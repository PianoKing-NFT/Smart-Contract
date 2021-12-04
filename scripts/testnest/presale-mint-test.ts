// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');
  // We get the contract to deploy
  /**
   * Idea for deployment: Listen to gas price with Etherscan API and trigger
   * the deployment of the contracts at a less expensive time
   */

  const pianoKing = await ethers.getContractAt(
    "MockPianoKing",
    process.env.PIANO_KING as string
  );
  console.log("Piano King deployed to:", pianoKing.address);

  const pianoKingRNConsumer = await ethers.getContractAt(
    "PianoKingRNConsumer",
    process.env.PIANO_KING_RN_CONSUMER as string
  );
  console.log(
    "Piano King RN Consumer deployed to:",
    pianoKingRNConsumer.address
  );

  const addresses: string[] = [];
  for (let i = 0; i < 250; i++) {
    // Send everything to the same address to have control over the supply
    // on the testnets
    addresses.push(process.env.ADDRESS as string);
  }

  // Request a random number to use as seed for the batch
  const randomnessTx = await pianoKingRNConsumer.requestRandomNumber();
  await randomnessTx.wait(1);
  console.log("Random number requested...");

  pianoKingRNConsumer.on("RandomNumberReceived", async () => {
    console.log("Random number received.");
    const tx = await pianoKing.doBatchMint(addresses, 125);
    await tx.wait(1);
    const tx2 = await pianoKing.doBatchMint(addresses, 125);
    await tx2.wait(1);
    console.log("Presale mint completed.");
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
