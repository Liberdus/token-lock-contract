require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { AMOY_RPC_URL, PRIVATE_KEY, POLYGONSCAN_API_KEY } = process.env;

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
