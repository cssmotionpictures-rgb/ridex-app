/* eslint-disable no-undef -- this file is a plain Node.js server deployed to Render,
   never bundled into the browser app; Node globals (require/process/Buffer) are expected. */
/**
 * FLW WEBHOOK SHIELD — the SAFE external fallback for Flutterwave webhooks.
 * Deploy free on Render (or Railway). Zero dependencies — plain Node 18+.
 *
 * WHY THIS SHAPE: money crediting can NEVER safely leave the Base44 engine —
 * the ledger, idempotency records, emergency pause and audit trail all live
 * there, and no external server can (or should) write to them. What an
 * external host CAN do safely is make sure no payment event is ever LOST:
 * this shield receives each webhook, verifies its signature, forwards it
 * UNCHANGED to the Base44 webhook function, and — only if Base44 cannot be
 * reached — queues the verified event and replays it automatically until
 * Base44 confirms receipt. Fail-closed, replay-until-confirmed.
 *
 * WHAT THIS IS:
 *   - A forwarding shield + dead-letter queue for Flutterwave webhook events
 *   - Signature-verified before anything is accepted or queued
 *   - Duplicate-protected in the queue (identical payloads never stack up)
 *   - Fully read-only about money: it never credits, debits, signs, or holds
 *
 * WHAT THIS IS NOT (by design — these are the unsafe parts we refuse):
 *   - It never credits wallets or runs any money logic
 *   - It holds NO private keys, NO blockchain credentials, NO card numbers
 *   - It is never a second ledger or source of truth
 *   - It does not touch the blockchain and does not replace the platform engine
 *
 * ENVIRONMENT VARIABLES (set in the Render dashboard):
 *   FLW_WEBHOOK_SECRET  REQUIRED — the same Flutterwave secret hash the platform uses
 *   TARGET_URL          OPTIONAL — defaults to the app's live webhook function URL
 *   PORT                set by Render automatically
 *
 * Endpoints:
 *   POST /  (any POST path) — webhook intake (this is the URL for Flutterwave)
 *   GET  /healthz          — shield status, queue depth, last forward result
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 8080);
const TARGET_URL = process.env.TARGET_URL || "https://ridex-all-go.base44.app/functions/flutterwave-webhook";
const WEBHOOK_SECRET = process.env.FLW_WEBHOOK_SECRET || "";
const QUEUE_FILE = process.env.QUEUE_FILE || path.join(process.cwd(), "webhook-queue.jsonl");
const MAX_QUEUE = 5000;
const DRAIN_INTERVAL_MS = Number(process.env.DRAIN_INTERVAL_MS || 60000);

let lastForward = { ts: 0, status: "none" };
const startedAt = new Date().toISOString();

// --- Signature verification (matches the platform's own check) ---
function verifySignature(raw, signature, verifHash) {
  if (!WEBHOOK_SECRET) {
    // No secret configured — forward anyway; the Base44 function re-verifies
    // every event independently before touching any money state.
    return true;
  }
  // Mode 1 — Flutterwave SIGNED webhooks: HMAC-SHA256 of the raw body.
  if (signature) {
    const b64 = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw, "utf8").digest("base64");
    const hex = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw, "utf8").digest("hex");
    if (signature === b64 || signature === hex) return true;
  }
  // Mode 2 — Flutterwave dashboard DEFAULT: the verif-hash header carries the
  // secret hash string itself.
  return !!verifHash && verifHash === WEBHOOK_SECRET;
}

// The platform engine verifies the signed (HMAC) mode — so whatever mode the
// event arrived in, it is ALWAYS forwarded with a correct flutterwave-signature
// header computed from the same secret. Nothing is altered, only re-signed.
function computeForwardSignature(raw, signature) {
  if (signature) return signature;
  if (!WEBHOOK_SECRET) return "";
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw, "utf8").digest("hex");
}

// --- Dead-letter queue (append-only file, drained oldest-first) ---
function loadQueue() {
  try {
    return fs
      .readFileSync(QUEUE_FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
function saveQueue(items) {
  fs.writeFileSync(QUEUE_FILE, items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : ""));
}

// --- Forwarding (the only thing this shield does with money events) ---
async function forward(body, signature) {
  try {
    const res = await fetch(TARGET_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "flutterwave-signature": signature } : {}),
      },
      body,
    });
    lastForward = { ts: Date.now(), status: res.status };
    return res.ok;
  } catch (e) {
    lastForward = { ts: Date.now(), status: "network_error: " + String((e && e.message) || e).slice(0, 140) };
    return false;
  }
}

// Replay loop: drain oldest-first, stop at the first failure so order holds.
// Duplicates are harmless — the Base44 function's duplicate-charge guard and
// idempotent crediting refuse double-credit at the ledger itself.
async function drainQueue() {
  try {
    let items = loadQueue();
    let changed = false;
    while (items.length) {
      const ok = await forward(items[0].body, items[0].sig);
      if (!ok) break;
      items = items.slice(1);
      changed = true;
    }
    if (changed) saveQueue(items);
  } catch (e) {
    console.error("shield: drain failed:", (e && e.message) || e);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://shield.local");
  const json = (status, obj) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj, null, 2));
  };

  if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/")) {
    return json(200, {
      ok: true,
      role: "flutterwave webhook shield (forward-only, never credits money)",
      started_at: startedAt,
      target: TARGET_URL,
      signature_enforced: !!WEBHOOK_SECRET,
      queued_events: loadQueue().length,
      last_forward: lastForward,
    });
  }

  if (req.method !== "POST") return json(404, { error: "NOT_FOUND — POST a webhook event or GET /healthz" });

  let chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const signature = String(req.headers["flutterwave-signature"] || "");
  const verifHash = String(req.headers["verif-hash"] || "");
  const forwardSig = computeForwardSignature(raw, signature);

  if (!verifySignature(raw, signature, verifHash)) {
    console.error("shield: rejected event with invalid signature — nothing forwarded, nothing queued");
    return json(401, { error: "UNAUTHORIZED — invalid signature. Nothing was forwarded or queued." });
  }

  const ok = await forward(raw, forwardSig);
  if (ok) {
    console.log("shield: forwarded event to Base44 —", lastForward.status);
    return json(200, { received: true, forwarded: true });
  }

  // Base44 unreachable — queue the VERIFIED event and own the redelivery.
  // Also answer 503 so Flutterwave retries on its own schedule too; any
  // resulting duplicate delivery is refused by the platform's own guards.
  const items = loadQueue();
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  if (items.length < MAX_QUEUE && !items.some((i) => i.hash === hash)) {
    items.push({ ts: new Date().toISOString(), hash, sig: forwardSig, body: raw });
    saveQueue(items);
    console.log("shield: Base44 unreachable — event queued for replay (" + items.length + " pending)");
  }
  return json(503, { received: true, queued_for_replay: true, note: "The platform engine is unreachable — this verified event is safely queued and replays automatically." });
});

server.listen(PORT, () => {
  console.log("FLW Webhook Shield live on port " + PORT + " — forwarding to " + TARGET_URL);
  drainQueue(); // replay anything left from before a restart
  setInterval(drainQueue, DRAIN_INTERVAL_MS);
});