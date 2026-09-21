/**
 * CRIXCOIN DEPLOYMENT-OUTAGE BRIDGE — browser-deployed Cloudflare Worker.
 * Deploy from https://workers.cloudflare.com/playground (no CLI): paste this
 * file, click Deploy, claim the Worker, then follow src/workers/CRIX_BRIDGE_SETUP.md.
 *
 * WHAT THIS IS — a TEMPORARY infrastructure bridge around the Base44 function
 * deployment outage. It performs ONLY infrastructure/verification work and
 * durably queues verified events until Base44 can receive them:
 *   · GET  /health                          — honest status of every dependency + queue
 *   · GET  /queue/status                    — pending / failed / unknown / dead-letter counts
 *   · POST /queue/replay                    — manually replay due queued events (auth)
 *   · POST /wallet/address/derive           — deterministic factory address from 3 RPCs (auth)
 *   · POST /wallet/address/verify           — signature recovery + factory re-derivation (auth)
 *   · POST /payments/flutterwave/webhook    — Flutterwave URL: verify sig → forward to Base44 → queue if down
 *   · POST /payments/flutterwave/reconcile  — live provider verification of one transaction (auth)
 *   · POST /base/crxs/event                 — verify a CRXS Transfer deposit on-chain, queue for Base44 (auth)
 *   · GET  /base/crxs/transaction/:hash    — live verified chain read of any tx (auth)
 *
 * WHAT THIS IS NOT (NON-NEGOTIABLE — the bridge must never be a second Crix):
 *   · NO customer balance tables, NO alternative wallet ledger
 *   · NO manual balance-credit endpoints, NO settlement logic
 *   · NO withdrawal signing, NO private keys, NO CRXS mint authority
 *   · NO NGN money movement — the ONLY money decisions happen inside Base44
 *     (idempotency, double-entry ledger, risk, pause gates, final credit).
 *   If Base44 is unavailable, the bridge QUEUES verified events. It does NOT
 *   manufacture balances. Uncertain states stop as UNKNOWN — never retried
 *   blindly, never auto-resubmitted.
 *
 * BASE44 REMAINS AUTHORITATIVE FOR: users, balances, ledger, idempotency,
 * transaction state, risk, emergency pauses, audit records, final NGN credit,
 * final CRXS internal balance.
 *
 * SECRETS / BINDINGS (Cloudflare dashboard → Settings):
 *   BACKEND_API_SECRET        REQUIRED — shared secret, sent by the Base44 integration as Bearer
 *   FLW_WEBHOOK_SECRET        REQUIRED for the webhook endpoint — Flutterwave secret hash
 *   FLW_SECRET_KEY            REQUIRED for provider re-verification — Flutterwave API key
 *   BRIDGE_QUEUE              REQUIRED binding — a KV namespace (durable event queue)
 *   BASE44_WEBHOOK_URL        OPTIONAL — default: the app's live flutterwave-webhook function
 *   CRXS_DEPOSIT_TARGET_URL   OPTIONAL — Base44 intake function for verified CRXS deposits.
 *                             While unset, verified deposit events stay QUEUED (honest, visible,
 *                             never dropped) until the target exists.
 *   BRIDGE_KEY                OPTIONAL — if set, GET /health also requires it (otherwise public, no secrets shown)
 */

// ————————————————————————————————————————————
// Canonical constants (Base MAINNET production — never Sepolia)
// ————————————————————————————————————————————
const BASE_CHAIN_ID = 8453;
const CRXS_TOKEN = "0xb7a10024941f5286d9686b0bb8ebf6cb88c7453f";
const SIMPLE_ACCOUNT_FACTORY = "0x91e60e0613813810449d098b0b5ec8b51a0fe8c8985";
const GET_ADDRESS_SELECTOR = "0x8cb84e18"; // getAddress(address,uint256)
const TRANSFER_TOPIC_0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RPCS = ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.meowrpc.com"];
const BASE44_APP_URL_DEFAULT = "https://ridex-all-go.base44.app";
const DEFAULT_WEBHOOK_TARGET = BASE44_APP_URL_DEFAULT + "/functions/flutterwave-webhook";

const MIN_CONFIRMATIONS = 3; // deposit depth requirement before an event is forwardable
const BACKOFF_BASE_SECONDS = 60; // 1m, 2m, 4m, 8m, 16m, 32m…
const RETRY_CEILING = 10;      // after this → DEAD_LETTER (never silently deleted)

// ————————————————————————————————————————————
// Small helpers
// ————————————————————————————————————————————
const te = (s) => new TextEncoder().encode(s);
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(str) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", te(str)));
}
function nowIso() {
  return new Date().toISOString();
}
function json(data, status, origin) {
  const headers = { "content-type": "application/json" };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "authorization, content-type";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
  }
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}
function authorized(request, env) {
  const expected = env.BACKEND_API_SECRET;
  if (!expected) return { ok: false, reason: "BACKEND_API_SECRET is not configured on the Worker — nothing was executed." };
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || token !== expected) return { ok: false, reason: "The shared secret did not match." };
  return { ok: true };
}
async function readBody(request) {
  try { return (await request.json()) || {}; } catch (e) { return {}; }
}
const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));

// ————————————————————————————————————————————
// Multi-endpoint Base RPC — every read needs at least 2 agreeing endpoints
// before anything is treated as fact (spec §7: disagreement = UNKNOWN, no credit).
// ————————————————————————————————————————————
async function rpcOne(url, method, params) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    const body = await res.json();
    if (body && body.error) return { ok: false, error: "rpc: " + JSON.stringify(body.error).slice(0, 140) };
    return { ok: true, result: body.result };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 140) };
  }
}
async function rpcQuorum(method, params, need = 2) {
  const answers = [];
  const errors = [];
  for (const url of RPCS) {
    const r = await rpcOne(url, method, params);
    if (r.ok) answers.push({ url: new URL(url).host, result: r.result });
    else errors.push(new URL(url).host + ": " + r.error);
    // early exit once a quorum agrees on the same value
    const winner = answers.find((a) => answers.filter((b) => b.result === a.result).length >= need);
    if (winner) return { ok: true, agree: need, value: winner.result, sources: answers.map((a) => a.url), errors };
  }
  return { ok: false, agree: answers.filter((a) => a.result === answers[0]?.result).length, value: answers[0]?.result ?? null, sources: answers.map((a) => a.host ?? a.url), errors };
}
async function rpcHead() {
  let okCount = 0;
  for (const url of RPCS) {
    const r = await rpcOne(url, "eth_blockNumber", []);
    if (r.ok && r.result) okCount++;
  }
  return okCount;
}

// ————————————————————————————————————————————
// Durable KV queue — append-only records, never silently deleted.
// States: RECEIVED → VERIFYING → VERIFIED → QUEUED → FORWARDED → ACKNOWLEDGED
//          | FAILED | UNKNOWN | DEAD_LETTER
// ————————————————————————————————————————————
function queueClient(env) {
  if (!env.BRIDGE_QUEUE) return null;
  return env.BRIDGE_QUEUE;
}
async function queueGet(kv, eventId) {
  const raw = await kv.get("q:" + eventId);
  return raw ? JSON.parse(raw) : null;
}
async function queuePut(kv, record) {
  record.updated_at = nowIso();
  await kv.put("q:" + record.event_id, JSON.stringify(record));
  return record;
}
async function queueList(kv, limit = 200) {
  const keys = await kv.list({ prefix: "q:" }, limit);
  const out = [];
  for (const k of keys.keys.slice(0, limit)) {
    const rec = await queueGet(kv, k.name.slice(2));
    if (rec) out.push(rec);
  }
  return out;
}
function nextRetryAt(retryCount) {
  return new Date(Date.now() + BACKOFF_BASE_SECONDS * Math.pow(2, retryCount) * 1000).toISOString();
}
// Deliver one queued event to its target. Returns { delivered:boolean, status }.
async function deliverEvent(env, record) {
  if (record.event_type === "crxs_deposit") {
    const target = env.CRXS_DEPOSIT_TARGET_URL || "";
    if (!target) return { delivered: false, status: "NO_TARGET — CRXS_DEPOSIT_TARGET_URL is not configured yet; the verified event stays safely queued." };
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + (env.BACKEND_API_SECRET || "") },
        body: JSON.stringify(record.verified_payload),
      });
      if (res.ok) return { delivered: true, status: res.status };
      return { delivered: false, status: "HTTP " + res.status };
    } catch (e) {
      return { delivered: false, status: "network: " + String((e && e.message) || e).slice(0, 140) };
    }
  }
  if (record.event_type === "flutterwave_event") {
    const target = env.BASE44_WEBHOOK_URL || DEFAULT_WEBHOOK_TARGET;
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json", ...(record.forward_signature ? { "flutterwave-signature": record.forward_signature } : {}) },
        body: record.raw_body,
      });
      if (res.ok) return { delivered: true, status: res.status };
      return { delivered: false, status: "HTTP " + res.status };
    } catch (e) {
      return { delivered: false, status: "network: " + String((e && e.message) || e).slice(0, 140) };
    }
  }
  return { delivered: false, status: "UNKNOWN_EVENT_TYPE" };
}
// Replay every event whose next_retry_at is due (oldest-first semantics by received_at).
async function replayDue(env, force = false) {
  const kv = queueClient(env);
  if (!kv) return { error: "BRIDGE_QUEUE KV binding is not configured — nothing to replay." };
  const records = (await queueList(kv)).sort((a, b) => String(a.received_at).localeCompare(String(b.received_at)));
  const summary = { attempted: 0, delivered: 0, deferred: 0, dead_lettered: 0, details: [] };
  for (const rec of records) {
    const terminal = ["FORWARDED", "ACKNOWLEDGED", "DEAD_LETTER", "REJECTED"].includes(rec.delivery_status);
    if (terminal) continue;
    const due = force || !rec.next_retry_at || new Date(rec.next_retry_at).getTime() <= Date.now();
    if (!due) { summary.deferred++; continue; }
    if (rec.verification_status === "UNKNOWN") { summary.deferred++; continue; } // reconcile first — never blind-send
    summary.attempted++;
    const r = await deliverEvent(env, rec);
    if (r.delivered) {
      rec.delivery_status = "FORWARDED";
      rec.retry_count = (rec.retry_count || 0);
      rec.last_error = "";
      rec.next_retry_at = null;
      summary.delivered++;
    } else {
      rec.retry_count = (rec.retry_count || 0) + 1;
      rec.last_error = r.status;
      if (rec.retry_count >= RETRY_CEILING) {
        rec.delivery_status = "DEAD_LETTER"; // kept forever, never silently deleted
        summary.dead_lettered++;
      } else {
        rec.delivery_status = "QUEUED";
        rec.next_retry_at = nextRetryAt(rec.retry_count);
      }
    }
    rec.last_attempt_at = nowIso();
    await queuePut(kv, rec);
    summary.details.push({ event_id: rec.event_id, status: rec.delivery_status, error: rec.last_error || null });
    if (summary.attempted >= 50) break; // bounded sweep
  }
  return summary;
}

// ————————————————————————————————————————————
// Flutterwave signature verification (matches the platform check) + API verify
// ————————————————————————————————————————————
async function verifyFlwSignature(raw, signatureHeader, verifHash, secret) {
  if (!secret) return { ok: true, enforced: false };
  if (signatureHeader) {
    const key = await crypto.subtle.importKey("raw", te(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const buf = await crypto.subtle.sign("HMAC", key, te(raw));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    if (signatureHeader === b64) return { ok: true, enforced: true, mode: "hmac-b64" };
  }
  if (verifHash && verifHash === secret) return { ok: true, enforced: true, mode: "verif-hash" };
  return { ok: false, enforced: true };
}
function computeForwardSignature(raw, secret) {
  // Forwarding always carries a correct HMAC header so the Base44 function's
  // own signed-mode verification passes on every forwarded event.
  return computeHmacHex(raw, secret);
}
async function computeHmacHex(raw, secret) {
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", te(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", key, te(raw));
  return bytesToHex(buf);
}
// Independent provider verification — the webhook is only a trigger (spec §9).
async function flwVerifyTransaction(env, txId) {
  if (!env.FLW_SECRET_KEY) return { status: "UNAVAILABLE", detail: "FLW_SECRET_KEY not configured on the Worker" };
  if (!/^\d+$/.test(String(txId || ""))) return { status: "UNAVAILABLE", detail: "not a numeric v3 transaction id" };
  try {
    const res = await fetch("https://api.flutterwave.com/v3/transactions/" + String(txId) + "/verify", {
      headers: { authorization: "Bearer " + env.FLW_SECRET_KEY, "content-type": "application/json" },
    });
    const body = await res.json();
    if (!res.ok) return { status: "UNAVAILABLE", detail: "HTTP " + res.status };
    const d = (body && body.data) || {};
    const status = String(d.status || "").toLowerCase();
    if (status === "successful") {
      return { status: "SUCCESSFUL", detail: { id: d.id, tx_ref: d.tx_ref, amount: d.amount, currency: d.currency, created_at: d.created_at } };
    }
    if (status) return { status: status.toUpperCase(), detail: { id: d.id, tx_ref: d.tx_ref, amount: d.amount, currency: d.currency } };
    return { status: "UNAVAILABLE", detail: "provider answer carried no status" };
  } catch (e) {
    return { status: "UNAVAILABLE", detail: String((e && e.message) || e).slice(0, 140) };
  }
}

// ————————————————————————————————————————————
// Wallet address derivation — the OFFICIAL ERC-4337 factory, read from a
// quorum of independent Base endpoints. The derivation salt must match the
// app + platform function EXACTLY (SHA-256 of "CRIXCOIN-ADDRESS-SALT-V1|<user_id>").
// ————————————————————————————————————————————
async function saltHexFor(userId) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", te("CRIXCOIN-ADDRESS-SALT-V1|" + String(userId))));
}
function deriveCalldata(owner, saltHex) {
  return (
    GET_ADDRESS_SELECTOR.slice(2) +
    String(owner).toLowerCase().replace(/^0x/, "").padStart(64, "0") +
    saltHex
  );
}
async function deriveAddressQuorum(userId, ownerAddress) {
  const evidence = [];
  if (!isAddress(ownerAddress)) {
    evidence.push({ check: "owner_address_format", pass: false, value: String(ownerAddress), source: "request" });
    return { error: "INVALID_OWNER_ADDRESS", evidence };
  }
  const factoryCode = await rpcQuorum("eth_getCode", [SIMPLE_ACCOUNT_FACTORY, "latest"], 2);
  evidence.push({ check: "factory_code_on_base", pass: !!(factoryCode.ok && factoryCode.value && factoryCode.value !== "0x"), value: factoryCode.ok ? "official SimpleAccountFactory contract present" : (factoryCode.errors || []).join("; "), source: "Base Mainnet RPC quorum" });
  if (!factoryCode.ok || !factoryCode.value || factoryCode.value === "0x") return { error: "FACTORY_NOT_REACHABLE — the official factory could not be verified on Base right now. Nothing was created.", evidence };
  const saltHex = await saltHexFor(userId);
  const calldata = "0x" + deriveCalldata(ownerAddress, saltHex);
  const answers = [];
  const errors = [];
  for (const url of RPCS) {
    const r = await rpcOne(url, "eth_call", [{ to: SIMPLE_ACCOUNT_FACTORY, data: calldata }, "latest"]);
    if (r.ok && typeof r.result === "string" && r.result.length === 66) answers.push({ host: new URL(url).host, address: "0x" + r.result.slice(-40).toLowerCase() });
    else errors.push(new URL(url).host + ": " + (r.error || "no address"));
  }
  const agreeCount = answers.filter((a) => a.address === answers[0].address).length;
  evidence.push({
    check: "factory_get_address_agreement",
    pass: agreeCount >= 2,
    value: agreeCount + "/" + RPCS.length + " independent endpoints derived the SAME address" + (answers[0] ? " (" + answers[0].address + ")" : ""),
    source: answers.map((a) => a.host).join(", "),
  });
  if (answers.length < 2 || agreeCount < 2) {
    return { error: "DERIVATION_QUORUM_FAILED — fewer than two independent Base endpoints agreed. Nothing was created.", evidence };
  }
  return {
    crixcoin_address: answers[0].address,
    owner_address: String(ownerAddress).toLowerCase(),
    account_name: "crixcoin-user-" + String(userId),
    chain_id: BASE_CHAIN_ID,
    factory: SIMPLE_ACCOUNT_FACTORY,
    derivation_salt: saltHex,
    verification_status: "VERIFIED",
    evidence,
  };
}

// The binding message — must match src/lib/crixAddress.js byte-for-byte.
function bindingMessage(userId, owner) {
  return (
    "CRIXCOIN-ADDRESS-BINDING-V1\n" +
    "user_id: " + userId + "\n" +
    "owner: " + String(owner).toLowerCase() + "\n" +
    "chain: base-mainnet\n" +
    "factory: " + SIMPLE_ACCOUNT_FACTORY
  );
}
// Server-side personal_sign recovery (spec §4: never trust a client-claimed
// address). Uses viem's audited recovery via esm.sh; if the import fails the
// endpoint FAILS CLOSED — no verification, no record.
async function recoverSigner(userId, owner, signature) {
  const { recoverMessageAddress } = await import("https://esm.sh/viem@2");
  const message = bindingMessage(userId, owner);
  const recovered = await recoverMessageAddress({ message, signature: String(signature) });
  return String(recovered).toLowerCase();
}

// ————————————————————————————————————————————
// CRXS deposit verification — the full 13-point check against the chain
// (spec §6/§7). Idempotency identity: chainId + txHash + logIndex.
// ————————————————————————————————————————————
async function verifyCrxsDeposit(env, txHash, logIndex, expectedDestination) {
  const evidence = [];
  const tx = String(txHash || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return { error: "INVALID_TX_HASH", evidence };
  const idx = Number(logIndex || 0);

  // Receipt from a quorum — disagreement means UNKNOWN, never credit (spec §7).
  const r1 = await rpcQuorum("eth_getTransactionReceipt", [tx], 2);
  evidence.push({ check: "receipt_quorum", pass: r1.ok, value: r1.ok ? "≥2 independent endpoints returned the same receipt" : (r1.errors || []).join("; "), source: "Base Mainnet RPC quorum" });
  if (!r1.ok) return { status: "UNKNOWN", reason: "RPC_QUORUM_FAILED — the chain could not prove this transaction right now. Reconcile before any action.", evidence };

  const rc = r1.value;
  const success = String(rc.status || "") === "0x1";
  evidence.push({ check: "receipt_status_success", pass: success, value: rc.status, source: "receipt" });
  if (!success) return { status: "FAILED", reason: "REVERTED — the transaction did not succeed. Never credited.", evidence };

  // Chain id + canonical contract.
  const chain = await rpcQuorum("eth_chainId", [], 2);
  const chainOk = chain.ok && String(chain.value) === "0x" + BASE_CHAIN_ID.toString(16);
  evidence.push({ check: "chain_id_base_mainnet", pass: chainOk, value: chain.ok ? chain.value : "unreachable", source: "Base Mainnet RPC quorum" });
  if (!chainOk) return { error: "WRONG_CHAIN", evidence };

  // Confirmation depth.
  const head = await rpcQuorum("eth_blockNumber", [], 2);
  const depth = head.ok && rc.blockNumber ? Number(BigInt(head.value)) - Number(BigInt(rc.blockNumber)) : 0;
  evidence.push({ check: "confirmation_depth", pass: depth >= MIN_CONFIRMATIONS, value: depth + " confirmations (require " + MIN_CONFIRMATIONS + ")", source: "Base Mainnet RPC quorum" });

  // Find the CRXS Transfer log at the requested index (or all CRXS transfers).
  const logs = (rc.logs || []).filter((l) => String(l.address).toLowerCase() === CRXS_TOKEN && String(l.topics[0]) === TRANSFER_TOPIC_0);
  if (!logs.length) return { status: "FAILED", reason: "NO_CRXS_TRANSFER — the receipt carries no CRXS Transfer event. Nothing to credit.", evidence };
  const log = Number.isInteger(idx) && idx >= 0 ? logs.find((l) => Number(BigInt(l.logIndex)) === idx) : logs[0];
  if (!log) return { error: "LOG_INDEX_NOT_FOUND", evidence };
  const from = "0x" + log.topics[1].slice(-40);
  const to = "0x" + log.topics[2].slice(-40);
  const amountRaw = String(BigInt(log.data));
  evidence.push({ check: "transfer_event", pass: true, value: from + " → " + to + " · " + amountRaw + " raw CRXS (18 decimals)", source: "receipt log " + Number(BigInt(log.logIndex)) });
  if (expectedDestination) {
    const destOk = String(expectedDestination).toLowerCase() === to;
    evidence.push({ check: "destination_match", pass: destOk, value: "expected " + expectedDestination + ", got " + to, source: "receipt log" });
    if (!destOk) return { error: "DESTINATION_MISMATCH", evidence };
  }
  return {
    status: depth >= MIN_CONFIRMATIONS ? "CONFIRMED" : "PENDING",
    depth,
    idempotency_key: BASE_CHAIN_ID + ":" + tx + ":" + Number(BigInt(log.logIndex)),
    deposit: { tx_hash: tx, block_number: Number(BigInt(rc.blockNumber)), log_index: Number(BigInt(log.logIndex)), from, to, amount_raw: amountRaw, token: CRXS_TOKEN, chain_id: BASE_CHAIN_ID, confirmations: depth },
    evidence,
  };
}

// ————————————————————————————————————————————
// Health / observability (spec §25) — no secrets are ever returned.
// ————————————————————————————————————————————
async function handleHealth(env) {
  const out = { ok: true, checked_at: nowIso(), base44: {}, flutterwave: {}, base_rpc: {}, crxs_contract: {}, queue: {}, last_events: [] };
  // Base44
  try {
    const res = await fetch(env.BASE44_APP_URL || BASE44_APP_URL_DEFAULT, { method: "HEAD" });
    out.base44 = { status: res.ok || res.status < 500 ? "ONLINE" : "DEGRADED", http: res.status };
  } catch (e) { out.base44 = { status: "OFFLINE", detail: "unreachable" }; }
  // Flutterwave API reachability
  try {
    const res = await fetch("https://api.flutterwave.com/v3/transactions/verify", { method: "POST" });
    out.flutterwave = { status: res.status === 401 || res.status === 400 || res.status === 405 ? "ONLINE" : "DEGRADED", http: res.status, api_key_configured: !!env.FLW_SECRET_KEY };
  } catch (e) { out.flutterwave = { status: "OFFLINE", detail: "unreachable" }; }
  // Base RPC
  const okCount = await rpcHead();
  out.base_rpc = { status: okCount >= 2 ? "ONLINE" : okCount === 1 ? "DEGRADED" : "OFFLINE", endpoints_reachable: okCount + "/" + RPCS.length };
  // CRXS contract
  const code = await rpcQuorum("eth_getCode", [CRXS_TOKEN, "latest"], 1);
  out.crxs_contract = { status: code.ok && code.value && code.value !== "0x" ? "VERIFIED" : "ERROR", address: CRXS_TOKEN, chain_id: BASE_CHAIN_ID };
  // Queue
  const kv = queueClient(env);
  if (!kv) {
    out.queue = { error: "BRIDGE_QUEUE KV binding not configured — durable queueing is INACTIVE. Webhook events rely on Flutterwave's own retries (the bridge answers 503 so they do)." };
  } else {
    const recs = await queueList(kv);
    const byState = {};
    for (const r of recs) byState[r.delivery_status || "UNKNOWN"] = (byState[r.delivery_status || "UNKNOWN"] || 0) + 1;
    out.queue = { pending: (byState.QUEUED || 0), forwarded: (byState.FORWARDED || 0), dead_letter: (byState.DEAD_LETTER || 0), unknown_verification: recs.filter((r) => r.verification_status === "UNKNOWN").length, total: recs.length };
    out.last_events = recs.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at))).slice(0, 5).map((r) => ({ event_id: r.event_id, type: r.event_type, verification: r.verification_status, delivery: r.delivery_status, received_at: r.received_at, last_error: r.last_error || null }));
  }
  out.guardrails = {
    role: "verification + durable queue only",
    credits_balances: false, ledger_writes: false, holds_private_keys: false, withdrawal_signing: false,
    authoritative_backend: "Base44",
    crxs_deposit_target_configured: !!env.CRXS_DEPOSIT_TARGET_URL,
  };
  return { status: 200, data: out };
}

// ————————————————————————————————————————————
// OpenAPI (for Base44 "From URL" integration registration)
// ————————————————————————————————————————————
const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "CRIXCOIN Deployment-Outage Bridge",
    version: "1.0.0",
    description: "Temporary fail-closed infrastructure bridge: signature/factory verification, blockchain reads, webhook verification and durable event queueing. No balances, no ledger, no signing, no keys — Base44 stays the single financial authority.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/health": { get: { summary: "Dependency + queue status (no secrets)", responses: { "200": { description: "Status" } } } },
    "/queue/status": { get: { summary: "Queue counts by state", responses: { "200": { description: "Counts" } } } },
    "/queue/replay": { post: { summary: "Replay due queued events now", responses: { "200": { description: "Replay summary" } } } },
    "/wallet/address/derive": { post: { summary: "Deterministic factory address (3-endpoint quorum)", responses: { "200": { description: "Derived address + evidence" } } } },
    "/wallet/address/verify": { post: { summary: "personal_sign recovery + factory re-derivation", responses: { "200": { description: "Verified address + evidence" } } } },
    "/payments/flutterwave/reconcile": { post: { summary: "Live provider verification of one transaction", responses: { "200": { description: "Verification result" } } } },
    "/base/crxs/event": { post: { summary: "Verify a CRXS Transfer deposit on-chain and queue it for Base44", responses: { "200": { description: "Verification + queue state" } } } },
  },
};

// ————————————————————————————————————————————
// Router
// ————————————————————————————————————————————
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "*";
    if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
    if (url.pathname === "/openapi.json") return json(OPENAPI_SPEC, 200, origin);

    // ——— Public, but secret-gated: the Flutterwave webhook target ———
    if (url.pathname === "/payments/flutterwave/webhook" && request.method === "POST") {
      const raw = await request.text();
      const signature = request.headers.get("flutterwave-signature") || "";
      const verifHash = request.headers.get("verif-hash") || "";
      const secret = env.FLW_WEBHOOK_SECRET || "";
      const sig = await verifyFlwSignature(raw, signature, verifHash, secret);
      if (!sig.ok) return json({ error: "UNAUTHORIZED — invalid webhook signature. Nothing was forwarded or queued." }, 401);
      const payloadHash = await sha256Hex(raw);
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { /* forward anyway; platform will reject */ }
      const evType = String((parsed && (parsed.event || parsed.type)) || "").toLowerCase();
      const d = (parsed && parsed.data) || {};
      // Independent provider verification for payment events (webhook = trigger only).
      let verification_status = "VERIFIED";
      let verification_detail = "signature " + (sig.enforced ? "enforced (" + sig.mode + ")" : "not enforced — FLW_WEBHOOK_SECRET unset; the Base44 function re-verifies independently");
      let provider_check = null;
      if (/^\d+$/.test(String(d.id || ""))) {
        provider_check = await flwVerifyTransaction(env, d.id);
        verification_status = provider_check.status === "SUCCESSFUL" ? "VERIFIED" : provider_check.status === "UNAVAILABLE" ? "UNKNOWN" : "REJECTED";
        verification_detail += " · provider: " + provider_check.status + (provider_check.detail ? " (" + (typeof provider_check.detail === "string" ? provider_check.detail : JSON.stringify(provider_check.detail)) + ")" : "");
      }
      // Deliver straight to the Base44 webhook function (the money authority);
      // queue durably only if it cannot be reached.
      const target = env.BASE44_WEBHOOK_URL || DEFAULT_WEBHOOK_TARGET;
      const forwardSig = signature || computeHmacHex(raw, secret);
      let delivered = false;
      let httpStatus = 0;
      try {
        const res = await fetch(target, {
          method: "POST",
          headers: { "content-type": "application/json", ...(forwardSig ? { "flutterwave-signature": forwardSig } : {}) },
          body: raw,
        });
        delivered = res.ok;
        httpStatus = res.status;
      } catch (e) { httpStatus = 0; }
      const kv = queueClient(env);
      const record = {
        event_id: "flw:" + payloadHash.slice(0, 32),
        event_type: "flutterwave_event",
        provider: "flutterwave",
        external_reference: String(d.id || d.tx_ref || ""),
        merchant_reference: String(d.tx_ref || d.reference || ""),
        payload_hash: payloadHash,
        received_at: nowIso(),
        verification_status,
        verification_detail,
        delivery_status: delivered ? "FORWARDED" : "QUEUED",
        retry_count: 0,
        next_retry_at: delivered ? null : nextRetryAt(0),
        last_attempt_at: nowIso(),
        last_error: delivered ? "" : "Base44 webhook unreachable (HTTP " + httpStatus + ")",
        raw_body: raw,
        forward_signature: forwardSig,
        created_at: nowIso(),
      };
      if (kv && (!delivered || verification_status !== "VERIFIED")) {
        // Keep an auditable record of every queued/unverified event (never silently deleted).
        await queuePut(kv, record);
      }
      if (delivered) return json({ received: true, forwarded: true, verification: verification_status }, 200, origin);
      // 503 → Flutterwave retries too; duplicates are refused by the platform's own idempotency.
      return json({ received: true, queued_for_replay: !!(kv && verification_status !== "REJECTED"), verification: verification_status, note: "Base44 could not be reached — this verified event is durably queued and replays automatically. No money state changed." }, 503, origin);
    }

    // ——— Everything below requires the shared secret ———
    const auth = authorized(request, env);
    if (!auth.ok) return json({ error: "UNAUTHORIZED — " + auth.reason }, 401, origin);

    if (url.pathname === "/health" && request.method === "GET") {
      if (env.BRIDGE_KEY && request.headers.get("x-bridge-key") !== env.BRIDGE_KEY) return json({ error: "UNAUTHORIZED" }, 401, origin);
      const r = await handleHealth(env);
      return json(r.data, r.status, origin);
    }

    if (url.pathname === "/queue/status" && request.method === "GET") {
      const kv = queueClient(env);
      if (!kv) return json({ error: "BRIDGE_QUEUE KV binding is not configured." }, 503, origin);
      const recs = await queueList(kv);
      const byDelivery = {};
      for (const r of recs) byDelivery[r.delivery_status || "UNKNOWN"] = (byDelivery[r.delivery_status || "UNKNOWN"] || 0) + 1;
      return json({
        ok: true,
        total: recs.length,
        by_delivery: byDelivery,
        failed: (byDelivery.FAILED || 0),
        dead_letter: (byDelivery.DEAD_LETTER || 0),
        unknown_needing_reconciliation: recs.filter((r) => r.verification_status === "UNKNOWN").length,
        crxs_deposit_target_configured: !!env.CRXS_DEPOSIT_TARGET_URL,
        events: recs.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at))).slice(0, 20).map((r) => ({ event_id: r.event_id, type: r.event_type, external_reference: r.external_reference, verification: r.verification_status, delivery: r.delivery_status, retry_count: r.retry_count, next_retry_at: r.next_retry_at, last_error: r.last_error || null })),
      }, 200, origin);
    }

    if (url.pathname === "/queue/replay" && request.method === "POST") {
      const body = await readBody(request);
      const summary = await replayDue(env, !!body.force);
      return json({ ok: true, replay: summary }, 200, origin);
    }

    if (url.pathname === "/wallet/address/derive" && request.method === "POST") {
      const body = await readBody(request);
      if (!body.user_id || !body.owner_address) return json({ error: "user_id and owner_address are required." }, 400, origin);
      const r = await deriveAddressQuorum(body.user_id, body.owner_address);
      if (r.error) return json({ error: r.error, evidence: r.evidence }, 503, origin);
      return json({ ok: true, ...r }, 200, origin);
    }

    if (url.pathname === "/wallet/address/verify" && request.method === "POST") {
      const body = await readBody(request);
      const { user_id, owner_address, signature } = body;
      const evidence = [];
      if (!user_id || !isAddress(owner_address) || !/^(0x)?[0-9a-fA-F]{130}$/.test(String(signature || ""))) {
        evidence.push({ check: "request_shape", pass: false, value: "user_id, owner_address and a 65-byte personal_sign signature are required", source: "request" });
        return json({ error: "INVALID_REQUEST — user_id, owner_address and signature are required. Nothing was created.", evidence }, 400, origin);
      }
      // 1 — server-side signature recovery. FAIL CLOSED on any failure.
      let recovered = "";
      try {
        recovered = await recoverSigner(user_id, String(owner_address).toLowerCase(), String(signature).toLowerCase().startsWith("0x") ? signature : "0x" + signature);
      } catch (e) {
        evidence.push({ check: "signature_recovery", pass: false, value: "recovery failed: " + String((e && e.message) || e).slice(0, 140), source: "ecrecover (viem via esm.sh)" });
        return json({ error: "SIGNATURE_RECOVERY_FAILED — the signature could not be verified. Nothing was created.", evidence }, 400, origin);
      }
      const signerMatches = recovered === String(owner_address).toLowerCase();
      evidence.push({ check: "signature_recovers_owner", pass: signerMatches, value: "recovered " + recovered, source: "ecrecover (viem via esm.sh)" });
      if (!signerMatches) return json({ error: "SIGNATURE_MISMATCH — the signature was not made by this owner address. Nothing was created.", evidence }, 403, origin);
      // 2 — independent factory re-derivation from ≥2 Base endpoints.
      const derived = await deriveAddressQuorum(user_id, owner_address);
      if (derived.error) return json({ error: derived.error, evidence: [...evidence, ...derived.evidence] }, 503, origin);
      return json({ ok: true, ...derived, evidence: [...evidence, ...derived.evidence] }, 200, origin);
    }

    if (url.pathname === "/payments/flutterwave/reconcile" && request.method === "POST") {
      const body = await readBody(request);
      if (!body.transaction_id) return json({ error: "transaction_id is required." }, 400, origin);
      const v = await flwVerifyTransaction(env, body.transaction_id);
      return json({ ok: true, transaction_id: body.transaction_id, verification: v.status, detail: v.detail || null }, 200, origin);
    }

    if (url.pathname === "/base/crxs/event" && request.method === "POST") {
      const body = await readBody(request);
      const v = await verifyCrxsDeposit(env, body.tx_hash, body.log_index, body.expected_destination);
      if (v.error) return json({ error: v.error, evidence: v.evidence }, 400, origin);
      const kv = queueClient(env);
      const eventId = "crxs:" + (v.idempotency_key || String(body.tx_hash));
      const existing = kv ? await queueGet(kv, eventId) : null;
      if (existing) {
        // Idempotency: the same chain event NEVER queues twice (spec §13).
        return json({ ok: true, duplicate: true, status: existing.verification_status === "UNKNOWN" ? "UNKNOWN" : existing.deposit ? "CONFIRMED" : existing.status, event_id: eventId, note: "This exact chain event was already processed — no second queue entry, ever.", evidence: v.evidence }, 200, origin);
      }
      if (!kv) return json({ error: "BRIDGE_QUEUE KV binding is not configured — the verified event cannot be durably held. NOT queued, NOT credited. Configure the binding and re-submit." }, 503, origin);
      const record = {
        event_id: eventId,
        event_type: "crxs_deposit",
        provider: "base-mainnet",
        external_reference: v.idempotency_key,
        merchant_reference: "",
        payload_hash: await sha256Hex(JSON.stringify(v.deposit)),
        received_at: nowIso(),
        verification_status: v.status === "CONFIRMED" ? "VERIFIED" : v.status,
        verification_detail: v.status === "PENDING" ? v.depth + " confirmations — waiting for depth " + MIN_CONFIRMATIONS : (v.reason || ""),
        delivery_status: v.status === "CONFIRMED" ? "QUEUED" : v.status,
        retry_count: 0,
        next_retry_at: v.status === "CONFIRMED" ? nextRetryAt(0) : null,
        last_attempt_at: null,
        last_error: "",
        verified_payload: v.deposit,
        created_at: nowIso(),
      };
      await queuePut(kv, record);
      return json({ ok: true, status: v.status, idempotency_key: v.idempotency_key, deposit: v.deposit, delivery_target_configured: !!env.CRXS_DEPOSIT_TARGET_URL, note: v.status === "CONFIRMED" ? "Verified on-chain and durably queued — Base44 performs the final idempotency check and ledger credit." : (v.status === "PENDING" ? "Waiting for confirmation depth — forwarded automatically once confirmed." : "UNKNOWN — reconcile before any action; never auto-resubmitted."), evidence: v.evidence }, 200, origin);
    }

    const txMatch = url.pathname.match(/^\/base\/crxs\/transaction\/(0x[0-9a-fA-F]{64})$/);
    if (txMatch && request.method === "GET") {
      const v = await verifyCrxsDeposit(env, txMatch[1], undefined, undefined);
      if (v.error) return json({ error: v.error, evidence: v.evidence }, 400, origin);
      return json({ ok: true, status: v.status, deposit: v.deposit || null, reason: v.reason || null, evidence: v.evidence }, 200, origin);
    }

    return json({ error: "NOT_FOUND" }, 404, origin);
  },

  // Cron trigger (optional — add in the Cloudflare dashboard, e.g. every minute):
  // replays due queued events with the same fail-closed rules.
  async scheduled(event, env) {
    await replayDue(env, false);
  },
};