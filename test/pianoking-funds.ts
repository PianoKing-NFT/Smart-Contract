import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { PianoKingFunds } from "../typechain";

describe("Piano King Funds", function () {
  let pianoKingFunds: PianoKingFunds;
  let deployer: SignerWithAddress;
  let dao1: string;
  let dao2: string;
  let exchange: SignerWithAddress;
  beforeEach(async () => {
    // Get the local accounts
    const accounts = await ethers.getSigners();
    // The default address is the first one
    deployer = accounts[0];
    exchange = accounts[1];
    dao1 = ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 20);
    dao2 = ethers.utils.hexZeroPad(ethers.utils.hexlify(2), 20);

    const PianoKingFunds = await ethers.getContractFactory("PianoKingFunds");
    pianoKingFunds = await PianoKingFunds.deploy();
    await pianoKingFunds.deployed();
  });

  it("Should be able to deposit ETH", async function () {
    await expect(
      exchange.sendTransaction({
        to: pianoKingFunds.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.not.reverted;
  });

  it("Should be able to retrieve the funds of the contract", async function () {
    // Set the addresses of the DAOs on the contract
    const setDaosTx = await pianoKingFunds.setDAOAddresses(dao1, dao2);
    await setDaosTx.wait(1);

    // Get the current balances of DAOs
    const dao1Balance = await ethers.provider.getBalance(dao1);
    const dao2Balance = await ethers.provider.getBalance(dao2);

    // Mimick the exchange platform sending 1 ETH to the contract
    // as the royalties on a given sale
    const sendTx = await exchange.sendTransaction({
      to: pianoKingFunds.address,
      value: ethers.utils.parseEther("1"),
    });
    await sendTx.wait(1);

    // Send the funds to the DAOs
    const tx = await pianoKingFunds.retrieveFunds();
    tx.wait(1);

    // The funds should have been splitted evenly between the two DAOs
    expect(dao1Balance.add(ethers.utils.parseEther("0.5")));
    expect(dao2Balance.add(ethers.utils.parseEther("0.5")));

    // The contract should now be empty of any ETH
    expect(
      await ethers.provider.getBalance(pianoKingFunds.address)
    ).to.be.equal(0);
  });

  it("Should fail to retrieve the funds if the DAOs are not set", async function () {
    // Mimick the exchange platform sending 1 ETH to the contract
    // as the royalties on a given sale
    const sendTx = await exchange.sendTransaction({
      to: pianoKingFunds.address,
      value: ethers.utils.parseEther("1"),
    });
    await sendTx.wait(1);

    // It should fail as the DAOs addresses have not been set yet
    await expect(pianoKingFunds.retrieveFunds()).to.be.revertedWith(
      "DAOs not active"
    );
  });
});
