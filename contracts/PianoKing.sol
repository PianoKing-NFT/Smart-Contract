// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PianoKingWhitelist.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";

/**
 * Some optimizations will be necessary before deploying to production.
 * For now it's just a draft
 */
contract PianoKing is
  ERC721,
  ERC721Enumerable,
  ERC721URIStorage,
  Ownable,
  VRFConsumerBase
{
  // The amount in Wei (0.25 ETH by default) required to give this contract to mint an NFT
  uint256 private minPrice = 250000000000000000;
  // The max supply possible is 10,000 tokens
  uint16 private constant MAX_SUPPLY = 10000;
  // TO-DO: replace this url by the base url where the metadata
  // of each token will be stored.
  string private baseURI = "https://example.com/";
  // Mapping letting us avoid collisions while choosing a random token id
  // in a very cost effective way
  mapping(uint16 => uint16) private movedIds;

  // Address whitelisted by the whitelist contract => boolean indicating
  // if the tokens pre-purchased during presale have been minted already or not
  mapping(address => bool) private whiteListedAddressToMinted;

  // Address => whether this address is allowed to mint an NFT for free (excluding gas fee)
  mapping(address => bool) private giveAwayAddress;

  // The random number used for presale mints
  uint256 private randomNumberForPresaleMint;

  PianoKingWhitelist private pianoKingWhitelist;
  address private pianoKingWallet;

  // Mapping the Randomness request id to the address
  // trying to mint a token
  mapping(bytes32 => address) public requestIdToAddress;
  // Address => a boolean indicating if the given address
  // as already initiated a randomness request
  mapping(address => bool) public hasRequestedRandomness;

  // Data for chainlink
  bytes32 private keyhash;
  uint256 private fee;

  event RequestedRandomness(
    bytes32 indexed requestId,
    address indexed requester
  );
  event LinkBalanceLow(uint256 amountLeft);

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
   * @dev Let anyone mint a random NFT as long as they send at least
   * the min price required to do so
   */
  function mint() external payable {
    // A sender can trigger only one randomness request at a time
    require(
      !hasRequestedRandomness[msg.sender],
      "A minting is alreay in progress"
    );
    // There can only be 10,000 tokens minted
    require(totalSupply() < MAX_SUPPLY, "Max supply reached");
    // The sender must send at least the min price to mint
    // and acquire the NFT
    // Or is allowed to do it for free
    require(
      msg.value >= minPrice || giveAwayAddress[msg.sender],
      "Not enough funds"
    );
    uint256 linkBalance = LINK.balanceOf(address(this));
    // We need some LINK to pay a fee to the oracles
    require(linkBalance >= fee, "Not enough LINK");
    // Request a random number to Chainlink oracles
    bytes32 requestId = requestRandomness(keyhash, fee);
    // Link the request id to the sender to retrieve it
    // later when the random number is received
    requestIdToAddress[requestId] = msg.sender;
    hasRequestedRandomness[msg.sender] = true;
    emit RequestedRandomness(requestId, msg.sender);
    // If there's only enough LINK left for 10 or less oracle requests
    // we emit an event we can listen to remind us to
    // replenish the contract with LINK tokens
    if (linkBalance <= fee * 10) {
      emit LinkBalanceLow(linkBalance);
    }
  }

  /**
   * @dev Request the random number to be use for presale minting
   */
  function requestPresaleRN() external onlyOwner {
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
    // that this request has been made with the mintPreSaleTokens
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
      randomNumberForPresaleMint = randomNumber;
    } else {
      // Request made by a random sender
      uint256 tokenId = generateTokenId(randomNumber);
      _safeMint(requester, tokenId);
    }
    // Allow sender to trigger a new randomness request
    delete hasRequestedRandomness[requester];
  }

  /**
   * @dev Mint tokens pre-purchased during presale for a given address
   */
  function mintPreSaleTokensForAddress(address addr) external onlyOwner {
    require(addr != address(0), "Invalid address");
    require(!whiteListedAddressToMinted[addr], "Already minted");
    // The allowance cannot be more than 25 so uint8 will be enough
    uint8 allowance = uint8(pianoKingWhitelist.getWhitelistAllowance(addr));
    require(allowance > 0, "Not whitelisted");
    for (uint8 j = 0; j < allowance; j++) {
      // Generate a number from the random number for the given
      // address and this given token to be minted
      uint256 randomNumber = uint256(
        keccak256(abi.encodePacked(randomNumberForPresaleMint, addr, j))
      );
      _safeMint(addr, generateTokenId(randomNumber));
    }
    // Indicate that this address has now received its pre-purchased NFTs
    whiteListedAddressToMinted[addr] = true;
  }

  /**
   * @dev Pick a random token id among the ones still available
   * @param randomNumber Random number which has previously provided by an oracle
   */
  function generateTokenId(uint256 randomNumber) private returns (uint256) {
    // We get the number of ids remaining by substracting the total supply
    // with the max supply
    uint16 idsRemaining = uint16(MAX_SUPPLY - totalSupply());
    // Keep the randomIndex within the 0 => 10,000 range
    uint16 randomIndex = uint16(randomNumber % idsRemaining);
    // Pick the id at randomIndex within the ids remaining
    uint256 tokenId = getIdAt(randomIndex);

    // Move the last id in the remaining ids into position randomIndex
    // That way if we get that randomIndex again it will return that number
    movedIds[randomIndex] = getIdAt(idsRemaining - 1);
    // Free the storage used at the last index if used
    delete movedIds[idsRemaining - 1];

    return tokenId;
  }

  function getIdAt(uint16 i) private view returns (uint16) {
    // Return the number stored at index i if it has been defined
    if (movedIds[i] != 0) {
      return movedIds[i];
    } else {
      // Otherwise just return the i + 1 (as it starts at 1)
      return i + 1;
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

  function setBaseURI(string memory uri) external onlyOwner {
    baseURI = uri;
  }

  /**
   * @dev Add addresses that can mint an NFT without paying
   */
  function addGiveAwayAddresses(address[] memory addrs) external onlyOwner {
    for (uint256 i = 0; i < addrs.length; i++) {
      giveAwayAddress[addrs[i]] = true;
    }
  }

  /**
   * @dev Let the owner of the contract withdraw LINK from the smart contract.
   * Can be useful if too much was sent or LINK are no longer need on the contract
   */
  function withdrawLinkTokens(uint256 amount) external onlyOwner {
    LINK.transfer(msg.sender, amount);
  }

  // The following functions are overrides required by Solidity.

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal override(ERC721, ERC721Enumerable) {
    // We prevent to burn token once they have minted
    require(to != address(0), "Burning not allowed");
    super._beforeTokenTransfer(from, to, tokenId);
  }

  // A PianoKing NFT will not be burnable, so this function won't be exposed
  // publically at any point
  function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
    super._burn(tokenId);
  }

  function tokenURI(uint256 tokenId)
    public
    view
    override(ERC721, ERC721URIStorage)
    returns (string memory)
  {
    return super.tokenURI(tokenId);
  }

  function supportsInterface(bytes4 interfaceId)
    public
    view
    override(ERC721, ERC721Enumerable)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
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
