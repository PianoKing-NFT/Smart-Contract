// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./PianoKingRandomnessConsumer.sol";

/**
 * Contract meant to request random numbers for Piano King contract.
 * Several oracles can be added to make it more trustless
 */
contract PianoKingRandomnessOracle is Ownable {
  using Address for address;
  // Id of the request => Request
  mapping(uint256 => Request) private requests;
  // Increasing request id starting at 0
  uint256 private currentId;
  // Total number of trusted oracles
  uint256 private totalOracleCount;
  // Address => whether this address is trusted as an oracle to provide a random number
  mapping(address => bool) public isTrustedOracle;
  // Address => whether this address is allowed to initiate randomness requests
  mapping(address => bool) public isTrustedRequester;

  struct Request {
    // The combined random number resulting from the XOR of the answers
    uint256 randomNumber;
    // The different random number provided by the oracles
    uint256[] anwers;
    // oracles which will query the answer (false=oracle hasn't voted, true=oracle has voted)
    mapping(address => bool) quorum;
    // Whether the request has been completed or not
    bool completed;
    // The address that requested that request the random number
    address requester;
  }

  // Event that triggers oracle outside of the blockchain
  event NewRequest(address indexed requester, uint256 indexed id);

  // Triggered when there's a consensus on the final result
  event UpdatedRequest(uint256 indexed id, uint256 randomNumber);

  /**
   * @dev Emit an event to let off-chains oracles fetch a random
   * number
   * @return The id of the newly created request
   */
  function requestRandomNumber() external returns (uint256) {
    // Check the sender is allowed to request a random number
    require(isTrustedRequester[msg.sender], "Not allowed");
    // Save the sender as the requester
    requests[currentId].requester = msg.sender;
    // Emit an event to be detected by off-chain oracles
    emit NewRequest(msg.sender, currentId);
    // Return then increase request id
    return currentId++;
  }

  /**
   * @dev Called by the oracle with a random number
   */
  function updateRequest(uint256 id, uint256 randomNumberRetrieved) external {
    // Check if the sender is part of the trusted oracles
    require(isTrustedOracle[msg.sender], "Not trusted");
    Request storage currentRequest = requests[id];
    // Check whether the request has been completed already or not
    require(!currentRequest.completed, "Request already completed");
    // Check if the oracle hasn't voted yet
    require(!currentRequest.quorum[address(msg.sender)], "Already voted");

    // Marking that the sender has voted
    currentRequest.quorum[msg.sender] = true;
    currentRequest.anwers.push(randomNumberRetrieved);

    // To xor every random numbers returned into one
    currentRequest.randomNumber =
      currentRequest.randomNumber ^
      randomNumberRetrieved;

    // At leat half (floored) of the oracles must have answered to mark the answer
    // as completed and send back the random number
    if (currentRequest.anwers.length >= totalOracleCount / 2) {
      currentRequest.completed = true;
      // Send back the random number to the requester
      callbackWithRN(id, currentRequest.randomNumber, currentRequest.requester);
      emit UpdatedRequest(id, currentRequest.randomNumber);
    }
  }

  function callbackWithRN(
    uint256 requestId,
    uint256 randomNumber,
    address requester
  ) private {
    PianoKingRandomnessConsumer consumer;
    bytes memory resp = abi.encodeWithSelector(
      consumer.rawFulfillRandomness.selector,
      requestId,
      randomNumber
    );
    (bool success, ) = requester.call(resp);
  }

  /**
   * @dev Approve a new oracle to provide random numbers
   */
  function addNewTrustedOracle(address addr) external onlyOwner {
    totalOracleCount += 1;
    isTrustedOracle[addr] = true;
  }

  /**
   * @dev Remove an oracle
   */
  function removeTrustedOracle(address addr) external onlyOwner {
    totalOracleCount -= 1;
    delete isTrustedOracle[addr];
  }

  /**
   * @dev Approve a new address to request random numbers
   */
  function addNewTrustedRequester(address addr) external onlyOwner {
    require(addr != address(0), "Invalid address");
    // Only contracts can initiate requests
    require(addr.isContract(), "EOA cannot initiate requests");
    isTrustedRequester[addr] = true;
  }

  /**
   * @dev Disapprove an address to request random numbers
   */
  function removeTrustedRequester(address addr) external onlyOwner {
    delete isTrustedRequester[addr];
  }
}
