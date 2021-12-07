import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  PianoKingWhitelist,
  PianoKing,
  VRFCoordinatorMock,
  LinkToken,
  PianoKingRNConsumer,
  PianoKingFunds,
  PianoKingDutchAuction,
} from "../typechain";
import { getRandomNumber } from "../utils";
import { requestRandomNumber } from "./utils";

// Run the entire flow that will happen in the history of Piano King contract
// From the presale batch mint to the very last token through Dutch Auction
describe("Piano King Flow", function () {
  let whiteList: PianoKingWhitelist;
  let pianoKing: PianoKing;
  let pianoKingRNConsumer: PianoKingRNConsumer;
  let pianoKingFunds: PianoKingFunds;
  let vrfCoordinator: VRFCoordinatorMock;
  let dutchAuction: PianoKingDutchAuction;
  let linkToken: LinkToken;
  let deployer: SignerWithAddress;
  let buyer: SignerWithAddress;
  let pianoKingWallet: SignerWithAddress;
  let linkBalance = ethers.utils.parseEther("20000");
  const LINK_FEE = ethers.utils.parseEther("2");

  async function executePremintsAndMint(
    lowerBound: number,
    upperBound: number
  ) {
    const accounts = await ethers.getSigners();
    // Loop through 40 accounts and preMint 25 tokens for each with 5 ETH
    // to get to a total of 1000 tokens
    for (let i = 10; i < 50; i++) {
      const tx = await pianoKing.connect(accounts[i]).preMint({
        value: ethers.utils.parseEther("5"),
      });
      await tx.wait(1);
    }

    // Request a random number and update the link balance of the contract
    linkBalance = await requestRandomNumber(
      pianoKingRNConsumer,
      vrfCoordinator,
      linkToken,
      linkBalance,
      LINK_FEE
    );

    // Mint in 4 calls
    for (let i = 0; i < 4; i++) {
      // Each address has bought 25 tokens, so 10 addresses
      // will be 250 tokens
      const tx = await pianoKing.batchMint(10);
      await tx.wait(1);
    }

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    // We expect the total number of mint to be equal to the upper bound, that
    // is the first token id available for next batch
    expect(mintEvents.length).to.be.equal(upperBound);
    // We slice the events to get only the ones that correspond to the latest
    // batch mint
    const tokenIds = mintEvents
      .slice(lowerBound)
      .map((x) => x.args.tokenId.toNumber());
    // Each token id should be within the current range allowed
    for (const tokenId of tokenIds) {
      expect(tokenId).to.be.lessThanOrEqual(upperBound).greaterThan(lowerBound);
    }
    // Since a Set cannot have duplicates we check here that
    // all the token ids generated are unique
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);

    // The total supply should have been properly updated
    expect(await pianoKing.totalSupply()).to.be.equal(upperBound);
    if (upperBound < 8000) {
      // If it's not the last slot of phase 1 then there's still another batch
      // coming after that, so 1000 tokens
      expect(await pianoKing.supplyLeft()).to.be.equal(1000);
    } else {
      // We've reached the end of phase 1, next are the Dutch auctions,
      // so 200 tokens each
      expect(await pianoKing.supplyLeft()).to.be.equal(200);
    }

    for (let i = 10; i < 50; i++) {
      // Each address that preMinted should now own 25 tokens plus the ones
      // accumulated before, that is 25 per batch
      expect(await pianoKing.balanceOf(accounts[i].address)).to.be.equal(
        Math.floor(lowerBound / 1000) * 25 + 25
      );
    }
  }

  async function executeDutchAuctionAndMint(
    lowerBound: number,
    upperBound: number
  ) {
    const accounts = await ethers.getSigners();

    // We initiate a new Dutch auction
    const setAuctionTx = await dutchAuction.initiateAuction(
      // 3600 seconds => 1 hour
      3600,
      // Deduction price of 0.001 ETH/second
      ethers.utils.parseEther("0.001"),
      // Starting price of 5 ETH
      ethers.utils.parseEther("5"),
      // Reserve price of 1 ETH
      ethers.utils.parseEther("1")
    );
    await setAuctionTx.wait(1);

    // Loop through 200 addresses that each buy one token
    // through the auction
    for (let i = 10; i < 210; i++) {
      const tx = await dutchAuction.connect(accounts[i]).buy({
        value: ethers.utils.parseEther("5"),
      });
      await tx.wait(1);
    }

    // Request a random number and update the link balance of the contract
    linkBalance = await requestRandomNumber(
      pianoKingRNConsumer,
      vrfCoordinator,
      linkToken,
      linkBalance,
      LINK_FEE
    );

    // Mint in 2 calls
    for (let i = 0; i < 2; i++) {
      // Each address bought only 1 token so 100 addresses
      // will be 100 tokens
      const tx = await pianoKing.batchMint(100);
      await tx.wait(1);
    }

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    // We expect the total number of mint to be equal to the upper bound, that
    // is the first token id available for next batch
    expect(mintEvents.length).to.be.equal(upperBound);
    // We slice the events to get only the ones that correspond to the latest
    // batch mint
    const tokenIds = mintEvents
      .slice(lowerBound)
      .map((x) => x.args.tokenId.toNumber());
    // Each token id should be within the current range allowed
    for (const tokenId of tokenIds) {
      expect(tokenId).to.be.lessThanOrEqual(upperBound).greaterThan(lowerBound);
    }
    // Since a Set cannot have duplicates we check here that
    // all the token ids generated are unique
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);

    // The total supply should have been properly updated
    expect(await pianoKing.totalSupply()).to.be.equal(upperBound);
    if (upperBound < 10000) {
      // If it's not the last slot then there's still another batch
      // coming after that, so 200 tokens
      expect(await pianoKing.supplyLeft()).to.be.equal(200);
    } else {
      // We've reached the end of the supply, so no more batch
      expect(await pianoKing.supplyLeft()).to.be.equal(0);
    }

    for (let i = 10; i < 210; i++) {
      // Each address that preMinted should now own 1 token plus the ones
      // accumulated before 25 * 8 in the first 8 batches of 1000 tokens
      // for the first 40 addresses and 1 per Dutch auction
      if (i < 50) {
        expect(await pianoKing.balanceOf(accounts[i].address)).to.be.equal(
          25 * 8 + Math.floor((lowerBound - 8000) / 200) + 1
        );
      } else {
        expect(await pianoKing.balanceOf(accounts[i].address)).to.be.equal(
          Math.floor((lowerBound - 8000) / 200) + 1
        );
      }
    }
  }

  // We use a before instead of a beforeEach since we want each test
  // to depend on what happened in the ones before
  before(async () => {
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

    const PianoKingRNConsumer = await ethers.getContractFactory(
      "PianoKingRNConsumer"
    );
    pianoKingRNConsumer = await PianoKingRNConsumer.deploy(
      vrfCoordinator.address,
      linkToken.address,
      // Key hash for mainnet
      "0xAA77729D3466CA35AE8D28B3BBAC7CC36A5031EFDC430821C02BC31A238AF445",
      // 2 LINK fee on mainnet
      LINK_FEE
    );
    await pianoKingRNConsumer.deployed();

    const PianoKingFunds = await ethers.getContractFactory("PianoKingFunds");
    pianoKingFunds = await PianoKingFunds.deploy();
    await pianoKingFunds.deployed();

    const PianoKingFactory = await ethers.getContractFactory("PianoKing");
    pianoKing = await PianoKingFactory.deploy(
      whiteList.address,
      pianoKingRNConsumer.address,
      pianoKingFunds.address
    );
    await pianoKing.deployed();

    // The LINK have been given to the deployer of the contract
    // therefore the first account, so we transfer some to PianoKing
    // contract in order to pay the fees for randomness requests
    const transferTx = await linkToken.transfer(
      pianoKingRNConsumer.address,
      linkBalance
    );
    await transferTx.wait(1);
  });

  it("Should mint all of the tokens bought in presale", async function () {
    const accounts = await ethers.getSigners();
    for (let i = 10; i < 50; i++) {
      const whiteLisTx = await whiteList.connect(accounts[i]).whiteListSender({
        value: ethers.utils.parseEther("2.5"),
      });
      await whiteLisTx.wait(1);
    }

    linkBalance = await requestRandomNumber(
      pianoKingRNConsumer,
      vrfCoordinator,
      linkToken,
      linkBalance,
      LINK_FEE
    );

    // Mint in 4 calls
    for (let i = 0; i < 4; i++) {
      const tx = await pianoKing.presaleMint(10);
      await tx.wait(1);
    }

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    expect(mintEvents.length).to.be.equal(1000);
    const tokenIds = mintEvents.map((x) => x.args.tokenId.toNumber());
    for (const tokenId of tokenIds) {
      expect(tokenId).to.be.lessThanOrEqual(1000).greaterThan(0);
    }
    // Since a Set cannot have duplicates we check here that
    // all the token ids generated are unique
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);

    // The total supply should have been properly updated
    expect(await pianoKing.totalSupply()).to.be.equal(1000);
    // The next batch is 1000 tokens
    expect(await pianoKing.supplyLeft()).to.be.equal(1000);
  });

  it("Should mint the tokens from id 1001 to 2000", async function () {
    await executePremintsAndMint(1000, 2000);
  });

  it("Should mint the tokens from id 2001 to 3000", async function () {
    await executePremintsAndMint(2000, 3000);
  });

  it("Should mint the tokens from id 3001 to 4000", async function () {
    await executePremintsAndMint(3000, 4000);
  });

  it("Should mint the tokens from id 4001 to 5000", async function () {
    await executePremintsAndMint(4000, 5000);
  });

  it("Should mint the tokens from id 5001 to 6000", async function () {
    await executePremintsAndMint(5000, 6000);
  });

  it("Should mint the tokens from id 6001 to 7000", async function () {
    await executePremintsAndMint(6000, 7000);
  });

  it("Should mint the tokens from id 7001 to 8000", async function () {
    await executePremintsAndMint(7000, 8000);
  });

  it("Should deploy and set the Dutch Auction on Piano King contract", async () => {
    // Since we've passed the 8000 tokens minted, it's time for the Dutch auctions
    // So if we try to mint directly the transaction should fail since only the
    // Dutch auction contract can do so now
    await expect(
      pianoKing.connect(buyer).preMint({
        value: ethers.utils.parseEther("5"),
      })
    ).to.be.revertedWith("Only through auction");

    // We deploy the Dutch Auction contract
    const DutchAuction = await ethers.getContractFactory(
      "PianoKingDutchAuction"
    );
    dutchAuction = await DutchAuction.deploy(pianoKing.address);

    await dutchAuction.deployed();

    // And set it on the Piano King contract
    const setAuctionAddrTx = await pianoKing.setDutchAuction(
      dutchAuction.address
    );
    await setAuctionAddrTx.wait(1);
  });

  it("Should mint the tokens from 8001 to 8200 through Dutch Auctions", async () => {
    await executeDutchAuctionAndMint(8000, 8200);
  });

  it("Should mint the tokens from 8201 to 8400 through Dutch Auctions", async () => {
    await executeDutchAuctionAndMint(8200, 8400);
  });

  it("Should mint the tokens from 8401 to 8600 through Dutch Auctions", async () => {
    await executeDutchAuctionAndMint(8400, 8600);
  });

  it("Should mint the tokens from 8601 to 8800 through Dutch Auctions", async () => {
    await executeDutchAuctionAndMint(8600, 8800);
  });

  it("Should mint the tokens from 8801 to 9000 through Dutch Auctions", async () => {
    await executeDutchAuctionAndMint(8800, 9000);
  });

  it("Should mint the tokens from 9001 to 9200 through Dutch Auctions", async () => {
    await executeDutchAuctionAndMint(9000, 9200);
  });

  it("Should mint the tokens from 9201 to 9400 through Dutch Auctions", async () => {
    await executeDutchAuctionAndMint(9200, 9400);
  });

  it("Should mint the tokens from 9401 to 9600 through Dutch Auctions", async () => {
    await executeDutchAuctionAndMint(9400, 9600);
  });

  it("Should mint the tokens from 9601 to 9800 through Dutch Auctions", async () => {
    await executeDutchAuctionAndMint(9600, 9800);
  });

  it("Should mint the tokens from 9801 to 10000 through Dutch Auctions", async () => {
    await executeDutchAuctionAndMint(9800, 10000);
  });
});
