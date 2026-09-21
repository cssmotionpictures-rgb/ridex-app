# CRIXCOIN Engine (READ-ONLY) — browser-only setup (no CLI, no terminal)

A safe diagnostic fallback so CRIXCOIN keeps working while Base44's backend
deploy pipeline is down — and switches back to Base44 automatically the moment
it recovers (the app always tries its own backend function first).

Full architecture reference: `src/workers/DUAL_RAIL_ARCHITECTURE.md`.

## What this engine can and cannot do

CAN (read-only, live evidence only):
- Provider health probes (Pimlico / CDP paymaster: chain id + entry points)
- Whitelisted read-only Base Sepolia / Base Mainnet chain queries
  (chain id, block number, balance, code, receipts, eth_call, gas estimate)
- Dual-rail diagnostics: `GET /health`, `GET /chain/base`, `GET /chain/solana`,
  `GET /crixcoin/deployment?address=0x…`,
  `GET /crixcoin/balance/{address}?contract=0x…`,
  `GET /crixcoin/transaction/{hash}`, `GET /solana/token/{address}?mint=…`

CANNOT — there is NO endpoint that can transfer or send CRXS, withdraw, pay
bills, bridge or convert, sign a transaction or UserOperation, submit to a
paymaster or bundler, touch private keys, or create a wallet. The Worker also
has NO access to the app database: the authoritative user_id → CRIXCOIN
address mapping lives only in Base44 (CrxsSmartAccount records, written only
by the platform server function), so the Worker can never create a second
wallet for an existing user. CRIXCOIN address creation is PLATFORM-ONLY.

CRXS transfers stay PAUSED, exactly as designed. The Mainnet deployment is a
separate, owner-signed browser action (CrixCoin → Mainnet Wallet) and is
completely independent of this engine — connecting the engine never triggers
or broadcasts any Mainnet transaction.

## 1. Deploy the Worker from the browser

1. Open https://workers.cloudflare.com/playground (no signup needed to test).
2. Delete the sample code and paste ALL of `src/workers/crxs-engine.js`.
3. Click **Deploy** (top right). Create/claim a Cloudflare account when
   prompted — claiming makes the Worker permanent instead of session-owned.
4. Copy your Worker URL, e.g. `https://crixcoin-api.your-name.workers.dev`.
5. Quick test: open `<your-worker-url>/openapi.json` in a tab — you should
   see the spec JSON.

## 2. Set the secret in the Cloudflare dashboard

Dashboard → Workers & Pages → your Worker → Settings → Variables and
Secrets → Add (type: **Secret**, encrypted):

| Variable | Value | Needed for |
|----------|-------|------------|
| `BACKEND_API_SECRET` | any long random string you generate | REQUIRED — authenticates the Base44 integration |
| `PIMLICO_API_KEY` | your Pimlico key | optional — enables the Pimlico health probe |
| `CDP_PAYMASTER_URL` | your CDP paymaster URL | optional — enables the CDP paymaster probe |
| `SOLANA_RPC_URL` | your Solana RPC endpoint | optional — read-only Solana queries (defaults to the public mainnet RPC) |

**No CDP credential (key id / key secret / wallet secret) is required or
read by this Worker.** Click **Deploy** to apply. Missing optional secrets
simply report NOT_CONFIGURED honestly — nothing breaks.

## 3. Register the integration in Base44

1. Base44 → your workspace name (bottom left) → **Settings → Integrations**.
2. **New Integration → From URL** → paste:
   `https://<your-worker-url>/openapi.json`
3. Continue → select the endpoints (`/aa-health`, `/chain-read`).
4. Configure:
   - **Slug:** `crxs-engine`  ← must be exactly this
   - **Name / description:** anything you like
   - **Custom header:** `Authorization` = `Bearer <your BACKEND_API_SECRET>`
     (stored encrypted by Base44, never sent to the browser)
5. Create Integration. Requires workspace owner/admin on a Builder+ plan.

## 4. Safe test checklist (read-only only)

Once connected, test with exactly these — nothing else exists to test:
- **Health check:** POST `/aa-health` via the app's provider panel.
- **Chain ID:** `/chain-read` `{ "chain": "mainnet", "method": "eth_chainId" }` → `0x2105` (8453).
- **Contract existence/code:** `/chain-read` `{ "chain": "mainnet", "method": "eth_getCode", "params": ["0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1", "latest"] }`.
- **CRXS balance read:** `/chain-read` with `eth_call` of `balanceOf(address)` against the verified contract (once a Mainnet contract exists; before that the honest answer is "no contract").
- **Authenticated address lookup:** the app reads your own CRIXCOIN address record — this is served by the Base44 app itself (your data, your row), not by the Worker.
- **Duplicate address-creation request:** sending the creation request twice resolves through the same platform path and refuses duplicates honestly — the read-only engine has no creation endpoint, so a duplicate can never create a second wallet.

## Once Base44 recovers

Nothing to do. The fallback stops being used automatically, because the
platform function is always tried first.