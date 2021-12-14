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
  PianoKingRNConsumer,
  PianoKingFunds,
} from "../typechain";
import { getRandomNumber } from "../utils";

describe("Mock Piano King", function () {
  let whiteList: PianoKingWhitelist;
  let pianoKing: MockPianoKing;
  let pianoKingRNConsumer: PianoKingRNConsumer;
  let vrfCoordinator: VRFCoordinatorMock;
  let pianoKingFunds: PianoKingFunds;
  let linkToken: LinkToken;
  let dutchAuction: PianoKingDutchAuction;
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

    const PianoKingFactory = await ethers.getContractFactory("MockPianoKing");
    pianoKing = await PianoKingFactory.deploy(
      whiteList.address,
      pianoKingRNConsumer.address,
      pianoKingFunds.address
    );
    await pianoKing.deployed();

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
      pianoKingRNConsumer.address,
      INITIAL_LINK_BALANCE
    );
    await transferTx.wait(1);
  });

  it("Should premint 1 NFT directly in phase 1 after presale", async function () {
    // Set the total supply to 1000 to mimick post presale premint
    const totalSupplyTx = await pianoKing.setTotalSupply(1000);
    await totalSupplyTx.wait(1);
    // Set the supply left to 1000 to mimick the start of the post presale
    // premint
    const setSupplyTx = await pianoKing.setSupplyLeft(1000);
    await setSupplyTx.wait(1);
    // Each NFT is 0.2 ETH
    const tx = await pianoKing.connect(buyer).preMint({
      value: ethers.utils.parseEther("0.2"),
    });
    await tx.wait(1);

    // We expect to see the buyer address as the first in the array of addresses
    // which preminted a token
    expect(await pianoKing.preMintAddresses(0)).to.be.equal(buyer.address);
    // The buyer should now own 1 token that will be minted in the next batch
    expect(await pianoKing.preMintAllowance(buyer.address)).to.be.equal(1);

    // We expect the supply left to be 999 as 1 token has now been purchased
    // Note that the total supply will be unchanged as it only change during
    // the actual batch mint not premint
    expect(await pianoKing.supplyLeft()).to.be.equal(999);
  });

  it("Should premint 25 NFTs directly in phase 1 after presale", async function () {
    // Set the total supply to 1000 to mimick post presale premint
    const totalSupplyTx = await pianoKing.setTotalSupply(1000);
    await totalSupplyTx.wait(1);
    // Set the supply left to 1000 to mimick the start of the post presale
    // premint
    const setSupplyTx = await pianoKing.setSupplyLeft(1000);
    await setSupplyTx.wait(1);
    // Each NFT is 0.2 ETH -> so 25 NFT = 5 ETH
    const tx = await pianoKing.connect(buyer).preMint({
      value: ethers.utils.parseEther("5"),
    });
    await tx.wait(1);

    // We expect to see the buyer address as the first in the array of addresses
    // which preminted a token
    expect(await pianoKing.preMintAddresses(0)).to.be.equal(buyer.address);
    // The buyer should now own 25 token that will be minted in the next batch
    expect(await pianoKing.preMintAllowance(buyer.address)).to.be.equal(25);

    // We expect the supply left to be 975 as 25 tokens have now been purchased
    // Note that the total supply will be unchanged as it only change during
    // the actual batch mint not premint
    expect(await pianoKing.supplyLeft()).to.be.equal(975);
  });

  it("Should be able to premint twice directly in phase 1 after presale", async function () {
    // Set the total supply to 1000 to mimick post presale premint
    const totalSupplyTx = await pianoKing.setTotalSupply(1000);
    await totalSupplyTx.wait(1);
    // Set the supply left to 1000 to mimick the start of the post presale
    // premint
    const setSupplyTx = await pianoKing.setSupplyLeft(1000);
    await setSupplyTx.wait(1);
    // Each NFT is 0.2 ETH -> so 10 NFT = 2 ETH
    const tx = await pianoKing.connect(buyer).preMint({
      value: ethers.utils.parseEther("2"),
    });
    await tx.wait(1);

    // We expect to see the buyer address as the first in the array of addresses
    // which preminted a token
    expect(await pianoKing.preMintAddresses(0)).to.be.equal(buyer.address);
    // The buyer should now own 10 tokens that will be minted in the next batch
    expect(await pianoKing.preMintAllowance(buyer.address)).to.be.equal(10);

    // We expect the supply left to be 990 as 10 tokens have now been purchased
    // Note that the total supply will be unchanged as it only change during
    // the actual batch mint not premint
    expect(await pianoKing.supplyLeft()).to.be.equal(990);

    // Each NFT is 0.2 ETH -> so 15 NFT = 3 ETH
    const tx2 = await pianoKing.connect(buyer).preMint({
      value: ethers.utils.parseEther("3"),
    });
    await tx2.wait(1);

    // We expect to see the buyer address as the first in the array of addresses
    // which preminted a token
    expect(await pianoKing.preMintAddresses(0)).to.be.equal(buyer.address);
    // The buyer should now own 25 token that will be minted in the next batch
    expect(await pianoKing.preMintAllowance(buyer.address)).to.be.equal(25);

    // We expect the supply left to be 975 as 25 tokens have now been purchased in total
    // Note that the total supply will be unchanged as it only change during
    // the actual batch mint not premint
    expect(await pianoKing.supplyLeft()).to.be.equal(975);
  });

  it("Should let sender premint 1 NFT directly for someone else in phase 1 after presale", async function () {
    // Set the total supply to 1000 to mimick post presale premint
    const totalSupplyTx = await pianoKing.setTotalSupply(1000);
    await totalSupplyTx.wait(1);
    // Set the supply left to 1000 to mimick the start of the post presale
    // premint
    const setSupplyTx = await pianoKing.setSupplyLeft(1000);
    await setSupplyTx.wait(1);

    const accounts = await ethers.getSigners();
    // The lucky recipient of that token
    const luckyRecipient = accounts[5];
    // Each NFT is 0.2 ETH
    const tx = await pianoKing
      .connect(buyer)
      .preMintFor(luckyRecipient.address, {
        value: ethers.utils.parseEther("0.2"),
      });
    await tx.wait(1);

    // We expect to see the luck recipient address as the first in
    // the array of addresses which preminted a token and not the
    // actual buyer since he or she preminted for someone else
    expect(await pianoKing.preMintAddresses(0)).to.be.equal(
      luckyRecipient.address
    );
    // The lucky recipient should now own 1 token that will be minted in the next batch
    expect(
      await pianoKing.preMintAllowance(luckyRecipient.address)
    ).to.be.equal(1);
    // On the other hand the buyer shouldn't own any as he or she only paid for it
    // to give to someone else
    expect(await pianoKing.preMintAllowance(buyer.address)).to.be.equal(0);

    // We expect the supply left to be 999 as 1 token has now been purchased
    // Note that the total supply will be unchanged as it only change during
    // the actual batch mint not premint
    expect(await pianoKing.supplyLeft()).to.be.equal(999);
  });

  it("Should fail to mint an NFT with less than 0.2 ETH", async function () {
    const tx = await pianoKing.setTotalSupply(1000);
    await tx.wait(1);

    const tx2 = await pianoKing.setSupplyLeft(1000);
    await tx2.wait(1);

    // Try to mint with 0.19 ETH, so not enough
    await expect(
      pianoKing.connect(buyer).preMint({
        value: ethers.utils.parseEther("0.19"),
      })
    ).to.be.revertedWith("Not enough funds");
  });

  it("Should fail to premint more than 25 NFT directly in phase 1", async function () {
    // Set the total supply to 1000 to mimick post presale premint
    const totalSupplyTx = await pianoKing.setTotalSupply(1000);
    await totalSupplyTx.wait(1);
    // Set the supply left to 1000 to mimick the start of the post presale
    // premint
    const setSupplyTx = await pianoKing.setSupplyLeft(1000);
    await setSupplyTx.wait(1);
    // The sender might expect to get 26 NFTs out of this transaction
    // but the limit is 25 NFTs per address so it will fail
    await expect(
      pianoKing.connect(buyer).preMint({
        value: ethers.utils.parseEther("5.2"),
      })
    ).to.be.revertedWith("Above maximum");
  });

  it("Should fail to premint twice if the second transaction go above 25 NFTs for that address in phase 1", async function () {
    // Set the total supply to 1000 to mimick post presale premint
    const totalSupplyTx = await pianoKing.setTotalSupply(1000);
    await totalSupplyTx.wait(1);
    // Set the supply left to 1000 to mimick the start of the post presale
    // premint
    const setSupplyTx = await pianoKing.setSupplyLeft(1000);
    await setSupplyTx.wait(1);
    // Each NFT is 0.2 ETH -> so 20 NFT = 4 ETH
    const tx = await pianoKing.connect(buyer).preMint({
      value: ethers.utils.parseEther("4"),
    });
    await tx.wait(1);
    // We expect to see the buyer address as the first in the array of addresses
    // which preminted a token
    expect(await pianoKing.preMintAddresses(0)).to.be.equal(buyer.address);
    // The buyer should now own 20 token that will be minted in the next batch
    expect(await pianoKing.preMintAllowance(buyer.address)).to.be.equal(20);
    // The sender might expect to get 26 NFTs out of this transaction
    // but the limit is 25 NFTs per address so it will fail
    await expect(
      pianoKing.connect(buyer).preMint({
        value: ethers.utils.parseEther("1.2"),
      })
    ).to.be.revertedWith("Above maximum");

    // The buyer address is still the first in the array of addresses
    expect(await pianoKing.preMintAddresses(0)).to.be.equal(buyer.address);
    // The second transaction fail, so the buyer only own the 20 tokens bought
    // in the first transaction
    expect(await pianoKing.preMintAllowance(buyer.address)).to.be.equal(20);
  });

  it("Should fail to premint an NFT directly in phase 1 before presale mint is completed", async function () {
    // Set the total supply to 0, indicating the presale has not yet been
    // completed
    const totalSupplyTx = await pianoKing.setTotalSupply(0);
    await totalSupplyTx.wait(1);
    // We expect it to fail since the total supply is 0,
    // the presale batch mint has not been completed yet and
    // premints are not allowed before it has
    await expect(
      pianoKing.connect(buyer).preMint({
        value: ethers.utils.parseEther("0.2"),
      })
    ).to.be.revertedWith("Presale mint not completed");
  });

  it("Should fail to premint an NFT directly in phase 2", async function () {
    // Set the total supply to 8000 to initiate phase 2 where
    // token can only be minted through the Dutch Auction
    const totalSupplyTx = await pianoKing.setTotalSupply(8000);
    await totalSupplyTx.wait(1);
    // We expect it to fail since the total supply is 8000, the phase 2
    // is on and only Dutch Auction contract can mint
    await expect(
      pianoKing.connect(buyer).preMint({
        value: ethers.utils.parseEther("0.2"),
      })
    ).to.be.revertedWith("Only through auction");
  });

  it("Should premint an NFT after purchase through auction in the first slot of phase 2", async function () {
    // Set the total supply to 8000 to initiate phase 2 where
    // token can only be minted through the Dutch Auction
    const totalSupplyTx = await pianoKing.setTotalSupply(8000);
    await totalSupplyTx.wait(1);
    // This would be set at the end of each batch mint but we're skipping that here
    // as it's tested in the batch mint tests down anyaway
    const setSupplyTx = await pianoKing.setSupplyLeft(200);
    await setSupplyTx.wait(1);
    // Initiate a dutch auction of 60 seconds
    const tx = await dutchAuction.initiateAuction(
      60,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("1")
    );
    await tx.wait(1);
    // Initiate a transaction to buy a token for 2 ETH straight away
    const buyTx = await dutchAuction.connect(buyer).buy({
      value: ethers.utils.parseEther("2"),
    });
    await buyTx.wait(1);
    // One token has been given to the sender
    expect(await pianoKing.supplyLeft()).to.be.equal(199);
    // We expect to see the buyer address as the first in the array of addresses
    // which preminted a token
    expect(await pianoKing.preMintAddresses(0)).to.be.equal(buyer.address);
    // The buyer should now own 1 token that will be minted in the next batch
    expect(await pianoKing.preMintAllowance(buyer.address)).to.be.equal(1);
  });

  it("Should mint a random NFT after purchase through auction in the last slot of phase 2", async function () {
    // We set the total supply to 9800 to initiate the last slot of phase 2
    const supplyTx = await pianoKing.setTotalSupply(9800);
    await supplyTx.wait(1);
    // This would be set at the end of each batch mint but we're skipping that here
    // as it's tested in the batch mint tests down anyaway
    const setSupplyTx = await pianoKing.setSupplyLeft(200);
    await setSupplyTx.wait(1);
    // Initiate a dutch auction of 60 seconds
    const tx = await dutchAuction.initiateAuction(
      60,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("1")
    );
    await tx.wait(1);
    // Initiate a transaction to buy a token for 2 ETH straight away
    const buyTx = await dutchAuction.connect(buyer).buy({
      value: ethers.utils.parseEther("2"),
    });
    await buyTx.wait(1);
    // One token has been given to the sender
    expect(await pianoKing.supplyLeft()).to.be.equal(199);
    // We expect to see the buyer address as the first in the array of addresses
    // which preminted a token
    expect(await pianoKing.preMintAddresses(0)).to.be.equal(buyer.address);
    // The buyer should now own 1 token that will be minted in the next batch
    expect(await pianoKing.preMintAllowance(buyer.address)).to.be.equal(1);
  });

  it("Should do a batch mint of the first 1000 tokens (i.e. presale mint)", async function () {
    // Set the supply to 0 in order to mimick a presale batch mint
    const supplyTx = await pianoKing.setTotalSupply(0);
    await supplyTx.wait(1);

    expect(await pianoKing.supplyLeft()).to.be.equal(0);
    expect(await pianoKing.totalSupply()).to.be.equal(0);

    const addresses = [];
    // Generate 250 addresses as the mock contract returns a fake allowance of 4
    // for each address, so 1000 tokens in total
    for (let i = 0; i < 250; i++) {
      // An address is encoded as 20 bytes hexadecimal string
      addresses.push(ethers.utils.hexZeroPad(ethers.utils.hexlify(i), 20));
    }

    // Request a random number to use as seed for the batch
    const randomnessTx = await pianoKingRNConsumer.requestRandomNumber();
    await randomnessTx.wait(1);

    // We get the request id of the randomness request from the events
    const requestRandomnessFilter =
      pianoKingRNConsumer.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKingRNConsumer.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;

    // Initiate a mock response of the VRF to our contract
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      getRandomNumber(),
      pianoKingRNConsumer.address
    );
    await vrfTx.wait(1);
    // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
    expect(await linkToken.balanceOf(pianoKingRNConsumer.address)).to.be.equal(
      INITIAL_LINK_BALANCE.sub(LINK_FEE)
    );

    // Execute the batch mint in 2 separate calls
    const tx = await pianoKing.doBatchMint(addresses, 125);
    await tx.wait(1);
    const tx2 = await pianoKing.doBatchMint(addresses, 125);
    await tx2.wait(1);

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    // There should be a 1000 tokens minted in total
    expect(mintEvents.length).to.be.equal(1000);
    // Get all the token ids generated
    const tokenIds = mintEvents.map((x) => x.args.tokenId.toNumber());
    for (const tokenId of tokenIds) {
      // Each token id range between 1 and 1000 (inclusive)
      expect(tokenId).to.be.lessThanOrEqual(1000).greaterThan(0);
    }
    // Since a Set cannot have duplicates we check here that
    // all the token ids generated are unique
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);

    // At the end of the batch mint, we expect the supply left
    // to be 1000 as it gets ready for the next batch
    expect(await pianoKing.supplyLeft()).to.be.equal(1000);
    // The total supply should be 1000 since all the presale tokens are now minted
    expect(await pianoKing.totalSupply()).to.be.equal(1000);
  });

  it("Should do a batch mint with a random number which will yield an incrementor equivalent to 0", async function () {
    // Set the supply to 0 in order to mimick a presale batch mint
    const supplyTx = await pianoKing.setTotalSupply(0);
    await supplyTx.wait(1);

    expect(await pianoKing.supplyLeft()).to.be.equal(0);
    expect(await pianoKing.totalSupply()).to.be.equal(0);

    const addresses = [];
    // Generate 250 addresses as the mock contract returns a fake allowance of 4
    // for each address, so 1000 tokens in total
    for (let i = 0; i < 250; i++) {
      // An address is encoded as 20 bytes hexadecimal string
      addresses.push(ethers.utils.hexZeroPad(ethers.utils.hexlify(i), 20));
    }

    // Request a random number to use as seed for the batch
    const randomnessTx = await pianoKingRNConsumer.requestRandomNumber();
    await randomnessTx.wait(1);

    // We get the request id of the randomness request from the events
    const requestRandomnessFilter =
      pianoKingRNConsumer.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKingRNConsumer.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;

    // Initiate a mock response of the VRF to our contract
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      // Since it's the batch of the first 1000 tokens the modulo used
      // with the incrementor will be 1009 and 10089 modulo 1009 = 1008
      // which with the plus 1 we add to the token id is equivalent to
      // 0. We handle this special case and the ids should still be all
      // unique
      10089,
      pianoKingRNConsumer.address
    );
    await vrfTx.wait(1);
    // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
    expect(await linkToken.balanceOf(pianoKingRNConsumer.address)).to.be.equal(
      INITIAL_LINK_BALANCE.sub(LINK_FEE)
    );

    // Execute the batch mint in 2 separate calls
    const tx = await pianoKing.doBatchMint(addresses, 125);
    await tx.wait(1);
    const tx2 = await pianoKing.doBatchMint(addresses, 125);
    await tx2.wait(1);

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    // There should be a 1000 tokens minted in total
    expect(mintEvents.length).to.be.equal(1000);
    // Get all the token ids generated
    const tokenIds = mintEvents.map((x) => x.args.tokenId.toNumber());
    for (const tokenId of tokenIds) {
      // Each token id range between 1 and 1000 (inclusive)
      expect(tokenId).to.be.lessThanOrEqual(1000).greaterThan(0);
    }
    // Since a Set cannot have duplicates we check here that
    // all the token ids generated are unique
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);

    // At the end of the batch mint, we expect the supply left
    // to be 1000 as it gets ready for the next batch
    expect(await pianoKing.supplyLeft()).to.be.equal(1000);
    // The total supply should be 1000 since all the presale tokens are now minted
    expect(await pianoKing.totalSupply()).to.be.equal(1000);
  });

  it("Should do a batch mint of the second batch of 1000 tokens (i.e. following the presale)", async function () {
    // Set the total supply to 1000 to mimick the batch mint of the 1000 tokens
    // following the presale mint
    const supplyTx = await pianoKing.setTotalSupply(1000);
    await supplyTx.wait(1);

    // The total supply should now be 1000
    expect(await pianoKing.totalSupply()).to.be.equal(1000);

    const addresses = [];
    // Generate 250 addresses as the mock contract returns a fake allowance of 4
    // for each address, so 1000 tokens in total
    for (let i = 0; i < 250; i++) {
      addresses.push(ethers.utils.hexZeroPad(ethers.utils.hexlify(i), 20));
    }

    // Request a random number to Chainlink VRF
    const randomnessTx = await pianoKingRNConsumer.requestRandomNumber();
    await randomnessTx.wait(1);

    // We get the request id of the randomness request from the events
    const requestRandomnessFilter =
      pianoKingRNConsumer.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKingRNConsumer.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;

    // Mock a response from Chainlink oracles
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      getRandomNumber(),
      pianoKingRNConsumer.address
    );
    await vrfTx.wait(1);
    // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
    expect(await linkToken.balanceOf(pianoKingRNConsumer.address)).to.be.equal(
      INITIAL_LINK_BALANCE.sub(LINK_FEE)
    );

    // Execute the batch mint in 2 separate calls
    const tx = await pianoKing.doBatchMint(addresses, 125);
    await tx.wait(1);
    const tx2 = await pianoKing.doBatchMint(addresses, 125);
    await tx2.wait(1);

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    // There should have been 1000 mints in total
    expect(mintEvents.length).to.be.equal(1000);
    // Get all the token ids
    const tokenIds = mintEvents.map((x) => x.args.tokenId.toNumber());
    for (const tokenId of tokenIds) {
      // Each token id should be between 1001 and 2000 (inclusive)
      expect(tokenId).to.be.lessThanOrEqual(2000).greaterThan(1000);
    }
    // Since a Set cannot have duplicates we check here that
    // all the token ids generated are unique
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);

    // There should 2000 tokens in supply now
    expect(await pianoKing.totalSupply()).to.be.equal(2000);
    // After this batch mint, the first 2000 tokens should be minted,
    // so the next batch will be 1000 tokens
    expect(await pianoKing.supplyLeft()).to.be.equal(1000);
  });

  it("Should do a batch mint of the last 1000 tokens batch", async function () {
    // Set the total supply to 7000 to mimick the batch mint of
    // the last batch of 1000 tokens
    const supplyTx = await pianoKing.setTotalSupply(7000);
    await supplyTx.wait(1);

    // The total supply should now be 7000
    expect(await pianoKing.totalSupply()).to.be.equal(7000);

    const addresses = [];
    // Generate 250 addresses as the mock contract returns a fake allowance of 4
    // for each address, so 1000 tokens in total
    for (let i = 0; i < 250; i++) {
      addresses.push(ethers.utils.hexZeroPad(ethers.utils.hexlify(i), 20));
    }

    // Request a random number to Chainlink VRF
    const randomnessTx = await pianoKingRNConsumer.requestRandomNumber();
    await randomnessTx.wait(1);

    // We get the request id of the randomness request from the events
    const requestRandomnessFilter =
      pianoKingRNConsumer.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKingRNConsumer.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;

    // Mock a response from Chainlink oracles
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      getRandomNumber(),
      pianoKingRNConsumer.address
    );
    await vrfTx.wait(1);
    // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
    expect(await linkToken.balanceOf(pianoKingRNConsumer.address)).to.be.equal(
      INITIAL_LINK_BALANCE.sub(LINK_FEE)
    );

    // Execute the batch mint in 2 separate calls
    const tx = await pianoKing.doBatchMint(addresses, 125);
    await tx.wait(1);
    const tx2 = await pianoKing.doBatchMint(addresses, 125);
    await tx2.wait(1);

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    // There should have been 1000 mints in total
    expect(mintEvents.length).to.be.equal(1000);
    // Get all the token ids
    const tokenIds = mintEvents.map((x) => x.args.tokenId.toNumber());
    for (const tokenId of tokenIds) {
      // Each token id should be between 7001 and 8000 (inclusive)
      expect(tokenId).to.be.lessThanOrEqual(8000).greaterThan(7000);
    }
    // Since a Set cannot have duplicates we check here that
    // all the token ids generated are unique
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);

    // There should 8000 tokens in supply now
    expect(await pianoKing.totalSupply()).to.be.equal(8000);
    // After this batch mint, it will be a Dutch Auction of 200 tokens
    expect(await pianoKing.supplyLeft()).to.be.equal(200);
  });

  it("Should do a batch mint of 200 tokens for the first slot of phase 2", async function () {
    // Set the total supply to 8000 to mimick the batch mint of 200 tokens
    // in the first slot of phase 2
    const supplyTx = await pianoKing.setTotalSupply(8000);
    await supplyTx.wait(1);

    // The total supply should now be 8000
    expect(await pianoKing.totalSupply()).to.be.equal(8000);

    const addresses = [];
    // Generate 50 addresses as the mock contract returns a fake allowance of 4
    // for each address, so 200 tokens in total
    for (let i = 0; i < 50; i++) {
      addresses.push(ethers.utils.hexZeroPad(ethers.utils.hexlify(i), 20));
    }

    // Request a random number to Chainlink VRF
    const randomnessTx = await pianoKingRNConsumer.requestRandomNumber();
    await randomnessTx.wait(1);

    // We get the request id of the randomness request from the events
    const requestRandomnessFilter =
      pianoKingRNConsumer.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKingRNConsumer.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;

    // Mock a response from Chainlink oracles
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      getRandomNumber(),
      pianoKingRNConsumer.address
    );
    await vrfTx.wait(1);
    // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
    expect(await linkToken.balanceOf(pianoKingRNConsumer.address)).to.be.equal(
      INITIAL_LINK_BALANCE.sub(LINK_FEE)
    );

    // Execute the batch mint in a single transaction
    const tx = await pianoKing.doBatchMint(addresses, 50);
    await tx.wait(1);

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    // There should have been 200 mints in total
    expect(mintEvents.length).to.be.equal(200);
    // Get all the ids of the token minted in this batch
    const tokenIds = mintEvents.map((x) => x.args.tokenId.toNumber());
    for (const tokenId of tokenIds) {
      // This batch should contain id between 8001 and 8200 (inclusive)
      expect(tokenId).to.be.lessThanOrEqual(8200).greaterThan(8000);
    }
    // Since a Set cannot have duplicates we check here that
    // all the token ids generated are unique
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);

    // The next batch is another Dutch Auction so 200
    expect(await pianoKing.supplyLeft()).to.be.equal(200);
    // The total supply should now be 8200
    expect(await pianoKing.totalSupply()).to.be.equal(8200);
  });

  it("Should do a batch mint of 200 tokens for the last slot of phase 2", async function () {
    // Set the total supply to 9800 to mimick the batch mint of 200 tokens
    // in the last slot of phase 2
    const supplyTx = await pianoKing.setTotalSupply(9800);
    await supplyTx.wait(1);

    // The total supply should 9800
    expect(await pianoKing.totalSupply()).to.be.equal(9800);

    const addresses = [];
    // Generate 50 addresses as the mock contract returns a fake allowance of 4
    // for each address, so 200 tokens in total
    for (let i = 0; i < 50; i++) {
      addresses.push(ethers.utils.hexZeroPad(ethers.utils.hexlify(i), 20));
    }

    // Request a random number to Chainlink VRF
    const randomnessTx = await pianoKingRNConsumer.requestRandomNumber();
    await randomnessTx.wait(1);

    // We get the request id of the randomness request from the events
    const requestRandomnessFilter =
      pianoKingRNConsumer.filters.RequestedRandomness();
    const [requestRandomnessEvent] = await pianoKingRNConsumer.queryFilter(
      requestRandomnessFilter
    );
    const requestId = requestRandomnessEvent.args.requestId;

    // Mock a response from Chainlink oracles
    const vrfTx = await vrfCoordinator.callBackWithRandomness(
      requestId,
      getRandomNumber(),
      pianoKingRNConsumer.address
    );
    await vrfTx.wait(1);
    // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
    expect(await linkToken.balanceOf(pianoKingRNConsumer.address)).to.be.equal(
      INITIAL_LINK_BALANCE.sub(LINK_FEE)
    );

    // Execute the batch mint in a single transaction
    const tx = await pianoKing.doBatchMint(addresses, 50);
    await tx.wait(1);

    // From the zero address means it's a mint
    const mintFilter = pianoKing.filters.Transfer(ethers.constants.AddressZero);
    const mintEvents = await pianoKing.queryFilter(mintFilter);
    // There should have been 500 mints in total
    expect(mintEvents.length).to.be.equal(200);
    // Get all the ids of the token minted in this batch
    const tokenIds = mintEvents.map((x) => x.args.tokenId.toNumber());
    for (const tokenId of tokenIds) {
      // This batch should contain token with ids between 9801 and 10000 (the last token)
      expect(tokenId).to.be.lessThanOrEqual(10000).greaterThan(9800);
    }
    // Since a Set cannot have duplicates we check here that
    // all the token ids generated are unique
    expect(tokenIds).to.be.lengthOf(new Set(tokenIds).size);

    // The max supply has been reached, so supplyLeft should be 0
    expect(await pianoKing.supplyLeft()).to.be.equal(0);
    // There should be 10000 tokens in total now, everything has been minted
    expect(await pianoKing.totalSupply()).to.be.equal(10000);
  });

  it("Should be able to withraw the funds as Piano King Wallet", async function () {
    const supplyTx = await pianoKing.setTotalSupply(1000);
    await supplyTx.wait(1);

    const supplyLeftTx = await pianoKing.setSupplyLeft(1000);
    await supplyLeftTx.wait(1);

    const accounts = await ethers.getSigners();
    // Get a new address to set a new Piano King wallet
    const newPianoKingWallet = accounts[8];
    const setPianoKingWalletTx = await pianoKing.setPianoKingWallet(
      newPianoKingWallet.address
    );
    await setPianoKingWalletTx.wait(1);

    let contractBalance = await ethers.provider.getBalance(pianoKing.address);
    // We expect the contract to have no funds here
    expect(contractBalance).to.be.equal(0);
    // A buyer deposit 2 ETH
    const tx = await pianoKing.connect(buyer).preMint({
      value: ethers.utils.parseEther("2"),
    });
    await tx.wait(1);
    // Get the balance of the Piano King Wallet which should be 10,000 ETH
    // the default value of test accounts on hardhat network
    let walletBalance = await ethers.provider.getBalance(
      newPianoKingWallet.address
    );
    expect(walletBalance).to.be.equal(ethers.utils.parseEther("10000"));

    // The contract should now hold the 2 ETH
    contractBalance = await ethers.provider.getBalance(pianoKing.address);
    expect(contractBalance).to.be.equal(ethers.utils.parseEther("2"));
    const withdrawTx = await pianoKing
      .connect(newPianoKingWallet)
      .retrieveFunds();
    await withdrawTx.wait(1);
    // Get the balance of the Piano King Wallet again, which has received
    // the 2 ETH from the contract
    walletBalance = await ethers.provider.getBalance(
      newPianoKingWallet.address
    );
    // We expect slightly less than 10002 ETH since we also paid some
    // gas fee in the transaction
    expect(walletBalance).to.be.closeTo(
      ethers.utils.parseEther("10002"),
      // Small enough for Javascript number
      ethers.utils.parseEther("0.001").toNumber()
    );
    // The funds have been withdrawn so now the contract should not
    // have any ETH
    contractBalance = await ethers.provider.getBalance(pianoKing.address);
    expect(contractBalance).to.be.equal(0);
  });

  it("Should be able to withraw the funds as owner", async function () {
    const supplyTx = await pianoKing.setTotalSupply(1000);
    await supplyTx.wait(1);

    const supplyLeftTx = await pianoKing.setSupplyLeft(1000);
    await supplyLeftTx.wait(1);

    const accounts = await ethers.getSigners();
    // Get a new address to set a new Piano King wallet
    const newPianoKingWallet = accounts[9];
    const setPianoKingWalletTx = await pianoKing.setPianoKingWallet(
      newPianoKingWallet.address
    );
    await setPianoKingWalletTx.wait(1);

    let contractBalance = await ethers.provider.getBalance(pianoKing.address);
    // We expect the contract to have no funds here
    expect(contractBalance).to.be.equal(0);
    // A buyer deposit 2 ETH
    const tx = await pianoKing.connect(buyer).preMint({
      value: ethers.utils.parseEther("2"),
    });
    await tx.wait(1);
    // Get the balance of the Piano King wallet which should be 10,000 ETH
    // the default value of test accounts on hardhat network
    let walletBalance = await ethers.provider.getBalance(
      newPianoKingWallet.address
    );
    expect(walletBalance).to.be.equal(ethers.utils.parseEther("10000"));

    // The contract should now hold the 2 ETH
    contractBalance = await ethers.provider.getBalance(pianoKing.address);
    expect(contractBalance).to.be.equal(ethers.utils.parseEther("2"));
    // Not necessary to use connect as it's already the default account,
    // but let's be completely explicit
    const withdrawTx = await pianoKing.connect(deployer).retrieveFunds();
    await withdrawTx.wait(1);
    // Get the balance of the Piano King wallet again, which has received
    // the 2 ETH from the contract
    walletBalance = await ethers.provider.getBalance(
      newPianoKingWallet.address
    );
    // We expect exactly 10002 ETH since the fees have been paid by the owner
    expect(walletBalance).to.be.equal(ethers.utils.parseEther("10002"));
    // The funds have been withdrawn so now the contract should not
    // have any ETH
    contractBalance = await ethers.provider.getBalance(pianoKing.address);
    expect(contractBalance).to.be.equal(0);
  });

  it("Should not be able to withraw the funds as unauthorized sender", async function () {
    // The buyer is not authorized to withdraw the funds so we expect the transaction
    // to be rejected
    await expect(pianoKing.connect(buyer).retrieveFunds()).to.be.revertedWith(
      "Not allowed"
    );
  });
});
