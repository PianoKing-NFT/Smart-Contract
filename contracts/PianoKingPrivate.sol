// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/**
 * @dev Contract meant for the private collection of Piano King
 */
contract PianoKingPrivate is
  ERC721,
  ERC721URIStorage,
  ERC721Burnable,
  IERC2981,
  Ownable
{
  using Counters for Counters.Counter;

  Counters.Counter private _tokenIdCounter;
  address public minter = 0x32a5dE462B2e6f3bFeCc7d558B3ac871F0C2fbF8;

  // Structure describing the details of the token
  // mostly useful for the royalties distribution
  struct TokenDetails {
    address creator;
    // From 0 to 10000 (i.e. 550 => 5.5%)
    uint256 minterRoyalties;
    // From 0 to 10000 (i.e. 550 => 5.5%)
    uint256 creatorRoyalties;
  }

  // Mapping each token id to its details
  mapping(uint256 => TokenDetails) private idToTokenDetails;

  constructor() ERC721("Piano King Private", "PKP") {}

  modifier onlyMinter() {
    require(msg.sender == minter, "Not minter");
    _;
  }

  /**
   * @dev Mint and send it directly do the minter
   */
  function mint(
    string memory uri,
    address creator,
    uint256 minterRoyalties,
    uint256 creatorRoyalties
  ) external onlyMinter {
    // Just call the mintFor function with the minter as the target address
    mintFor(minter, uri, creator, minterRoyalties, creatorRoyalties);
  }

  /**
   * @dev Mint and send to a given address
   */
  function mintFor(
    address to,
    string memory uri,
    address creator,
    uint256 minterRoyalties,
    uint256 creatorRoyalties
  ) public onlyMinter {
    // Get the token id to use
    uint256 tokenId = _tokenIdCounter.current();
    // Increment the token id counter for the next mint
    _tokenIdCounter.increment();
    // Safely mint the token and send it to the target address
    _safeMint(to, tokenId);
    // Associate the URI of the metadata for that given token
    _setTokenURI(tokenId, uri);
    // Store the wallet of the creator of the NFT, the royalties
    // meant for the minter and the ones meant for the creator
    idToTokenDetails[tokenId] = TokenDetails({
      creator: creator,
      minterRoyalties: minterRoyalties,
      creatorRoyalties: creatorRoyalties
    });
  }

  /**
   * @dev Set the address of the minter
   */
  function setMinter(address addr) external onlyOwner {
    require(addr != address(0), "Invalid address");
    minter = addr;
  }

  // The following functions are overrides required by Solidity.

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

  /**
   * @dev Get the details of a given token
   */
  function getTokenDetails(uint256 tokenId)
    external
    view
    returns (TokenDetails memory details)
  {
    return idToTokenDetails[tokenId];
  }

  /**
   * @dev Get the amount of royalties to distribute for the creator of
   * a given tokenId
   * @param tokenId Id of the token to query
   * @param salePrice Price for which the token has been sold
   */
  function getRoyaltyForCreator(uint256 tokenId, uint256 salePrice)
    external
    view
    returns (uint256)
  {
    // Check the token does exist
    require(_exists(tokenId), "Token does not exist");
    // Get the details associated to the token
    TokenDetails storage details = idToTokenDetails[tokenId];
    // Return how much the creator should get
    return (salePrice * details.creatorRoyalties) / 10000;
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
    // Check the token does exist
    require(_exists(tokenId), "Token doesn't exist");
    // Get the details associated to the token
    TokenDetails storage details = idToTokenDetails[tokenId];
    // The minter will receive all the royalties and the distribution
    // to multiple parties will be made by him
    // Easier than going through proxy payment splitter contracts for each
    // NFT
    receiver = minter;
    // We divide it by 10000 as the royalties can change from
    // 0 to 10000 representing percents with 2 decimals
    royaltyAmount =
      (salePrice * (details.minterRoyalties + details.creatorRoyalties)) /
      10000;
  }
}
