// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "./lib/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PianoKingWhitelist.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @dev The contract of Piano King NFTs.
 */
contract PianoKing is ERC721, Ownable, VRFConsumerBase {
  using Address for address payable;
  uint256 private constant MAX_TOKEN_PER_ADDRESS = 25;
  // The amount in Wei (0.2 ETH by default) required to give this contract to mint an NFT
  // for the 4000 tokens following the 1000 in presale
  uint256 public constant MIN_PRICE = 200000000000000000;
  // The current minted supply
  uint256 public totalSupply;
  // TO-DO: replace this url by the base url where the metadata
  // of each token will be stored.
  string internal baseURI = "https://example.com/";
  // The supply left before next batch mint
  // Start at 0 as there is no premint for presale
  uint256 public supplyLeft = 0;

  // Address => how many free tokens this address can mint
  mapping(address => uint256) internal preApprovedAddress;

  // Address => how many tokens this address will receive on the next batch mint
  mapping(address => uint256) public preMintAllowance;

  // Addresses that have paid to get a token in the next batch mint
  address[] public preMintAddresses;

  // The random number used for batch mints
  uint256 internal globalRandomNumber;
  // Indicate if a random number has just been requested
  bool internal hasRequestedRandomness;
  // Indicate if the random number is ready to be used
  bool internal canUseRandomNumber;
  // Allow to keep track of iterations through multiple consecutives
  // transactions for batch mints
  uint16 internal lastBatchIndex;

  PianoKingWhitelist public pianoKingWhitelist;
  // Address authorized to withdraw the funds
  address public pianoKingWallet = 0xA263f5e0A44Cb4e22AfB21E957dE825027A1e586;

  // Doesn't have to be defined straight away, can be defined later
  // at least before phase 2
  address public pianoKingDutchAuction;

  // Data for chainlink
  bytes32 internal keyhash;
  uint256 internal fee;

  event RequestedRandomness(bytes32 indexed requestId);
  event RandomNumberReceived(bytes32 indexed requestId);

  constructor(
    address _pianoKingWhitelistAddress,
    address _vrfCoordinator,
    address _linkToken,
    bytes32 _keyhash,
    uint256 _fee
  ) VRFConsumerBase(_vrfCoordinator, _linkToken) ERC721("PianoKing", "PK") {
    keyhash = _keyhash;
    fee = _fee;
    pianoKingWhitelist = PianoKingWhitelist(_pianoKingWhitelistAddress);
  }

  /**
   * @dev Let anyone premint a random token as long as they send at least
   * the min price required to do so
   * The actual minting will happen later in a batch to reduce the fees
   * of random number request to off-chain oracles
   */
  function preMint() external payable {
    // The sender must send at least the min price to mint
    // and acquire the NFT
    // Or is allowed to do it for free
    // The restriction is here as it doesn't apply for Piano King Dutch Auction
    // which uses the mintFor function directly
    require(
      msg.value >= MIN_PRICE || preApprovedAddress[msg.sender] > 0,
      "Not enough funds"
    );
    preMintFor(msg.sender);
  }

  /**
   * @dev Premint a token for a given address.
   * Meant to be used by the Dutch Auction contract or anyone wishing to
   * offer a token to someone else
   */
  function preMintFor(address addr) public payable {
    // The presale mint has to be completed before this function can be called
    require(totalSupply >= 1000, "Presale mint not completed");
    bool isDutchAuction = totalSupply >= 5000;
    // After the first phase only the Piano King Dutch Auction contract
    // can mint
    if (isDutchAuction) {
      require(msg.sender == pianoKingDutchAuction, "Only through auction");
    }
    uint256 amountOfToken;
    if (isDutchAuction) {
      // Only one token per purchase through Dutch Auction
      amountOfToken = 1;
    } else {
      // We get the amount of tokens according to the value passed
      // by the sender. Since Solidity only supports integer numbers
      // the division will be an integer whose value is floored
      // (i.e. 15.9 => 15 and not 16)
      // If this address has been given away some free tokens,
      // we just get the amount of tokens given away
      uint256 preApprovedAllowance = preApprovedAddress[addr];
      amountOfToken = preApprovedAllowance > 0
        ? preApprovedAllowance
        : msg.value / MIN_PRICE;
    }

    // We check there is enough supply left
    require(supplyLeft >= amountOfToken, "Not enough tokens left");
    // Check that the amount desired by the sender is below or
    // equal to the maximum per address
    require(
      amountOfToken + preMintAllowance[addr] <= MAX_TOKEN_PER_ADDRESS,
      "Above maximum"
    );

    if (preMintAllowance[addr] == 0) {
      preMintAddresses.push(addr);
    }
    // Assign the number of token to the sender
    preMintAllowance[addr] += amountOfToken;

    // Remove the newly acquired tokens from the supply left before next batch mint
    supplyLeft -= amountOfToken;
  }

  /**
   * @dev Request the random number to be used for a batch mint
   */
  function requestBatchRN() external onlyOwner {
    // Can trigger only one randomness request at a time
    require(!hasRequestedRandomness, "Random number already requested");
    // Check that no batch minting is in progress
    require(!canUseRandomNumber, "Current minting not finished");
    // We need some LINK to pay a fee to the oracles
    require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
    // Request a random number to Chainlink oracles
    bytes32 requestId = requestRandomness(keyhash, fee);
    // Indicate that a request has been initiated
    hasRequestedRandomness = true;
    emit RequestedRandomness(requestId);
  }

  /**
   * Called by Chainlink oracles when sending back a random number for
   * a given request
   * This function cannot use more than 200,000 gas or the transaction
   * will fail
   */
  function fulfillRandomness(bytes32 requestId, uint256 randomNumber)
    internal
    override
  {
    globalRandomNumber = randomNumber;
    // Allow to trigger a new randomness request
    hasRequestedRandomness = false;
    // Mark the random number is ready to be used
    canUseRandomNumber = true;
    // Just to tell us that the random number has been received
    // No need to broadcast, however making it public is not problematic
    // and shouldn't since any data on-chain is public (even private variable)
    emit RandomNumberReceived(requestId);
  }

  /**
   * @dev Do a batch mint for the tokens after the first 1000 of presale
   * This function is meant to be called multiple times in row to loop
   * through consecutive ranges of the array to spread gas costs as doing it
   * in one single transaction may cost more than a block gas limit
   * @param count How many addresses to loop through
   */
  function batchMint(uint256 count) external onlyOwner {
    _batchMint(preMintAddresses, count);
  }

  /**
   * @dev Mint all the token pre-purchased during the presale
   * @param count How many addresses to loop through
   */
  function presaleMint(uint256 count) external onlyOwner {
    _batchMint(pianoKingWhitelist.getWhitelistedAddresses(), count);
  }

  /**
   * @dev Generic batch mint
   * We don't use neither the _mint nor the _safeMint function
   * to optimize the process as much as possible in terms of gas
   * @param addrs Addresses meant to receive tokens
   * @param count How many addresses to loop through in this call
   */
  function _batchMint(address[] memory addrs, uint256 count) internal {
    // To mint a batch all of its tokens need to have been preminted
    require(supplyLeft == 0, "Batch not yet sold out");
    // Check that the random number is ready to be used
    require(canUseRandomNumber, "Random number not ready");
    // Get the ending index from the start index and the number of
    // addresses to loop through
    uint256 end = lastBatchIndex + count;
    // Check that the end is not longer than the addrs array
    require(end <= addrs.length, "Out of bounds");
    // Get the bounds of the current phase/slot
    (uint256 lowerBound, uint256 upperBound) = getBounds();
    // Set the token id to the value of the random number variable
    // If it's the start, then it will be the random number returned
    // by Chainlink VRF. If not it will be the last token id generated
    // in the batch needed to continue the sequence
    uint256 tokenId = globalRandomNumber;
    for (uint256 i = lastBatchIndex; i < end; i++) {
      address addr = addrs[i];
      uint256 allowance = getAllowance(addr);
      for (uint256 j = 0; j < allowance; j++) {
        // Generate a number from the random number for the given
        // address and this given token to be
        tokenId = generateTokenId(tokenId, lowerBound, upperBound);
        _owners[tokenId] = addr;
        emit Transfer(address(0), addr, tokenId);
      }
      // Update the balance of the address
      _balances[addr] += allowance;
      // Add the allowance just minted to the total supply
      totalSupply += allowance;
      if (lowerBound >= 1000) {
        // We clear the mapping at this address as it's no longer needed
        delete preMintAllowance[addr];
      }
    }
    if (end == addrs.length) {
      // We've minted all the tokens of this batch, so this random number
      // cannot be used anymore
      canUseRandomNumber = false;
      if (lowerBound >= 1000) {
        // And we can clear the preMintAddresses array to free it for next batch
        // It's always nice to free unused storage anyway
        delete preMintAddresses;
      }
      // Get the bounds of the next range now that this batch mint is completed
      (lowerBound, upperBound) = getBounds();
      // Assign the supply available to premint for the next batch
      supplyLeft = upperBound - lowerBound;
      // Set the index back to 0 so that next batch mint can start at the beginning
      lastBatchIndex = 0;
    } else {
      // Save the token id in the random number variable to continue the sequence
      // on next call
      globalRandomNumber = tokenId;
      // Save the index to set as start of next call
      lastBatchIndex = uint16(end);
    }
  }

  /**
   * @dev Get the allowance of an address depending of the current supply
   * @param addr Address to get the allowance of
   */
  function getAllowance(address addr) internal view virtual returns (uint256) {
    // If the supply is below a 1000 then we're getting the white list allowance
    // otherwise it's the premint allowance
    return
      totalSupply < 1000
        ? pianoKingWhitelist.getWhitelistAllowance(addr)
        : preMintAllowance[addr];
  }

  /**
   * @dev Generate a number from a random number for the tokenId that is guarranteed
   * not to repeat within one cycle (defined by the size of the modulo) if we call
   * this function many times in a row.
   * We use the properties of prime numbers to prevent collisions naturally without
   * manual checks that would be expensive since they would require writing the
   * storage or the memory.
   * @param randomNumber True random number which has been previously provided by oracles
   * or previous tokenId that was generated from it. Since we're generating a sequence
   * of numbers defined by recurrence we need the previous number as the base for the next.
   */
  function generateTokenId(
    uint256 randomNumber,
    uint256 lowerBound,
    uint256 upperBound
  ) internal pure returns (uint256 tokenId) {
    // A lower bound of 0 indicate it's the presale batch mint with ids
    // between 1 and 1000 (inclusive)
    if (lowerBound == 0) {
      tokenId = ((randomNumber + 739) % 1009) + 1;
      // We don't need a loop as if the number is between 1000 and 1009,
      // we are guarranteed the next one will not
      if (tokenId > upperBound) {
        tokenId = ((tokenId + 739) % 1009) + 1;
      }
    } else if (lowerBound == 1000) {
      // A lower bound of 1000 indicates it's post-presale batch of 4000
      // tokens with ids between 1001 and 5000 (inclusive)
      tokenId = lowerBound + ((randomNumber + 3209) % 4001) + 1;
      // We don't need a loop as if the number is 5001,
      // we are guarranteed the next one will not
      if (tokenId > upperBound) {
        tokenId = lowerBound + ((tokenId + 3209) % 4001) + 1;
      }
    } else {
      // If the lower bound is above a 1000 (and actually 5000 and above)
      // then its the phase 2 in which we are minting in batch 500 tokens
      // paid for during the Dutch Auction
      tokenId = lowerBound + ((randomNumber + 367) % 503) + 1;
      // We don't need a loop as if the number is between 500 and 503,
      // we are guarranteed the next one will not
      if (tokenId > upperBound) {
        tokenId = lowerBound + ((tokenId + 367) % 503) + 1;
      }
    }
  }

  /**
   * @dev Get the bounds of the range to generate the ids in
   * The first phase contains the first 5000 ids which is for the presale
   * and the following 4000. The first phase contains 25 legendary and 150
   * heroic
   * The second phase is the next 5000 divided each in 500 distributed in
   * Dutch auctions. Each slot of 500 contains 2 legendary and 15 heroic.
   * If someone wish to verify these data, he or she can do so by consulting
   * the metadata of the tokens yet to be minted
   * @param lowerBound The starting position from which the tokenId will be randomly picked
   * @param upperBound The ending position until which the tokenId will be randomly picked
   */
  function getBounds()
    internal
    view
    returns (uint256 lowerBound, uint256 upperBound)
  {
    if (totalSupply < 1000) {
      // For the presale
      lowerBound = 0;
      upperBound = 1000;
    } else if (totalSupply < 5000) {
      // For the 4000 tokens following the presale
      lowerBound = 1000;
      upperBound = 5000;
    } else if (totalSupply < 10000) {
      // To get the 500 tokens slots to be distributed by Dutch auctions
      lowerBound = 5000 + ((totalSupply - 5000) / 500) * 500;
      upperBound = lowerBound + 500;
    } else {
      // Set both at zero to mark that we reached the end of the max supply
      lowerBound = 0;
      upperBound = 0;
    }
  }

  /**
   * @dev Set the address of the Piano King Wallet
   */
  function setPianoKingWallet(address addr) external onlyOwner {
    require(addr != address(0), "Invalid address");
    pianoKingWallet = addr;
  }

  /**
   * @dev Set the address of the Piano King Whitelist
   */
  function setWhitelist(address addr) external onlyOwner {
    require(addr != address(0), "Invalid address");
    pianoKingWhitelist = PianoKingWhitelist(addr);
  }

  function setDutchAuction(address addr) external onlyOwner {
    require(addr != address(0), "Invalid address");
    pianoKingDutchAuction = addr;
  }

  function setBaseURI(string memory uri) external onlyOwner {
    baseURI = uri;
  }

  /**
   * @dev Add addresses that can premint an NFT without paying
   */
  function addPreApprovedAddresses(
    address[] calldata addrs,
    uint256[] calldata amounts
  ) external onlyOwner {
    for (uint256 i = 0; i < addrs.length; i++) {
      preApprovedAddress[addrs[i]] = amounts[i];
    }
  }

  /**
   * @dev Let the owner of the contract withdraw LINK from the smart contract.
   * Can be useful if too much was sent or LINK are no longer need on the contract
   */
  function withdrawLinkTokens(uint256 amount) external onlyOwner {
    LINK.transfer(msg.sender, amount);
  }

  /**
   * @dev Retrieve the funds of the sale
   */
  function retrieveFunds() external {
    // Only the Piano King Wallet or the owner can withraw the funds
    require(
      msg.sender == pianoKingWallet || msg.sender == owner(),
      "Not allowed"
    );
    payable(pianoKingWallet).sendValue(address(this).balance);
  }

  // The following functions are overrides required by Solidity.

  /**
   * @dev Override of an OpenZeppelin hook called on before any token transfer
   */
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal override {
    // This will prevent anyone from burning a token if he or she tries
    // to send it to the zero address
    require(to != address(0), "Burning not allowed");
    super._beforeTokenTransfer(from, to, tokenId);
  }

  /**
   * @dev Get the URI for a given token
   */
  function tokenURI(uint256 tokenId)
    public
    view
    override
    returns (string memory)
  {
    require(_exists(tokenId), "URI query for nonexistent token");
    // Concatenate the baseURI and the tokenId as the tokenId should
    // just be appended at the end to access the token metadata
    return string(abi.encodePacked(_baseURI(), tokenId));
  }

  // View and pure functions

  /**
   * @dev Get the uri used as a base for all the token metadata
   */
  function _baseURI() internal view override returns (string memory) {
    return baseURI;
  }

  /**
   * @dev Get the address of the Piano King wallet
   */
  function getPianoKingWallet() external view returns (address) {
    return pianoKingWallet;
  }
}
