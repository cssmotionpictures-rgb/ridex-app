# FLW Webhook Shield — Setup (Render, free tier, ~5 minutes)

This is the **safe** external fallback: a forward-only shield that makes sure
no Flutterwave payment event is ever lost if the Base44 webhook intake is
unreachable. It **never credits money itself** — all settlement stays inside
the guarded Base44 engine (signature checks, duplicate-charge guard, idempotent
ledger, emergency pause, audit trail). It holds no private keys and no
blockchain credentials.

## Deploy steps

1. **Create a repo** containing just `flw-webhook-shield.js` (copy it from
   `src/workers/flw-webhook-shield.js` in this project), plus a minimal
   `package.json`:
   ```json
   { "name": "flw-webhook-shield", "version": "1.0.0", "main": "flw-webhook-shield.js" }
   ```
2. **Render.com → New → Web Service** → connect that repo.
   - Runtime: **Node**
   - Build command: (leave empty — zero dependencies)
   - Start command: `node flw-webhook-shield.js`
   - Instance: Free
3. **Environment variables** (Render dashboard → Environment):
   - `FLW_WEBHOOK_SECRET` — the same Flutterwave webhook secret hash already
     configured in this app (Flutterwave dashboard → Settings → Webhooks).
   - `TARGET_URL` — optional; defaults to
     `https://ridex-all-go.base44.app/functions/flutterwave-webhook`
4. Deploy, then verify: open `https://<your-render-url>/healthz` — you should
   see `ok: true` and the target URL.
5. **Flutterwave dashboard → Settings → Webhooks** → set the webhook URL to:
   `https://<your-render-url>/` (any POST path is accepted).

## How it behaves

| Event | What the shield does |
|---|---|
| Base44 reachable | Forwards the event unchanged, immediately. Nothing stored. |
| Base44 unreachable | Verifies the signature, queues the event, answers 503 so Flutterwave retries too |
| Recovery | Replays queued events oldest-first every 60s until Base44 confirms each one |

Duplicate deliveries are harmless: the Base44 webhook function refuses
double-credit through its own signature verification, duplicate-charge guard
and idempotent ledger.

## Verify it is working

```bash
curl https://<your-render-url>/healthz
```

Send a test event with a BAD signature — it must answer **401**:
```bash
curl -X POST https://<your-render-url>/ \
  -H "content-type: application/json" \
  -H "flutterwave-signature: INVALID_TEST" \
  -d '{"event":"charge.completed","data":{"id":999}}'
```
A 401 means the security shield is active. Only correctly signed events are
ever forwarded or queued.

## Honest limits (read before relying on it)

- **Free tier sleeps**: after ~15 minutes idle the instance sleeps; the next
  webhook wakes it (a few seconds' delay). Flutterwave's own retries plus the
  shield's queue mean events are delayed, never lost.
- **Queue persistence**: the queue file lives on the instance disk. It
  survives sleep/wake and restarts, but is wiped when you REDEPLOY the
  service — so only redeploy while the queue (see `/healthz`) is empty.
- **It does not unlock new features**: if the Base44 deployment pipeline is
  down, NEW engine code still cannot ship. The shield protects existing money
  flows from losing events — it never credits anything by itself.
- **Rollback anytime**: point the Flutterwave webhook URL back at
  `https://ridex-all-go.base44.app/functions/flutterwave-webhook` and the
  shield is out of the path.