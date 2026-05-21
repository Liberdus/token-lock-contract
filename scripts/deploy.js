const hre = require("hardhat");
const { recordDeployment } = require("./deployment-records");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const TokenLock = await hre.ethers.getContractFactory("TokenLock");
  const tokenLock = await TokenLock.deploy();
  const deploymentTx = tokenLock.deploymentTransaction();
  const receipt = await deploymentTx.wait();
  await tokenLock.waitForDeployment();

  const address = await tokenLock.getAddress();
  console.log("TokenLock deployed to:", address);
  console.log("Deployer:", deployer.address);

  const deploymentFile = await recordDeployment(hre, "TokenLock", address, {
    deploymentTx,
    receipt,
  });

  if (deploymentFile) {
    console.log("Deployment recorded in:", deploymentFile);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
