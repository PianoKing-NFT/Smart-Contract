import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { PianoKingPrivate } from "../typechain";

describe("Whitelist", function () {
  let pianoKingPrivate: PianoKingPrivate;
  let deployer: SignerWithAddress;
  let minter: SignerWithAddress;
  let creator: SignerWithAddress;
  let recipient: SignerWithAddress;
  beforeEach(async () => {
    // Get the local accounts
    const accounts = await ethers.getSigners();
    // The default address is the first one
    deployer = accounts[0];
    // Set minter to be the second one
    minter = accounts[1];
    // Set the creator to be the third one
    creator = accounts[2];

    recipient = accounts[3];

    // Deploys the Piano King Private contract
    const PianoKingPrivate = await ethers.getContractFactory(
      "PianoKingPrivate"
    );
    pianoKingPrivate = await PianoKingPrivate.deploy();
    await pianoKingPrivate.deployed();

    // For test purpose we're going to change the minter
    pianoKingPrivate.setMinter(minter.address);
  });

  it("Should not be able to deposit ETH", async function () {
    // No receive nor fallback function has been implemented so
    // we should expect that any ETH sent will be rejected
    await expect(
      creator.sendTransaction({
        to: pianoKingPrivate.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.reverted;
  });

  it("Should mint an NFT", async function () {
    const tx = await pianoKingPrivate
      .connect(minter)
      .mint("https://example.com/test", creator.address, 250, 200);
    await tx.wait(1);

    // The minter should have received the token from the mint since
    // we used the mint function which send it right to the minter
    expect(await pianoKingPrivate.balanceOf(minter.address)).to.be.equal(1);
    // This is the first token so it's id will be 0 as it's an incremental id
    expect(await pianoKingPrivate.ownerOf(0)).to.be.equal(minter.address);

    // The token uri should be properly set
    expect(await pianoKingPrivate.tokenURI(0)).to.be.equal(
      "https://example.com/test"
    );

    // Check that the details about the token have been set properly
    const [creatorAddress, minterRoyalties, creatorRoyalties] =
      await pianoKingPrivate.getTokenDetails(0);
    expect(creatorAddress).to.be.equal(creator.address);
    expect(minterRoyalties).to.be.equal(250);
    expect(creatorRoyalties).to.be.equal(200);

    // The creator royalties are set to 200, so 2%
    // We imagine the NFT was sold for 10 ETH
    // So the royalties for the creator should 10 ETH * 0.02 => 0.2 ETH
    expect(
      await pianoKingPrivate.getRoyaltyForCreator(
        0,
        ethers.utils.parseEther("10")
      )
    ).to.be.equal(ethers.utils.parseEther("0.2"));

    const [receiver, royalties] = await pianoKingPrivate.royaltyInfo(
      0,
      ethers.utils.parseEther("10")
    );
    // The receiver of the royalties payment by the exchange platform should
    // be the minter
    expect(receiver).to.be.equal(minter.address);
    // The total royalties is 250 + 200 = 450 => 4.5%
    // So for a sale of 10 ETH, we should expect the royalties
    // to be sent to the minter to be 0.45 ETH
    expect(royalties).to.be.equal(ethers.utils.parseEther("0.45"));
  });

  it("Should mint an NFT and send it to a given address", async function () {
    const tx = await pianoKingPrivate
      .connect(minter)
      .mintFor(
        recipient.address,
        "https://example.com/test",
        creator.address,
        250,
        200
      );
    await tx.wait(1);

    // The recipient should have received the token from the mint
    expect(await pianoKingPrivate.balanceOf(recipient.address)).to.be.equal(1);
    // This is the first token so it's id will be 0 as it's an incremental id
    expect(await pianoKingPrivate.ownerOf(0)).to.be.equal(recipient.address);

    // The token uri should be properly set
    expect(await pianoKingPrivate.tokenURI(0)).to.be.equal(
      "https://example.com/test"
    );

    // Check that the details about the token have been set properly
    const [creatorAddress, minterRoyalties, creatorRoyalties] =
      await pianoKingPrivate.getTokenDetails(0);
    expect(creatorAddress).to.be.equal(creator.address);
    expect(minterRoyalties).to.be.equal(250);
    expect(creatorRoyalties).to.be.equal(200);

    // The creator royalties are set to 200, so 2%
    // We imagine the NFT was sold for 5 ETH
    // So the royalties for the creator should 5 ETH * 0.02 => 0.1 ETH
    expect(
      await pianoKingPrivate.getRoyaltyForCreator(
        0,
        ethers.utils.parseEther("5")
      )
    ).to.be.equal(ethers.utils.parseEther("0.1"));

    const [receiver, royalties] = await pianoKingPrivate.royaltyInfo(
      0,
      ethers.utils.parseEther("10")
    );
    // The receiver of the royalties payment by the exchange platform should
    // be the minter
    expect(receiver).to.be.equal(minter.address);
    // The total royalties is 250 + 200 = 450 => 4.5%
    // So for a sale of 10 ETH, we should expect the royalties
    // to be sent to the minter to be 0.45 ETH
    expect(royalties).to.be.equal(ethers.utils.parseEther("0.45"));
  });
});
