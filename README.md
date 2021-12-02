# Piano King NFTs

This is the official repository of **Piano King** smart contracts.
**Only the addresses of the contracts posted here should be trusted as the official ones**. To see the addresses, scroll down.

The smart contracts are coded in **Solidity** and is meant to be deployed on Ethereum mainnet. The project relies on **Hardhat** as its Ethereum (or EVM compatible) development environment. The non Solidity part of the project is coded in **TypeScript**.

# Getting started

To get started, make sure to have **Node.js** and **Yarn** installed on your computer. Then proceed by executing:

```shell
yarn install
```

Which will install the necessary packages, including Hardhat. Once the process has been completed, you can start by compiling the smart contracts present in the **contracts** folder by running the following command:

```shell
npx hardhat compile
```

# Tests

You can find the unit tests in the test folder. They are written using chai and mocha paired with Waffle for testing smart contracts efficiently. To run the tests, you can execute the following command:

```shell
npx hardhat test
```

# Environment variables

The project comes with multiple environment variables that you will need to set on your side by creating locally a **.env** file. That file will be read in the **hardhat.config.ts** file defining the configs of Hardhat. Here are the list of environment variables to define:

```shell
ROPSTEN_URL=https://eth-ropsten.alchemyapi.io/v2/<YOUR_ALCHEMY_KEY>
RINKEBY_URL=https://eth-rinkeby.alchemyapi.io/v2/<YOUR_ALCHEMY_KEY>
MAINNET_URL=https://eth-mainnet.alchemyapi.io/v2/<YOUR_ALCHEMY_KEY>
# If defined a table with gas cost estimation for each function and contract
# will show up after the completion of the tests
REPORT_GAS=<ANY_VALUE_TO_ACTIVATE_GAS_ESTIMATION>
# Don't use the private key of an account you use for real funds on Ethereum mainnet
PRIVATE_KEY=<YOUR_PRIVATE_KEY>
# To get the results of the gas estimation in US Dollars
COINMARKETCAP_API_KEY=<YOUR_COINMARKET_API_KEY>
```

# Current status of contracts

- Piano King Whitelist: Deployed to Ethereum Mainnet - [0xB2E31C3D51bbfefB4653789CF0965f9dfa7C902a](https://etherscan.io/address/0xB2E31C3D51bbfefB4653789CF0965f9dfa7C902a)
- Piano King: Under development - Planned deployment on Ethereum mainnet by December 8th
- Piano King Dutch Auction: Under development - Maybe deployed later
