// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PianoKingWhitelist.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "./lib/ArrayUtils.sol";

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
  using ArrayUtils for uint256[];
  // Default value of bool is false in Solidity (any unassigned variable will be
  // set to its zero state, e.g. 0 for uint256, Zero address for address),
  // so it's better not to assign it manually since this would consume more gas
  // Indicate whether the presale tokens have distributed
  bool private preSaleTokensDistributed;
  // The amount in Wei (0.25 ETH by default) required to give this contract to mint an NFT
  uint256 private minPrice = 250000000000000000;
  // The max supply possible is 10,000 tokens
  uint16 private constant MAX_SUPPLY = 10000;
  // Contains the ids of tokens left to mint
  uint256[] private idsLeft;

  PianoKingWhitelist private pianoKingWhitelist;
  address private pianoKingWallet;

  // Mapping the Randomness request id to the address
  // trying to mint a token
  mapping(bytes32 => address) private requestIdToAddress;

  // Data for chainlink
  bytes32 private keyhash;
  uint256 private fee;

  event RequestedRandomness(bytes32 indexed requestId, address requester);
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
    // Initialize the array of ids left to all the possible ids 1 to 10,000 (inclusive)
    for (uint256 i = 1; i <= MAX_SUPPLY; i++) {
      idsLeft.push(i);
    }
  }

  function safeMint(
    address to,
    uint256 tokenId,
    string memory uri
  ) public onlyOwner {
    _safeMint(to, tokenId);
    _setTokenURI(tokenId, uri);
  }

  /**
   * TO-DO: function letting anyone mint an NFT
   * for the minimum price of a PianoKing after presale
   */
  function mint() external payable {
    // There can only be 10,000 tokens minted
    require(totalSupply() < MAX_SUPPLY, "Max supply reached");
    // The sender must send at least the min price to mint
    // and acquire the NFT
    require(msg.value >= minPrice, "Not enough funds");
    uint256 linkBalance = LINK.balanceOf(address(this));
    // We need some LINK to pay a fee to the oracles
    require(linkBalance >= fee, "Not enough LINK");
    // Request a random number to Chainlink oracles
    bytes32 requestId = requestRandomness(keyhash, fee);
    // Link the request id to the sender to retrieve it
    // later when the random number is received
    requestIdToAddress[requestId] = msg.sender;
    emit RequestedRandomness(requestId, msg.sender);
    // If there's only enough LINK left for 10 or less oracle requests
    // we emit an event we can listen to remind us to
    // replenish the contract with LINK tokens
    if (linkBalance <= fee * 10) {
      emit LinkBalanceLow(linkBalance);
    }
  }

  function mintPreSaleTokens() external onlyOwner {
    // The distribution can only be done once for the presale
    require(!preSaleTokensDistributed, "Distributed already");
    // We need some LINK to pay a fee to the oracles
    require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
    // Request a random number to Chainlink oracles
    bytes32 requestId = requestRandomness(keyhash, fee);
    // Link the request id to the contract address indicating
    // that this request has been made with the mintPreSaleTokens
    requestIdToAddress[requestId] = address(this);
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
    // Request made by the contract so coming from the mintPreSaleTokens function
    if (requester == address(this)) {
      _mintPresaleTokens(randomNumber);
    } else {
      // Request made by a random sender
      uint256 tokenId = generateTokenId(randomNumber);
      _safeMint(requester, tokenId);
    }
  }

  function _mintPresaleTokens(uint256 randomNumber) private {
    address[] memory whiteListedAddresses = pianoKingWhitelist
      .getWhitelistedAddresses();
    for (uint256 i = 0; i < whiteListedAddresses.length; i++) {
      address whiteListedAddress = whiteListedAddresses[i];
      uint256 allowance = pianoKingWhitelist.getWhitelistAllowance(
        whiteListedAddress
      );
      for (uint256 j = 0; j < allowance; j++) {
        // Generate a number from the random number for the given
        // address and this given token to be minted
        uint256 localRandomNumber = uint256(
          keccak256(abi.encodePacked(whiteListedAddress, randomNumber, j))
        );
        uint256 tokenId = generateTokenId(localRandomNumber);
        _safeMint(whiteListedAddress, tokenId);
      }
    }
    preSaleTokensDistributed = true;
  }

  /**
   * @dev Pick a random token id among the ones still available
   * @param randomNumber Random number which has previously provided by an oracle
   */
  function generateTokenId(uint256 randomNumber) private returns (uint256) {
    // Get a random index from the random number
    // by constraining it to the modulo of the length
    // of the array of remaining ids to be minted
    uint256 randomIndex = randomNumber % idsLeft.length;
    // It's going to be minted so we remove it from the ids
    // left to be minted
    idsLeft.removeAt(randomIndex);
    // Return the id at the random index
    return idsLeft[randomIndex];
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

  // The following functions are overrides required by Solidity.

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal override(ERC721, ERC721Enumerable) {
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

  function _baseURI() internal pure override returns (string memory) {
    // TO-DO: replace this url by the base url where the metadata
    // of each token will be stored.
    // It will be either a centralized server or on IPFS, TBD
    // See OpenSea docs for the metadata standards:
    // https://docs.opensea.io/docs/metadata-standards
    return "https://example.com/";
  }

  function getMinPrice() external view returns (uint256) {
    return minPrice;
  }

  function getPianoKingWallet() external view returns (address) {
    return pianoKingWallet;
  }
}
