/**
 * CRIXCOIN ACCOUNT ENGINE — browser-deployed Cloudflare Worker.
 * Deploy from https://workers.cloudflare.com/playground (no CLI, no terminal):
 * paste this file, click Deploy, claim the Worker, then set the secrets listed
 * in src/workers/ACCOUNT_ENGINE_SETUP.md. Register it in Base44 (Settings →
 * Integrations → New Integration → From URL → https://<your-worker>/openapi.json,
 * slug "crxs-account-engine", header Authorization: Bearer <BACKEND_API_SECRET>).
 *
 * WHY THIS WORKER EXISTS — the Base44 deploy pipeline cannot build the
 * server-side function that creates CRIXCOIN addresses (the CDP SDK bundle
 * fails the platform's bundler/transport step). This Worker performs the SAME
 * real operations against the SAME live Coinbase Developer Platform REST API
 * (api.cdp.coinbase.com/platform/v2), implemented with pure Web Crypto — no
 * SDK, no npm, nothing to bundle. The app always tries its own platform
 * function first; this Worker is the fallback, and it stops being used
 * automatically the moment the platform function deploys.
 *
 * WHAT IT DOES (create-only wallet provisioning + read-only chain access):
 *   POST /cdp/account       — get-or-create the user's CDP EOA + ERC-4337 smart
 *                             account on Base, idempotent by deterministic name
 *                             derived from the user id (a retry resolves the
 *                             SAME accounts — a duplicate can never create a
 *                             second wallet). No funds move. The app, not this
 *                             Worker, writes the user's own record.
 *   POST /cdp/account-status — read-only by-name lookups (works without the
 *                             wallet secret — GET endpoints need the API key only)
 *   POST /alchemy/read      — whitelisted READ-ONLY chain queries through the
 *                             Alchemy Base Mainnet endpoint (public RPC fallback)
 *   POST /aa-health         — provider health probes: Alchemy bundler + gas
 *                             policy, Pimlico, CDP paymaster (live responses only)
 *
 * CONFIRMED ABSENT — there is NO endpoint that can:
 *   - transfer or send CRXS/CRIX (or any asset) — the transfer gate stays PAUSED
 *     on the platform and signing/submission has no endpoint here
 *   - sign a transaction or a UserOperation, or submit to a bundler/paymaster
 *   - touch the app database (the user_id → address record is written by the
 *     app itself, user's own row, enforced by security rules)
 *   - read, log or echo any secret value — evidence fields never contain keys
 *
 * SECRETS THIS WORKER USES (complete list, nothing else is read):
 *   BACKEND_API_SECRET        REQUIRED — shared secret matching the Base44 integration header
 *   CDP_API_KEY_ID            REQUIRED for CDP endpoints — the CDP Secret API key id
 *   CDP_API_SECRET            REQUIRED for CDP endpoints — PEM (PKCS8 or EC) private key, or base64 DER
 *   CDP_WALLET_SECRET         REQUIRED only for FIRST-TIME creation — base64 PKCS8 DER from the CDP Portal
 *   BASE_RPC_URL              OPTIONAL — GetBlock Base Mainnet RPC (private, 20 RPS; tried before Alchemy/public reads)
 *   ALCHEMY_API_KEY           OPTIONAL — Alchemy Base Mainnet RPC (replaces flaky public RPC reads)
 *   ALCHEMY_ACCOUNTS_API_KEY  OPTIONAL — Alchemy Account Kit bundler probe
 *   ALCHEMY_GAS_POLICY_ID     OPTIONAL — recorded in /aa-health evidence (paymaster sponsorship readiness)
 *   PIMLICO_API_KEY           OPTIONAL — Pimlico health probe
 *   CDP_PAYMASTER_URL         OPTIONAL — CDP paymaster health probe
 * Missing optional secrets report NOT_CONFIGURED honestly — never crash.
 */

// ————————————————————————————————————————————
// Constants
// ————————————————————————————————————————————
const CDP_HOST = "api.cdp.coinbase.com";
const CDP_BASE = "/platform/v2";
const EOA_BY_NAME = (name) => `${CDP_BASE}/evm/accounts/by-name/${encodeURIComponent(name)}`;
const EOA_CREATE = `${CDP_BASE}/evm/accounts`;
const SMART_BY_NAME = (name) => `${CDP_BASE}/evm/smart-accounts/by-name/${encodeURIComponent(name)}`;
const SMART_CREATE = `${CDP_BASE}/evm/smart-accounts`;

const ALCHEMY_BASE = "https://base-mainnet.g.alchemy.com/v2/";
const PUBLIC_MAINNET_RPC = ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.meowrpc.com"];
const BASE_MAINNET_CHAIN_ID = 8453;

// Strictly read-only EVM methods this engine will ever forward.
const READ_ONLY_METHODS = new Set([
  "eth_chainId", "eth_blockNumber", "eth_getBalance", "eth_getCode",
  "eth_getTransactionCount", "eth_getTransactionReceipt",
  "eth_getTransactionByHash", "eth_call", "eth_estimateGas",
]);

// ————————————————————————————————————————————
// base64url / hex helpers
// ————————————————————————————————————————————
function b64urlEncode(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecodeToBytes(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hexEncode(bytes) {
  const arr = new Uint8Array(bytes);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomHex32() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return hexEncode(b);
}
const te = (s) => new TextEncoder().encode(s);

// ————————————————————————————————————————————
// EC private key import — accepts every format the CDP Portal can give you:
//   · PEM PKCS8  ("-----BEGIN PRIVATE KEY-----")
//   · PEM SEC1   ("-----BEGIN EC PRIVATE KEY-----") — converted to PKCS8
//   · base64 DER (raw PKCS8 or SEC1)
// Pure Web Crypto afterwards — no node, no SDK, nothing to bundle.
// ————————————————————————————————————————————
function stripPem(pem) {
  const body = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function isSec1(der) {
  // SEC1: SEQ { INTEGER 1, ... }  |  PKCS8: SEQ { INTEGER 0, SEQ{OID...}, OCTET STRING }
  return der.length > 3 && der[0] === 0x30 && der[2] === 0x02 && der[3] === 0x01 && der[4] === 0x01;
}
function derLen(n) {
  if (n < 128) return new Uint8Array([n]);
  if (n < 256) return new Uint8Array([0x81, n]);
  return new Uint8Array([0x82, (n >> 8) & 0xff, n & 0xff]);
}
function derWrap(tag, content) {
  const len = derLen(content.length);
  const out = new Uint8Array(1 + len.length + content.length);
  out[0] = tag;
  out.set(len, 1);
  out.set(content, 1 + len.length);
  return out;
}
function sec1ToPkcs8(sec1) {
  // PKCS8 PrivateKeyInfo = SEQ { INTEGER 0, AlgorithmIdentifier, OCTET STRING <sec1> } —
  // the version and algorithm are DIRECT fields of the outer SEQ (no nested SEQ).
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const algId = new Uint8Array([0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);
  const octet = derWrap(0x04, sec1);
  const body = new Uint8Array(version.length + algId.length + octet.length);
  body.set(version, 0);
  body.set(algId, version.length);
  body.set(octet, version.length + algId.length);
  return derWrap(0x30, body);
}
async function importEcPrivateKey(secretString) {
  let der = null;
  const s = String(secretString || "").trim();
  if (/BEGIN/.test(s)) {
    der = stripPem(s);
    if (isSec1(der)) der = sec1ToPkcs8(der);
  } else {
    // raw base64 DER (PKCS8 or SEC1)
    const bin = atob(s.replace(/\s+/g, ""));
    der = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
    if (isSec1(der)) der = sec1ToPkcs8(der);
  }
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

// ————————————————————————————————————————————
// JWT builders — byte-compatible with @coinbase/cdp-sdk's auth module:
//   API key JWT  — header {alg ES256, kid, typ JWT, nonce}, claims
//                  {sub, iss:"cdp", uris:["METHOD host path"], iat, nbf, exp}
//   Wallet JWT   — header {alg ES256, typ JWT}, claims {uris, reqHash?, iat, nbf, jti}
//                  where reqHash = sha256hex(JSON.stringify(recursively
//                  key-sorted request body)) — exactly the SDK's stable stringify.
// ————————————————————————————————————————————
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}
async function sha256Hex(bytes) {
  return hexEncode(await crypto.subtle.digest("SHA-256", bytes));
}
async function es256Sign(privateKey, unsigned) {
  // Web Crypto ECDSA P-256/SHA-256 returns raw r||s — exactly JWS's ES256 format.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, te(unsigned));
  return b64urlEncode(sig);
}
// Ed25519 (EdDSA) API keys — the CURRENT CDP Portal format: base64 of exactly
// 64 bytes = seed(32) || public(32). The SDK detects the key type the same way
// and signs EdDSA JWTs with it. Verified live against api.cdp.coinbase.com.
function ed25519SecretBytes(secretString) {
  try {
    const bin = atob(String(secretString || "").trim().replace(/\s+/g, ""));
    if (bin.length !== 64) return null;
    const out = new Uint8Array(64);
    for (let i = 0; i < 64; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (e) {
    return null;
  }
}
async function buildEd25519Jwt(seed, pub, apiKeyId, method, host, path) {
  const jwk = { kty: "OKP", crv: "Ed25519", d: b64urlEncode(seed), x: b64urlEncode(pub) };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "EdDSA", kid: apiKeyId, typ: "JWT", nonce: randomHex32() };
  const claims = { sub: apiKeyId, iss: "cdp", uris: [`${method} ${host}${path}`], iat: now, nbf: now, exp: now + 120 };
  const unsigned = b64urlEncode(te(JSON.stringify(header))) + "." + b64urlEncode(te(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, te(unsigned)));
  return unsigned + "." + b64urlEncode(sig);
}
async function buildApiJwt(apiKeyId, apiKeySecret, method, host, path) {
  // 1 — Ed25519 key (current CDP Portal format: base64 of 64 bytes seed||public)
  const ed = ed25519SecretBytes(apiKeySecret);
  if (ed) return buildEd25519Jwt(ed.subarray(0, 32), ed.subarray(32), apiKeyId, method, host, path);
  // 2 — legacy EC (P-256) key in PEM or base64 DER
  const key = await importEcPrivateKey(apiKeySecret);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: apiKeyId, typ: "JWT", nonce: randomHex32() };
  const claims = { sub: apiKeyId, iss: "cdp", uris: [`${method} ${host}${path}`], iat: now, nbf: now, exp: now + 120 };
  const unsigned = b64urlEncode(te(JSON.stringify(header))) + "." + b64urlEncode(te(JSON.stringify(claims)));
  return unsigned + "." + (await es256Sign(key, unsigned));
}
async function buildWalletJwt(walletSecret, method, host, path, body) {
  const key = await importEcPrivateKey(walletSecret);
  const now = Math.floor(Date.now() / 1000);
  const claims = { uris: [`${method} ${host}${path}`], iat: now, nbf: now, jti: randomHex32() };
  if (body && typeof body === "object" && Object.keys(body).length > 0) {
    claims.reqHash = await sha256Hex(te(JSON.stringify(sortKeysDeep(body))));
  }
  const header = { alg: "ES256", typ: "JWT" };
  const unsigned = b64urlEncode(te(JSON.stringify(header))) + "." + b64urlEncode(te(JSON.stringify(claims)));
  return unsigned + "." + (await es256Sign(key, unsigned));
}

// ————————————————————————————————————————————
// CDP REST client
// ————————————————————————————————————————————
async function cdpRequest(env, method, path, body, evidence, stepName) {
  if (!env.CDP_API_KEY_ID || !env.CDP_API_SECRET) {
    return { ok: false, status: 503, error: "CDP_NOT_CONFIGURED — CDP_API_KEY_ID / CDP_API_SECRET are not set in the Cloudflare dashboard (Settings → Variables and Secrets)." };
  }
  const headers = { "content-type": "application/json", accept: "application/json" };
  try {
    headers["Authorization"] = "Bearer " + (await buildApiJwt(env.CDP_API_KEY_ID, env.CDP_API_SECRET, method, CDP_HOST, path));
    // Wallet auth is required for the account-create POSTs — the SDK sends it
    // for POST/DELETE on /v2/evm/accounts endpoints; sent here too whenever the
    // secret exists (harmless on GETs).
    if (method === "POST" && env.CDP_WALLET_SECRET) {
      headers["X-Wallet-Auth"] = await buildWalletJwt(env.CDP_WALLET_SECRET, method, CDP_HOST, path, body || {});
    }
  } catch (e) {
    return { ok: false, status: 500, error: "JWT_BUILD_FAILED — the CDP_API_SECRET / CDP_WALLET_SECRET value could not be parsed as an EC key: " + String((e && e.message) || e).slice(0, 120) };
  }
  let res;
  try {
    res = await fetch(`https://${CDP_HOST}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    evidence.push({ check: stepName, pass: false, value: "network error: " + String((e && e.message) || e).slice(0, 140), source: "Coinbase CDP API" });
    return { ok: false, status: 0, error: "CDP_UNREACHABLE" };
  }
  let json = null;
  try { json = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const detail = (json && (json.error || json.message || json.code)) || ("HTTP " + res.status);
    // 404 = "not found" is a normal answer for by-name lookups — not an error step.
    if (res.status !== 404) evidence.push({ check: stepName, pass: false, value: String(detail).slice(0, 160), source: "Coinbase CDP API" });
    return { ok: false, status: res.status, error: String(detail), json };
  }
  return { ok: true, status: res.status, json };
}

// Deterministic account name — same user id resolves the SAME name forever,
// so a retry get-or-creates the SAME accounts (CDP names: a-z0-9 hyphens, ≤36).
function accountNameFor(userId) {
  const clean = String(userId || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const name = "crix-u-" + clean.slice(0, 28);
  return name.length >= 2 && name.length <= 36 ? name : null;
}

async function getOrCreateCdpAccounts(env, userId, allowCreate) {
  const evidence = [];
  const name = accountNameFor(userId);
  if (!name) return { error: "INVALID_USER_ID — a user id is required to derive the deterministic account name." };
  if (!env.CDP_WALLET_SECRET && allowCreate) {
    evidence.push({ check: "cdp_wallet_secret", pass: false, value: "NOT_SET — existing accounts can be looked up, but FIRST-TIME creation needs CDP_WALLET_SECRET (create it in the CDP Portal alongside your API key).", source: "Cloudflare secret" });
  }

  // 1 — EOA by name
  let eoa = null;
  let get = await cdpRequest(env, "GET", EOA_BY_NAME(name), null, evidence, "eoa_lookup");
  if (get.ok) {
    eoa = { address: get.json.address || (get.json.account && get.json.account.address) || "", name: get.json.name || name };
    evidence.push({ check: "eoa_resolved_by_name", pass: !!eoa.address, value: eoa.address || "no address in response", source: "Coinbase CDP API" });
  } else if (get.status === 404 && allowCreate) {
    if (!env.CDP_WALLET_SECRET) return { error: "EOA_NOT_FOUND_AND_WALLET_SECRET_MISSING — this user has no CDP account yet and first-time creation requires CDP_WALLET_SECRET. Create it in the CDP Portal (API keys page) and set it in the Cloudflare dashboard.", evidence };
    const created = await cdpRequest(env, "POST", EOA_CREATE, { name }, evidence, "eoa_create");
    if (!created.ok) return { error: "EOA_CREATE_FAILED — " + created.error, evidence };
    eoa = { address: created.json.address || "", name: created.json.name || name };
    evidence.push({ check: "eoa_created", pass: !!eoa.address, value: eoa.address, source: "Coinbase CDP API (owner-signed by CDP TEE — private key never leaves Coinbase)" });
  } else if (get.status !== 404) {
    return { error: "EOA_LOOKUP_FAILED — " + (get.error || "CDP API error"), evidence };
  } else {
    // 404, create not allowed (status endpoint)
    evidence.push({ check: "eoa_lookup", pass: true, value: "NOT_FOUND — no CDP account exists for this user yet", source: "Coinbase CDP API" });
  }
  if (eoa && !eoa.address) return { error: "EOA_ADDRESS_MISSING — CDP answered without an address", evidence };

  // 2 — Smart account by name (address is CREATE2-deterministic: known before deployment, permanent)
  let smart = null;
  let sget = await cdpRequest(env, "GET", SMART_BY_NAME(name), null, evidence, "smart_lookup");
  if (sget.ok) {
    smart = { address: sget.json.address || "", name: sget.json.name || name, owner: sget.json.owner || "" };
    evidence.push({ check: "smart_account_resolved_by_name", pass: !!smart.address, value: smart.address, source: "Coinbase CDP API" });
  } else if (sget.status === 404 && allowCreate && eoa) {
    if (!env.CDP_WALLET_SECRET) return { error: "SMART_ACCOUNT_NOT_FOUND_AND_WALLET_SECRET_MISSING — the owner EOA exists, but creating its smart account requires CDP_WALLET_SECRET.", evidence };
    const created = await cdpRequest(env, "POST", SMART_CREATE, { name, owner: eoa.address }, evidence, "smart_create");
    if (!created.ok) return { error: "SMART_ACCOUNT_CREATE_FAILED — " + created.error, evidence };
    smart = { address: created.json.address || "", name: created.json.name || name, owner: eoa.address };
    evidence.push({ check: "smart_account_created", pass: !!smart.address, value: smart.address, source: "Coinbase CDP API" });
  } else if (sget.status !== 404) {
    return { error: "SMART_ACCOUNT_LOOKUP_FAILED — " + (sget.error || "CDP API error"), evidence };
  }

  return {
    account_name: name,
    owner_address: eoa ? eoa.address : "",
    account_address: smart ? smart.address : "",
    smart_account_exists: !!smart,
    eoa_exists: !!eoa,
    network: "base",
    chain_id: BASE_MAINNET_CHAIN_ID,
    evidence,
  };
}

// ————————————————————————————————————————————
// Alchemy + public RPC chain reads
// ————————————————————————————————————————————
async function rpcRead(url, method, params) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
    const body = await res.json();
    if (body && body.error) return { ok: false, error: "RPC error: " + JSON.stringify(body.error).slice(0, 160) };
    return { ok: true, result: body.result };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 160) };
  }
}

async function handleAlchemyRead(env, body) {
  const evidence = [];
  const method = String(body.method || "");
  const params = Array.isArray(body.params) ? body.params : [];
  if (!READ_ONLY_METHODS.has(method)) {
    return { status: 403, data: { error: "METHOD_NOT_ALLOWED — this engine forwards read-only chain queries only." } };
  }
  const via = [];
  if (env.BASE_RPC_URL) {
    // Private GetBlock Base Mainnet endpoint — tried FIRST (20 RPS). The access
    // token never enters evidence: only "answered by private GetBlock endpoint"
    // is recorded, never the URL.
    const r = await rpcRead(String(env.BASE_RPC_URL).trim(), method, params);
    if (r.ok) {
      evidence.push({ check: "getblock_base_mainnet_read", pass: true, value: "answered by private GetBlock Base Mainnet endpoint", source: "GetBlock" });
      return { status: 200, data: { ok: true, method, result: r.result, via: "getblock", evidence } };
    }
    evidence.push({ check: "getblock_base_mainnet_read", pass: false, value: r.error, source: "GetBlock" });
    via.push("getblock failed");
  } else {
    evidence.push({ check: "getblock_base_mainnet_read", pass: false, value: "NOT_CONFIGURED — BASE_RPC_URL not set; Alchemy/public endpoints used instead", source: "Cloudflare secret" });
  }
  if (env.ALCHEMY_API_KEY) {
    const r = await rpcRead(ALCHEMY_BASE + env.ALCHEMY_API_KEY, method, params);
    if (r.ok) {
      evidence.push({ check: "alchemy_base_mainnet_read", pass: true, value: "answered by Alchemy Base Mainnet endpoint", source: "Alchemy" });
      return { status: 200, data: { ok: true, method, result: r.result, via: "alchemy", evidence } };
    }
    evidence.push({ check: "alchemy_base_mainnet_read", pass: false, value: r.error, source: "Alchemy" });
    via.push("alchemy failed");
  } else {
    evidence.push({ check: "alchemy_key", pass: false, value: "NOT_CONFIGURED — ALCHEMY_API_KEY not set; public Base RPC used instead", source: "Cloudflare secret" });
  }
  for (const url of PUBLIC_MAINNET_RPC) {
    const r = await rpcRead(url, method, params);
    if (r.ok) {
      evidence.push({ check: "public_base_mainnet_read", pass: true, value: "answered by " + new URL(url).host, source: "public Base Mainnet RPC" });
      return { status: 200, data: { ok: true, method, result: r.result, via: "public", evidence } };
    }
  }
  evidence.push({ check: "chain_read", pass: false, value: "all endpoints failed", source: "Alchemy + public Base RPC" });
  return { status: 502, data: { error: "RPC_UNAVAILABLE — every chain endpoint failed for this query.", evidence } };
}

// ————————————————————————————————————————————
// AA provider health probes
// ————————————————————————————————————————————
async function handleAaHealth(env) {
  const evidence = [];
  const providers = {};

  if (env.ALCHEMY_ACCOUNTS_API_KEY) {
    const url = ALCHEMY_BASE + env.ALCHEMY_ACCOUNTS_API_KEY;
    const eps = await rpcRead(url, "eth_supportedEntryPoints", []);
    const pass = eps.ok && Array.isArray(eps.result) && eps.result.length > 0;
    evidence.push({ check: "alchemy_bundler_base_mainnet", pass: !!pass, value: pass ? "entry points: " + eps.result.join(", ") : (eps.error || "no entry points"), source: "Alchemy Account Kit live bundler" });
    providers.alchemy = pass ? "VERIFIED" : "FAILED";
    if (env.ALCHEMY_GAS_POLICY_ID) {
      evidence.push({ check: "alchemy_gas_policy", pass: true, value: "gas policy id configured (paymaster sponsorship ready)", source: "Cloudflare secret" });
    } else {
      evidence.push({ check: "alchemy_gas_policy", pass: false, value: "NOT_CONFIGURED — ALCHEMY_GAS_POLICY_ID not set (create a Gas Manager policy in the Alchemy dashboard for Base Mainnet)", source: "Cloudflare secret" });
    }
  } else {
    evidence.push({ check: "alchemy_bundler_base_mainnet", pass: false, value: "NOT_CONFIGURED — ALCHEMY_ACCOUNTS_API_KEY not set in the Cloudflare dashboard", source: "Cloudflare secret" });
    providers.alchemy = "NOT_CONFIGURED";
  }

  if (env.PIMLICO_API_KEY) {
    const url = "https://api.pimlico.io/v2/base/rpc?apikey=" + env.PIMLICO_API_KEY;
    const eps = await rpcRead(url, "eth_supportedEntryPoints", []);
    const pass = eps.ok && Array.isArray(eps.result) && eps.result.length > 0;
    evidence.push({ check: "pimlico_bundler_base_mainnet", pass: !!pass, value: pass ? "entry points: " + eps.result.join(", ") : (eps.error || "probe failed"), source: "Pimlico live bundler" });
    providers.pimlico = pass ? "VERIFIED" : "FAILED";
  } else {
    evidence.push({ check: "pimlico_bundler_base_mainnet", pass: false, value: "NOT_CONFIGURED", source: "Cloudflare secret" });
    providers.pimlico = "NOT_CONFIGURED";
  }

  if (env.CDP_PAYMASTER_URL) {
    const eps = await rpcRead(env.CDP_PAYMASTER_URL, "eth_supportedEntryPoints", []);
    const pass = eps.ok && Array.isArray(eps.result) && eps.result.length > 0;
    evidence.push({ check: "cdp_paymaster_base_mainnet", pass: !!pass, value: pass ? "entry points: " + eps.result.join(", ") : (eps.error || "probe failed"), source: "CDP paymaster live RPC" });
    providers.cdp = pass ? "VERIFIED" : "FAILED";
  } else {
    evidence.push({ check: "cdp_paymaster_base_mainnet", pass: false, value: "NOT_CONFIGURED", source: "Cloudflare secret" });
    providers.cdp = "NOT_CONFIGURED";
  }

  return {
    status: 200,
    data: {
      ok: true,
      providers,
      evidence,
      transfer_gate: "PAUSED — on-chain transfers stay PAUSED on the platform side; this engine has no endpoint that can move funds or sign anything, by design.",
      address_creation: "CDP get-or-create only, idempotent by deterministic per-user name — a retry resolves the SAME accounts and can never create a second wallet.",
    },
  };
}

// ————————————————————————————————————————————
// Routing, auth, spec
// ————————————————————————————————————————————
const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "CRIXCOIN Account Engine",
    version: "1.0.0",
    description: "CDP smart-account provisioning (get-or-create, idempotent by name) + Alchemy-backed read-only chain queries + AA provider health. No fund movement, no signing, no userOp submission, no database access — by design.",
  },
  servers: [{ url: "/", description: "This Worker" }],
  paths: {
    "/openapi.json": { get: { summary: "This OpenAPI specification", responses: { "200": { description: "The spec JSON" } } } },
    "/cdp/account": {
      post: {
        summary: "Get-or-create the user's CDP EOA + smart account on Base (idempotent by user id)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["user_id"], properties: { user_id: { type: "string" } } } } } },
        responses: { "200": { description: "Real addresses + evidence" }, "503": { description: "CDP not configured / wallet secret missing" } },
      },
    },
    "/cdp/account-status": {
      post: {
        summary: "Read-only by-name lookup of the user's CDP accounts (no wallet secret needed)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["user_id"], properties: { user_id: { type: "string" } } } } } },
        responses: { "200": { description: "Honest existence state + evidence" } },
      },
    },
    "/alchemy/read": {
      post: {
        summary: "Whitelisted read-only Base Mainnet chain query (Alchemy first, public RPC fallback)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["method"], properties: { method: { type: "string" }, params: { type: "array" } } } } } },
        responses: { "200": { description: "Live RPC result with evidence" }, "403": { description: "Method not whitelisted" } },
      },
    },
    "/aa-health": {
      post: {
        summary: "Provider health probes — Alchemy bundler + gas policy, Pimlico, CDP paymaster",
        requestBody: { required: false, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Per-provider honest states with evidence" } },
      },
    },
  },
};

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
  if (!expected) return { ok: false, reason: "Worker not configured — BACKEND_API_SECRET is not set in the Cloudflare dashboard (Settings → Variables and Secrets). Nothing was executed." };
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || token !== expected) return { ok: false, reason: "Unauthorized — the shared secret did not match." };
  return { ok: true };
}

async function readBody(request) {
  try { return (await request.json()) || {}; } catch (e) { return {}; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "*";
    if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
    if (url.pathname === "/openapi.json") return json(OPENAPI_SPEC, 200, origin);

    const auth = authorized(request, env);
    if (!auth.ok) return json({ error: "UNAUTHORIZED — " + auth.reason }, 401, origin);

    if (request.method !== "POST") return json({ error: "NOT_FOUND — use POST for engine operations" }, 404, origin);

    if (url.pathname === "/aa-health") {
      const r = await handleAaHealth(env);
      return json(r.data, r.status, origin);
    }
    if (url.pathname === "/alchemy/read") {
      const body = await readBody(request);
      const r = await handleAlchemyRead(env, body);
      return json(r.data, r.status, origin);
    }
    if (url.pathname === "/cdp/account") {
      const body = await readBody(request);
      if (!body.user_id) return json({ error: "user_id is required — the deterministic account name is derived from it." }, 400, origin);
      const r = await getOrCreateCdpAccounts(env, body.user_id, true);
      if (r.error) return json({ error: r.error, evidence: r.evidence || [] }, 503, origin);
      return json({ ok: true, ...r }, 200, origin);
    }
    if (url.pathname === "/cdp/account-status") {
      const body = await readBody(request);
      if (!body.user_id) return json({ error: "user_id is required." }, 400, origin);
      const r = await getOrCreateCdpAccounts(env, body.user_id, false);
      if (r.error) return json({ error: r.error, evidence: r.evidence || [] }, 503, origin);
      return json({ ok: true, ...r }, 200, origin);
    }
    return json({ error: "NOT_FOUND" }, 404, origin);
  },
};