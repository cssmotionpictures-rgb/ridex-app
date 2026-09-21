# CRIXCOIN Account Engine — browser-only setup (no CLI, no terminal)

Unblocks the one operation the Base44 deploy pipeline cannot build right now:
**creating each user's permanent CRIXCOIN address** (Coinbase CDP EOA +
ERC-4337 smart account on Base Mainnet), plus **Alchemy-backed chain reads**
and AA provider health probes.

The app ALWAYS tries its own backend function first — the Worker is only the
fallback, and it stops being used automatically the moment the platform
function deploys. Nothing to switch back later.

## What it does (and cannot do)

- `POST /cdp/account` — get-or-create the user's CDP EOA + smart account,
  **idempotent**: the account name is derived deterministically from the user
  id, so a retry resolves the SAME accounts and can never create a second
  wallet. No funds move. The app itself writes the user's own record
  (security rules enforce ownership).
- `POST /cdp/account-status` — read-only "does my account exist yet" lookup.
- `POST /alchemy/read` — whitelisted READ-ONLY Base Mainnet queries through
  your Alchemy endpoint (public RPC fallback).
- `POST /aa-health` — live probes: Alchemy Account Kit bundler + gas policy,
  Pimlico, CDP paymaster.

**Cannot** — there is no endpoint that can transfer CRXS, sign a
transaction/UserOperation, submit to a bundler or paymaster, touch private
keys, or read the app database. The transfer gate stays PAUSED on the platform.

## 1. Deploy the Worker from the browser

1. Open https://workers.cloudflare.com/playground.
2. Delete the sample code and paste ALL of `src/workers/crxs-account-engine.js`.
3. Click **Deploy**, create/claim your Cloudflare account when prompted.
4. Copy the Worker URL, e.g. `https://crxs-account-api.your-name.workers.dev`.
5. Quick test: open `<your-worker-url>/openapi.json` — you should see the spec.

## 2. Set the secrets (Cloudflare dashboard → your Worker → Settings →
Variables and Secrets → Add, type: **Secret**)

| Variable | Value | Needed for |
|----------|-------|------------|
| `BACKEND_API_SECRET` | any long random string (can be the same one as the read-only engine) | REQUIRED — authenticates the Base44 integration |
| `CDP_API_KEY_ID` | your CDP API key id | REQUIRED for CDP endpoints |
| `CDP_API_SECRET` | your CDP API key secret (PEM `BEGIN PRIVATE KEY` / `BEGIN EC PRIVATE KEY` or base64 DER — all accepted) | REQUIRED for CDP endpoints |
| `CDP_WALLET_SECRET` | the Wallet Secret created in the CDP Portal (API keys page) | REQUIRED only for FIRST-TIME creation — existing accounts are readable without it |
| `ALCHEMY_API_KEY` | your Alchemy Base Mainnet app key | optional — fast, reliable chain reads |
| `ALCHEMY_ACCOUNTS_API_KEY` | your Alchemy Account Kit key | optional — bundler health probe |
| `ALCHEMY_GAS_POLICY_ID` | your Gas Manager policy id (Base Mainnet) | optional — recorded in health evidence |
| `PIMLICO_API_KEY` | your Pimlico key | optional |
| `CDP_PAYMASTER_URL` | your CDP paymaster URL | optional |

Note: your Base44 workspace secrets already hold `CDP_API_KEY_ID`,
`CDP_API_SECRET` and `ALCHEMY_API_KEY` — copy the same values here.
`CDP_WALLET_SECRET` is the one the health check flagged as missing: create it
in the CDP Portal next to your API key, add it to BOTH Base44 (Settings →
Secrets) and this Worker.

## 3. Register the integration in Base44

1. Base44 → your workspace name (bottom left) → **Settings → Integrations**.
2. **New Integration → From URL** → paste
   `https://<your-worker-url>/openapi.json`
3. Select the endpoints (`/cdp/account`, `/cdp/account-status`,
   `/alchemy/read`, `/aa-health`).
4. Configure:
   - **Slug:** `crxs-account-engine`  ← must be exactly this
   - **Custom header:** `Authorization` = `Bearer <your BACKEND_API_SECRET>`
     (stored encrypted by Base44, never sent to the browser)
5. Create Integration. Requires workspace owner/admin on a Builder+ plan.

## 4. Safe test checklist

- **Health:** in the admin provider panel, run the AA health check — Alchemy
  should appear once its keys are set.
- **Address creation:** as a signed-in user, open the CRIXCOIN address card and
  tap *Get my CRIXCOIN address*. You should get a real `0x…` address recorded
  with evidence (name lookups + creation responses from Coinbase).
- **Idempotency:** tap it twice — the SAME address comes back, no second wallet.
- **Alchemy read:** `POST /alchemy/read`
  `{"method":"eth_chainId"}` → `0x2105` (8453).

## Once Base44 recovers

Nothing to do. The platform function is always tried first; the fallback
stops being used on its own.