const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const Token = await hre.ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("TestToken", "TEST");
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log("MockERC20 deployed to:", address);
  console.log("Deployer:", deployer.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
