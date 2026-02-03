const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;

describe("TokenLock", function () {
  async function deploy() {
    const [creator, withdrawer, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock", "MOCK");
    const Lock = await ethers.getContractFactory("TokenLock");
    const lock = await Lock.deploy();

    await token.waitForDeployment();
    await lock.waitForDeployment();
    const tokenAddress = await token.getAddress();
    const lockAddress = await lock.getAddress();

    return { token, lock, tokenAddress, lockAddress, creator, withdrawer, other };
  }

  it("locks tokens and assigns lockId", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer } = await deploy();

    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);

    await expect(lock.lock(tokenAddress, 1000, 0, 1_000_000, withdrawer.address))
      .to.emit(lock, "LockCreated")
      .withArgs(0, creator.address, tokenAddress, 1000, 0, 1_000_000, withdrawer.address);

    const l = await lock.getLock(0);
    expect(l.amount).to.equal(1000);
    expect(l.withdrawAddress).to.equal(withdrawer.address);
  });

  it("only creator can unlock", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer, other } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);
    await lock.lock(tokenAddress, 1000, 0, 1_000_000, withdrawer.address);

    const now = await time.latest();
    await expect(lock.connect(other).unlock(0, now + 1))
      .to.be.revertedWith("not creator");
  });

  it("withdraws after cliff with daily vesting", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);

    const rate = 100_000; // 10% per day
    await lock.lock(tokenAddress, 1000, 0, rate, withdrawer.address);

    const now = await time.latest();
    await lock.unlock(0, now + 1);

    await time.increaseTo(now + 1 + 5 * DAY);

    await expect(lock.connect(withdrawer).withdraw(0, 0, 0, withdrawer.address))
      .to.emit(lock, "Withdrawn")
      .withArgs(0, withdrawer.address, 500);

    await time.increase(5 * DAY);

    await expect(lock.connect(withdrawer).withdraw(0, 0, 0, withdrawer.address))
      .to.emit(lock, "Withdrawn")
      .withArgs(0, withdrawer.address, 500);
  });

  it("supports percent-based withdrawals", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);

    const rate = 1_000_000; // 100% per day
    await lock.lock(tokenAddress, 1000, 0, rate, withdrawer.address);

    const now = await time.latest();
    await lock.unlock(0, now + 1);
    await time.increaseTo(now + 1 + 1 * DAY);

    await expect(lock.connect(withdrawer).withdraw(0, 0, 500_000, withdrawer.address))
      .to.emit(lock, "Withdrawn")
      .withArgs(0, withdrawer.address, 500);
  });

  it("retracts only before any withdrawal", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);

    await lock.lock(tokenAddress, 1000, 0, 1_000_000, withdrawer.address);

    await expect(lock.retract(0, creator.address))
      .to.emit(lock, "Retracted")
      .withArgs(0, creator.address, 1000);
  });
});
