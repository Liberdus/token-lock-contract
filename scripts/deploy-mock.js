const hre = require("hardhat");
const { recordDeployment } = require("./deployment-records");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const Token = await hre.ethers.getContractFactory("MockERC20");
  const name = "TestToken";
  const symbol = "TEST";
  const token = await Token.deploy(name, symbol);
  const deploymentTx = token.deploymentTransaction();
  const receipt = await deploymentTx.wait();
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log("MockERC20 deployed to:", address);
  console.log("Deployer:", deployer.address);

  const deploymentFile = await recordDeployment(hre, "MockERC20", address, {
    constructorArgs: [name, symbol],
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
