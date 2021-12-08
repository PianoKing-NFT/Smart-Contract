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

  console.log("Fetching Piano King smart contract...");
  const pianoKing = await ethers.getContractAt(
    "PianoKing",
    "0x725afa0c34bab44f5b1ef8f87c50438f934c1a85"
  );

  await waitForRightGasPrice();
  console.log("Deploying the contract receiving the royalties...");
  const PianoKingDutchAuction = await ethers.getContractFactory(
    "PianoKingDutchAuction"
  );
  const pianoKingDutchAuction = await PianoKingDutchAuction.deploy(
    pianoKing.address
  );
  await pianoKingDutchAuction.deployed();
  console.log(
    "Piano King Dutch Auction deployed to:",
    pianoKingDutchAuction.address
  );

  await waitForRightGasPrice();
  console.log("Setting address of Dutch Auction on Piano King...");
  const setDutchAuctionTx = await pianoKing.setDutchAuction(
    pianoKingDutchAuction.address
  );
  await setDutchAuctionTx.wait(1);
  console.log("Dutch Auction set.");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
