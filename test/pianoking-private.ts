import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { PianoKingPrivate } from "../typechain";

describe("Piano King Private", function () {
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
    minter = accounts[10];
    // Set the creator to be the third one
    creator = accounts[11];

    recipient = accounts[12];

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

    const splitterContractAddress =
      await pianoKingPrivate.getTokenSplitterContract(0);

    const [receiver, royalties] = await pianoKingPrivate.royaltyInfo(
      0,
      ethers.utils.parseEther("10")
    );
    // The receiver of the royalties payment by the exchange platform should
    // be the splitter contract
    expect(receiver).to.be.equal(splitterContractAddress);
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

    const splitterContractAddress =
      await pianoKingPrivate.getTokenSplitterContract(0);
    const splitterContract = ethers.getContractAt(
      "PianoKingPrivateSplitter",
      splitterContractAddress
    );

    expect(splitterContract).to.be.not.equal(ethers.constants.AddressZero);

    const [receiver, royalties] = await pianoKingPrivate.royaltyInfo(
      0,
      ethers.utils.parseEther("10")
    );
    // The receiver of the royalties payment by the exchange platform should
    // be the minter
    expect(receiver).to.be.equal(splitterContractAddress);
    // The total royalties is 250 + 200 = 450 => 4.5%
    // So for a sale of 10 ETH, we should expect the royalties
    // to be sent to the minter to be 0.45 ETH
    expect(royalties).to.be.equal(ethers.utils.parseEther("0.45"));
  });

  it("Should fail to mint an NFT as a non-authorized sender", async function () {
    await expect(
      pianoKingPrivate.mintFor(
        recipient.address,
        "https://example.com/test",
        creator.address,
        250,
        200
      )
    ).to.be.revertedWith("Not minter");
  });

  it("Should fail to get royalty info for a non-existant token", async function () {
    await expect(pianoKingPrivate.royaltyInfo(0, 0)).to.be.revertedWith(
      "Token does not exist"
    );
  });

  it("Should fail to set minter to the zero address", async function () {
    await expect(
      pianoKingPrivate.setMinter(ethers.constants.AddressZero)
    ).to.be.revertedWith("Invalid address");
  });

  it("Should retrieve funds received as royalties", async function () {
    // The creator should have the default balance of 10,000 ETH
    expect(await ethers.provider.getBalance(creator.address)).to.be.equal(
      ethers.utils.parseEther("10000")
    );

    // Mint a token
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

    // We get the current balance of the minter
    const minterBalance = await ethers.provider.getBalance(minter.address);

    // A Splitter contract should have been created for the newly minted token
    const splitterContractAddress =
      await pianoKingPrivate.getTokenSplitterContract(0);

    // We mimick what the exchange will do after a sale of the token
    // that is simply sending all the royalties to the contract
    const sendETHTx = await recipient.sendTransaction({
      to: splitterContractAddress,
      value: ethers.utils.parseEther("1"),
    });
    await sendETHTx.wait(1);

    // We withdraw the royalties from the contract to send them
    // to the minter and creator according to the rate set for both
    const withdrawTx = await pianoKingPrivate.retrieveRoyalties(0);
    await withdrawTx.wait(1);

    // 0.02/(0.025+0.02) ~ 0.4444 => 44.44%
    // 0.4444 * 1 ETH = 0.4444
    expect(await ethers.provider.getBalance(creator.address)).to.be.equal(
      ethers.utils.parseEther("10000.4444")
    );
    // 0.025/(0.025+0.02) ~ 0.5556 => 55.56%
    // 0.5556 * 1 ETH = 0.5556
    expect(await ethers.provider.getBalance(minter.address)).to.be.equal(
      minterBalance.add(ethers.utils.parseEther("0.5556"))
    );
  });
});
