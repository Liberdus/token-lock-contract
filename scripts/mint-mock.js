const hre = require("hardhat");

async function main() {
  const [caller] = await hre.ethers.getSigners();
  const tokenAddress = process.env.MOCK_TOKEN;
  const to = process.env.MINT_TO;
  const amount = process.env.MINT_AMOUNT || "1000000"; // whole tokens

  if (!tokenAddress || !to) {
    throw new Error("Set MOCK_TOKEN and MINT_TO in env");
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
