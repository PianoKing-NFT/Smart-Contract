import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  PianoKingWhitelist,
  PianoKing,
  VRFCoordinatorMock,
  LinkToken,
} from "../typechain";

describe("PianoKing", function () {
  let whiteList: PianoKingWhitelist;
  let pianoKing: PianoKing;
  let vrfCoordinator: VRFCoordinatorMock;
  let linkToken: LinkToken;
  let deployer: SignerWithAddress;
  let buyer: SignerWithAddress;
  let pianoKingWallet: SignerWithAddress;
  let initialLinkBalance = 20000;
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

    const PianoKingFactory = await ethers.getContractFactory("PianoKing");
    pianoKing = await PianoKingFactory.deploy(
      whiteList.address,
      vrfCoordinator.address,
      linkToken.address,
      // Key hash for mainnet
      "0xAA77729D3466CA35AE8D28B3BBAC7CC36A5031EFDC430821C02BC31A238AF445",
      // 2 LINK fee on mainnet
      2
    );
    await pianoKing.deployed();

    // The LINK have been given to the deployer of the contract
    // therefore the first account, so we transfer some to PianoKing
    // contract in order to pay the fees for randomness requests
    const transferTx = await linkToken.transfer(
      pianoKing.address,
      initialLinkBalance
    );
    transferTx.wait(1);
  });

  it("Should not be able to deposit ETH", async function () {
    // No receive nor fallback function has been implemented so
    // we should expect that any ETH not sent with the whiteListSender
    // function will not be accepted and the transaction reverted
    // That way the only way to deposit ETH on the smart contract is to
    // go through the mint function.
    await expect(
      buyer.sendTransaction({
        to: pianoKing.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.reverted;
  });

  it("Should mint a random NFT with 0.25 ETH", async function () {
    // Initiate random request to mint an NFT
    const tx = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.25"),
    });
    tx.wait(1);
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
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      42,
      pianoKing.address
    );
    await vrfTx.wait(1);
    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const [mintEvent] = await pianoKing.queryFilter(mintFilter);
    const tokenId = mintEvent.args.tokenId;
    const to = mintEvent.args.to;
    // The token should be the number 42 returned by the mock Chainlink VRF
    expect(tokenId).to.be.equal(42);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should fail to mint an NFT with less than 0.25 ETH", async function () {
    // Try to mint with 0.24 ETH, so not enough
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.24"),
      })
    ).to.be.revertedWith("Not enough funds");
  });

  it("Should fail to mint second time if Chainlink VRF didn't respond", async function () {
    // This transaction should initiate a randomness request
    const tx = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.25"),
    });
    tx.wait(1);

    // A randomness request has been initiated by this sender just before
    // and no response has been given by Chainlink VRF yet, so it should fail
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.25"),
      })
    ).to.be.revertedWith("A minting is alreay in progress");

    // Get the id of the randomness request
    const requestRandomnessFilter = pianoKing.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKing.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;

    // Respond with 42 as the random number to PianoKing contract
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      42,
      pianoKing.address
    );
    await vrfTx.wait(1);

    // Now the sender should be able to mint a new NFT again
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.25"),
      })
    ).to.be.not.reverted;
  });

  it("Should fail to mint an NFT because not enough LINK for randomness request", async function () {
    // The smart contract should hold its previously given LINK balance
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      initialLinkBalance
    );
    // We deplete the smart contract from all its LINK tokens
    const withdrawLinkTx = await pianoKing.withdrawLinkTokens(
      initialLinkBalance - 1
    );
    withdrawLinkTx.wait(1);

    // The contract should only have 1 LINK which is below the 2 LINK
    // fee for a randomness request
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(1);

    // The transaction will fail since the contract doesn't have enough LINK
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.25"),
      })
    ).to.be.revertedWith("Not enough LINK");

    // We give back our smart contract some LINKs
    const transferTx = await linkToken.transfer(pianoKing.address, 2);
    transferTx.wait(1);

    // And now the transaction should work just fine
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.25"),
      })
    ).to.be.not.reverted;
  });
});
