// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { waitForRightGasPrice } from "../utils";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');
  // We get the contract to deploy

  console.log("Fetching Piano King RNConsumer smart contract...");
  const pianoKingRNConsumer = await ethers.getContractAt(
    "PianoKingRNConsumer",
    process.env.PIANO_KING_RN_CONSUMER as string
  );

  await waitForRightGasPrice();
  // Request a random number to use as seed for the presale batch
  console.log("Initiating randomness request...");
  const randomnessTx = await pianoKingRNConsumer.requestRandomNumber();
  await randomnessTx.wait(1);
  console.log("Random number requested...");

  // Listen to RandomNumberReceived to notify us when it is received
  pianoKingRNConsumer.on("RandomNumberReceived", async () => {
    console.log(
      "Random number received. You can proceed to execute the batch mint."
    );
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
