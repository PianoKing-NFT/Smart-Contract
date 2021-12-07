// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { checkGasPrice, waitForRightGasPrice } from "../utils";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');
  // We get the contract to deploy

  // Checking the gas price and will throw an error to stop
  // the deployment if the gas price are too high
  await waitForRightGasPrice();

  console.log("Deploying the random number consumer contract...");
  const PianoKingRNConsumer = await ethers.getContractFactory(
    "PianoKingRNConsumer"
  );
  // Configuration for Mainnet
  const pianoKingRNConsumer = await PianoKingRNConsumer.deploy(
    // VRF Coordinator address
    "0xf0d54349aDdcf704F77AE15b96510dEA15cb7952",
    // LINK token address
    "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    // Key hash
    "0xAA77729D3466CA35AE8D28B3BBAC7CC36A5031EFDC430821C02BC31A238AF445",
    // Fee in LINK (18 decimals so same as Wei)
    ethers.utils.parseEther("2")
  );
  await pianoKingRNConsumer.deployed();
  console.log(
    "Piano King RN Consumer deployed to:",
    pianoKingRNConsumer.address
  );

  await waitForRightGasPrice();
  console.log("Deploying the contract receiving the royalties...");
  const PianoKingFunds = await ethers.getContractFactory("PianoKingFunds");
  const pianoKingFunds = await PianoKingFunds.deploy();
  await pianoKingFunds.deployed();
  console.log("Piano King Funds deployed to:", pianoKingFunds.address);

  await waitForRightGasPrice();
  console.log("Deploying the main ERC721 contract...");
  const PianoKing = await ethers.getContractFactory("PianoKing");
  const pianoKing = await PianoKing.deploy(
    // Whitelist contract
    "0xB2E31C3D51bbfefB4653789CF0965f9dfa7C902a",
    // Address of the Piano King RN Consumer contract
    pianoKingRNConsumer.address,
    // Address of the Piano King Funds contract
    pianoKingFunds.address
  );
  await pianoKing.deployed();
  console.log("Piano King deployed to:", pianoKing.address);

  /* await waitForRightGasPrice();
  console.log("Setting base url for NFTs metadata...");
  const setURITx = await pianoKing.setBaseURI(
    process.env.IPFS_BASE_URL as string
  );
  await setURITx.wait(1);
  console.log("Base URL set."); */

  console.log("Deployment completed successfully!");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
