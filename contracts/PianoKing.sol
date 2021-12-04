// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "./lib/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PianoKingWhitelist.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "./PianoKingRNConsumer.sol";

/**
 * @dev The contract of Piano King NFTs.
 * As minting batch of tokens is a native feature of ERC1155, using
 * this standard can be discussed. Noting however that ERC1155 is
 * not yet supported everywhere.
 * For example Metamask has only a partial support of ERC1155 for now
 * (they can be viewed but not transfered).
 * OpenSea does support them however.
 * Considering Piano King use case it may not be guarranteed that using
 * ERC1155 will further reduce gas fee. With the ERC1155 we interact with just
 * one mapping during mint instead of two for ERC721, but it is a nested mapping.
 */
contract PianoKing is ERC721, Ownable, IERC2981 {
  using Address for address payable;
  using Strings for uint256;

  uint256 private constant MAX_TOKEN_PER_ADDRESS = 25;
  // The amount in Wei (0.2 ETH by default) required to give this contract to mint an NFT
  // for the 4000 tokens following the 1000 in presale
  uint256 public constant MIN_PRICE = 200000000000000000;
  // The royalties taken on each sale. Can range from 0 to 10000
  // 500 => 5%
  uint16 internal constant ROYALTIES = 500;
  // The current minted supply
  uint256 public totalSupply;
  // TO-DO: replace this url by the base url where the metadata
  // of each token will be stored.
  string private baseURI = "https://example.com/";
  // The supply left before next batch mint
  // Start at 0 as there is no premint for presale
  uint256 public supplyLeft = 0;

  // Address => how many tokens this address will receive on the next batch mint
  mapping(address => uint256) public preMintAllowance;

  // Addresses that have paid to get a token in the next batch mint
  address[] public preMintAddresses;

  // The random number used as a seed for the random sequence for batch mint
  uint128 internal randomSeed;
  // The random number used as the base for the incrementor in the sequence
  uint128 internal randomIncrementor;
  // Indicate if the random number is ready to be used
  bool internal canUseRandomNumber;
  // Allow to keep track of iterations through multiple consecutives
  // transactions for batch mints
  uint16 internal lastBatchIndex;

  PianoKingRNConsumer public pianoKingRNConsumer;
  PianoKingWhitelist public pianoKingWhitelist;
  // Address authorized to withdraw the funds
  address internal pianoKingWallet = 0xA263f5e0A44Cb4e22AfB21E957dE825027A1e586;

  // Doesn't have to be defined straight away, can be defined later
  // at least before phase 2
  address internal pianoKingDutchAuction;

  constructor(address _pianoKingWhitelistAddress, address _pianoKingRNConsumer)
    ERC721("Piano King", "PK")
  {
    pianoKingWhitelist = PianoKingWhitelist(_pianoKingWhitelistAddress);
    pianoKingRNConsumer = PianoKingRNConsumer(_pianoKingRNConsumer);
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
    preMintFor(msg.sender);
  }

  /**
   * @dev Premint a token for a given address.
   * Meant to be used by the Dutch Auction contract or anyone wishing to
   * offer a token to someone else or simply paying the gas fee for that person
   * Improvement propsals:
   * - Disable smart contract from calling this function by detecting if the sender
   * has any code (but it could still be called from the constructor of a smart contract)
   */
  function preMintFor(address addr) public payable {
    // The presale mint has to be completed before this function can be called
    require(totalSupply >= 1000, "Presale mint not completed");
    bool isDutchAuction = totalSupply >= 8000;
    // After the first phase only the Piano King Dutch Auction contract
    // can mint
    if (isDutchAuction) {
      require(msg.sender == pianoKingDutchAuction, "Only through auction");
    }
    uint256 amountOfToken = isDutchAuction ? 1 : msg.value / MIN_PRICE;
    // If the result is 0 then not enough funds was sent
    require(amountOfToken > 0, "Not enough funds");

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
   * @dev Fetch the random numbers from RNConsumer contract
   */
  function fetchRandomNumbers() internal {
    // Will revert if the numbers are not ready
    (uint128 seed, uint128 incrementor) = pianoKingRNConsumer
      .getRandomNumbers();
    // By checking this we enforce the use of a different random number for
    // each batch mint
    // There is still the case in which two subsequent random number requests
    // return the same random number. However since it's a true random number
    // using the full range of a uint128 this has an extremely low chance of occuring.
    // And if it does we can still request another number.
    // We can't use the randomSeed for comparison as it changes during the bathc mint
    require(incrementor != randomIncrementor, "Cannot use old random numbers");
    randomIncrementor = incrementor;
    randomSeed = seed;
    canUseRandomNumber = true;
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
    if (!canUseRandomNumber) {
      // Will revert the transaction if the random numbers are not ready
      fetchRandomNumbers();
    }
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
    uint256 tokenId = randomSeed;
    uint256 incrementor = randomIncrementor;
    for (uint256 i = lastBatchIndex; i < end; i++) {
      address addr = addrs[i];
      uint256 allowance = getAllowance(addr);
      for (uint256 j = 0; j < allowance; j++) {
        // Generate a number from the random number for the given
        // address and this given token to be
        tokenId = generateTokenId(tokenId, lowerBound, upperBound, incrementor);
        _owners[tokenId] = addr;
        emit Transfer(address(0), addr, tokenId);
      }
      // Update the balance of the address
      _balances[addr] += allowance;
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
      // Add the supply at the end to minimize interactions with storage
      // It's not critical to know the actual current evolving supply
      // during the batch mint so we can do that here
      totalSupply += upperBound - lowerBound;
      // Get the bounds of the next range now that this batch mint is completed
      (lowerBound, upperBound) = getBounds();
      // Assign the supply available to premint for the next batch
      supplyLeft = upperBound - lowerBound;
      // Set the index back to 0 so that next batch mint can start at the beginning
      lastBatchIndex = 0;
    } else {
      // Save the token id in the random number variable to continue the sequence
      // on next call
      // The token id is between 1 and 10000, so no worries on this side,
      // it can even fit in a uint16
      randomSeed = uint128(tokenId);
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
   * @param lowerBound Lower bound of current batch
   * @param upperBound Upper bound of current batch
   * @param incrementor Random incrementor based on the random number provided by oracles
   */
  function generateTokenId(
    uint256 randomNumber,
    uint256 lowerBound,
    uint256 upperBound,
    uint256 incrementor
  ) internal pure returns (uint256 tokenId) {
    if (lowerBound == 0) {
      // Presale mint (1000 tokens)
      tokenId = getTokenIdInRange(
        randomNumber,
        1009,
        incrementor,
        lowerBound,
        upperBound
      );
    } else if (lowerBound == 1000) {
      // Post pre-sale mint of 2200 tokens
      tokenId = getTokenIdInRange(
        randomNumber,
        2203,
        incrementor,
        lowerBound,
        upperBound
      );
    } else if (lowerBound < 8000) {
      // Second post pre-sale mints of 1600 tokens
      tokenId = getTokenIdInRange(
        randomNumber,
        1601,
        incrementor,
        lowerBound,
        upperBound
      );
    } else {
      // Dutch auction mints of 200 tokens
      tokenId = getTokenIdInRange(
        randomNumber,
        211,
        incrementor,
        lowerBound,
        upperBound
      );
    }
  }

  function getTokenIdInRange(
    uint256 randomNumber,
    uint256 modulo,
    uint256 incrementor,
    uint256 lowerBound,
    uint256 upperBound
  ) internal pure returns (uint256 tokenId) {
    // Special case in which the incrementor would be equivalent to 0
    // so we need to add 1 to it. Letting such failure happen would not be
    // fatal for the flow of minting other tokens but would be costly for us
    // in terms of gas
    if (incrementor % modulo == modulo - 1 - (lowerBound % modulo)) {
      incrementor += 1;
    }
    tokenId = lowerBound + ((randomNumber + incrementor) % modulo) + 1;
    // Shouldn't trigger too many iterations
    while (tokenId > upperBound) {
      tokenId = lowerBound + ((tokenId + incrementor) % modulo) + 1;
    }
  }

  /**
   * @dev Get the bounds of the range to generate the ids in
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
    } else if (totalSupply < 3200) {
      // For the 2200 tokens following the presale
      lowerBound = 1000;
      upperBound = 3200;
    } else if (totalSupply < 8000) {
      // For the batches of 1600 tokens following the presale and previous
      // 2200 tokens
      lowerBound = 3200 + ((totalSupply - 3200) / 1600) * 1600;
      upperBound = lowerBound + 1600;
    } else if (totalSupply < 10000) {
      // To get the 200 tokens slots to be distributed by Dutch auctions
      lowerBound = 8000 + ((totalSupply - 8000) / 200) * 200;
      upperBound = lowerBound + 200;
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

  /**
   * @dev Set the address of the contract authorized to do Dutch Auction
   * of the tokens of this contract
   */
  function setDutchAuction(address addr) external onlyOwner {
    require(addr != address(0), "Invalid address");
    pianoKingDutchAuction = addr;
  }

  /**
   * @dev Set the base URI of every token URI
   * Improvement proposal:
   * - This setter is here as a fallback in case a mistake is made
   * while setting the base URI or one of the metadata. But in an optimal
   * case preventing its edition would be better to assure the immutability
   * of the data representing the NFTs
   */
  function setBaseURI(string memory uri) external onlyOwner {
    baseURI = uri;
  }

  /**
   * @dev Set addresses directly in the list as if they preminted for free
   * like for giveaway.
   */
  function setPreApprovedAddresses(
    address[] calldata addrs,
    uint256[] calldata amounts
  ) external onlyOwner {
    for (uint256 i = 0; i < addrs.length; i++) {
      address addr = addrs[i];
      require(addr != address(0), "Invalid address");
      uint256 amount = amounts[i];
      require(amount > 0, "Amount too low");
      require(
        amount + preMintAllowance[addr] <= MAX_TOKEN_PER_ADDRESS,
        "Above maximum"
      );
      if (preMintAllowance[addr] == 0) {
        preMintAddresses.push(addr);
      }
      preMintAllowance[addr] = amount;
    }
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
    return string(abi.encodePacked(baseURI, tokenId.toString(), ".json"));
  }

  // View and pure functions

  /**
   * @dev Get the address of the Piano King wallet
   */
  function getPianoKingWallet() external view returns (address) {
    return pianoKingWallet;
  }

  /**
   * @dev Called with the sale price to determine how much royalty is owed and to whom.
   * @param tokenId - the NFT asset queried for royalty information
   * @param salePrice - the sale price of the NFT asset specified by `tokenId`
   * @return receiver - address of who should be sent the royalty payment
   * @return royaltyAmount - the royalty payment amount for `salePrice`
   */
  function royaltyInfo(uint256 tokenId, uint256 salePrice)
    external
    view
    override
    returns (address receiver, uint256 royaltyAmount)
  {
    receiver = pianoKingWallet;
    // We divide it by 10000 as the royalties can change from
    // 0 to 10000 representing percents with 2 decimals
    royaltyAmount = (salePrice * ROYALTIES) / 10000;
  }
}
