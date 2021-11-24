import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  PianoKingWhitelist,
  PianoKing,
  PianoKingRandomnessOracle,
} from "../typechain";

describe("PianoKing", function () {
  let whiteList: PianoKingWhitelist;
  let pianoKing: PianoKing;
  let pianoKingOracle: PianoKingRandomnessOracle;
  let deployer: SignerWithAddress;
  let buyer: SignerWithAddress;
  let pianoKingWallet: SignerWithAddress;
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

    const PianoKingOracle = await ethers.getContractFactory(
      "PianoKingRandomnessOracle"
    );
    pianoKingOracle = await PianoKingOracle.deploy();
    await pianoKingOracle.deployed();

    const PianoKingFactory = await ethers.getContractFactory("PianoKing");
    pianoKing = await PianoKingFactory.deploy(
      whiteList.address,
      pianoKingOracle.address
    );
    await pianoKing.deployed();

    const tx = await pianoKingOracle.addNewTrustedRequester(pianoKing.address);
    tx.wait(1);

    const tx2 = await pianoKingOracle.addNewTrustedOracle(deployer.address);
    tx2.wait(1);
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

  it("Should mint a random NFT with 0.25 ETH", async function () {
    // Initiate a randomness request to mint an NFT
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
    const randomNumber = 42;
    const vrfTx = await pianoKingOracle.updateRequest(requestId, randomNumber);
    await vrfTx.wait(1);
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
    // Initiate a randomness request to mint an NFT
    const tx = await pianoKing.connect(buyer).mint({
      value: ethers.utils.parseEther("0.25"),
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
    const vrfTx = await pianoKingOracle.updateRequest(requestId, randomNumber);
    await vrfTx.wait(1);
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
      value: ethers.utils.parseEther("0.25"),
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
    const vrfTx2 = await pianoKingOracle.updateRequest(requestId, randomNumber);
    await vrfTx2.wait(1);

    const mintEvents = await pianoKing.queryFilter(mintFilter);
    tokenId = mintEvents[1].args.tokenId;
    to = mintEvents[1].args.to;
    // The token should not be the number 43 since it was already picked earlier
    // It will get instead the last id that was moved into that slot, so 10,000
    expect(tokenId).to.be.equal(10000);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should mint a random NFT with token id 50 when provided with random number 20049", async function () {
    // Initiate a randomness request to mint an NFT
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
    // Mock a response from Chainlink oracles with the number 20049 as so-called
    // random number
    const randomNumber = 20049;
    const vrfTx = await pianoKingOracle.updateRequest(requestId, randomNumber);
    await vrfTx.wait(1);
    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const [mintEvent] = await pianoKing.queryFilter(mintFilter);
    const tokenId = mintEvent.args.tokenId;
    const to = mintEvent.args.to;
    // The token should be the number 50 since the Chainlink VRF returned 20049
    // which should be modulo 10000, so 49. Since the contract add plus one to
    // as to start the ids at 1 and not 0, we'll get 50
    expect(tokenId).to.be.equal(50);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should mint a random NFT with token id 1 when provided with random number 0", async function () {
    // Initiate a randomness request to mint an NFT
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
    // Mock a response from Chainlink oracles with the number 20049 as so-called
    // random number
    const randomNumber = 0;
    const vrfTx = await pianoKingOracle.updateRequest(requestId, randomNumber);
    await vrfTx.wait(1);
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

  it("Should mint a random NFT with token id 10000 when provided with random number 9999", async function () {
    // Initiate a randomness request to mint an NFT
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
    // Mock a response from Chainlink oracles with the number 20049 as so-called
    // random number
    const randomNumber = 9999;
    const vrfTx = await pianoKingOracle.updateRequest(requestId, randomNumber);
    await vrfTx.wait(1);
    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const [mintEvent] = await pianoKing.queryFilter(mintFilter);
    const tokenId = mintEvent.args.tokenId;
    const to = mintEvent.args.to;
    // The token should be the number 10000 since 9999 is actually the last index
    // in the range
    expect(tokenId).to.be.equal(10000);
    // The sender of the original transaction should be the owner of minted token
    expect(to).to.be.equal(buyer.address);
  });

  it("Should mint a random NFT with token id 1 when provided with random number 10000", async function () {
    // Initiate a randomness request to mint an NFT
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
    // Mock a response from Chainlink oracles with the number 20049 as so-called
    // random number
    const randomNumber = 10000;
    const vrfTx = await pianoKingOracle.updateRequest(requestId, randomNumber);
    await vrfTx.wait(1);
    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const [mintEvent] = await pianoKing.queryFilter(mintFilter);
    const tokenId = mintEvent.args.tokenId;
    const to = mintEvent.args.to;
    // The token should be the number 1 since 10000 modulo 10000 is 0
    // and we add 1 to it to start ids at 1
    expect(tokenId).to.be.equal(1);
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
    const vrfTx = await pianoKingOracle.updateRequest(requestId, 42);
    await vrfTx.wait(1);

    // Now the sender should be able to mint a new NFT again
    await expect(
      pianoKing.connect(buyer).mint({
        value: ethers.utils.parseEther("0.25"),
      })
    ).to.be.not.reverted;
  });

  it("Should mint and distribute the tokens bought during the presale by a given address", async function () {
    const whiteLisTx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("0.2"),
    });
    whiteLisTx.wait(1);

    const randomnessTx = await pianoKing.requestPresaleRN();
    randomnessTx.wait(1);

    const tx = await pianoKing.mintPreSaleTokensForAddress(buyer.address);
    tx.wait(1);

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
    const vrfTx = await pianoKingOracle.updateRequest(requestId, randomNumber);
    await vrfTx.wait(1);
    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    expect(mintEvents.length).to.be.equal(2);
    expect(mintEvents[0].args.to).to.be.equal(buyer.address);
    expect(mintEvents[1].args.to).to.be.equal(buyer.address);
    expect(mintEvents[0].args.tokenId).to.be.not.equal(
      mintEvents[1].args.tokenId
    );
  });
});
