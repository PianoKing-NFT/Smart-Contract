import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  PianoKingWhitelist,
  PianoKing,
  VRFCoordinatorMock,
  LinkToken,
  MockPianoKing,
  PianoKingDutchAuction,
} from "../typechain";

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("");
    }, ms);
  });
}

/**
 * Note, most of this tests can only pass on a local hardhat network
 * since any delay would make them fail.
 */
describe("Dutch Auction", function () {
  let whiteList: PianoKingWhitelist;
  let pianoKing: MockPianoKing;
  let vrfCoordinator: VRFCoordinatorMock;
  let linkToken: LinkToken;
  let dutchAuction: PianoKingDutchAuction;
  let deployer: SignerWithAddress;
  let buyer: SignerWithAddress;
  let pianoKingWallet: SignerWithAddress;
  const INITIAL_LINK_BALANCE = 20000;
  const LINK_FEE = 2;
  // let walletBalance: BigNumber;
  beforeEach(async () => {
    // Get the local accounts
    const accounts = await ethers.getSigners();
    // The default address is the first one
    deployer = accounts[0];
    // Set the buyer to be the second account
    buyer = accounts[1];
    // The address allowed to withdraw the funds
    // from the contract
    pianoKingWallet = accounts[2];

    // Deploys the whitelist contract
    const Whitelist = await ethers.getContractFactory("PianoKingWhitelist");
    whiteList = await Whitelist.deploy();
    await whiteList.deployed();

    whiteList.setPianoKingWallet(pianoKingWallet.address);

    const LINK = await ethers.getContractFactory("LinkToken");
    linkToken = await LINK.deploy();
    await linkToken.deployed();

    const VRFCoordinator = await ethers.getContractFactory(
      "VRFCoordinatorMock"
    );
    vrfCoordinator = await VRFCoordinator.deploy(linkToken.address);
    await vrfCoordinator.deployed();

    // Deploy a mock version of Piano King contract which let us modify
    // the total supply, which is necessary as the Dutch auction is only allowed
    // after the first 5000 have been distributed
    const PianoKingFactory = await ethers.getContractFactory("MockPianoKing");
    pianoKing = await PianoKingFactory.deploy(
      whiteList.address,
      vrfCoordinator.address,
      linkToken.address,
      // Key hash for mainnet
      "0xAA77729D3466CA35AE8D28B3BBAC7CC36A5031EFDC430821C02BC31A238AF445",
      // 2 LINK fee on mainnet
      LINK_FEE
    );
    await pianoKing.deployed();

    const totalSupplyTx = await pianoKing.setTotalSupply(5000);
    await totalSupplyTx.wait(1);

    const DutchAuction = await ethers.getContractFactory(
      "PianoKingDutchAuction"
    );
    dutchAuction = await DutchAuction.deploy(pianoKing.address);

    await dutchAuction.deployed();

    const setAuctionAddrTx = await pianoKing.setDutchAuction(
      dutchAuction.address
    );
    await setAuctionAddrTx.wait(1);

    // The LINK have been given to the deployer of the contract
    // therefore the first account, so we transfer some to PianoKing
    // contract in order to pay the fees for randomness requests
    const transferTx = await linkToken.transfer(
      pianoKing.address,
      INITIAL_LINK_BALANCE
    );
    transferTx.wait(1);
  });

  it("Should initiate an auction with the right values", async function () {
    // Initiate an auction for 5 seconds with a deduction rate of 0.1 ETH
    // a starting price of 2 ETH and a reserve price of 1 ETH
    const tx = await dutchAuction.initiateAuction(
      5,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("1")
    );
    // Get the blockhash into which this transaction has been integrated
    const { blockHash } = await tx.wait(1);
    // Get all the info of the auction
    const [
      startingPrice,
      startAt,
      expiresAt,
      priceDeductionRate,
      tokensLeft,
      reservePrice,
    ] = await dutchAuction.auctions(0);
    const block = await ethers.provider.getBlock(blockHash);
    // Check that info are correct
    expect(startingPrice).to.be.equal(ethers.utils.parseEther("2"));
    // The auction start at the block timestamp
    expect(startAt).to.be.equal(block.timestamp);
    // And expires at the block timestamp plus the 5 seconds defined as the duration
    expect(expiresAt).to.be.equal(block.timestamp + 5);
    expect(priceDeductionRate).to.be.equal(ethers.utils.parseEther("0.1"));
    // The amount of tokens always start at 500
    expect(tokensLeft).to.be.equal(500);
    expect(reservePrice).to.be.equal(ethers.utils.parseEther("1"));
  });

  it("Should fail to initiate an auction if the total supply of tokens minted so is less than 5000", async function () {
    // Set the total supply just shy of 5000 but below
    pianoKing.setTotalSupply(4999);
    // We expect the initiation to fail since the first phase is not over
    // as all the first 5000 tokens have to be sold first
    await expect(
      dutchAuction.initiateAuction(
        5,
        ethers.utils.parseEther("0.1"),
        ethers.utils.parseEther("2"),
        ethers.utils.parseEther("1")
      )
    ).to.be.revertedWith("Auction phase not started");
  });

  it("Should let sender buy if price matches", async function () {
    // Initiate a dutch auction of 60 seconds
    const tx = await dutchAuction.initiateAuction(
      60,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("1")
    );
    await tx.wait(1);
    // We wait 3 seconds
    await wait(3000);
    // The price should be now down to around 1.7 ETH since with a deduction
    // rate of 0.1 ETH/sec after 3s 0.3 ETH will have been deducted
    // We then expect the sender to be able to buy a token at 1.7 ETH
    const buyTx = await dutchAuction.connect(buyer).buy({
      value: ethers.utils.parseEther("1.7"),
    });
    buyTx.wait(1);
    const [
      startingPrice,
      startAt,
      expiresAt,
      priceDeductionRate,
      tokensLeft,
      reservePrice,
    ] = await dutchAuction.auctions(0);
    // One token has been given to the sender
    expect(tokensLeft).to.be.equal(499);
  });

  it("Should not let sender buy if price doesn't match", async function () {
    // 60 seconds auction
    const tx = await dutchAuction.initiateAuction(
      60,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("1")
    );
    await tx.wait(1);
    // Wait 1s
    await wait(1000);
    // After 1s the price should be around 1.9 ETH, so we expect
    // the transaction below to fail with "Not enough funds"
    await expect(
      dutchAuction.connect(buyer).buy({
        value: ethers.utils.parseEther("1.85"),
      })
    ).to.revertedWith("Not enough funds");
  });

  it("Should not let sender buy if auction is expired", async function () {
    // Auction of 1s
    const tx = await dutchAuction.initiateAuction(
      1,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("1")
    );
    await tx.wait(1);
    // After 1s the auction will be expired
    await wait(1000);
    // We expect the transaction to fail since the auction is expired
    await expect(
      dutchAuction.connect(buyer).buy({
        value: ethers.utils.parseEther("1.7"),
      })
    ).to.revertedWith("Auction expired");
  });

  it("Should not let sender buy below reserve price", async function () {
    // Initiate a dutch auction of 60 seconds
    const tx = await dutchAuction.initiateAuction(
      60,
      ethers.utils.parseEther("0.2"),
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("1")
    );
    await tx.wait(1);
    // We wait 6 seconds
    await wait(6000);
    // Even if after 6 seconds the price should be down to 0.8 ETH
    // the reserve price kicks in and the sender can only buy at 1 ETH
    // at least from that point, until the auction expires. So we expect
    // the transaction to fail with "Not enough funds" if we try to go for 0.8 ETH
    await expect(
      dutchAuction.connect(buyer).buy({
        value: ethers.utils.parseEther("0.8"),
      })
    ).to.revertedWith("Not enough funds");
  });
});
