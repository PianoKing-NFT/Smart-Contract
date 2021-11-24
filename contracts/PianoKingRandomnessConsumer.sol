// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract PianoKingRandomnessConsumer {
  function fulfillRandomness(uint256 requestId, uint256 randomNumber)
    internal
    virtual;

  function rawFulfillRandomness(uint256 requestId, uint256 randomNumber)
    external
  {
    fulfillRandomness(requestId, randomNumber);
  }
}
