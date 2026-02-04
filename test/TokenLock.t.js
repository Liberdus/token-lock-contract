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

    await expect(lock.lock(tokenAddress, 1000, 0, 1_000_000_000_000, withdrawer.address))
      .to.emit(lock, "LockCreated")
      .withArgs(0, creator.address, tokenAddress, 1000, 0, 1_000_000_000_000, withdrawer.address);

    const l = await lock.getLock(0);
    expect(l.amount).to.equal(1000);
    expect(l.withdrawAddress).to.equal(withdrawer.address);
  });

  it("only creator can unlock", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer, other } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);
    await lock.lock(tokenAddress, 1000, 0, 1_000_000_000_000, withdrawer.address);

    const now = await time.latest();
    await expect(lock.connect(other).unlock(0, now + 1))
      .to.be.revertedWith("not creator");
  });

  it("rejects invalid lock parameters", async function () {
    const { token, lock, tokenAddress, lockAddress, creator } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);

    await expect(lock.lock(ethers.ZeroAddress, 1000, 0, 1_000_000_000_000, creator.address))
      .to.be.revertedWith("token zero");
    await expect(lock.lock(tokenAddress, 0, 0, 1_000_000_000_000, creator.address))
      .to.be.revertedWith("amount zero");
    await expect(lock.lock(tokenAddress, 1000, 0, 0, creator.address))
      .to.be.revertedWith("rate invalid");
    await expect(lock.lock(tokenAddress, 1000, 0, 1_000_000_000_001, creator.address))
      .to.be.revertedWith("rate invalid");
  });

  it("prevents unlock in the past and double unlock", async function () {
    const { token, lock, tokenAddress, lockAddress, creator } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);
    await lock.lock(tokenAddress, 1000, 0, 1_000_000_000_000, creator.address);

    const now = await time.latest();
    await expect(lock.unlock(0, now - 1))
      .to.be.revertedWith("unlock in past");

    await lock.unlock(0, now + 10);
    await expect(lock.unlock(0, now + 20))
      .to.be.revertedWith("already unlocked");
  });

  it("blocks withdrawal before unlock or cliff end", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);
    await lock.lock(tokenAddress, 1000, 2, 1_000_000_000_000, withdrawer.address);

    await expect(lock.connect(withdrawer).withdraw(0, 0, 0, withdrawer.address))
      .to.be.revertedWith("not unlocked");

    const now = await time.latest();
    await lock.unlock(0, now + 1);

    await time.increaseTo(now + 1 + 1 * DAY);
    await expect(lock.connect(withdrawer).withdraw(0, 0, 0, withdrawer.address))
      .to.be.revertedWith("cliff active");
  });

  it("honors non-zero cliff with delayed vesting start", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);

    const rate = 200_000_000_000; // 20% per day
    await lock.lock(tokenAddress, 1000, 3, rate, withdrawer.address);

    const now = await time.latest();
    await lock.unlock(0, now + 1);

    await time.increaseTo(now + 1 + 2 * DAY);
    expect(await lock.previewWithdrawable(0)).to.equal(0);

    await time.increaseTo(now + 1 + 3 * DAY);
    expect(await lock.previewWithdrawable(0)).to.equal(0);

    await time.increaseTo(now + 1 + 4 * DAY);
    expect(await lock.previewWithdrawable(0)).to.equal(200);
  });

  it("enforces withdraw address and amount/percent rules", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer, other } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);
    await lock.lock(tokenAddress, 1000, 0, 1_000_000_000_000, withdrawer.address);

    const now = await time.latest();
    await lock.unlock(0, now + 1);
    await time.increaseTo(now + 1 + 1 * DAY);

    await expect(lock.connect(other).withdraw(0, 0, 0, other.address))
      .to.be.revertedWith("not withdraw address");
    await expect(lock.connect(withdrawer).withdraw(0, 1, 1, withdrawer.address))
      .to.be.revertedWith("amount and percent");
    await expect(lock.connect(withdrawer).withdraw(0, 0, 1_000_000_000_001, withdrawer.address))
      .to.be.revertedWith("percent invalid");
  });

  it("defaults withdraw address to creator and deletes lock after full withdraw", async function () {
    const { token, lock, tokenAddress, lockAddress, creator } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);

    await lock.lock(tokenAddress, 1000, 0, 1_000_000_000_000, ethers.ZeroAddress);
    const now = await time.latest();
    await lock.unlock(0, now + 1);
    expect(await lock.previewWithdrawable(0)).to.equal(0);
    await time.increaseTo(now + 1 + 1 * DAY);

    expect(await lock.previewWithdrawable(0)).to.equal(1000);
    await expect(lock.withdraw(0, 0, 0, ethers.ZeroAddress))
      .to.emit(lock, "Withdrawn")
      .withArgs(0, creator.address, 1000);

    const l = await lock.getLock(0);
    expect(l.creator).to.equal(ethers.ZeroAddress);
  });

  it("retract fails after any withdrawal", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);
    await lock.lock(tokenAddress, 1000, 0, 1_000_000_000_000, withdrawer.address);

    const now = await time.latest();
    await lock.unlock(0, now + 1);
    await time.increaseTo(now + 1 + 1 * DAY);
    await lock.connect(withdrawer).withdraw(0, 500, 0, withdrawer.address);

    await expect(lock.retract(0, creator.address))
      .to.be.revertedWith("already withdrawn");
  });

  it("withdraws after cliff with daily vesting", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);

    const rate = 100_000_000_000; // 10% per day
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

    const rate = 1_000_000_000_000; // 100% per day
    await lock.lock(tokenAddress, 1000, 0, rate, withdrawer.address);

    const now = await time.latest();
    await lock.unlock(0, now + 1);
    await time.increaseTo(now + 1 + 1 * DAY);

    await expect(lock.connect(withdrawer).withdraw(0, 0, 500_000_000_000, withdrawer.address))
      .to.emit(lock, "Withdrawn")
      .withArgs(0, withdrawer.address, 500);
  });

  it("emits LockClosed on full withdrawal", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);

    const rate = 1_000_000_000_000; // 100% per day
    await lock.lock(tokenAddress, 1000, 0, rate, withdrawer.address);

    const now = await time.latest();
    await lock.unlock(0, now + 1);
    await time.increaseTo(now + 1 + 1 * DAY);

    await expect(lock.connect(withdrawer).withdraw(0, 0, 0, withdrawer.address))
      .to.emit(lock, "Withdrawn")
      .withArgs(0, withdrawer.address, 1000)
      .to.emit(lock, "LockClosed");
  });

  it("tracks active lock ids", async function () {
    const { token, lock, tokenAddress, lockAddress, creator } = await deploy();
    await token.mint(creator.address, 2000);
    await token.approve(lockAddress, 2000);

    await lock.lock(tokenAddress, 1000, 0, 1_000_000_000_000, creator.address);
    await lock.lock(tokenAddress, 1000, 0, 1_000_000_000_000, creator.address);

    const count = await lock.getActiveLockCount();
    expect(count).to.equal(2);

    const ids = await lock.getActiveLockIds(0, 10);
    expect(ids.map((v) => Number(v))).to.have.members([0, 1]);

    await lock.retract(0, creator.address);

    const countAfter = await lock.getActiveLockCount();
    expect(countAfter).to.equal(1);
    const idsAfter = await lock.getActiveLockIds(0, 10);
    expect(idsAfter.map((v) => Number(v))).to.have.members([1]);
  });

  it("retracts only before any withdrawal", async function () {
    const { token, lock, tokenAddress, lockAddress, creator, withdrawer } = await deploy();
    await token.mint(creator.address, 1000);
    await token.approve(lockAddress, 1000);

    await lock.lock(tokenAddress, 1000, 0, 1_000_000_000_000, withdrawer.address);

    await expect(lock.retract(0, creator.address))
      .to.emit(lock, "Retracted")
      .withArgs(0, creator.address, 1000)
      .to.emit(lock, "LockClosed");
  });
});
