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
    transferTx.wait(1);
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

  it("Should mint a random NFT with 0.2 ETH", async function () {
    // The contract should have all the LINK received before
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE
    );
    // Initiate a randomness request to mint an NFT
    const tx = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.2"),
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
    // The token should be the number 43 since the Chainlink VRF returned 42
    // that's used as an index
    expect(tokenId).to.be.equal(randomNumber + 1);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should mint an NFT with different id for the same random number", async function () {
    // The contract should have all the LINK received before
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE
    );
    // Initiate a randomness request to mint an NFT
    const tx = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.2"),
    });
    tx.wait(1);
    // We get the request id of the randomness request from the events
    const requestRandomnessFilter = pianoKing.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKing.queryFilter(
      requestRandomnessFilter
    );
    let requestId = requestRandomnessEvent.args.requestId;
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
    let tokenId = mintEvent.args.tokenId;
    let to = mintEvent.args.to;
    // The token should be the number 43 since the Chainlink VRF returned 42
    // that's used as an index
    expect(tokenId).to.be.equal(randomNumber + 1);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);

    // Initiate anoter randomness request to mint an NFT
    const tx2 = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.2"),
    });
    tx2.wait(1);

    // We get the request id of the randomness request from the events
    const requestRandomnessEvents = await pianoKing.queryFilter(
      requestRandomnessFilter
    );
    requestId = requestRandomnessEvents[1].args.requestId;
    // The requester should be the buyer
    expect(requestRandomnessEvent.args.requester).to.be.equal(buyer.address);
    // Mock a response from Chainlink oracles with the number 42 as so-called
    // random number
    const vrfTx2 = await vrfCoordinator.callBackWithRandomness(
      requestId,
      randomNumber,
      pianoKing.address
    );
    await vrfTx2.wait(1);
    // The contract should have lost 2 more LINK consumed by Chainlink VRF as fee
    // so 4 less in total
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE - LINK_FEE * 2
    );

    const mintEvents = await pianoKing.queryFilter(mintFilter);
    tokenId = mintEvents[1].args.tokenId;
    to = mintEvents[1].args.to;
    // The token should not be the number 43 since it was already picked earlier
    // It will get instead the last id that was moved into that slot, so 5,000
    // since the first phase is for the first 5000
    expect(tokenId).to.be.equal(5000);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should mint a random NFT with token id 50 when provided with random number 20049", async function () {
    // The contract should have all the LINK received before
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE
    );
    // Initiate a randomness request to mint an NFT
    const tx = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.2"),
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
    // Mock a response from Chainlink oracles with the number 20049 as so-called
    // random number
    const randomNumber = 20049;
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
    // The token should be the number 50 since the Chainlink VRF returned 20049
    // which should be modulo 5000, so 49. Since the contract add plus one to it
    // as to start the ids at 1 and not 0, we'll get 50
    expect(tokenId).to.be.equal(50);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should mint a random NFT with token id 1 when provided with random number 0", async function () {
    // The contract should have all the LINK received before
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE
    );
    // Initiate a randomness request to mint an NFT
    const tx = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.2"),
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
    // Mock a response from Chainlink oracles with the number 20049 as so-called
    // random number
    const randomNumber = 0;
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
    // The token should be the number 1 since the ids start at 1 and not 0
    expect(tokenId).to.be.equal(1);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should mint a random NFT with token id 5000 when provided with random number 4999", async function () {
    // The contract should have all the LINK received before
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE
    );
    // Initiate a randomness request to mint an NFT
    const tx = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.2"),
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
    // Mock a response from Chainlink oracles with the number 4999 as so-called
    // random number
    const randomNumber = 4999;
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
    // The token should be the number 5000 since 4999 is actually the last index
    // in the range for the first phase
    expect(tokenId).to.be.equal(5000);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should mint a random NFT with token id 1 when provided with random number 50000", async function () {
    // The contract should have all the LINK received before
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE
    );
    // Initiate a randomness request to mint an NFT
    const tx = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.2"),
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
    // Mock a response from Chainlink oracles with the number 5000 as so-called
    // random number
    const randomNumber = 5000;
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
    // The token should be the number 1 since 5000 modulo 5000 is 0
    // and we add 1 to it to start ids at 1
    expect(tokenId).to.be.equal(1);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should fail to mint an NFT with less than 0.2 ETH", async function () {
    // Try to mint with 0.19 ETH, so not enough
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.19"),
      })
    ).to.be.revertedWith("Not enough funds");
  });

  it("Should fail to mint second time if Chainlink VRF didn't respond", async function () {
    // This transaction should initiate a randomness request
    const tx = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.2"),
    });
    tx.wait(1);

    // A randomness request has been initiated by this sender just before
    // and no response has been given by Chainlink VRF yet, so it should fail
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.2"),
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
        value: ethers.utils.parseEther("0.2"),
      })
    ).to.be.not.reverted;
  });

  it("Should fail to mint an NFT because not enough LINK for randomness request", async function () {
    // The smart contract should hold its previously given LINK balance
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(
      INITIAL_LINK_BALANCE
    );
    // We deplete the smart contract from all its LINK tokens
    const withdrawLinkTx = await pianoKing.withdrawLinkTokens(
      INITIAL_LINK_BALANCE - 1
    );
    withdrawLinkTx.wait(1);

    // The contract should only have 1 LINK which is below the 2 LINK
    // fee for a randomness request
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(1);

    // The transaction will fail since the contract doesn't have enough LINK
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.2"),
      })
    ).to.be.revertedWith("Not enough LINK");

    // We give back our smart contract some LINKs
    const transferTx = await linkToken.transfer(pianoKing.address, 2);
    transferTx.wait(1);

    // The contract should have 3 LINK now (1 + 2)
    expect(await linkToken.balanceOf(pianoKing.address)).to.be.equal(3);

    // And now the transaction should work just fine
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.2"),
      })
    ).to.be.not.reverted;
  });

  it("Should mint and distribute the tokens bought during the presale", async function () {
    const accounts = await ethers.getSigners();
    for (let i = 10; i < 20; i++) {
      const whiteLisTx = await whiteList.connect(accounts[i]).whiteListSender({
        value: ethers.utils.parseEther("2.5"),
      });
      whiteLisTx.wait(1);
    }

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

    const tx = await pianoKing.presaleMint();
    tx.wait(1);

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    expect(mintEvents.length).to.be.equal(250);
    expect(mintEvents[0].args.to).to.be.equal(accounts[10].address);
    expect(mintEvents[1].args.to).to.be.equal(accounts[10].address);
    expect(mintEvents[25].args.to).to.be.equal(accounts[11].address);
    expect(mintEvents[26].args.to).to.be.equal(accounts[11].address);
    expect(mintEvents[0].args.tokenId).to.be.not.equal(
      mintEvents[1].args.tokenId
    );
    /* console.log(
      mintEvents.map((x) => x.args.tokenId.toNumber()).filter((x) => x <= 150)
    ); */
  });
});
