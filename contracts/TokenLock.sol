// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TokenLock {
    using SafeERC20 for IERC20;

    uint8 public constant CLOSE_REASON_WITHDRAWN = 0;
    uint8 public constant CLOSE_REASON_RETRACTED = 1;
    uint256 public constant RATE_SCALE = 1_000_000_000_000; // 100% = 1e12

    struct Lock {
        address creator;
        address token;
        address withdrawAddress;
        uint256 amount;
        uint256 withdrawn;
        uint256 cliffDays;
        uint256 ratePerDay;
        uint256 unlockTime;
        bool unlocked;
        // If true: creator may retract only until the lock has been unlocked.
        // If false: creator may retract until the first withdrawal (legacy behavior).
        bool retractUntilUnlock;
    }

    uint256 public nextLockId;
    uint256 public activeLockCount;
    mapping(uint256 => Lock) private locks;
    uint256[] private activeLockIds;
    mapping(uint256 => uint256) private activeIndex;

    event LockCreated(
        uint256 indexed lockId,
        address indexed creator,
        address indexed token,
        uint256 amount,
        uint256 cliffDays,
        uint256 ratePerDay,
        address withdrawAddress
    );
    event Unlocked(uint256 indexed lockId, uint256 unlockTime);
    event Withdrawn(uint256 indexed lockId, address indexed to, uint256 amount);
    event Retracted(uint256 indexed lockId, address indexed to, uint256 amount);
    event LockClosed(
        uint256 indexed lockId,
        uint8 reason,
        address creator,
        address token,
        address withdrawAddress,
        uint256 amount,
        uint256 withdrawn,
        uint256 cliffDays,
        uint256 ratePerDay,
        uint256 unlockTime,
        bool unlocked
    );

    function getLock(uint256 lockId) external view returns (Lock memory) {
        return locks[lockId];
    }

    function getActiveLockCount() external view returns (uint256) {
        return activeLockCount;
    }

    function getActiveLockIds(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        uint256 total = activeLockIds.length;
        if (offset >= total) return new uint256[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;
        uint256[] memory result = new uint256[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = activeLockIds[offset + i];
        }
        return result;
    }

    function previewWithdrawable(uint256 lockId) external view returns (uint256) {
        Lock memory l = locks[lockId];
        if (l.creator == address(0) || !l.unlocked) {
            return 0;
        }
        return _withdrawable(l);
    }

    function lock(
        address token,
        uint256 amount,
        uint256 cliffDays,
        uint256 ratePerDay,
        address withdrawAddress,
        bool retractUntilUnlock
    ) external returns (uint256 lockId) {
        require(token != address(0), "token zero");
        require(amount > 0, "amount zero");
        require(ratePerDay > 0 && ratePerDay <= RATE_SCALE, "rate invalid");

        lockId = nextLockId++;
        address resolvedWithdraw = withdrawAddress == address(0) ? msg.sender : withdrawAddress;

        locks[lockId] = Lock({
            creator: msg.sender,
            token: token,
            withdrawAddress: resolvedWithdraw,
            amount: amount,
            withdrawn: 0,
            cliffDays: cliffDays,
            ratePerDay: ratePerDay,
            unlockTime: 0,
            unlocked: false,
            retractUntilUnlock: retractUntilUnlock
        });
        _addActiveLock(lockId);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit LockCreated(lockId, msg.sender, token, amount, cliffDays, ratePerDay, resolvedWithdraw);
    }

    function unlock(uint256 lockId, uint256 unlockTime) external {
        Lock storage l = locks[lockId];
        require(l.creator != address(0), "lock missing");
        require(msg.sender == l.creator, "not creator");
        require(!l.unlocked, "already unlocked");
        require(unlockTime >= block.timestamp, "unlock in past");

        l.unlocked = true;
        l.unlockTime = unlockTime;

        emit Unlocked(lockId, unlockTime);
    }

    function withdraw(
        uint256 lockId,
        uint256 amount,
        uint256 percent,
        address to
    ) external returns (uint256 withdrawnAmount) {
        Lock storage l = locks[lockId];
        require(l.creator != address(0), "lock missing");
        require(l.unlocked, "not unlocked");
        require(msg.sender == l.withdrawAddress, "not withdraw address");

        uint256 cliffEnd = l.unlockTime + (l.cliffDays * 1 days);
        require(block.timestamp >= cliffEnd, "cliff active");

        uint256 available = _withdrawable(l);
        require(available > 0, "nothing unlocked");

        if (amount == 0 && percent == 0) {
            withdrawnAmount = available;
        } else if (amount > 0 && percent == 0) {
            withdrawnAmount = amount;
        } else if (amount == 0 && percent > 0) {
            require(percent <= RATE_SCALE, "percent invalid");
            withdrawnAmount = (available * percent) / RATE_SCALE;
        } else {
            revert("amount and percent");
        }

        require(withdrawnAmount > 0, "withdraw zero");
        require(withdrawnAmount <= available, "exceeds available");

        l.withdrawn += withdrawnAmount;
        address resolvedTo = to == address(0) ? l.withdrawAddress : to;
        IERC20(l.token).safeTransfer(resolvedTo, withdrawnAmount);

        emit Withdrawn(lockId, resolvedTo, withdrawnAmount);

        if (l.withdrawn >= l.amount) {
            emit LockClosed(
                lockId,
                CLOSE_REASON_WITHDRAWN,
                l.creator,
                l.token,
                l.withdrawAddress,
                l.amount,
                l.withdrawn,
                l.cliffDays,
                l.ratePerDay,
                l.unlockTime,
                l.unlocked
            );
            _removeActiveLock(lockId);
            delete locks[lockId];
        }
    }

    function retract(uint256 lockId, address to) external {
        Lock storage l = locks[lockId];
        require(l.creator != address(0), "lock missing");
        require(msg.sender == l.creator, "not creator");
        if (l.retractUntilUnlock) {
            require(!l.unlocked, "already unlocked");
        } else {
            require(l.withdrawn == 0, "already withdrawn");
        }

        uint256 amount = l.amount;
        address token = l.token;
        address resolvedTo = to == address(0) ? l.creator : to;
        emit LockClosed(
            lockId,
            CLOSE_REASON_RETRACTED,
            l.creator,
            l.token,
            l.withdrawAddress,
            l.amount,
            l.withdrawn,
            l.cliffDays,
            l.ratePerDay,
            l.unlockTime,
            l.unlocked
        );
        _removeActiveLock(lockId);
        delete locks[lockId];

        IERC20(token).safeTransfer(resolvedTo, amount);

        emit Retracted(lockId, resolvedTo, amount);
    }

    function _withdrawable(Lock memory l) internal view returns (uint256) {
        uint256 cliffEnd = l.unlockTime + (l.cliffDays * 1 days);
        if (block.timestamp < cliffEnd) {
            return 0;
        }

        uint256 daysElapsed = (block.timestamp - cliffEnd) / 1 days;
        uint256 vestedPct = l.ratePerDay * daysElapsed;
        if (vestedPct > RATE_SCALE) {
            vestedPct = RATE_SCALE;
        }

        uint256 unlocked = (l.amount * vestedPct) / RATE_SCALE;
        if (unlocked <= l.withdrawn) {
            return 0;
        }
        return unlocked - l.withdrawn;
    }

    function _addActiveLock(uint256 lockId) internal {
        activeIndex[lockId] = activeLockIds.length;
        activeLockIds.push(lockId);
        activeLockCount = activeLockIds.length;
    }

    function _removeActiveLock(uint256 lockId) internal {
        if (activeLockIds.length == 0) return;
        uint256 idx = activeIndex[lockId];
        uint256 lastIdx = activeLockIds.length - 1;
        if (idx != lastIdx) {
            uint256 lastId = activeLockIds[lastIdx];
            activeLockIds[idx] = lastId;
            activeIndex[lastId] = idx;
        }
        activeLockIds.pop();
        delete activeIndex[lockId];
        activeLockCount = activeLockIds.length;
    }
}
