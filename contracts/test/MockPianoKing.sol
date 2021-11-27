// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "../PianoKing.sol";

contract MockPianoKing is PianoKing {
  constructor(
    address _pianoKingWhitelistAddress,
    address _vrfCoordinator,
    address _linkToken,
    bytes32 _keyhash,
    uint256 _fee
  )
    PianoKing(
      _pianoKingWhitelistAddress,
      _vrfCoordinator,
      _linkToken,
      _keyhash,
      _fee
    )
  {}

  function setTotalSupply(uint256 supply) external {
    totalSupply = supply;
  }

  function batchMint(address[] calldata addrs, uint256[] calldata allowances)
    external
    onlyOwner
  {
    uint256 seedRN = globalRandomNumber;
    (uint256 lowerBound, uint256 upperBound) = getBounds();
    uint256 tokenId = (seedRN % 1000) + 1;
    for (uint256 i = 0; i < addrs.length; i++) {
      address addr = addrs[i];
      uint256 allowance = allowances[i];
      for (uint256 j = 0; j < allowance; j++) {
        // Generate a number from the random number for the given
        // address and this given token to be minted
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
}
