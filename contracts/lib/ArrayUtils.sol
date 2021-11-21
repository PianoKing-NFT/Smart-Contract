// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library ArrayUtils {
  function contains(address[] storage array, address item)
    internal
    view
    returns (bool)
  {
    for (uint256 i = 0; i < array.length; i++) {
      // Move the last element into the place to delete
      if (array[i] == item) {
        return true;
      }
    }
    return false;
  }

  function contains(uint256[] storage array, uint256 item)
    internal
    view
    returns (bool)
  {
    for (uint256 i = 0; i < array.length; i++) {
      // Move the last element into the place to delete
      if (array[i] == item) {
        return true;
      }
    }
    return false;
  }

  function remove(address[] storage array, address item) internal {
    require(array.length > 0, "Empty array");
    for (uint256 i = 0; i < array.length; i++) {
      // Move the last element into the place to delete
      if (array[i] == item) {
        array[i] = array[array.length - 1];
        // Remove the last element
        array.pop();
        break;
      }
    }
  }

  function remove(uint256[] storage array, uint256 item) internal {
    require(array.length > 0, "Empty array");
    for (uint256 i = 0; i < array.length; i++) {
      // Move the last element into the place to delete
      if (array[i] == item) {
        array[i] = array[array.length - 1];
        // Remove the last element
        array.pop();
        break;
      }
    }
  }

  function removeAt(address[] storage array, uint256 index) internal {
    require(array.length > 0, "Empty array");
    // Move the last element into the place to delete
    array[index] = array[array.length - 1];
    // Remove the last element
    array.pop();
  }

  function removeAt(uint256[] storage array, uint256 index) internal {
    require(array.length > 0, "Empty array");
    // Move the last element into the place to delete
    array[index] = array[array.length - 1];
    // Remove the last element
    array.pop();
  }
}
