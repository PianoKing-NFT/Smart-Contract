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

describe("Piano King Phase 2", function () {
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

  it("Should fail to mint a random NFT directly", async function () {
    // The contract should have all the LINK received before
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE
    );
    // We expect it to fail since the total supply is 5000, the phase 2
    // is on and only Dutch Auction contract can mint
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.2"),
      })
    ).to.be.revertedWith("Only through auction");
  });

  it("Should mint a random NFT after purchase through auction in the first slot of phase 2", async function () {
    // Initiate a dutch auction of 60 seconds
    const tx = await dutchAuction.initiateAuction(
      60,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("1")
    );
    await tx.wait(1);
    const buyTx = await dutchAuction.connect(buyer).buy({
      value: ethers.utils.parseEther("2"),
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
    // We check on the Piano King contract that a randomness request has been
    // initiated for the sender
    expect(await pianoKing.hasRequestedRandomness(buyer.address)).to.be.equal(
      true
    );
    // We get the request id of the randomness request from the events
    const requestRandomnessFilter = pianoKing.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKing.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;
    // The requester should be the buyer
    expect(requestRandomnessEvent.args.requester).to.be.equal(buyer.address);
    // Mock a response from Chainlink oracles with the number 42 as so-called
    // random number
    const randomNumber = 42;
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      randomNumber,
      pianoKing.address
    );
    await vrfTx.wait(1);
    // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE - LINK_FEE
    );
    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const [mintEvent] = await pianoKing.queryFilter(mintFilter);
    const tokenId = mintEvent.args.tokenId;
    const to = mintEvent.args.to;
    // The token should be the number 5043 since the Chainlink VRF returned 42
    // that's used as an index and we're the first slot of phase 2,
    // so between token id 5000 and 5500
    // expect(tokenId).to.be.equal(5000 + randomNumber + 1);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should mint a random NFT after purchase through auction in the last slot of phase 2", async function () {
    // We set the total supply to 9500 to initiate the last slot of phase 2
    const supplyTx = await pianoKing.setTotalSupply(9500);
    await supplyTx.wait(1);
    // Initiate a dutch auction of 60 seconds
    const tx = await dutchAuction.initiateAuction(
      60,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("1")
    );
    await tx.wait(1);
    const buyTx = await dutchAuction.connect(buyer).buy({
      value: ethers.utils.parseEther("2"),
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
    // We check on the Piano King contract that a randomness request has been
    // initiated for the sender
    expect(await pianoKing.hasRequestedRandomness(buyer.address)).to.be.equal(
      true
    );
    // We get the request id of the randomness request from the events
    const requestRandomnessFilter = pianoKing.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKing.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;
    // The requester should be the buyer
    expect(requestRandomnessEvent.args.requester).to.be.equal(buyer.address);
    // Mock a response from Chainlink oracles with the number 42 as so-called
    // random number
    const randomNumber = 42;
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      randomNumber,
      pianoKing.address
    );
    await vrfTx.wait(1);
    // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE - LINK_FEE
    );
    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const [mintEvent] = await pianoKing.queryFilter(mintFilter);
    const tokenId = mintEvent.args.tokenId;
    const to = mintEvent.args.to;
    // The token should be the number 9543 since the Chainlink VRF returned 42
    // that's used as an index and we're the first slot of phase 2,
    // so between token id 9500 and 10000
    // expect(tokenId).to.be.equal(9500 + randomNumber + 1);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should do a batch mint", async function () {
    const supplyTx = await pianoKing.setTotalSupply(0);
    await supplyTx.wait(1);

    const addresses = [];
    const allowances = [];
    for (let i = 0; i < 200; i++) {
      addresses.push(ethers.utils.hexZeroPad(ethers.utils.hexlify(i), 20));
      allowances.push(1);
    }
    // console.log(addresses);
    // console.log(allowances);

    const randomnessTx = await pianoKing.requestGroupRN();
    randomnessTx.wait(1);

    // We get the request id of the randomness request from the events
    const requestRandomnessFilter = pianoKing.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKing.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;
    // The requester should be the contract
    expect(requestRandomnessEvent.args.requester).to.be.equal(
      pianoKing.address
    );
    // Mock a response from Chainlink oracles with the number 42 as so-called
    // random number
    const randomNumber = 42;
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      randomNumber,
      pianoKing.address
    );
    await vrfTx.wait(1);
    // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE - LINK_FEE
    );

    const tx = await pianoKing.batchMint(addresses, allowances);
    tx.wait(1);

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    expect(mintEvents.length).to.be.equal(200);
    const tokenIds = mintEvents.map((x) => x.args.tokenId.toNumber());
    for (const tokenId of tokenIds) {
      expect(tokenId).to.be.lessThanOrEqual(5000);
    }
    console.log(tokenIds);
    // Since a Set cannot have duplicates we check here that
    // all the token ids generated are unique
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);
  });
});
