# CRIXCOIN Dual-Rail Architecture — Base Primary + Solana Controlled Fallback

Authoritative reference for the production design. **Nothing here activates real
money movement by itself** — every gate below must pass first, in order.

## 1. Core principle — ONE authoritative ledger

The CRIXCOIN internal double-entry ledger (CrixLedgerEntry / CrixWallet, written
only by the server-side Crix engine) is the customer's authoritative financial
position. Blockchain networks are settlement rails:

- The **ledger** determines the customer's internal balance.
- The **chain** only determines whether an external blockchain settlement
  actually occurred — confirmed only by an independently verified receipt AND
  the matching token Transfer event (Base) / SPL transfer instruction (Solana),
  never by "transaction submitted".
- Customer balances are NEVER computed from a blockchain balance query.
- Credit is granted only after the authoritative settlement condition is met.

## 2. Rails and assets (CrixSettlementRail registry)

| asset_id | rail | network | standard | status |
|----------|------|---------|----------|--------|
| CRXS | BASE | BASE_MAINNET (8453) | ERC-20 | PAUSED — no production contract yet |
| CRIX_SOL | SOLANA | SOLANA_MAINNET | SPL | NOT_IMPLEMENTED — fallback OFF |

- The ERC-20 rail must be the **verified production CRXS contract** — the exact
  recovered creation bytecode (solc 0.8.37, minimal standard ERC-20, no mint,
  no owner, no tax, no blacklist), deployed by the owner wallet
  `0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1`. Never deploy a different contract.
- **CRIX_SOL is a separate asset.** It is never called "Base CRXS". Customer UI
  says "CRIXCOIN — Base" or "CRIXCOIN — Solana" wherever the distinction matters.
- Internal ledger movements are displayed as **"Internal CRIXCOIN transfer"**;
  only verified blockchain settlement is displayed as **"On-chain transfer"**.

## 3. Solana supply/backing model — CHOICE (documented before any activation)

**Model C — canonical token on one chain with wrapped representation on the
other.** CRXS on Base Mainnet is the canonical, fixed-supply token. Any Solana
representation is a wrapped asset minted ONLY against locked Base inventory
(locked in a dedicated, audited backing account), 1:1 redeemable. Base supply +
Solana wrapped supply can never exceed 500,000,000,000 CRXS backing. No burn/mint
bridge is activated in this stage; SOLANA_FALLBACK_ENABLED=false until the model
is implemented, audited and tested.

## 4. State machine (every financial transaction)

CREATED → QUOTED → AUTHORIZED → RESERVED → ROUTE_SELECTED → SUBMITTED →
PENDING → CONFIRMED · terminal: FAILED | CANCELLED | REVERSED · recovery: UNKNOWN.

UNKNOWN is a real state: a lost response after submission is UNKNOWN, never
FAILED. UNKNOWN never triggers blind resubmission — reconciliation queries the
chain (by hash, nonce, sender, recipient, amount, idempotency key, receipt and
Transfer event) first:

- Base confirmed → CONFIRMED_BASE (no second transaction, ever)
- Base definitively failed → FAILED_BASE, reservation released; another rail
  only if the routing policy explicitly permits it
- genuinely never submitted → controlled retry/reroute per policy

A timeout is never proof of failure. Rail is never switched after submission.

## 5. Server-side router (pseudo-logic)

```
if globalEmergencyPause: reject            (CrixEmergencyPause registry)
if riskEngineBlocked: reject
if chain explicitly specified: validate, use it
if preferred rail healthy: BASE
if BASE unavailable BEFORE submission:
    if fallback_enabled for this transaction type: SOLANA
    else: controlled failure
if Base submission already occurred: BASE_RECOVERY (reconcile, never re-route)
```

Paymaster failure ≠ Base failure: try the next authorized Base paymaster or
user-paid Base gas; never switch chain for a paymaster problem. RPC provider
failover (A→B→C on the same chain) is not rail failover. Health is determined
server-side only (BASE_/SOLANA_ HEALTHY | DEGRADED | UNAVAILABLE) — never by a
browser probe. See the failover decision table in section 8 of the source spec —
implemented as written.

## 6. Idempotency & double-entry

- Every money-moving operation has an immutable idempotency key
  (`CRIX-<user_id>-<transaction_id>…`); the same key never moves money twice —
  a retry returns the existing transaction. No two ledger transactions from one
  key; no second blockchain submission unless reconciliation proves the first
  never occurred.
- The append-only double-entry ledger never overwrites balances; corrections
  are compensating entries. Customer balance fields: available / reserved /
  pending / settled (+ rail-specific where applicable). No spendable credit
  before settlement.

## 7. Wallets, keys, custody — the security decision

- Every wallet belongs to an authenticated user_id (never email alone); wallet
  ownership is checked server-side before send/withdraw/deposit/conversion/bill.
- **Base**: production smart-account architecture via Coinbase CDP — key
  material lives only in Coinbase's managed infrastructure. The app stores
  public addresses only.
- **Solana (future)**: provider-managed or KMS/HSM-backed signing only.
- **REJECTED — the single-secret AES-256-GCM key store** (cryptoWalletSecurity.js
  pattern): per the architecture spec §15, app-decryptable AES-GCM with one
  environment key means the application can decrypt every customer's key —
  that is custodial risk, not security, and is strictly worse than the
  provider-managed custody already in place. It will not be implemented. No raw,
  localStorage, plaintext or single-layer encrypted private keys anywhere.

## 8. Emergency pause & audit

- `CrixEmergencyPause` registry: PAUSE_ALL / BASE / SOLANA / DEPOSITS /
  WITHDRAWALS / TRANSFERS / CONVERSIONS / BILLS. Checked BEFORE money movement;
  the frontend can never disable a pause; every change is audited (actor,
  reason, timestamp). Current enforced state is seeded truthfully (on-chain
  transfers paused, deposits active, internal ledger active).
- `CrixAuditEvent`: append-only audit trail for every sensitive operation
  (state changes, rail selection, pause changes, reconciliation findings) —
  no secrets ever in logs.

## 9. External engine boundary (this stage)

BASE44 = customer application + authoritative financial backend.
EXTERNAL ENGINE = read-only diagnostics / chain reads / health checks only.
The engine has no private keys, no signing, no balance authority, no ledger
authority, no money movement, no pause override — and no database access, so it
cannot even see the authoritative records. Endpoints and secrets are listed in
src/workers/SETUP.md and audited in src/workers/crxs-engine.js.

## 10. Current honest state & implementation order

Current state: CRXS verified on Base Sepolia only. Base Mainnet deployment has
NOT happened (no receipt exists — verified on-chain: the deployer wallet is an
EOA with no contract code). Base44 function deploys are blocked by the platform
bundler outage (the webhook duplicate-guard fix and dual-rail server functions
land the moment it recovers). The external engine is read-only.

1. Fix Base44 production function deployment (platform issue)
2. Owner funds deployer wallet (~0.01 ETH) + signs Base Mainnet deployment →
   verify receipt, contract, supply, symbol (deployment verify functions)
3. Base-only production settlement (gate list passes first)
4. Ledger / reconciliation / security testing (incl. mandatory UNKNOWN-recovery
   tests on both rails — submit, lose the response, reconcile, settle once,
   never double-send)
5. Solana CRIX representation + documented supply/backing model (§3)
6. Solana wallet + settlement adapter + reconciliation
7. Server-side dual-rail router + failure/failover test suite (spec §43 list)
8. Only then: SOLANA_FALLBACK_ENABLED=true for explicitly approved transaction
   types

## 11. Real-money activation gates

The §44 checklist is the gate list — Base Mainnet CRXS deployment verified,
receipt exists, contract verified, wallet ownership tested, ledger/idempotency/
reconciliation/emergency-pause tested, webhooks server-side-verified tested,
unknown-transaction recovery tested on both rails, Solana asset + supply model
documented, liquidity tested, risk controls tested, secrets reviewed, compliance
reviewed, monitoring + incident response prepared, and one real-money
controlled test completed. Nothing is activated before its gate passes, and no
capability is ever faked.