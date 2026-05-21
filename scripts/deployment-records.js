const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const EXPLORER_URLS = {
  amoy: "https://amoy.polygonscan.com/address/",
  bsc: "https://bscscan.com/address/",
  bscTestnet: "https://testnet.bscscan.com/address/",
};

function getGitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function buildDeploymentRecord(hre, contractName, address, options = {}) {
  const [deployer] = await hre.ethers.getSigners();
  const deploymentTx = options.deploymentTx || null;
  const receipt = options.receipt || (deploymentTx ? await deploymentTx.wait() : null);
  const network = await hre.ethers.provider.getNetwork();
  const block = receipt?.blockNumber
    ? await hre.ethers.provider.getBlock(receipt.blockNumber)
    : null;
  const explorerBaseUrl = EXPLORER_URLS[hre.network.name] || null;

  return {
    contract: contractName,
    address,
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    transactionHash: receipt?.hash || deploymentTx?.hash || null,
    blockNumber: receipt?.blockNumber || null,
    deployedAt: block ? new Date(Number(block.timestamp) * 1000).toISOString() : new Date().toISOString(),
    constructorArgs: options.constructorArgs || [],
    verified: false,
    explorerUrl: explorerBaseUrl ? `${explorerBaseUrl}${address}` : null,
    gitCommit: getGitCommit(),
  };
}

function writeDeploymentRecord(networkName, record) {
  const deploymentsDir = path.join(process.cwd(), "deployments");
  const deploymentFile = path.join(deploymentsDir, `${networkName}.json`);
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const existing = fs.existsSync(deploymentFile)
    ? JSON.parse(fs.readFileSync(deploymentFile, "utf8"))
    : { network: networkName, chainId: record.chainId, contracts: {} };

  existing.network = networkName;
  existing.chainId = record.chainId;
  existing.contracts = existing.contracts || {};
  existing.contracts[record.contract] = record;

  fs.writeFileSync(deploymentFile, `${JSON.stringify(existing, null, 2)}\n`);
  return deploymentFile;
}

async function recordDeployment(hre, contractName, address, options = {}) {
  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    return null;
  }

  const record = await buildDeploymentRecord(hre, contractName, address, options);
  return writeDeploymentRecord(hre.network.name, record);
}

module.exports = {
  buildDeploymentRecord,
  recordDeployment,
  writeDeploymentRecord,
};
