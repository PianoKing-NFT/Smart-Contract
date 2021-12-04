// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @dev Contract meant to receive the royalties for a given
 * token of Piano King Private and then splitting it between
 * the minter and the creator when sending the funds
 */
contract PianoKingPrivateSplitter is Ownable {
  using Address for address payable;
  address private immutable creator;
  address private immutable minter;
  uint256 private immutable minterRoyalties;
  uint256 private immutable creatorRoyalties;

  constructor(
    address _creator,
    address _minter,
    uint256 _minterRoyalties,
    uint256 _creatorRoyalties
  ) {
    creator = _creator;
    minter = _minter;
    minterRoyalties = _minterRoyalties;
    creatorRoyalties = _creatorRoyalties;
  }

  receive() external payable {}

  /**
   * @dev Send the royalties accumulated on the contract
   * to the minter and creator according to the royalties defined
   * when minting the token
   */
  function retrieveRoyalties() external onlyOwner {
    uint256 totalRoyalties = minterRoyalties + creatorRoyalties;
    // From 0 to 10000 using 2 decimals (550 => 5.5%)
    uint256 creatorPercentage = (creatorRoyalties * 10000) / totalRoyalties;
    // Send the right amount to the creator
    payable(creator).sendValue(
      (creatorPercentage * address(this).balance) / 10000
    );
    // Send the remaining balance to the minter
    payable(minter).sendValue(address(this).balance);
  }
}
