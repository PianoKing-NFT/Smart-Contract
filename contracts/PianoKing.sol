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
  // Default value of bool is false in Solidity (any unassigned variable will be
  // set to its zero state, e.g. 0 for uint256, Zero address for address),
  // so it's better not to assign it manually since this would consume more gas
  // Indicate whether the presale tokens have distributed
  bool private preSaleTokensDistributed;
  // The amount in Wei (0.25 ETH by default) required to give this contract to mint an NFT
  uint256 private minPrice = 250000000000000000;
  // The max supply possible is 10,000 tokens
  uint16 private constant MAX_SUPPLY = 10000;
  // TO-DO: replace this url by the base url where the metadata
  // of each token will be stored.
  string private baseURI = "https://example.com/";

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
   * TO-DO: function letting anyone mint an NFT
   * for the minimum price of a PianoKing after presale
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
    require(msg.value >= minPrice, "Not enough funds");
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

  function mintPreSaleTokens() external onlyOwner {
    // Can trigger only one randomness request at a time
    require(
      !hasRequestedRandomness[address(this)],
      "A minting is alreay in progress"
    );
    // The distribution can only be done once for the presale
    require(!preSaleTokensDistributed, "Distributed already");
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
    // Request made by the contract so coming from the mintPreSaleTokens function
    if (requester == address(this)) {
      _mintPresaleTokens(randomNumber);
    } else {
      // Request made by a random sender
      uint256 tokenId = generateTokenId(randomNumber);
      _safeMint(requester, tokenId);
    }
    // Allow sender to trigger a new randomness request
    delete hasRequestedRandomness[requester];
  }

  // Not tested but this function will probably cost too much gas
  // Therefore, it will need to be reorganized in smaller chuncks
  // and the random number will need to be stored temporarly in the storage.
  // Which we can do as it doesn't matter if people can access to this
  // number (private keyword doesn't fully protected state variables)
  // since it will only be used for this function
  function _mintPresaleTokens(uint256 randomNumber) private {
    address[] memory whiteListedAddresses = pianoKingWhitelist
      .getWhitelistedAddresses();
    for (uint256 i = 0; i < whiteListedAddresses.length; i++) {
      address whiteListedAddress = whiteListedAddresses[i];
      // The allowance cannot be more than 25
      uint8 allowance = uint8(
        pianoKingWhitelist.getWhitelistAllowance(whiteListedAddress)
      );
      for (uint8 j = 0; j < allowance; j++) {
        // Generate a number from the random number for the given
        // address and this given token to be minted
        uint256 localRandomNumber = uint256(
          keccak256(abi.encodePacked(whiteListedAddress, randomNumber, j))
        );
        _safeMint(whiteListedAddress, generateTokenId(localRandomNumber));
      }
    }
    preSaleTokensDistributed = true;
  }

  /**
   * @dev Pick a random token id among the ones still available
   * @param randomNumber Random number which has previously provided by an oracle
   */
  function generateTokenId(uint256 randomNumber)
    private
    view
    returns (uint256)
  {
    // Needs to be more tested and optimized as the performance will get
    // worse and worse as the supply left to mint decreases
    uint16 randomId = uint16(randomNumber % MAX_SUPPLY);
    for (uint16 id = randomId - 1; id <= randomId + MAX_SUPPLY; id++) {
      uint16 moduloId = (id % MAX_SUPPLY) + 1;
      if (_exists(moduloId)) {
        continue;
      } else {
        return moduloId;
      }
    }
    // Not a valid id
    return 0;
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
