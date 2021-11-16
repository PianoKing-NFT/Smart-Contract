//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PianoKingWhitelist is Ownable {
  // Address => amount of tokens allowed for white listed address
  mapping(address => uint256) private whiteListAmount;
  uint256 private tokenSupply = 1000;
  uint256 private maxTokenPerAddress = 25;
  // In wei => 0.1 Ether
  uint256 private pricePerToken = 100000000000000000;
  // Supply left to be distributed
  uint256 private supplyLeft = tokenSupply;

  // The address authorized to white list addresses
  address private whiteLister;

  bool private whiteListingEnabled = true;

  constructor(
    uint256 tokenSupply_,
    uint256 maxTokenPerAddress_,
    uint256 pricePerToken_,
    address whiteLister_
  ) {
    tokenSupply = tokenSupply_;
    maxTokenPerAddress = maxTokenPerAddress_;
    pricePerToken = pricePerToken_;
    whiteLister = whiteLister_;
  }

  /**
   * @dev Check that whitelisting is enabled and the sender
   * is the whitelister
   */
  modifier onlyWhitelister() {
    require(whiteListingEnabled, "Whitelisting disabled");
    require(msg.sender == whiteLister, "Not allowed");
    _;
  }

  /**
   * @dev Toggle white listing
   */
  function toggleWhitelisting(bool val) external onlyOwner {
    whiteListingEnabled = val;
  }

  /**
   * @dev Get the supply left
   */
  function getSupplyLeft() external view returns (uint256) {
    return supplyLeft;
  }

  /**
   * @dev Set the address allowed to white list
   */
  function setWhiteLister(address adr) external onlyOwner {
    require(adr != address(0), "Invalid address");
    whiteLister = adr;
  }

  /**
   * @dev White list an address for a given amount of tokens
   */
  function whiteListAddress(address adr, uint256 amountToGive)
    external
    onlyWhitelister
  {
    // We check there is enough supply left
    require(supplyLeft >= amountToGive, "Not enough tokens left");
    // 25 token per address max
    require(amountToGive <= 25, "Above maximum");
    // Classic check for zero address
    require(adr != address(0), "Zero address");
    // Assign the number of token to the sender
    whiteListAmount[adr] = amountToGive;
    // Remove the assigned tokens from the supply left
    supplyLeft -= amountToGive;
  }

  /**
   * @dev Get the amount of tokens the address has been whitelisted for
   * If the value is equal to 0 then the address is not whitelisted
   * @param adr The address to check
   */
  function getWhitelistAllowance(address adr) public view returns (uint256) {
    return whiteListAmount[adr];
  }
}
