// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../PianoKing.sol";

contract MockPianoKing is PianoKing {
  constructor(
    address _pianoKingWhitelistAddress,
    address _pianoKingRNConsumer,
    address _pianoKingFunds
  )
    PianoKing(_pianoKingWhitelistAddress, _pianoKingRNConsumer, _pianoKingFunds)
  {}

  function setTotalSupply(uint256 supply) external onlyOwner {
    totalSupply = supply;
  }

  function setSupplyLeft(uint256 supply) external onlyOwner {
    supplyLeft = supply;
  }

  function doBatchMint(address[] memory addrs, uint256 count)
    external
    onlyOwner
  {
    _batchMint(addrs, count);
  }

  function getAllowance(address addr) internal view override returns (uint256) {
    return 4;
  }
}
