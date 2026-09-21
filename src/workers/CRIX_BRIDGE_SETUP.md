# CRIXCOIN DEPLOYMENT-OUTAGE BRIDGE — SETUP

A temporary fail-closed bridge so CRIXCOIN keeps moving while the Base44
function deployment pipeline is down. **It never credits, never holds keys,
never writes the ledger — Base44 stays the single financial authority.**

Worker code: `src/workers/crix-bridge.js`

---

## 1 · Deploy the Worker (no CLI, ~5 minutes)

1. Open https://workers.cloudflare.com/playground
2. Paste the entire content of `src/workers/crix-bridge.js`
3. Click **Deploy**, then **claim** the Worker (give it a name like `crix-bridge`)

## 2 · Create the durable queue (KV)

1. Cloudflare dashboard → **Storage & Databases → KV → Create namespace**
   (name it e.g. `crix-bridge-queue`)
2. Worker → **Settings → Bindings → Add → KV namespace**
   - Variable name: `BRIDGE_QUEUE`  ← must match exactly
   - Namespace: the one you just created

## 3 · Set the secrets (Worker → Settings → Variables and Secrets)

| Name | Value | Required |
|---|---|---|
| `BACKEND_API_SECRET` | any long random string — you'll reuse it in step 5 | YES |
| `FLW_WEBHOOK_SECRET` | the same Flutterwave secret hash set in Base44 secrets | YES (for webhook endpoint) |
| `FLW_SECRET_KEY` | the same Flutterwave API key set in Base44 secrets | YES (for provider re-verification) |
| `BASE44_WEBHOOK_URL` | leave unset — defaults to `https://ridex-all-go.base44.app/functions/flutterwave-webhook` | optional |
| `CRXS_DEPOSIT_TARGET_URL` | leave unset for now — set it later to the Base44 CRXS-deposit intake function once it deploys | optional |
| `BRIDGE_KEY` | optional extra key for `GET /health` | optional |

## 4 · Add the cron trigger (automatic queue replay)

Worker → **Settings → Trigger Events → Cron Triggers → Add**
Cron expression: `* * * * *` (every minute). The replay uses exponential
backoff (1, 2, 4, 8, 16, 32 min…), stops hammering, and moves events to
DEAD_LETTER after 10 failed attempts — never silently deleting anything.

## 5 · Register the bridge in Base44

Settings → Integrations → New Integration → **From URL**:
- URL: `https://<your-worker>.<your-subdomain>.workers.dev/openapi.json`
- Slug: `crix-bridge`  ← must match exactly (the app's fallback uses it)
- Header: `Authorization: Bearer <the BACKEND_API_SECRET you chose>`

This keeps the shared secret server-side — the browser never sees it.

## 6 · What now works in the app (automatically)

- **CRIXCOIN address creation** — when the platform function can't deploy,
  `CrixCoinAddressCard` falls back to the bridge: the Worker recovers the
  personal_sign signature server-side, re-derives the address from the
  official Base factory across 3 independent endpoints, and the app records
  the user's own verified row. The moment the platform function deploys, the
  fallback stops being used — automatically.

## 7 · Flutterwave webhook (only if platform intake fails)

Keep Flutterwave pointed at
`https://ridex-all-go.base44.app/functions/flutterwave-webhook` **while it
works** — that function re-verifies every event itself. If the platform
intake ever goes down, switch the webhook URL in the Flutterwave dashboard to
`https://<your-worker>.<your-subdomain>.workers.dev/payments/flutterwave/webhook`.
The bridge verifies the signature, re-verifies the transaction against
Flutterwave's API, forwards unchanged to Base44, and durably queues with
backoff if Base44 is unreachable.

## 8 · Verification-only tools (curl with the Bearer secret)

```
# bridge + dependency + queue status (no secrets in the answer)
curl https://<worker>/health

# queue detail
curl -H "Authorization: Bearer <secret>" https://<worker>/queue/status

# live provider check of one Flutterwave transaction
curl -X POST -H "Authorization: Bearer <secret>" \
  -d '{"transaction_id":"123456"}' https://<worker>/payments/flutterwave/reconcile

# verify any CRXS transfer on Base Mainnet (13-point chain check)
curl -H "Authorization: Bearer <secret>" \
  https://<worker>/base/crxs/transaction/0x<hash>
```

## 9 · When the Base44 deploy pipeline recovers

1. Deploy the native functions (`crix-wallet`, `crix-address-register`, the
   CRXS deposit intake).
2. Set `CRXS_DEPOSIT_TARGET_URL` to the deposit intake function URL.
3. Run the ₦100 lifecycle + the duplicate/fake/outage tests.
4. `POST /queue/replay {"force":true}` — drain the queue; Base44's own
   idempotency refuses any double-credit.
5. Verify reconciliation (`/queue/status` empty of pending).
6. Keep the bridge read-only endpoints if useful; remove write paths.