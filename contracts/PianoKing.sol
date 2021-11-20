// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PianoKing is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {
  // Default value of bool is false in Solidity (any unassigned variable will be
  // set to its zero state, e.g. 0 for uint256, Zero address for address),
  // so it's better not to assign it manually since this would consume more gas
  // Indicate whether the presale tokens have distributed
  bool private preSaleTokensDistributed;
  // The amount in Wei required to give this contract to mint an NFT
  uint256 public minPrice = 250000000000000000;
  // The max supply possible is 10,000 tokens
  uint16 public constant MAX_SUPPLY = 10000;

  constructor() ERC721("PianoKing", "PK") {}

  function _baseURI() internal pure override returns (string memory) {
    // TO-DO: replace this url by the base url where the metadata
    // of each token will be stored.
    // It will be either a centralized server or on IPFS, TBD
    // See OpenSea docs for the metadata standards:
    // https://docs.opensea.io/docs/metadata-standards
    return "https://example.com/";
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
    //_safeMint(msg.sender, tokenId);
    //_setTokenURI(tokenId, uri);
  }

  function mintPreSaleTokens() external onlyOwner {
    /**
     * TO-DO: implement the logic to mint randomly
     * (using Chainlink, so 2 functions will be needed)
     * the 1000 tokens bought during the presale
     * and transfer them to their respective owner
     * by looping through the array of whitelisted
     * addresses of PianoKingWhitelist contract
     * and use the relevant mapping to check how many NTFs
     * an address has bought
     */
    // The distribution can only be done once for the presale
    require(!preSaleTokensDistributed, "Distributed already");
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
}
