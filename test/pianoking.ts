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

describe("Piano King", function () {
  let whiteList: PianoKingWhitelist;
  let pianoKing: PianoKing;
  let vrfCoordinator: VRFCoordinatorMock;
  let linkToken: LinkToken;
  let deployer: SignerWithAddress;
  let buyer: SignerWithAddress;
  let pianoKingWallet: SignerWithAddress;
  const INITIAL_LINK_BALANCE = ethers.utils.parseEther("20000");
  const LINK_FEE = ethers.utils.parseEther("2");
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
      LINK_FEE
    );
    await pianoKing.deployed();

    // The LINK have been given to the deployer of the contract
    // therefore the first account, so we transfer some to PianoKing
    // contract in order to pay the fees for randomness requests
    const transferTx = await linkToken.transfer(
      pianoKing.address,
      INITIAL_LINK_BALANCE
    );
    await transferTx.wait(1);
  });

  it("Should not be able to deposit ETH", async function () {
    // No receive nor fallback function has been implemented so
    // we should expect that any ETH not sent with the mint
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

  it("Should fail to mint an NFT with less than 0.2 ETH", async function () {
    // Try to mint with 0.19 ETH, so not enough
    await expect(
      pianoKing.connect(buyer).preMint({
        value: ethers.utils.parseEther("0.19"),
      })
    ).to.be.revertedWith("Not enough funds");
  });

  it("Should fail to mint an NFT because the presale minting is not finished", async function () {
    // If the total supply is below 1000 then the presale batch mint hasn't been completed
    // yet and premint is not allowed yet
    expect(await pianoKing.totalSupply()).to.be.equal(0);
    await expect(
      pianoKing.connect(buyer).preMint({
        value: ethers.utils.parseEther("0.2"),
      })
    ).to.be.revertedWith("Presale mint not completed");
  });

  it("Should mint and distribute the tokens bought during the presale", async function () {
    const accounts = await ethers.getSigners();
    // Mimick the distribution of the actual presale (383 addresses)
    for (let i = 10; i < 393; i++) {
      if (i < 343) {
        const whiteLisTx = await whiteList
          .connect(accounts[i])
          .whiteListSender({
            value: ethers.utils.parseEther("0.2"),
          });
        await whiteLisTx.wait(1);
      } else if (i < 390) {
        const whiteLisTx = await whiteList
          .connect(accounts[i])
          .whiteListSender({
            value: ethers.utils.parseEther("0.7"),
          });
        await whiteLisTx.wait(1);
      } else if (i < 392) {
        const whiteLisTx = await whiteList
          .connect(accounts[i])
          .whiteListSender({
            value: ethers.utils.parseEther("0.2"),
          });
        await whiteLisTx.wait(1);
      } else {
        const whiteLisTx = await whiteList
          .connect(accounts[i])
          .whiteListSender({
            value: ethers.utils.parseEther("0.1"),
          });
        await whiteLisTx.wait(1);
      }
    }

    const randomnessTx = await pianoKing.requestBatchRN();
    await randomnessTx.wait(1);

    // We get the request id of the randomness request from the events
    const requestRandomnessFilter = pianoKing.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKing.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;
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
      INITIAL_LINK_BALANCE.sub(LINK_FEE)
    );

    const tx = await pianoKing.presaleMint(200);
    await tx.wait(1);
    const tx2 = await pianoKing.presaleMint(183);
    await tx2.wait(1);

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
    // console.log(mintEvents.map((x) => x.args.tokenId.toNumber()).slice(0, 50));
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);
  });
});
