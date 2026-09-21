// PURE WEB-CRYPTO CDP REST CLIENT — no SDK, on purpose.
// The @coinbase/cdp-sdk npm bundle cannot be built by the Base44 deploy
// pipeline, so every CDP operation here is implemented directly against the
// official Coinbase Developer Platform REST API (api.cdp.coinbase.com/platform/v2)
// using only Web Crypto — exactly the approach already proven in
// src/workers/crxs-account-engine.js. Server-side only; credential values and
// key material never leave this module, and evidence never contains secrets.

import { secrets } from "base44:runtime";

const CDP_HOST = "api.cdp.coinbase.com";
const CDP_BASE = "/platform/v2";
const EOA_BY_NAME = (name) => CDP_BASE + "/evm/accounts/by-name/" + encodeURIComponent(name);
const EOA_CREATE = CDP_BASE + "/evm/accounts";
const SMART_BY_NAME = (name) => CDP_BASE + "/evm/smart-accounts/by-name/" + encodeURIComponent(name);
const SMART_CREATE = CDP_BASE + "/evm/smart-accounts";

export const CDP_NETWORK = "base";
export const CDP_CHAIN_ID = 8453;

export function readCdpSecret(name) {
  try {
    return secrets.get(name) || null;
  } catch (error) {
    return null;
  }
}

// Credentials needed to CREATE accounts. By-name LOOKUPS need only the API key
// pair — CDP_WALLET_SECRET is required only for FIRST-TIME creation.
export function readCdpCreationCredentials() {
  const missing = [];
  const apiKeyId = readCdpSecret("CDP_API_KEY_ID");
  if (!apiKeyId) missing.push("CDP_API_KEY_ID");
  const apiKeySecret = readCdpSecret("CDP_API_SECRET");
  if (!apiKeySecret) missing.push("CDP_API_SECRET");
  const walletSecret = readCdpSecret("CDP_WALLET_SECRET");
  if (!walletSecret) missing.push("CDP_WALLET_SECRET (create it alongside the CDP API key in the CDP Portal — required only for FIRST-TIME account creation; existing accounts are looked up without it)");
  return { apiKeyId, apiKeySecret, walletSecret, missing };
}

// ————————————————————————————————————————
// base64url / hex helpers
// ————————————————————————————————————————
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

// ————————————————————————————————————————
// EC private key import — accepts every format the CDP Portal can give:
//   · PEM PKCS8  ("-----BEGIN PRIVATE KEY-----")
//   · PEM SEC1   ("-----BEGIN EC PRIVATE KEY-----") — converted to PKCS8
//   · base64 DER (raw PKCS8 or SEC1)
// Pure Web Crypto afterwards — nothing to bundle.
// ————————————————————————————————————————
function stripPem(pem) {
  const body = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function isSec1(der) {
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
    const bin = atob(s.replace(/\s+/g, ""));
    der = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
    if (isSec1(der)) der = sec1ToPkcs8(der);
  }
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

// ————————————————————————————————————————
// JWT builders — byte-compatible with the CDP SDK auth module:
//   API key JWT  — header {alg ES256, kid, typ JWT, nonce}, claims
//                  {sub, iss:"cdp", uris:["METHOD host path"], iat, nbf, exp}
//   Wallet JWT   — header {alg ES256, typ JWT}, claims {uris, reqHash?, iat, nbf, jti}
// ————————————————————————————————————————
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
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, te(unsigned));
  return b64urlEncode(sig);
}
// Ed25519 (EdDSA) API keys — the CURRENT CDP Portal format: base64 of exactly
// 64 bytes = seed(32) || public(32). The SDK detects the key type the same way
// (base64 → 64 bytes = Ed25519) and signs EdDSA JWTs with it. Verified live
// against api.cdp.coinbase.com: the EdDSA JWT authenticates, ES256 does not.
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
async function buildEd25519Jwt(seed, pub, apiKeyId, method, path) {
  const jwk = { kty: "OKP", crv: "Ed25519", d: b64urlEncode(seed), x: b64urlEncode(pub) };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "EdDSA", kid: apiKeyId, typ: "JWT", nonce: randomHex32() };
  const claims = { sub: apiKeyId, iss: "cdp", uris: [method + " " + CDP_HOST + path], iat: now, nbf: now, exp: now + 120 };
  const unsigned = b64urlEncode(te(JSON.stringify(header))) + "." + b64urlEncode(te(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, te(unsigned)));
  return unsigned + "." + b64urlEncode(sig);
}
async function buildApiJwt(apiKeyId, apiKeySecret, method, path) {
  // 1 — Ed25519 key (current CDP Portal format: base64 of 64 bytes seed||public)
  const ed = ed25519SecretBytes(apiKeySecret);
  if (ed) return buildEd25519Jwt(ed.subarray(0, 32), ed.subarray(32), apiKeyId, method, path);
  // 2 — legacy EC (P-256) key in PEM or base64 DER
  const key = await importEcPrivateKey(apiKeySecret);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: apiKeyId, typ: "JWT", nonce: randomHex32() };
  const claims = { sub: apiKeyId, iss: "cdp", uris: [method + " " + CDP_HOST + path], iat: now, nbf: now, exp: now + 120 };
  const unsigned = b64urlEncode(te(JSON.stringify(header))) + "." + b64urlEncode(te(JSON.stringify(claims)));
  return unsigned + "." + (await es256Sign(key, unsigned));
}
async function buildWalletJwt(walletSecret, method, path, body) {
  const key = await importEcPrivateKey(walletSecret);
  const now = Math.floor(Date.now() / 1000);
  const claims = { uris: [method + " " + CDP_HOST + path], iat: now, nbf: now, jti: randomHex32() };
  if (body && typeof body === "object" && Object.keys(body).length > 0) {
    claims.reqHash = await sha256Hex(te(JSON.stringify(sortKeysDeep(body))));
  }
  const header = { alg: "ES256", typ: "JWT" };
  const unsigned = b64urlEncode(te(JSON.stringify(header))) + "." + b64urlEncode(te(JSON.stringify(claims)));
  return unsigned + "." + (await es256Sign(key, unsigned));
}

// ————————————————————————————————————————
// CDP REST request with both auth layers
// ————————————————————————————————————————
async function cdpRequest(creds, method, path, body, evidence, stepName) {
  if (!creds.apiKeyId || !creds.apiKeySecret) {
    return { ok: false, status: 503, error: "CDP_NOT_CONFIGURED — CDP_API_KEY_ID / CDP_API_SECRET are not set in the app secrets." };
  }
  const headers = { "content-type": "application/json", accept: "application/json" };
  try {
    headers["Authorization"] = "Bearer " + (await buildApiJwt(creds.apiKeyId, creds.apiKeySecret, method, path));
    // Wallet auth is required for the account-create POSTs; harmless elsewhere.
    if (method === "POST" && creds.walletSecret) {
      headers["X-Wallet-Auth"] = await buildWalletJwt(creds.walletSecret, method, path, body || {});
    }
  } catch (e) {
    return { ok: false, status: 500, error: "JWT_BUILD_FAILED — the CDP_API_SECRET / CDP_WALLET_SECRET value could not be parsed as an EC key: " + String((e && e.message) || e).slice(0, 120) };
  }
  let res;
  try {
    res = await fetch("https://" + CDP_HOST + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    evidence.push({ check: stepName, pass: false, value: "network error: " + String((e && e.message) || e).slice(0, 140), source: "Coinbase CDP API" });
    return { ok: false, status: 0, error: "CDP_UNREACHABLE" };
  }
  let json = null;
  try { json = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const detail = (json && (json.error || json.message || json.code)) || ("HTTP " + res.status);
    if (res.status !== 404) evidence.push({ check: stepName, pass: false, value: String(detail).slice(0, 160), source: "Coinbase CDP API" });
    return { ok: false, status: res.status, error: String(detail), json };
  }
  return { ok: true, status: res.status, json };
}

// Deterministic, valid CDP names (a-z0-9 hyphens, ≤36 chars) derived from the
// user id — the SAME names forever, so a retry get-or-creates the SAME
// accounts and a duplicate can never create a second wallet.
export function cdpNamesFor(userId) {
  const clean = String(userId || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return { eoa: "crix-eoa-" + clean.slice(0, 27), smart: "crix-sa-" + clean.slice(0, 29) };
}

// GET-OR-CREATE one unique EOA owner + its one smart account on Base —
// idempotent by deterministic names. allowCreate=false turns this into a pure
// read-only lookup (no wallet secret needed). No funds ever move here.
export async function cdpGetOrCreateAccounts(creds, eoaName, smartName, allowCreate) {
  const evidence = [];
  if (!eoaName || !smartName) return { error: "INVALID_USER_ID — a user id is required to derive the deterministic account names." };

  // 1 — owner EOA by name
  let eoa = null;
  const get = await cdpRequest(creds, "GET", EOA_BY_NAME(eoaName), null, evidence, "eoa_lookup");
  if (get.ok) {
    eoa = { address: get.json.address || (get.json.account && get.json.account.address) || "", name: get.json.name || eoaName };
    evidence.push({ check: "eoa_resolved_by_name", pass: !!eoa.address, value: eoa.address || "no address in response", source: "Coinbase CDP API" });
  } else if (get.status === 404 && allowCreate) {
    if (!creds.walletSecret) return { error: "EOA_NOT_FOUND_AND_WALLET_SECRET_MISSING — this user has no CDP account yet and first-time creation requires CDP_WALLET_SECRET.", evidence };
    const created = await cdpRequest(creds, "POST", EOA_CREATE, { name: eoaName }, evidence, "eoa_create");
    if (!created.ok) return { error: "EOA_CREATE_FAILED — " + created.error, evidence };
    eoa = { address: created.json.address || "", name: created.json.name || eoaName };
    evidence.push({ check: "eoa_created", pass: !!eoa.address, value: eoa.address, source: "Coinbase CDP API (key material never leaves Coinbase)" });
  } else if (get.status !== 404) {
    return { error: "EOA_LOOKUP_FAILED — " + (get.error || "CDP API error"), evidence };
  } else {
    evidence.push({ check: "eoa_lookup", pass: true, value: "NOT_FOUND — no CDP account exists for this user yet", source: "Coinbase CDP API" });
  }
  if (eoa && !eoa.address) return { error: "EOA_ADDRESS_MISSING — CDP answered without an address", evidence };

  // 2 — smart account by name (address is CREATE2-deterministic: known before deployment, permanent)
  let smart = null;
  const sget = await cdpRequest(creds, "GET", SMART_BY_NAME(smartName), null, evidence, "smart_lookup");
  if (sget.ok) {
    smart = { address: sget.json.address || "", name: sget.json.name || smartName, owner: sget.json.owner || "" };
    evidence.push({ check: "smart_account_resolved_by_name", pass: !!smart.address, value: smart.address, source: "Coinbase CDP API" });
  } else if (sget.status === 404 && allowCreate && eoa) {
    if (!creds.walletSecret) return { error: "SMART_ACCOUNT_NOT_FOUND_AND_WALLET_SECRET_MISSING — the owner EOA exists, but creating its smart account requires CDP_WALLET_SECRET.", evidence };
    const created = await cdpRequest(creds, "POST", SMART_CREATE, { name: smartName, owner: eoa.address }, evidence, "smart_create");
    if (!created.ok) return { error: "SMART_ACCOUNT_CREATE_FAILED — " + created.error, evidence };
    smart = { address: created.json.address || "", name: created.json.name || smartName, owner: eoa.address };
    evidence.push({ check: "smart_account_created", pass: !!smart.address, value: smart.address, source: "Coinbase CDP API" });
  } else if (sget.status !== 404) {
    return { error: "SMART_ACCOUNT_LOOKUP_FAILED — " + (sget.error || "CDP API error"), evidence };
  } else {
    evidence.push({ check: "smart_lookup", pass: true, value: "NOT_FOUND — no smart account exists for this user yet", source: "Coinbase CDP API" });
  }

  return {
    account_name: smartName,
    owner_address: eoa ? eoa.address : "",
    account_address: smart ? smart.address : "",
    smart_account_exists: !!smart,
    eoa_exists: !!eoa,
    network: CDP_NETWORK,
    chain_id: CDP_CHAIN_ID,
    evidence,
  };
}