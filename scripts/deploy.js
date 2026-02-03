const hre = require("hardhat");

async function main() {
  const TokenLock = await hre.ethers.getContractFactory("TokenLock");
  const tokenLock = await TokenLock.deploy();
  await tokenLock.waitForDeployment();

  const address = await tokenLock.getAddress();
  console.log("TokenLock deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
