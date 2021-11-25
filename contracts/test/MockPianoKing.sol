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
}
