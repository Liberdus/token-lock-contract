# Token Lock Contract

Simple ERC20 token lock with cliff + daily linear vesting. Intended for Polygon-compatible deployment.

## Key Concepts
- `ratePerDay` is a **percentage-per-day** scaled by `RATE_SCALE = 1_000_000`.
  - `1_000_000` = 100% per day
  - Example: 2 years (730 days) => `ratePerDay = 1_000_000 / 730`.
- Vesting starts only after `unlock()` is called and the cliff period has elapsed.

## Contract Flow
1. `lock(...)`
   - Transfers tokens into the contract.
   - Assigns a `lockId` and emits `LockCreated`.
2. `unlock(lockId, unlockTime)`
   - Must be called by the original lock creator.
   - Starts the cliff countdown at `unlockTime`.
3. `withdraw(lockId, amount, percent, to)`
   - Must be called by the `withdrawAddress` set in `lock()`.
   - Can withdraw by exact `amount` or `percent` (scaled by `RATE_SCALE`).
   - If both `amount` and `percent` are zero, defaults to 100% of available.
4. `retract(lockId, to)`
   - Creator-only, only allowed if **no withdrawals have occurred**.

## Local Dev
```bash
npm install
npm run compile
npm test
```

## Deploy to Polygon Amoy (Testnet)
1. Copy `.env.example` to `.env` and fill in:
   - `AMOY_RPC_URL`
   - `PRIVATE_KEY`
   - `POLYGONSCAN_API_KEY`
2. Deploy:
```bash
npx hardhat run scripts/deploy.js --network amoy
```
3. Verify on PolygonScan (to enable the contract UI there):
```bash
npx hardhat verify --network amoy <DEPLOYED_ADDRESS>
```

## Mock ERC20 (Test Token)
Deploy a mock token to Amoy for local testing against the lock contract:
```bash
npx hardhat run scripts/deploy-mock.js --network amoy
```

Mint to a wallet (example: 1,000,000 tokens):
```bash
MOCK_TOKEN=0xYourMockToken MINT_TO=0xYourWallet MINT_AMOUNT=1000000 \\
  npx hardhat run scripts/mint-mock.js --network amoy
```

## Notes
- This repo uses Hardhat.
- ERC20 only (no permit, no ERC777 hooks).
