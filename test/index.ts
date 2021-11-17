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
    // Get the local accounts
    const accounts = await ethers.getSigners();
    // The default address is the first one
    deployer = accounts[0];
    // Set the buyer to be the second account
    buyer = accounts[1];

    // Deploys the whitelist contract
    const Whitelist = await ethers.getContractFactory("PianoKingWhitelist");
    whiteList = await Whitelist.deploy(
      // 1000 NFTs for the pre-sale
      1000,
      // 25 NFTs per address maximum
      25,
      // 0.1 ETH in Wei, setting the price of each NFT in the pre-sale
      "100000000000000000",
      // The address of the wallet that will receive all the funds
      // sent to the contract
      process.env.PIANO_KING_WALLET as string
    );
    await whiteList.deployed();

    // Get the balance of the wallet set to receive the funds
    walletBalance = await ethers.provider.getBalance(pianoKingWallet);
  });

  it("Should not be able to deposit ETH", async function () {
    // Not receive nor fallback function has been implemented so
    // we should expect that any ETH not send with the whiteListSender
    // function will not be accepted and the transaction reverted
    // That way the only to deposit ETH on the smart contract is to
    // go through the whiteListSender function.
    await expect(
      buyer.sendTransaction({
        to: whiteList.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.reverted;
  });

  it("Should whitelist the sender for one token", async function () {
    // Make sure the buyer has no tokens whitelisted for now
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getWhitelistedAddresses()).to.not.contain(
      buyer.address
    );
    // The supply should be full
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    // White list the buyer by sending 0.1 ETH giving him or her
    // 1 NFT
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("0.1"),
    });
    tx.wait(1);
    // We expect 1 NFT to be assigned to the buyer address
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(1);
    // We should find the address of the buyer in the white listed addresses list
    expect(await whiteList.getWhitelistedAddresses()).to.contain(buyer.address);
    // The supply should have decreased by 1
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
    // The buyer sent 1 ETH so 10 NFTs
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      10
    );
    expect(await whiteList.getWhitelistedAddresses()).to.contain(buyer.address);
    // 1000 - 10 = 990
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
    // 2.5 ETH => 25 NFTs
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      25
    );
    // 1000 - 25 = 975
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
    // 3 ETH would result in 30 NFTs which is above the maximum
    // so we expect the transaction to revert
    await expect(
      whiteList.connect(buyer).whiteListSender({
        value: ethers.utils.parseEther("3"),
      })
    ).to.be.revertedWith("Above maximum");
    // As the transaction failed, the buyer should not have acquired anything
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    // Should not have changed
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
    expect(await ethers.provider.getBalance(pianoKingWallet)).to.be.equal(
      walletBalance
    );
  });

  it("Should whitelist the sender for 15 tokens when providing 1.59 ETH", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    // The contract will floor the number of ETH sent to it so
    // that any excess of ETH not being enough to count for one more
    // NFT will not count for one more NFT. The excess will still be kept
    // by the smart contract and forwarded to the wallet
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("1.59"),
    });
    tx.wait(1);
    // 1.59 => 15.9 => 15 NFTs (as the number is floored)
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      15
    );
    // 1000 - 15 = 985
    expect(await whiteList.getSupplyLeft()).to.be.equal(985);
    // We expect the contract to have forwaded the fund to the Piano King wallet
    // so the contract should not hold any ETH and the wallet should have the ETH
    // sent by the user
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
    // The wallet should have the received the excess as well as the value of
    // the NFTs
    expect(await ethers.provider.getBalance(pianoKingWallet)).to.be.equal(
      walletBalance.add(ethers.utils.parseEther("1.59"))
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
    ).to.be.revertedWith("Above maximum");
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
