// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PianoKing.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * Dutch Auction contract for Piano King
 */
contract PianoKingDutchAuction is Ownable, ReentrancyGuard {
  struct Auction {
    uint256 startingPrice;
    // Unix timestamp in seconds
    uint256 startAt;
    // Unix timestamp in seconds
    uint256 expiresAt;
    // In Wei
    uint256 priceDeductionRate;
    // Minimum price at which a token can be sold
    uint256 reservePrice;
  }

  PianoKing private immutable pianoKing;
  // Id of the auction => auction
  mapping(uint256 => Auction) public auctions;
  // Counter to keep count of the auction ids
  uint256 public counter;

  event Buy(address winner, uint256 amount);

  constructor(address _pianoKing) {
    require(_pianoKing != address(0), "Invalid address");
    pianoKing = PianoKing(_pianoKing);
  }

  /**
   * @dev Initiate a new auction
   * @param duration Duration of the auctions in seconds
   * @param deductionRate Price depreciation per second in Wei
   * @param startingPrice Price in Wei at which the auction will start
   * @param reservePrice Reserve price in Wei fixing the minimum selling price
   */
  function initiateAuction(
    uint256 duration,
    uint256 deductionRate,
    uint256 startingPrice,
    uint256 reservePrice
  ) external onlyOwner {
    // Only one auction at a time
    require(
      block.timestamp >= auctions[counter].expiresAt,
      "Auction already in progress"
    );
    // The Dutch Auction can only happen after the first 8000 tokens have been minted
    require(pianoKing.totalSupply() >= 8000, "Auction phase not started");
    // If all the tokens have been sold but not minted yet, then we need to wait
    require(pianoKing.supplyLeft() > 0, "No token available for sell");
    Auction storage auction = auctions[counter++];
    // The auction start right at this block timestamp
    auction.startAt = block.timestamp;
    // We add the duration to the current timestamp
    // to get the end date of the auction
    auction.expiresAt = block.timestamp + duration;
    // How much is deducted from the price in Wei every second
    auction.priceDeductionRate = deductionRate;
    // The starting price
    auction.startingPrice = startingPrice;
    // Below that price, the token cannot be sold
    auction.reservePrice = reservePrice;
  }

  /**
   * @dev Anyone willing to make an offer to buy a given token
   * can call this function
   */
  function buy() external payable nonReentrant {
    uint256 price = getCurrentPrice();
    // If the sender send enough to match the price then he/she wins that token
    require(msg.value >= price, "Not enough funds");

    // Premint an NFT for the buyer
    pianoKing.preMintFor{ value: msg.value }(msg.sender);

    emit Buy(msg.sender, msg.value);
  }

  /**
   * @dev Get the current price of the ongoing auction
   * If no auction is in progress, it will revert
   */
  function getCurrentPrice() public view returns (uint256) {
    require(counter > 0, "No auction created");
    // The counter has been incremented on initialization, so the current id is
    // actually the counter - 1
    Auction storage currentAuction = auctions[counter - 1];
    require(block.timestamp < currentAuction.expiresAt, "Auction expired");
    // If there's no token left then the auction is finished
    require(pianoKing.supplyLeft() > 0, "Auction finished");

    // Get the elapsed time since start
    uint256 timeElapsed = block.timestamp - currentAuction.startAt;
    // Get the deduction from the rate and the time elapsed
    uint256 deduction = currentAuction.priceDeductionRate * timeElapsed;
    // Get the current price by substracting the deduction from the starting price
    uint256 discountedPrice = currentAuction.startingPrice - deduction;
    // We make sure that the price is always at least the reserve price
    uint256 price = discountedPrice > currentAuction.reservePrice
      ? discountedPrice
      : currentAuction.reservePrice;

    return price;
  }
}
