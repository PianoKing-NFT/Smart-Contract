//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PianoKingWhitelist is Ownable, ReentrancyGuard {
  using Address for address payable;

  // Address => amount of tokens allowed for white listed address
  mapping(address => uint256) private whiteListAmount;
  address[] private whiteListedAddresses;
  uint256 private tokenSupply = 1000;
  uint256 private maxTokenPerAddress = 25;
  // In wei => 0.1 Ether
  uint256 private pricePerToken = 100000000000000000;
  // Supply left to be distributed
  uint256 private supplyLeft = tokenSupply;

  address private pianoKingWallet;

  event FundReceived(uint256 amount);
  event AddressWhitelisted(address indexed addr, uint256 amountOfToken);

  constructor(
    uint256 tokenSupply_,
    uint256 maxTokenPerAddress_,
    uint256 pricePerToken_,
    address pianoKingWallet_
  ) {
    tokenSupply = tokenSupply_;
    maxTokenPerAddress = maxTokenPerAddress_;
    pricePerToken = pricePerToken_;
    pianoKingWallet = pianoKingWallet_;
  }

  /**
   * @dev Set the address of the Piano King Wallet
   */
  function setPianoKingWallet(address addr) external onlyOwner {
    require(addr != address(0), "Invalid address");
    pianoKingWallet = addr;
  }

  /**
   * @dev Get the supply left
   */
  function getSupplyLeft() external view returns (uint256) {
    return supplyLeft;
  }

  /**
   * @dev White list an address for a given amount of tokens
   */
  function whiteListSender() external payable nonReentrant {
    // We check the value is at least greater or equal to that of
    // one token
    require(msg.value >= pricePerToken, "Not enough funds");
    uint256 amountOfToken = msg.value / pricePerToken;
    // We check there is enough supply left
    require(supplyLeft >= amountOfToken, "Not enough tokens left");
    // 25 token per address max
    require(amountOfToken <= maxTokenPerAddress, "Above maximum");
    // We check that if the sender has already some whitelisted tokens
    // adding more won't go above 25
    require(
      amountOfToken + whiteListAmount[msg.sender] <= maxTokenPerAddress,
      "Already too much"
    );
    // If the amount is set to zero then the sender
    // is not yet whitelisted so we add it to the list
    // of whitelisted addresses
    if (whiteListAmount[msg.sender] == 0) {
      whiteListedAddresses.push(msg.sender);
    }
    // Assign the number of token to the sender
    whiteListAmount[msg.sender] += amountOfToken;

    // Remove the assigned tokens from the supply left
    supplyLeft -= amountOfToken;

    // Forward all the funds to the token sale owners
    payable(pianoKingWallet).sendValue(msg.value);

    // Some events for easy to access info
    emit FundReceived(msg.value);
    emit AddressWhitelisted(msg.sender, amountOfToken);
  }

  /**
   * @dev Get the amount of tokens the address has been whitelisted for
   * If the value is equal to 0 then the address is not whitelisted
   * @param adr The address to check
   */
  function getWhitelistAllowance(address adr) public view returns (uint256) {
    return whiteListAmount[adr];
  }

  /**
   * @dev Get the list of all whitelisted addresses
   */
  function getWhitelistedAddresses() public view returns (address[] memory) {
    return whiteListedAddresses;
  }
}
