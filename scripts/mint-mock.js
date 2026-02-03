const hre = require("hardhat");

async function main() {
  const [caller] = await hre.ethers.getSigners();
  const [tokenAddress, to, amount = "1000000"] = process.argv.slice(2);

  if (!tokenAddress || !to) {
    throw new Error("Usage: mint-mock.js <tokenAddress> <to> [amount]");
  }

  const token = await hre.ethers.getContractAt("MockERC20", tokenAddress);
  const value = hre.ethers.parseUnits(amount, 18);
  const tx = await token.mint(to, value);
  await tx.wait();

  console.log("Minted", amount, "to", to, "from", caller.address);
  console.log("Token:", tokenAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
