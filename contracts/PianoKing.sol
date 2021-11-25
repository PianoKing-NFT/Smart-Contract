// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "./lib/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PianoKingWhitelist.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";

/**
 * Some optimizations will be necessary before deploying to production.
 * For now it's just a draft
 */
contract PianoKing is ERC721, Ownable, VRFConsumerBase {
  // The amount in Wei (0.25 ETH by default) required to give this contract to mint an NFT
  uint256 private minPrice = 250000000000000000;
  // The max supply possible is 10,000 tokens
  uint256 private constant MAX_SUPPLY = 10000;
  // The current minted supply
  uint256 public totalSupply;
  // TO-DO: replace this url by the base url where the metadata
  // of each token will be stored.
  string private baseURI = "https://example.com/";
  // Mapping letting us avoid collisions while choosing a random token id
  // in a very cost effective way
  mapping(uint256 => uint256) private movedIds;

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
    require(totalSupply < MAX_SUPPLY, "Max supply reached");
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
    emit RandomNumberReceived(requester);
    // Allow sender to trigger a new randomness request
    delete hasRequestedRandomness[requester];
  }

  /**
   * @dev Mint all the token pre-purchased during the presale
   * We don't use neither the _mint nor the _safeMint function
   * to optimize the process as much as possible in terms of fee
   */
  function presaleMint() external onlyOwner {
    address[] memory addrs = pianoKingWhitelist.getWhitelistedAddresses();
    uint256 seedRN = randomNumberForPresaleMint;
    for (uint256 i = 0; i < addrs.length; i++) {
      address addr = addrs[i];
      uint256 allowance = pianoKingWhitelist.getWhitelistAllowance(addr);
      for (uint256 j = 0; j < allowance; j++) {
        // Generate a number from the random number for the given
        // address and this given token to be minted
        // XOR is cheaper than keccak256 and is enough for the purpose of expanding
        // the random number.
        uint256 tokenId = generateTokenId(seedRN ^ gasleft());
        _owners[tokenId] = addr;
        emit Transfer(address(0), addr, tokenId);
        totalSupply += 1;
      }
      // Update the balance of the address
      _balances[addr] += allowance;
      // Indicate that this address has now received its pre-purchased NFTs
      whiteListedAddressToMinted[addr] = true;
    }
  }

  /**
   * @dev Pick a random token id among the ones still available
   * @param randomNumber Random number which has previously provided by an oracle
   */
  function generateTokenId(uint256 randomNumber) private returns (uint256) {
    // We get the number of ids remaining by substracting the total supply
    // with the max supply
    uint256 idsRemaining = MAX_SUPPLY - totalSupply;
    // Keep the randomIndex within the 0 => 10,000 range
    uint256 randomIndex = randomNumber % idsRemaining;
    // Pick the id at randomIndex within the ids remaining
    uint256 tokenId = getIdAt(randomIndex);

    // Move the last id in the remaining ids into position randomIndex
    // That way if we get that randomIndex again it will return that number
    idsRemaining--;
    movedIds[randomIndex] = getIdAt(idsRemaining);
    // Free the storage used at the last index if used
    delete movedIds[idsRemaining];

    return tokenId;
  }

  function getIdAt(uint256 i) private view returns (uint256) {
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
  function addGiveAwayAddresses(address[] calldata addrs) external onlyOwner {
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
