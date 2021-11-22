import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { PianoKingWhitelist } from "../typechain";

describe("Whitelist", function () {
  let whiteList: PianoKingWhitelist;
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
  });

  it("Should not be able to deposit ETH", async function () {
    // No receive nor fallback function has been implemented so
    // we should expect that any ETH not sent with the whiteListSender
    // function will not be accepted and the transaction reverted
    // That way the only way to deposit ETH on the smart contract is to
    // go through the whiteListSender function.
    await expect(
      buyer.sendTransaction({
        to: whiteList.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.reverted;
  });

  it("Should whitelist the sender for one token", async function () {
    // Make sure the buyer has no tokens whitelisted for now
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getWhitelistedAddresses()).to.not.contain(
      buyer.address
    );
    // The supply should be full
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    // White list the buyer by sending 0.1 ETH giving him or her
    // 1 NFT
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("0.1"),
    });
    tx.wait(1);
    // We expect 1 NFT to be assigned to the buyer address
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(1);
    // We should find the address of the buyer in the white listed addresses list
    expect(await whiteList.getWhitelistedAddresses()).to.contain(buyer.address);
    // The supply should have decreased by 1
    expect(await whiteList.getSupplyLeft()).to.be.equal(999);
    // We expect the contract to have received 0.1 ETH from the sender
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(
      ethers.utils.parseEther("0.1")
    );
  });

  it("Should whitelist the sender for 10 tokens", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getWhitelistedAddresses()).to.not.contain(
      buyer.address
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("1"),
    });
    tx.wait(1);
    // The buyer sent 1 ETH so 10 NFTs
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      10
    );
    expect(await whiteList.getWhitelistedAddresses()).to.contain(buyer.address);
    // 1000 - 10 = 990
    expect(await whiteList.getSupplyLeft()).to.be.equal(990);
    // We expect the contract to have received 1 ETH from the sender
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(
      ethers.utils.parseEther("1")
    );
  });

  it("Should whitelist the sender for 25 tokens", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("2.5"),
    });
    tx.wait(1);
    // 2.5 ETH => 25 NFTs
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      25
    );
    // 1000 - 25 = 975
    expect(await whiteList.getSupplyLeft()).to.be.equal(975);
    // We expect the contract to have received 2.5 ETH from the sender
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(
      ethers.utils.parseEther("2.5")
    );
  });

  it("Should not let sender get whitelisted for more than 25 tokens", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    // 3 ETH would result in 30 NFTs which is above the maximum
    // so we expect the transaction to revert
    await expect(
      whiteList.connect(buyer).whiteListSender({
        value: ethers.utils.parseEther("3"),
      })
    ).to.be.revertedWith("Above maximum");
    // As the transaction failed, the buyer should not have acquired anything
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    // Should not have changed
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(0);
  });

  it("Should whitelist the sender for 15 tokens when providing 1.59 ETH", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    // The contract will floor the number of ETH sent to it so
    // that any excess of ETH not being enough to count for one more
    // NFT will not count for one more NFT. The excess will still be kept
    // by the smart contract
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("1.59"),
    });
    tx.wait(1);
    // 1.59 => 15.9 => 15 NFTs (as the number is floored)
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      15
    );
    // 1000 - 15 = 985
    expect(await whiteList.getSupplyLeft()).to.be.equal(985);
    // The contract should have the received the excess as well as the value of
    // the NFTs
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(
      ethers.utils.parseEther("1.59")
    );
  });

  it("Should let sender get whitelisted twice", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getWhitelistedAddresses()).to.not.contain(
      buyer.address
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("1"),
    });
    tx.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      10
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(990);
    expect(await whiteList.getWhitelistedAddresses()).to.contain(buyer.address);
    expect(await whiteList.getWhitelistedAddresses()).to.be.length(1);
    // We expect the contract to have received 1 ETH from the sender
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(
      ethers.utils.parseEther("1")
    );
    const tx2 = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("1"),
    });
    tx2.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      20
    );
    expect(await whiteList.getWhitelistedAddresses()).to.contain(buyer.address);
    // We check that the length is still 1 to make sure the sender wasn't added twice
    expect(await whiteList.getWhitelistedAddresses()).to.be.length(1);
    expect(await whiteList.getSupplyLeft()).to.be.equal(980);
    // We expect the contract to have received 1 more ETH from the sender
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(
      ethers.utils.parseEther("2")
    );
  });

  it("Should not let sender get whitelisted twice if second time is above maximum", async function () {
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(0);
    expect(await whiteList.getSupplyLeft()).to.be.equal(1000);
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("1"),
    });
    tx.wait(1);
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      10
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(990);
    // We expect the contract to have received 1 ETH from the sender
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(
      ethers.utils.parseEther("1")
    );
    // After getting 10 tokens, the sender tries to get 20 more by sending 2 ETH
    // But that would increase the total to 30 after completion, so it should not
    // succeed
    await expect(
      whiteList.connect(buyer).whiteListSender({
        value: ethers.utils.parseEther("2"),
      })
    ).to.be.revertedWith("Above maximum");
    expect(await whiteList.getWhitelistAllowance(buyer.address)).to.be.equal(
      10
    );
    expect(await whiteList.getSupplyLeft()).to.be.equal(990);
    // Should be the same as before since the second transaction failed
    expect(await ethers.provider.getBalance(whiteList.address)).to.be.equal(
      ethers.utils.parseEther("1")
    );
  });

  it("Should be able to withraw the funds as Piano King Wallet", async function () {
    let contractBalance = await ethers.provider.getBalance(whiteList.address);
    // We expect the contract to have no funds here
    expect(contractBalance).to.be.equal(0);
    // A buyer deposit 2 ETH
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("2"),
    });
    tx.wait(1);
    // Get the balance of the Piano King Wallet which should be 10,000 ETH
    // the default value of test accounts on hardhat network
    let walletBalance = await ethers.provider.getBalance(
      pianoKingWallet.address
    );
    expect(walletBalance).to.be.equal(ethers.utils.parseEther("10000"));

    // The contract should now hold the 2 ETH
    contractBalance = await ethers.provider.getBalance(whiteList.address);
    expect(contractBalance).to.be.equal(ethers.utils.parseEther("2"));
    const withdrawTx = await whiteList.connect(pianoKingWallet).retrieveFunds();
    withdrawTx.wait(1);
    // Get the balance of the Piano King Wallet again, which has received
    // the 2 ETH from the contract
    walletBalance = await ethers.provider.getBalance(pianoKingWallet.address);
    // We expect slightly less than 10002 ETH since we also paid some
    // gas fee in the transaction
    expect(walletBalance).to.be.closeTo(
      ethers.utils.parseEther("10002"),
      // Small enough for Javascript number
      ethers.utils.parseEther("0.001").toNumber()
    );
    // The funds have been withdrawn so now the contract should not
    // have any ETH
    contractBalance = await ethers.provider.getBalance(whiteList.address);
    expect(contractBalance).to.be.equal(0);
  });

  it("Should be able to withraw the funds as owner", async function () {
    const accounts = await ethers.getSigners();
    // Get a new address to set a new Piano King wallet as the original
    // one has already been used in the previous test
    const newPianoKingWallet = accounts[5];
    const setPianoKingWalletTx = await whiteList.setPianoKingWallet(
      newPianoKingWallet.address
    );
    setPianoKingWalletTx.wait(1);

    let contractBalance = await ethers.provider.getBalance(whiteList.address);
    // We expect the contract to have no funds here
    expect(contractBalance).to.be.equal(0);
    // A buyer deposit 2 ETH
    const tx = await whiteList.connect(buyer).whiteListSender({
      value: ethers.utils.parseEther("2"),
    });
    tx.wait(1);
    // Get the balance of the Piano King wallet which should be 10,000 ETH
    // the default value of test accounts on hardhat network
    let walletBalance = await ethers.provider.getBalance(
      newPianoKingWallet.address
    );
    expect(walletBalance).to.be.equal(ethers.utils.parseEther("10000"));

    // The contract should now hold the 2 ETH
    contractBalance = await ethers.provider.getBalance(whiteList.address);
    expect(contractBalance).to.be.equal(ethers.utils.parseEther("2"));
    // Not necessary to use connect as it's already the default account,
    // but let's be completely explicit
    const withdrawTx = await whiteList.connect(deployer).retrieveFunds();
    withdrawTx.wait(1);
    // Get the balance of the Piano King wallet again, which has received
    // the 2 ETH from the contract
    walletBalance = await ethers.provider.getBalance(
      newPianoKingWallet.address
    );
    // We expect exactly 10002 ETH since the fees have been paid by the owner
    expect(walletBalance).to.be.equal(ethers.utils.parseEther("10002"));
    // The funds have been withdrawn so now the contract should not
    // have any ETH
    contractBalance = await ethers.provider.getBalance(whiteList.address);
    expect(contractBalance).to.be.equal(0);
  });

  it("Should not be able to withraw the funds as unauthorized sender", async function () {
    // The buyer is not authorized to withdraw the funds so we expect the transaction
    // to be rejected
    await expect(whiteList.connect(buyer).retrieveFunds()).to.be.revertedWith(
      "Not allowed"
    );
  });

  it("Should not let sender get whitelisted when the sale is not open", async function () {
    // We close the sale
    const closeSaleTx = await whiteList.setSaleStatus(false);
    closeSaleTx.wait(1);
    // We then expect the buyer to fail trying to get whitelisted
    // as the sale is not open
    await expect(
      whiteList.connect(buyer).whiteListSender({
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.revertedWith("Sale not open");
    // We re-open the sale
    const openSaleTx = await whiteList.setSaleStatus(true);
    openSaleTx.wait(1);
    // This time the buyer should be able to get whitelisted
    await expect(
      whiteList.connect(buyer).whiteListSender({
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.not.reverted;
  });
});
