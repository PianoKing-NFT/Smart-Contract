/* eslint-disable node/no-extraneous-import */
import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "hardhat";

export async function waitForRightGasPrice() {
  return new Promise((resolve) => {
    // Will run this code every 5 seconds until the gas price
    // is low enough
    const interval = setInterval(async () => {
      try {
        console.log("Checking gas price...");
        // Will throw an Error if the gas price is too high
        await checkGasPrice();
        console.log("Gas price below 90 Gwei, ready to mint...");
        clearInterval(interval);
        resolve("");
      } catch (error) {
        console.log("Gas price too high. Waiting for the right moment...");
      }
    }, 5000);
  });
}

export async function checkGasPrice() {
  const gasPrice = await ethers.provider.getGasPrice();
  console.log(
    "Current gas price in Gwei: ",
    ethers.utils.formatUnits(gasPrice, "gwei")
  );
  // If the gas price is above 90 Gwei we throw an error
  if (gasPrice.gt(ethers.utils.parseUnits("90", "gwei"))) {
    throw new Error("Gas price too high. Wait a moment and try again.");
  }
}

export async function executeBatchMint(
  call = async (addressCount: number) => {},
  getAllowanceFn = async (address: string) => BigNumber.from(0),
  addresses: string[],
  batchSize = 1000,
  maxPerCall = 100
) {
  let count = 0;
  let addressIndex = 0;
  while (count < batchSize && addressIndex < addresses.length) {
    let callCount = 0;
    let addressCount = 0;
    // Limit each call to a given number of tokens
    while (callCount <= maxPerCall && addressIndex < addresses.length) {
      const allowance = (
        await getAllowanceFn(addresses[addressIndex])
      ).toNumber();
      // Don't consider addresses with empty allowances
      if (allowance > 0) {
        addressCount++;
      }
      callCount += allowance;
      addressIndex++;
    }
    await call(addressCount);
    count += callCount;
  }
}
