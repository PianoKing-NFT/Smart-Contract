// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import {
  checkGasPrice,
  executeBatchMint,
  waitForRightGasPrice,
} from "../utils";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');
  // We get the contract to deploy

  console.log("Fetching the smart contracts...");
  const pianoKing = await ethers.getContractAt(
    "PianoKing",
    process.env.PIANO_KING as string
  );

  const pianoKingRNConsumer = await ethers.getContractAt(
    "PianoKingRNConsumer",
    process.env.PIANO_KING_RN_CONSUMER as string
  );

  const addresses = await pianoKing.getPremintAddresses();
  // Request a random number to use as seed for the presale batch
  console.log("Checking the random number is available...");
  const [randomSeed, randomIncrementor] =
    await pianoKingRNConsumer.getRandomNumbers();
  console.log("Random number available.");
  console.log(`The random seed is ${randomSeed}.`);
  console.log(`The random incrementor is ${randomIncrementor}.`);

  await executeBatchMint(
    async (addressCount) => {
      // This promise will resolve once the gas price is below 90 Gwei
      // Sending all the transactions at once could bloat temporarily the
      // blocks and send the gas price rising resulting in us paying a higher
      // cost for the last transactions. So we spread it out through time
      // and wait for the right moment for each transaction
      await waitForRightGasPrice();
      const tx = await pianoKing.batchMint(addressCount);
      const receipt = await tx.wait(1);
      console.log(
        `One transaction has been completed for ${addressCount} addresses and a total of ${receipt.gasUsed.toString()} gas`
      );
    },
    pianoKing.preMintAllowance,
    addresses,
    1000,
    100
  );
  console.log("Batch mint completed successfully!");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
