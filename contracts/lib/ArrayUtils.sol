// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library ArrayUtils {
  function removeAt(uint16[] storage array, uint256 index) internal {
    require(array.length > 0, "Empty array");
    // Move the last element into the place to delete
    array[index] = array[array.length - 1];
    // Remove the last element
    array.pop();
  }
}
