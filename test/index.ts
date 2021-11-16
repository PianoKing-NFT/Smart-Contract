import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { PianoKingWhitelist } from "../typechain";

const pianoKingWallet = process.env.PIANO_KING_WALLET as string;

describe("Whitelist", function () {
  let whiteList: PianoKingWhitelist;
  let deployer: SignerWithAddress;
  let buyer: SignerWithAddress;
  let walletBalance: BigNumber;
  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    // The default address is the first one
    deployer = accounts[0];
    buyer = accounts[1];

    const Whitelist = await ethers.getContractFactory("PianoKingWhitelist");
    whiteList = await Whitelist.deploy(
      1000,
      25,
      "100000000000000000",
      process.env.PIANO_KING_WALLET as string
    );
    await whiteList.deployed();

    walletBalance = await ethers.provider.getBalance(pianoKingWallet);
  });

  it("Should not be able to deposit ETH", async function () {
    await expect(
      buyer.sendTransaction({
        to: whiteList.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.reverted;
  });

  it("Should whitelist the sender for one token", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getWhitelistedAddresses()).to.not.contain(
      buyer.address
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("0.1"),
    });
    tx.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(1);
    expect(await whiteList.getWhitelistedAddresses()).to.contain(buyer.address);
    expect(await whiteList.getSupplyLeft()).to.be.equal(999);
    // We expect the contract to have forwaded the fund to the Piano King wallet
    // so the contract should not hold any ETH and the wallet should have the ETH
    // sent by the user
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
    expect(await ethers.provider.getBalance(pianoKingWallet)).to.be.equal(
      walletBalance.add(ethers.utils.parseEther("0.1"))
    );
  });

  it("Should whitelist the sender for 10 tokens", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getWhitelistedAddresses()).to.not.contain(
      buyer.address
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("1"),
    });
    tx.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      10
    );
    expect(await whiteList.getWhitelistedAddresses()).to.contain(buyer.address);
    expect(await whiteList.getSupplyLeft()).to.be.equal(990);
    // We expect the contract to have forwaded the fund to the Piano King wallet
    // so the contract should not hold any ETH and the wallet should have the ETH
    // sent by the user
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
    expect(await ethers.provider.getBalance(pianoKingWallet)).to.be.equal(
      walletBalance.add(ethers.utils.parseEther("1"))
    );
  });

  it("Should whitelist the sender for 25 tokens", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("2.5"),
    });
    tx.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      25
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(975);
    // We expect the contract to have forwaded the fund to the Piano King wallet
    // so the contract should not hold any ETH and the wallet should have the ETH
    // sent by the user
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
    expect(await ethers.provider.getBalance(pianoKingWallet)).to.be.equal(
      walletBalance.add(ethers.utils.parseEther("2.5"))
    );
  });

  it("Should not let sender get whitelisted for more than 25 tokens", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    await expect(
      whiteList.connect(buyer).whiteListSender({
        value: ethers.utils.parseEther("3"),
      })
    ).to.be.revertedWith("Above maximum");
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    // Should not have changed
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
    expect(await ethers.provider.getBalance(pianoKingWallet)).to.be.equal(
      walletBalance
    );
  });

  it("Should let sender get whitelisted twice", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getWhitelistedAddresses()).to.not.contain(
      buyer.address
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("1"),
    });
    tx.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      10
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(990);
    expect(await whiteList.getWhitelistedAddresses()).to.contain(buyer.address);
    expect(await whiteList.getWhitelistedAddresses()).to.be.length(1);
    // We expect the contract to have forwaded the fund to the Piano King wallet
    // so the contract should not hold any ETH and the wallet should have the ETH
    // sent by the user
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
    expect(await ethers.provider.getBalance(pianoKingWallet)).to.be.equal(
      walletBalance.add(ethers.utils.parseEther("1"))
    );
    const tx2 = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("1"),
    });
    tx2.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      20
    );
    expect(await whiteList.getWhitelistedAddresses()).to.contain(buyer.address);
    // We check that the lenght is still to make sure the sender wasn't added twice
    expect(await whiteList.getWhitelistedAddresses()).to.be.length(1);
    expect(await whiteList.getSupplyLeft()).to.be.equal(980);
    // We expect the contract to have forwaded the fund to the Piano King wallet
    // so the contract should not hold any ETH and the wallet should have the ETH
    // sent by the users
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
    expect(await ethers.provider.getBalance(pianoKingWallet)).to.be.equal(
      walletBalance.add(ethers.utils.parseEther("2"))
    );
  });

  it("Should not let sender get whitelisted twice if second time is above maximum", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("1"),
    });
    tx.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      10
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(990);
    // We expect the contract to have forwaded the fund to the Piano King wallet
    // so the contract should not hold any ETH and the wallet should have the ETH
    // sent by the user
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
    expect(await ethers.provider.getBalance(pianoKingWallet)).to.be.equal(
      walletBalance.add(ethers.utils.parseEther("1"))
    );
    // After getting 10 tokens, the sender tries to get 20 more by sending 2 ETH
    // But that would increase the total to 30 after completion, so it should not
    // succeed
    await expect(
      whiteList.connect(buyer).whiteListSender({
        value: ethers.utils.parseEther("2"),
      })
    ).to.be.revertedWith("Already too much");
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      10
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(990);
    // Should be the same as before since the second transaction failed
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
    expect(await ethers.provider.getBalance(pianoKingWallet)).to.be.equal(
      walletBalance.add(ethers.utils.parseEther("1"))
    );
  });
});
