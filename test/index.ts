import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { PianoKingWhitelist } from "../typechain";

describe("Whitelist", function () {
  let whiteList: PianoKingWhitelist;
  let deployer: SignerWithAddress;
  let whiteLister: SignerWithAddress;
  let buyer: SignerWithAddress;
  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    deployer = accounts[0];
    whiteLister = accounts[1];
    buyer = accounts[2];

    const Whitelist = await ethers.getContractFactory("PianoKingWhitelist");
    whiteList = await Whitelist.deploy(
      1000,
      25,
      "100000000000000000",
      whiteLister.address
    );
    await whiteList.deployed();
  });

  it("Should not be able to deposit ETH", async function () {
    await expect(
      buyer.sendTransaction({
        to: whiteList.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.reverted;
  });

  it("Should let whitelister whitelist an address", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList
      .connect(whiteLister)
      .whiteListAddress(buyer.address, 1);
    tx.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(1);
    expect(await whiteList.getSupplyLeft()).to.be.equal(999);
  });

  it("Should let whitelister whitelist an address for more than 1 token", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList
      .connect(whiteLister)
      .whiteListAddress(buyer.address, 10);
    tx.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      10
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(990);
  });

  it("Should not let anyone who's not the whitelister white list an address", async function () {
    await expect(
      whiteList.connect(buyer).whiteListAddress(buyer.address, 10)
    ).to.be.revertedWith("Not allowed");
  });

  it("Should not let whitelister whitelist an address if whitelisting is disabled", async function () {
    const tx = await whiteList.toggleWhitelisting(false);
    tx.wait(1);
    await expect(
      whiteList.connect(buyer).whiteListAddress(buyer.address, 10)
    ).to.be.revertedWith("Whitelisting disabled");
  });

  it("Should let the owner change the whitelister", async function () {
    const accounts = await ethers.getSigners();
    const secondWhiteLister = accounts[3];
    await expect(
      whiteList.connect(secondWhiteLister).whiteListAddress(buyer.address, 10)
    ).to.be.revertedWith("Not allowed");
    const tx = await whiteList.setWhiteLister(secondWhiteLister.address);
    tx.wait(1);
    await expect(
      whiteList.connect(secondWhiteLister).whiteListAddress(buyer.address, 10)
    ).to.not.be.reverted;
  });
});
