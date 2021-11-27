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
  /* const Whitelist = await ethers.getContractFactory("PianoKingWhitelist");
  const whiteList = await Whitelist.deploy();
  await whiteList.deployed();
  console.log("Whitelist deployed to:", whiteList.address); */
  /**
   * Idea for deployment: Listen to gas price with Etherscan API and trigger
   * the deployment of the contracts at a less expensive time
   */
  let tokenId = 1000 + (42 % 4001) + 1;
  const ids = [];
  for (let i = 0; i < 4000; i++) {
    tokenId = 1000 + ((tokenId + 3209) % 4001) + 1;
    if (tokenId > 5000) {
      tokenId = 1000 + ((tokenId + 3209) % 4001) + 1;
    }
    ids.push(tokenId);
  }
  console.log(ids.slice(3900));
  console.log(ids.length);
  console.log(new Set(ids).size);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
