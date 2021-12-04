// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import linkABI from "./link-abi.json";

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

  /* const Whitelist = await ethers.getContractFactory("PianoKingWhitelist");
  const whiteList = await Whitelist.deploy();
  await whiteList.deployed();
  console.log("Whitelist deployed to:", whiteList.address); */

  const PianoKingRNConsumer = await ethers.getContractFactory(
    "PianoKingRNConsumer"
  );
  // Configuration for Rinkeby as it's the testnet used by OpenSea for tests
  // and also avaible for Chainlink VRF
  const pianoKingRNConsumer = await PianoKingRNConsumer.deploy(
    "0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B",
    "0x01BE23585060835E02B77ef475b0Cc51aA1e0709",
    "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311",
    ethers.utils.parseEther("0.1")
  );
  await pianoKingRNConsumer.deployed();

  const PianoKingFunds = await ethers.getContractFactory("PianoKingFunds");
  const pianoKingFunds = await PianoKingFunds.deploy();
  await pianoKingFunds.deployed();

  const PianoKing = await ethers.getContractFactory("MockPianoKing");
  const pianoKing = await PianoKing.deploy(
    "0x37E3ACd3f0d4B7d5B8cc31613A2B4e2Cb1A33397",
    pianoKingRNConsumer.address,
    pianoKingFunds.address
  );
  await pianoKing.deployed();
  console.log("Piano King deployed to:", pianoKing.address);

  const setURITx = await pianoKing.setBaseURI(
    "ipfs://QmPYV2ibmTkSHjag913wrQRLSZCAb8juPWnuTsmwaLabwN/"
  );
  await setURITx.wait(1);

  const linkToken = await ethers.getContractAt(
    linkABI,
    process.env.LINK as string
  );

  const transferTx = await linkToken.transfer(
    pianoKing.address,
    ethers.utils.parseEther("5")
  );
  await transferTx.wait(1);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
