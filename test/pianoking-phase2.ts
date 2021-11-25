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
} from "../typechain";

describe("Piano King Phase 2", function () {
  let whiteList: PianoKingWhitelist;
  let pianoKing: MockPianoKing;
  let vrfCoordinator: VRFCoordinatorMock;
  let linkToken: LinkToken;
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
});
