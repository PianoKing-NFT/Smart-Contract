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
} from "../typechain";

describe("Piano King", function () {
  let whiteList: PianoKingWhitelist;
  let pianoKing: PianoKing;
  let pianoKingRNConsumer: PianoKingRNConsumer;
  let pianoKingFunds: PianoKingFunds;
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

  it("Should return the right royalty info", async function () {
    const [receiver, amount] = await pianoKing.royaltyInfo(
      0,
      ethers.utils.parseEther("3")
    );
    // It should be the address of Piano King Funds
    expect(receiver).to.be.equal(pianoKingFunds.address);
    // It should be 5 percent of 3 ETH
    expect(amount).to.be.closeTo(
      ethers.utils.parseEther((3 * 0.05).toString()),
      Math.pow(10, 6)
    );
  });

  /* it("Should set the piano king wallet address", async () => {
    // The address should be the one defined before in the beforeEach hook
    expect(await pianoKing.pianoKingWallet()).to.be.equal(
      "0xA263f5e0A44Cb4e22AfB21E957dE825027A1e586"
    );
    const accounts = await ethers.getSigners();

    // Get an address to set the Piano King wallet to
    const newPianoKingWallet = accounts[9];
    // Set the new Piano King wallet address
    const tx = await pianoKing.setPianoKingWallet(newPianoKingWallet.address);
    await tx.wait(1);

    // Check that the address was changed correctly
    expect(await pianoKing.pianoKingWallet()).to.be.equal(
      newPianoKingWallet.address
    );
  }); */

  it("Should set the white list address", async () => {
    // The address should be the one defined before in the beforeEach hook
    expect(await pianoKing.pianoKingWhitelist()).to.be.equal(whiteList.address);
    const accounts = await ethers.getSigners();

    // Get an address to set the White List to
    const newPianoKingWhitelist = accounts[9];
    // Set the new Piano King wallet address
    const tx = await pianoKing.setWhitelist(newPianoKingWhitelist.address);
    await tx.wait(1);

    // Check that the address was changed correctly
    expect(await pianoKing.pianoKingWhitelist()).to.be.equal(
      newPianoKingWhitelist.address
    );
  });

  /* it("Should set the Dutch Auction address", async () => {
    // The address should be the zero address as it wasn't defined before
    expect(await pianoKing.pianoKingDutchAuction()).to.be.equal(
      ethers.constants.AddressZero
    );
    const accounts = await ethers.getSigners();

    // Get an address to set the Dutch Auction to
    const dutchAuctionAddress = accounts[9];
    // Set the new Dutch Auction address
    const tx = await pianoKing.setDutchAuction(dutchAuctionAddress.address);
    await tx.wait(1);

    // Check that the address was changed correctly
    expect(await pianoKing.pianoKingDutchAuction()).to.be.equal(
      dutchAuctionAddress.address
    );
  });

  it("Should add 2 addresses as pre-approved addresses", async () => {
    // Get the two addresses to add
    const accounts = await ethers.getSigners();
    const address1 = accounts[5];
    const address2 = accounts[6];

    // For now these addresses should not have any pre approved allowance
    expect(await pianoKing.preApprovedAddress(address1.address)).to.be.equal(0);
    expect(await pianoKing.preApprovedAddress(address2.address)).to.be.equal(0);

    const tx = await pianoKing.addPreApprovedAddresses(
      [address1.address, address2.address],
      // The first address will have a pre-approved allowance of 2 and
      // the second a pre-approved allowance of 4
      [2, 4]
    );
    await tx.wait(1);

    // Check that the allowance have been set properly
    expect(await pianoKing.preApprovedAddress(address1.address)).to.be.equal(2);
    expect(await pianoKing.preApprovedAddress(address2.address)).to.be.equal(4);
  }); 

  it("Should set the base uri properly", async () => {
    // It should be equal to the default value
    expect(await pianoKing.baseURI()).to.be.equal("https://example.com/");

    const tx = await pianoKing.setBaseURI("ipfs://ersddsdfefwerwr/");
    await tx.wait(1);

    // The default URI should have been changed to the new one
    expect(await pianoKing.baseURI()).to.be.equal("ipfs://ersddsdfefwerwr/");
  }); */

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

    const randomnessTx = await pianoKingRNConsumer.requestRandomNumber();
    await randomnessTx.wait(1);

    // We get the request id of the randomness request from the events
    const requestRandomnessFilter =
      pianoKingRNConsumer.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKingRNConsumer.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;
    // Mock a response from Chainlink oracles with the number 42 as so-called
    // random number
    const randomNumber = 42;
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      randomNumber,
      pianoKingRNConsumer.address
    );
    await vrfTx.wait(1);
    // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
    expect(await linkToken.balanceOf(pianoKingRNConsumer.address)).to.be.equal(
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
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);
  });

  it("Should withdraw LINK from the contract", async () => {
    // Get how many LINK the contract owner initially has
    const initialDeployerBalance = await linkToken.balanceOf(deployer.address);

    // Should have all its LINK for now
    expect(await linkToken.balanceOf(pianoKingRNConsumer.address)).to.be.equal(
      INITIAL_LINK_BALANCE
    );

    const tx = await pianoKingRNConsumer.withdrawLinkTokens(
      ethers.utils.parseEther("10")
    );
    await tx.wait(1);

    // 10 LINK should have been deducted from the contract balance
    expect(await linkToken.balanceOf(pianoKingRNConsumer.address)).to.be.equal(
      INITIAL_LINK_BALANCE.sub(ethers.utils.parseEther("10"))
    );
    // And the owner of the contract should now own the withdrawn LINK
    expect(await linkToken.balanceOf(deployer.address)).to.be.equal(
      initialDeployerBalance.add(ethers.utils.parseEther("10"))
    );
  });
});
