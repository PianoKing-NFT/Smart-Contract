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

  /* const setURITx = await pianoKing.setBaseURI(
    "https://gateway.pinata.cloud/ipfs/QmPYV2ibmTkSHjag913wrQRLSZCAb8juPWnuTsmwaLabwN/"
  );
  await setURITx.wait(1); */
  console.log(await pianoKing.tokenURI(2));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
