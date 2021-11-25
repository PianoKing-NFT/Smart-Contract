// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PianoKing.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * Dutch Auction contract for Piano King
 */
contract PianoKingDutchAuction is Ownable, ReentrancyGuard {
  // 500 token available for sale per auction
  uint256 public constant TOKEN_PER_AUCTIONS = 500;

  struct Auction {
    uint256 startingPrice;
    // Unix timestamp in seconds
    uint256 startAt;
    // Unix timestamp in seconds
    uint256 expiresAt;
    // In Wei
    uint256 priceDeductionRate;
    // The amount of tokens left in the auction
    uint256 tokensLeft;
    // Minimum price at which a token can be sold
    uint256 reservePrice;
  }

  PianoKing private pianoKing;
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
    // To follow the amount of tokens left in the auction
    // 500 are to be sold, once 0 is reached the auction
    // is considered finished
    auction.tokensLeft = TOKEN_PER_AUCTIONS;
    // Below that price, the token cannot be sold
    auction.reservePrice = reservePrice;
  }

  /**
   * @dev Anyone willing to make an offer to buy a given token
   * can call this function
   */
  function buy() external payable nonReentrant {
    // The counter has been incremented on initialization, so the current id is
    // actually the counter - 1
    Auction storage currentAuction = auctions[counter - 1];

    // Check if the auction has expired
    require(block.timestamp < currentAuction.expiresAt, "Auction expired");
    // If there's no token left then the auction is finished
    require(currentAuction.tokensLeft > 0, "Auction finished");

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

    // If the sender send enough to match the price then he wins that token
    require(msg.value >= price, "Not enough funds");

    // Mint a random NFT for the buyer
    pianoKing.mintFor{ value: msg.value }(msg.sender);
    // Decrease by one the number of token
    currentAuction.tokensLeft -= 1;

    emit Buy(msg.sender, msg.value);
  }
}
