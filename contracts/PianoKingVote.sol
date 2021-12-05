//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./PianoKing.sol";

contract PianoKingVote is Ownable, ReentrancyGuard {
  using Address for address payable;

  // Store tokens who were already used for current vote
  mapping(uint256 => bool) private usedTokens;

  //if a vote is open
  bool private voteOpen = false;
 
  //projects to vote for
  address[] private choices;

  //storage for current votes
  uint256[] private votes;
 
  //pianoking smart contract
  PianoKing public pianoKing;

  constructor() {
    pianoKing = PianoKing(0x770BC58f9A8F0d0c0Ed6999580105720960997Fa);
  }

  /**
   * @dev vote for a given choice with given piano king tokens sender owns
   */
  function vote(uint256[] memory tokenIds, uint256 choice) external {
    // Checks there is an ongoing vote
    require(voteOpen, "No ongoing vote");
    // Checks tokenIds size doesn't exceed limit
    require(tokenIds.length>0, "empty tokenIds array");
    // Checks tokenIds size doesn't exceed limit
    require(tokenIds.length<=25, "25 max per call allowed");
    // Checks if choice is correct
    require(choice>=0&&choice<choices.length, "this choice doesn't exist");
    // Checks if tokens are not already used
    for(uint256 i=0;i < tokenIds.length;i++){
      require(!usedTokens[tokenIds[i]], "one token was already used");
      require(pianoKing.ownerOf(tokenIds[i])==msg.sender, "one token is not yours");
    }
    votes[choice] += tokenIds.length;
    for(uint256 i=0;i < tokenIds.length;i++){
      usedTokens[tokenIds[i]] = true;
    }
  }

  /**
  * @dev For Test Purposes only ?
   */
  receive() external payable {}

  
  /**
   * @dev Gets the vote array
   */
  function getVotes() external view returns (uint256[] memory) {
    return votes;
  }

  /**
   * @dev Gets the address array
   */
  function getChoices() external view returns (address[] memory) {
    return choices;
  }

  /**
   * @dev if vote is opened
   */
  function getVoteOpen() external view returns (bool) {
    return voteOpen;
  }

  /**
   * @dev Starts a new vote
   */
  function startVote(address[] memory _choices) external onlyOwner {
    require(!voteOpen, "Already ongoing vote");
    require(_choices.length>0, "At least 1 choice");
    require(_choices.length<10, "max 10 choices");
    for(uint256 i=0;i < _choices.length;i++){
      require(_choices[i] != address(0), "Invalid address");
    }
    choices = _choices;
    votes = new uint256[](_choices.length);
    for(uint256 i=1;i<pianoKing.totalSupply()+1;i++){
          delete(usedTokens[i]);
    }
    voteOpen = true;
  }

  /**
   * @dev Ends current vote
   */
  function endVote() external onlyOwner {
    require(voteOpen, "No ongoing vote");
    uint256 total = 0;
    for(uint256 i=0;i<choices.length;i++){
      total+=votes[i];
    }
    require(total>0&&pianoKing.totalSupply()/total<=10, "Not enough votes");
    uint256 maxVote = votes[0];
    uint256 index = 0;
    for(uint256 i=1;i<choices.length;i++){
      if(votes[i]>maxVote){
        maxVote = votes[i];
        index = i;
      }
    }
    voteOpen = false;
    address winner = choices[index];
    payable(winner).sendValue(address(this).balance);
  }
}
