# CRIXCOIN Engine — browser-only setup (no CLI, no terminal)

A safe fallback so CRIXCOIN keeps working while Base44's backend deploy
pipeline is down — and switches back to Base44 automatically the moment it
recovers (the app always tries its own backend function first).

## 1. Deploy the Worker from the browser

1. Open https://workers.cloudflare.com/playground (no signup needed to test).
2. Delete the sample code and paste ALL of `workers/crxs-engine.js`.
3. Click **Deploy** (top right). Create/claim a Cloudflare account when
   prompted — claiming makes the Worker permanent instead of session-owned.
4. Copy your Worker URL, e.g. `https://crixcoin-api.your-name.workers.dev`.
5. Quick test: open `<your-worker-url>/openapi.json` in a tab — you should
   see the spec JSON.

## 2. Set the secrets in the Cloudflare dashboard

Dashboard → Workers & Pages → your Worker → Settings → Variables and
Secrets → Add (type: **Secret**, encrypted):

| Variable | Value | Needed for |
|----------|-------|------------|
| `BACKEND_API_SECRET` | any long random string you generate | REQUIRED — authenticates the Base44 integration |
| `PIMLICO_API_KEY` | your Pimlico key | optional — enables the Pimlico health probe |
| `CDP_PAYMASTER_URL` | your CDP paymaster URL | optional — enables the CDP paymaster probe |
| `CDP_API_KEY_ID` | your CDP key id | required for CRIXCOIN address creation |
| `CDP_API_SECRET` | your CDP key secret | required for CRIXCOIN address creation |
| `CDP_WALLET_SECRET` | your CDP wallet secret (Portal → API keys) | required for CRIXCOIN address creation |

Click **Deploy** to apply. Missing optional secrets simply report
NOT_CONFIGURED honestly — nothing breaks.

## 3. Register the integration in Base44

1. Base44 → your workspace name (bottom left) → **Settings → Integrations**.
2. **New Integration → From URL** → paste:
   `https://<your-worker-url>/openapi.json`
3. Continue → select the endpoints (`/aa-health`, `/chain-read`,
   `/smart-account`).
4. Configure:
   - **Slug:** `crxs-engine`  ← must be exactly this
   - **Name / description:** anything you like
   - **Custom header:** `Authorization` = `Bearer <your BACKEND_API_SECRET>`
     (stored encrypted by Base44, never sent to the browser)
5. Create Integration. Requires workspace owner/admin on a Builder+ plan.

That's it — the app is already wired. The CRIXCOIN page's Mainnet Wallet tab
now shows a **My CRIXCOIN Address** card that works through this engine.

## How the safety model is kept

- **Platform first, always.** Every engine call tries the Base44 backend
  function first and only falls back to this Worker while that function is
  not deployed. When Base44's deploy issue is fixed, everything automatically
  runs on-platform again — no code change, no switch to flip.
- **No fund movement, ever.** The Worker deliberately has NO transfer, bill
  payment, bridge or settlement endpoint. External on-chain transfers stay
  PAUSED on the platform side exactly as designed.
- **Idempotent addresses.** CRIXCOIN address creation resolves the same
  permanent address for the same user every time; key material never leaves
  Coinbase's infrastructure.
- **Read-only chain access.** Only whitelisted query methods are forwarded;
  anything that can mutate chain state is refused.
- **Evidence everywhere.** Every response carries an evidence array built
  only from real live provider responses.

## Once Base44 recovers

Nothing to do. The fallback stops being used automatically, because the
platform function is always tried first.