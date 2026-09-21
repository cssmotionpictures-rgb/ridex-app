# CrixCoin (CRXS) — Base Sepolia Testnet Deployment Guide

**STATUS: PREPARED — TOKENOMICS APPROVED (500B) — WALLET FUNDED (0.01 test ETH confirmed on-chain) — WAITING FOR OWNER SIGNATURE. Nothing is deployed yet.**
No contract address, transaction hash or block number exists. Do not record any
value until it appears on the real Base Sepolia chain.

## Approved tokenomics (owner decision, 2026-09-11)

| Item | Value |
|---|---|
| Name | `CrixCoin` |
| Symbol | `CRXS` |
| Total supply | `500,000,000,000 CRXS` (five hundred billion, fixed) |
| Decimals | `18` |
| Constructor argument (raw units) | `500000000000000000000000000000` (= 5 × 10^11 × 10^18) |
| Initial allocation | 100% of the fixed supply is minted once to the deployment wallet at deployment. This is the INITIAL DEPLOYMENT ALLOCATION — not the final economic distribution of the ecosystem unless separately approved later. |
| Minting | None — entire supply minted once in the constructor, no mint function exists |
| Tax / blacklist / owner controls | None — no backdoor of any kind |
| Corporate structure | RIDE X is a product/platform of CSS ENTERTAINMENT (RC 7573127, incorporated June 11, 2024, CAC ACTIVE) · CRXS is the RIDE X cryptocurrency |

The coder may not change any of these values. Deployment is now blocked only on
gas + the owner's personal MetaMask signature.

## Network (real public facts)

| Item | Value |
|---|---|
| Network | Base Sepolia (Coinbase's public testnet for Base) |
| Chain ID | `84532` |
| RPC | `https://sepolia.base.org` |
| Explorer | `https://sepolia.basescan.org` |
| Native gas token | Testnet ETH (no real value) |
| Faucets | https://www.coinbase.com/faucets/ethereum-base-sepolia · https://www.alchemy.com/faucets/base-sepolia |
| Deployer (public address only) | `0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1` |

Mainnet (Base, chain ID `8454`) is **LOCKED**. After testnet tests pass,
deployment waits for explicit owner approval, real gas and a fresh human
signature.

## Human actions required (in order)

1. ~~Approve tokenomics~~ **DONE (2026-09-11, revised same day)** — 500,000,000,000 CRXS ·
   18 decimals · fixed supply · 100% initial allocation to the deployment wallet ·
   no mint · no tax · no blacklist · no owner controls.
2. ~~Fund the deployer~~ **DONE** — the on-chain balance reads exactly 0.01 test ETH
   (verified live against Base Sepolia at preparation time).
3. **Review the exact deployment transaction and sign it in MetaMask**
   (WAITING FOR SIGNATURE). Before signing, MetaMask must show: contract creation
   on Base Sepolia (chain 84532), from `0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1`,
   constructor argument `500000000000000000000000000000`. The private key /
   seed phrase is never requested, stored, logged or sent to anyone.

## Deployment steps

**Option A — in-app (recommended):** open **Admin → CRXS Launch Control → Owner
Deployment Console**, tick the explicit confirmation, and sign in MetaMask. The
app polls the real receipt, reads the contract state straight from Base Sepolia,
and the server (`crxs-deployment-verify`) independently re-verifies the receipt,
contract address, deployer, name, symbol, decimals, total supply and your
balance before anything is recorded. No key ever touches the app.

**Option B — Remix + MetaMask (keys stay in your wallet):**

1. Open https://remix.ethereum.org and create `CrixCoin.sol` with the exact
   source from `contracts/CrixCoin.sol`.
2. In MetaMask, add the Base Sepolia network (RPC `https://sepolia.base.org`,
   chain ID `84532`, symbol `ETH`, explorer `https://sepolia.basescan.org`) and
   connect the deployment wallet in Remix's "Deploy & run" tab, Environment:
   "Injected Provider — MetaMask".
3. Compile with any stable Solidity `0.8.x` that satisfies the pragma — the
   in-app console ships bytecode compiled with `0.8.37`, optimizer enabled,
   200 runs (artifact + SHA-256: `contracts/crxs-creation-bytecode.hex`). Use
   exactly those settings if you deploy via Remix, so BaseScan source
   verification matches the deployed bytecode.
4. Deploy with constructor argument (exact, approved):
    `500000000000000000000000000000` (= 500,000,000,000 CRXS at 18 decimals)
5. MetaMask shows the real deployment transaction — **REVIEW AND SIGN IT**.
6. Record the REAL values after confirmation (do not invent any):
   - contract address
   - deployment transaction hash
   - block number
   - deployer address (must be `0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1`)
   - timestamp
   - `totalSupply()`, `decimals()`, `symbol()`, `name()` read from the contract
7. Verify the source on https://sepolia.basescan.org
   (contract → "Verify & Publish" → Solidity single file → compiler `0.8.24`,
   optimizer default) and store the verified-contract URL.
8. Transfer test: send a small amount from the deployer to a second test
   wallet, then send it back. Record both REAL transaction hashes.

## Failure handling

If deployment or any transaction fails: show the real blockchain error, mark
the step FAILED, never substitute a fake address/hash, and only mark SUCCESS
after a real on-chain confirmation.

## After Stage 2 (testnet) completes

STOP. Do not proceed to mainnet automatically. Wait for the owner's explicit
approval for Stage 3 (mainnet), which additionally requires: approved
tokenomics, security review, real gas on Base mainnet, and a fresh human
signature.