# BASE MAINNET LAUNCH MANIFEST — CRIXCOIN ($CRXS)

Single source of truth for the CRIXCOIN Base Mainnet production launch.
Every status below is the REAL, current state — nothing here is aspirational.
This manifest deliberately replaces the AI-suggested version that advised a
third-party bonding-curve factory, an app-held AES-256-GCM key file, a
hardcoded NAIRA_TO_CRIX rate, and "immediate real money". All four are
REJECTED — reasons recorded under "Explicit rejections".

---

## Current honest status (2026-09-13)

| Item | Real state |
| :--- | :--- |
| Production CRXS contract on Base Mainnet | **NOT_DEPLOYED** — no owner-signed deployment receipt exists |
| Base Sepolia testnet CRXS | DEPLOYED + server-verified (test architecture only) |
| CDP paymaster endpoint | **LIVE** — chain 8453 answered; EntryPoints v0.6 (`0x5FF1…789`) + v0.7 (`0x0000…032`) |
| CDP paymaster sponsorship | **NOT PROVEN** — live stub probe returned 405 "request denied"; the CDP portal billing/payment method is not configured |
| Gas treasury | **CRITICAL (0 ETH)** — sponsored transfers must halt until funded |
| External transfer gate | **PAUSED** — opens only on real on-chain evidence |
| Emergency pause registry | Active: transfers/base/solana/withdrawals/conversions/bills PAUSED (honest) |
| Real-money movement | **DISABLED BY THE GATES ABOVE** — not a configuration choice, a fact of the unmet conditions |

---

## The ONLY approved deployment path (spec §2)

The production CRXS contract is deployed by the owner wallet
(`0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1`) signing a deployment of the
**exact verified creation bytecode** (`src/lib/crxsDeployBytecode.js` —
solc 0.8.37, optimizer 200, OpenZeppelin 5.1.0; byte-identical to the
verified Base Sepolia artifact).

**No third-party token factory (Clanker or any bonding-curve platform) may
ever create the production CRXS contract.** A factory-generated token is a
DIFFERENT contract: different bytecode, different admin/mint semantics,
different fees. Deploying it would violate the project's own §2 rule
("DO NOT deploy a different CRXS contract accidentally") and destroy the
bytecode-integrity chain (`bytecode_sha256`) that every deployment record,
verification record and audit event is built on.

Before production activation, the server-side verifier must independently
confirm: contract address, bytecode, constructor supply, decimals, symbol,
totalSupply (500,000,000,000 CRXS), ownership/admin, mint permissions, pause
permissions, transfer behavior, deployment transaction + receipt, and source
verification on basescan.org.

---

## Production configuration matrix (real values)

| Layer | Component | Setting |
| :--- | :--- | :--- |
| Blockchain | Network | Base Mainnet, chain ID 8453 |
| Token | Contract | Owner-signed verified bytecode (see above) — address recorded ONLY after a real receipt |
| Sponsorship | Gas infra | Coinbase CDP paymaster (ERC-7677) — needs a funded billing profile before sponsorship is real |
| Fallback bundler/paymaster | Pimlico | Verified live on Base Mainnet (read-only probes pass) |
| Fiat rail | Deposits | Flutterwave live NGN — webhook below |
| Pricing | CRXS per NGN | **Live quotes only** (pool quote + real FX). A hardcoded rate is never used |

Server-side secrets (already stored in app secrets — never in .env files in
the repo, never in frontend code): `CDP_API_KEY_ID`, `CDP_API_SECRET`,
`CDP_PROJECT_ID`, `CDP_PAYMASTER_URL`, `PIMLICO_API_KEY`, `ALCHEMY_API_KEY`,
`FLW_SECRET_KEY`, `FLW_WEBHOOK_SECRET`.

---

## Flutterwave production webhook (exact, corrected setup)

1. Flutterwave Dashboard → Settings → Webhooks.
2. URL: `https://ridex-all-go.base44.app/functions/flutterwave-webhook`
   (the published app domain — NOT a custom domain guess, NOT localhost).
3. Secret hash: the same value as the app's `FLW_WEBHOOK_SECRET` secret
   (stored server-side in Base44 → Settings → Secrets; never paste it into
   any file in the project).
4. Events: **Transactions** — `charge.completed`.
5. Already enforced server-side, regardless of dashboard settings:
   signature verification (invalid signatures → 401), duplicate-webhook guard
   (a redelivered charge never double-credits), and authoritative
   re-verification of every charge against the Flutterwave API before any
   balance changes.

---

## Explicit rejections (recorded so they are never re-introduced)

1. **Third-party token factory (Clanker/bonding curve)** — deploys a different
   contract; violates §2 and the bytecode-integrity chain. "Zero upfront
   cost" is not a reason to destroy the verified-deployment guarantee.
2. **App-held AES-256-GCM key file (`cryptoWalletSecurity.js` /
   `DATABASE_ENCRYPTION_KEY`)** — a single application secret that can decrypt
   every customer's key is ordinary custody risk with extra steps, forbidden
   by spec §15. Key material stays in Coinbase's managed infrastructure
   (CDP); the app stores public addresses only.
3. **`NAIRA_TO_CRIX_RATE=1.0` hardcoded** — CRXS pricing comes only from live
   pool quotes + real FX (the bill-payment flow's `price_evidence_json`).
4. **"Real money immediately"** — real-money movement activates only when the
   §44 gates below are ALL true. No promise of "100%" anything, ever.
5. **Fake diagnostics** — a script that prints "CONNECTION HANDSHAKE:
   SUCCESSFUL" without making a real API call is a false green light. Real
   probes answered: endpoint live, sponsorship REFUSED (405) until billing is
   configured in the CDP portal.

---

## Activation gates before real public money (spec §44, current status)

- [ ] Base Mainnet CRXS deployment verified (owner-signed, real receipt)
- [ ] CRXS contract source verified on basescan.org
- [ ] CDP portal billing/payment method configured — live sponsored op confirms
- [ ] Gas treasury funded above CRITICAL (currently 0 ETH)
- [ ] Emergency-pause gate deployed + block/restore test passed (code written;
      platform deploy pipeline currently in an outage — pending)
- [ ] Duplicate-send / duplicate-webhook / unknown-recovery tests passed
- [ ] Wallet ownership + cross-user access tests passed
- [ ] KYC/AML, monitoring and incident-response reviewed
- [ ] Real-money controlled test (₦) completed end to end

## Phase order (spec §46 — unchanged)

1. Fix the Base44 function deployment pipeline (platform outage — in progress
   with Base44 support). 2. Owner-signed Base Mainnet CRXS deployment.
   3. Base-only settlement activation. 4. Ledger/reconciliation/security
   testing. 5–7. Solana representation, wallet adapter, reconciliation.
   8–9. Dual-rail router + failure tests. 10. `SOLANA_FALLBACK_ENABLED` only
   after every gate passes.