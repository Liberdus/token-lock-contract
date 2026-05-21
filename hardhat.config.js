require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { task } = require("hardhat/config");

const {
  AMOY_RPC_URL,
  BSC_RPC_URL,
  BSC_TESTNET_RPC_URL,
  PRIVATE_KEY,
  ETHERSCAN_API_KEY,
} = process.env;

task("mint-mock", "Mint MockERC20 tokens")
  .addParam("token", "MockERC20 token address")
  .addParam("to", "Recipient address")
  .addOptionalParam("amount", "Whole token amount", "1000000")
  .setAction(async ({ token, to, amount }, hre) => {
    const [caller] = await hre.ethers.getSigners();
    const contract = await hre.ethers.getContractAt("MockERC20", token);
    const value = hre.ethers.parseUnits(amount, 18);
    const tx = await contract.mint(to, value);
    await tx.wait();
    console.log("Minted", amount, "to", to, "from", caller.address);
    console.log("Token:", token);
  });

task("approve-mock", "Approve MockERC20 allowance")
  .addParam("token", "MockERC20 token address")
  .addParam("spender", "Spender address")
  .addOptionalParam("amount", "Whole token amount", "1000")
  .setAction(async ({ token, spender, amount }, hre) => {
    const [caller] = await hre.ethers.getSigners();
    const contract = await hre.ethers.getContractAt("MockERC20", token);
    const value = hre.ethers.parseUnits(amount, 18);
    const tx = await contract.approve(spender, value);
    await tx.wait();
    console.log("Approved", amount, "for", spender, "from", caller.address);
    console.log("Token:", token);
  });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    amoy: {
      url: AMOY_RPC_URL || "https://rpc-amoy.polygon.technology/",
      chainId: 80002,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    bsc: {
      url: BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
};
