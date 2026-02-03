require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { task } = require("hardhat/config");

const { AMOY_RPC_URL, PRIVATE_KEY, POLYGONSCAN_API_KEY } = process.env;

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
  },
  etherscan: {
    apiKey: POLYGONSCAN_API_KEY || "",
  },
};
