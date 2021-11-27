// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "./lib/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PianoKingWhitelist.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * Some optimizations will be necessary before deploying to production.
 * For now it's just a draft
 */
contract PianoKing is ERC721, Ownable, VRFConsumerBase {
  using Address for address payable;
  // The amount in Wei (0.2 ETH by default) required to give this contract to mint an NFT
  uint256 internal minPrice = 200000000000000000;
  // The max supply possible is 10,000 tokens
  uint256 internal constant MAX_SUPPLY = 10000;
  // The current minted supply
  uint256 public totalSupply;
  // TO-DO: replace this url by the base url where the metadata
  // of each token will be stored.
  string internal baseURI = "https://example.com/";
  // Mapping letting us avoid collisions while choosing a random token id
  // in a very cost effective way
  mapping(uint256 => uint256) internal movedIds;

  // Address => how many free tokens this address can mint
  mapping(address => uint256) internal preApprovedAddress;

  // The random number used for group mints
  uint256 internal globalRandomNumber;

  PianoKingWhitelist public pianoKingWhitelist;
  // Address authorized to withdraw the funds
  address public pianoKingWallet = 0xA263f5e0A44Cb4e22AfB21E957dE825027A1e586;

  // Doesn't have to be defined straight away, can be defined later
  // at least before phase 2
  address public pianoKingDutchAuction;

  // Mapping the Randomness request id to the address
  // trying to mint a token
  mapping(bytes32 => address) public requestIdToAddress;
  // Address => a boolean indicating if the given address
  // as already initiated a randomness request
  mapping(address => bool) public hasRequestedRandomness;

  // Data for chainlink
  bytes32 internal keyhash;
  uint256 internal fee;

  event RequestedRandomness(
    bytes32 indexed requestId,
    address indexed requester
  );
  event LinkBalanceLow(uint256 amountLeft);
  event RandomNumberReceived(address indexed requester);

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

  function mint() external payable {
    // The sender must send at least the min price to mint
    // and acquire the NFT
    // Or is allowed to do it for free
    // The restriction is here as it doesn't apply for Piano King Dutch Auction
    // which uses the mintFor function directly
    require(
      msg.value >= minPrice || preApprovedAddress[msg.sender] > 0,
      "Not enough funds"
    );
    mintFor(msg.sender);
  }

  /**
   * @dev Let anyone mint a random NFT as long as they send at least
   * the min price required to do so
   */
  function mintFor(address addr) public payable {
    // A sender can trigger only one randomness request at a time
    require(!hasRequestedRandomness[addr], "A minting is alreay in progress");
    // There can only be 10,000 tokens minted
    require(totalSupply < MAX_SUPPLY, "Max supply reached");

    // After the first phase only the Piano King Dutch Auction contract
    // can mint
    if (totalSupply >= 5000) {
      require(msg.sender == pianoKingDutchAuction, "Only through auction");
    }

    uint256 linkBalance = LINK.balanceOf(address(this));
    // We need some LINK to pay a fee to the oracles
    require(linkBalance >= fee, "Not enough LINK");
    // Request a random number to Chainlink oracles
    bytes32 requestId = requestRandomness(keyhash, fee);
    // Link the request id to the sender to retrieve it
    // later when the random number is received
    requestIdToAddress[requestId] = addr;
    hasRequestedRandomness[addr] = true;
    emit RequestedRandomness(requestId, addr);
    // If there's only enough LINK left for 10 or less oracle requests
    // we emit an event we can listen to remind us to
    // replenish the contract with LINK tokens
    if (linkBalance <= fee * 10) {
      emit LinkBalanceLow(linkBalance);
    }
  }

  /**
   * @dev Request the random number to be use for group minting
   */
  function requestGroupRN() external onlyOwner {
    // Can trigger only one randomness request at a time
    require(
      !hasRequestedRandomness[address(this)],
      "A minting is alreay in progress"
    );
    // We need some LINK to pay a fee to the oracles
    require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
    // Request a random number to Chainlink oracles
    bytes32 requestId = requestRandomness(keyhash, fee);
    // Link the request id to the contract address indicating
    // that this request has been made with the requestGroupRN function
    requestIdToAddress[requestId] = address(this);
    hasRequestedRandomness[address(this)] = true;
    emit RequestedRandomness(requestId, address(this));
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
    address requester = requestIdToAddress[requestId];
    // Request made by the contract so coming from the requestPresaleRN function
    if (requester == address(this)) {
      globalRandomNumber = randomNumber;
    } else {
      // Request made by a random sender
      (uint256 lowerBound, uint256 upperBound) = getBounds();
      uint256 tokenId = generateTokenId(randomNumber, lowerBound, upperBound);
      _safeMint(requester, tokenId);
    }
    emit RandomNumberReceived(requester);
    // Allow sender to trigger a new randomness request
    delete hasRequestedRandomness[requester];
  }

  /**
   * @dev Mint all the token pre-purchased during the presale
   * We don't use neither the _mint nor the _safeMint function
   * to optimize the process as much as possible in terms of fee
   * TO-DO: allow to call this function multiple times to allow
   * to do it in chuncks in order to spread the costs over several
   * transactions
   */
  function presaleMint() external onlyOwner {
    address[] memory addrs = pianoKingWhitelist.getWhitelistedAddresses();
    uint256 seedRN = globalRandomNumber;
    (uint256 lowerBound, uint256 upperBound) = getBounds();
    uint256 tokenId = (seedRN % 1000) + 1;
    for (uint256 i = 0; i < addrs.length; i++) {
      address addr = addrs[i];
      uint256 allowance = pianoKingWhitelist.getWhitelistAllowance(addr);
      for (uint256 j = 0; j < allowance; j++) {
        // Generate a number from the random number for the given
        // address and this given token to be
        _owners[tokenId] = addr;
        tokenId = generateTokenId(tokenId, lowerBound, upperBound);
        emit Transfer(address(0), addr, tokenId);
      }
      // Update the balance of the address
      _balances[addr] += allowance;
    }
    // We use a memory variable to avoid too much interaction with the storage
    totalSupply += 1000;
  }

  /**
   * @dev Generate a number from a random number for the tokenId that is guarranteed
   * not to repeat within one cycle (defined by the size of the modulo) if we call
   * this function many times in a row.
   * We use the properties of prime numbers to prevent collisions naturally without
   * manual checks that would be expensive since they would require writing the
   * storage or the memory.
   * @param randomNumber True random number which has been previously provided by an oracle
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
    } else {
      // To get the 500 tokens slots to be distributed by Dutch auctions
      lowerBound = 5000 + ((totalSupply - 5000) / 500) * 500;
      upperBound = lowerBound + 500;
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
   * @dev Set the min price of the tokens
   */
  function setMinPrice(uint256 price) external onlyOwner {
    // Not setting any constraints on the price we can set
    minPrice = price;
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
   * @dev Add addresses that can mint an NFT without paying
   */
  function addGiveAwayAddresses(
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

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal override {
    // We prevent to burn token once they have minted
    require(to != address(0), "Burning not allowed");
    if (from == address(0)) {
      // If it's from the zero address then it's a mint so we increase the supply
      totalSupply += 1;
    }
    super._beforeTokenTransfer(from, to, tokenId);
  }

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

  function _baseURI() internal view override returns (string memory) {
    return baseURI;
  }

  function getMinPrice() external view returns (uint256) {
    return minPrice;
  }

  function getPianoKingWallet() external view returns (address) {
    return pianoKingWallet;
  }
}
