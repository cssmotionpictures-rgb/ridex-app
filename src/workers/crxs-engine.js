/**
 * CRIXCOIN ENGINE — browser-deployed Cloudflare Worker. READ-ONLY STAGE.
 * Deploy from https://workers.cloudflare.com/playground (no CLI, no terminal):
 * paste this file, click Deploy, claim the Worker, then set the secret listed
 * in src/workers/SETUP.md. Register it in Base44 (Settings → Integrations →
 * New Integration → From URL → https://<your-worker>/openapi.json, slug
 * "crxs-engine", header Authorization: Bearer <BACKEND_API_SECRET>).
 *
 * DUAL-RAIL ARCHITECTURE — this engine serves the DIAGNOSTIC/READ-ONLY layer
 * of the Base-primary + Solana-controlled-fallback architecture. The
 * authoritative ledger, routing, risk, pause and settlement authority stay
 * on the Base44 platform backend. This Worker is never a second
 * money-movement executor.
 *
 * ENDPOINT CAPABILITY AUDIT (this stage, deliberately):
 *   PRESENT (all read-only):
 *     GET  /openapi.json                — this spec
 *     GET  /health                      — engine + rail summary (honest states)
 *     GET  /chain/base                  — Base Mainnet chain id, latest block
 *     GET  /chain/solana                — Solana slot, block height
 *     GET  /crixcoin/deployment         — contract code check (?address=0x…)
 *     GET  /crixcoin/balance/{address}  — CRXS balance read (?contract=0x…)
 *     GET  /crixcoin/transaction/{hash} — Base Mainnet receipt read
 *     GET  /solana/token/{address}     — SPL token accounts read (?mint=…)
 *     POST /aa-health                   — provider health probes (read-only)
 *     POST /chain-read                  — whitelisted read-only EVM RPC
 *   CONFIRMED ABSENT — there is NO endpoint that can:
 *     - transfer or send CRXS/CRIX (or any asset)
 *     - withdraw, pay bills, bridge or convert anything
 *     - sign a transaction or a UserOperation
 *     - submit to a paymaster or bundler (no pm_* / eth_sendUserOperation)
 *     - create/mint tokens, or touch private keys or wallets of any kind
 *     - mutate any app record (this Worker has NO database access)
 *     - override or disable the platform emergency pause
 *
 * SECRETS THIS WORKER USES (complete list, nothing else is read):
 *   BACKEND_API_SECRET   REQUIRED — shared secret matching the Base44 integration header
 *   PIMLICO_API_KEY      OPTIONAL — only enables the Pimlico read-only health probe
 *   CDP_PAYMASTER_URL    OPTIONAL — only enables the CDP paymaster read-only health probe
 *   SOLANA_RPC_URL       OPTIONAL — read-only Solana RPC (defaults to the public mainnet RPC)
 *   NO CDP credential (key id / secret / wallet secret) is required or used.
 *   Missing optional secrets report NOT_CONFIGURED honestly — never crash.
 */

const SEPOLIA_RPC = ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"];
const MAINNET_RPC = ["https://mainnet.base.org", "https://base-rpc.publicnode.com"];
const SOLANA_RPC_DEFAULT = "https://api.mainnet-beta.solana.com";
const BASE_MAINNET_CHAIN_ID = 8453;

// The ONLY EVM RPC methods this engine will ever forward — strictly read-only.
const READ_ONLY_METHODS = new Set([
  "eth_chainId", "eth_blockNumber", "eth_getBalance", "eth_getCode",
  "eth_getTransactionCount", "eth_getTransactionReceipt",
  "eth_getTransactionByHash", "eth_call", "eth_estimateGas",
]);

// The ONLY Solana RPC methods this engine will ever forward — strictly
// read-only (no sendTransaction, no sendSignedTransaction, no airdrop).
const SOLANA_READ_METHODS = new Set([
  "getSlot", "getBlockHeight", "getBalance", "getAccountInfo",
  "getTokenAccountsByOwner", "getSignatureStatuses", "getTransaction",
  "getTokenSupply", "getEpochInfo",
]);

function json(data, status = 200, origin) {
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
  if (!token || token !== expected) return { ok: false, reason: "Unauthorized — the shared secret did not match. Requests are accepted only through the registered Base44 integration (its header is stored server-side and never reaches the browser)." };
  return { ok: true };
}

async function rpcRead(endpoints, method, params) {
  let lastError = "";
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const body = await res.json();
      if (body && body.error) { lastError = "RPC error: " + JSON.stringify(body.error).slice(0, 200); continue; }
      return { ok: true, result: body.result, endpoint: url };
    } catch (e) { lastError = String((e && e.message) || e).slice(0, 200); }
  }
  return { ok: false, error: lastError };
}

async function solanaRead(env, method, params) {
  if (!SOLANA_READ_METHODS.has(method)) return { ok: false, error: "METHOD_NOT_ALLOWED — this engine forwards read-only Solana queries only." };
  const url = env.SOLANA_RPC_URL || SOLANA_RPC_DEFAULT;
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const body = await res.json();
    if (body && body.error) return { ok: false, error: "Solana RPC error: " + JSON.stringify(body.error).slice(0, 200) };
    return { ok: true, result: body.result, endpoint: url };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
}

function isEvmAddress(a) { return /^0x[a-fA-F0-9]{40}$/.test(a || ""); }
function isTxHash(h) { return /^0x[a-fA-F0-9]{64}$/.test(h || ""); }
function isSolanaAddress(a) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a || ""); }

async function readBody(request) {
  try { return await request.json() || {}; } catch (e) { return {}; }
}

async function handleChainRead(request, env, origin) {
  const body = await readBody(request);
  const chain = body.chain === "mainnet" ? "mainnet" : "sepolia";
  const method = String(body.method || "");
  const params = Array.isArray(body.params) ? body.params : [];
  if (!READ_ONLY_METHODS.has(method)) {
    return json({ error: "METHOD_NOT_ALLOWED — this engine forwards read-only chain queries only. Nothing that can mutate chain state is accepted." }, 403, origin);
  }
  const endpoints = chain === "mainnet" ? MAINNET_RPC : SEPOLIA_RPC;
  const rpc = await rpcRead(endpoints, method, params);
  const evidence = [{ check: "rpc_read", method, chain, pass: rpc.ok, value: rpc.ok ? "answered by " + rpc.endpoint : rpc.error, source: "public " + (chain === "mainnet" ? "Base Mainnet" : "Base Sepolia") + " RPC" }];
  if (!rpc.ok) return json({ error: "RPC_UNAVAILABLE — " + rpc.error, evidence }, 502, origin);
  return json({ ok: true, chain, method, result: rpc.result, evidence }, 200, origin);
}

async function handleAaHealth(request, env, origin) {
  const evidence = [];
  const providers = {};

  if (!env.PIMLICO_API_KEY) {
    evidence.push({ check: "pimlico", pass: false, value: "NOT_CONFIGURED — PIMLICO_API_KEY secret not set in the Cloudflare dashboard" });
    providers.pimlico = "NOT_CONFIGURED";
  } else {
    const url = "https://api.pimlico.io/v2/base/rpc?apikey=" + env.PIMLICO_API_KEY;
    const chain = await rpcRead([url], "eth_chainId", []);
    const eps = chain.ok ? await rpcRead([url], "eth_supportedEntryPoints", []) : { ok: false };
    const pass = chain.ok && parseInt(chain.result, 16) === BASE_MAINNET_CHAIN_ID && eps.ok && Array.isArray(eps.result) && eps.result.length > 0;
    evidence.push({ check: "pimlico_bundler_base_mainnet", pass: !!pass, value: pass ? "chain 8453 live, entry points: " + eps.result.join(", ") : "probe failed", source: "Pimlico live RPC" });
    providers.pimlico = pass ? "VERIFIED" : "FAILED";
  }

  if (!env.CDP_PAYMASTER_URL) {
    evidence.push({ check: "cdp_paymaster", pass: false, value: "NOT_CONFIGURED — CDP_PAYMASTER_URL secret not set in the Cloudflare dashboard" });
    providers.cdp = "NOT_CONFIGURED";
  } else {
    const chain = await rpcRead([env.CDP_PAYMASTER_URL], "eth_chainId", []);
    const eps = chain.ok ? await rpcRead([env.CDP_PAYMASTER_URL], "eth_supportedEntryPoints", []) : { ok: false };
    const pass = chain.ok && parseInt(chain.result, 16) === BASE_MAINNET_CHAIN_ID && eps.ok && Array.isArray(eps.result) && eps.result.length > 0;
    evidence.push({ check: "cdp_paymaster_base_mainnet", pass: !!pass, value: pass ? "chain 8453 live, entry points: " + eps.result.join(", ") : "probe failed", source: "CDP paymaster live RPC" });
    providers.cdp = pass ? "VERIFIED" : "FAILED";
  }

  return json({
    ok: true,
    providers,
    evidence,
    transfer_gate: "PAUSED — external on-chain transfers stay PAUSED on the platform side; this engine has no endpoint that can move funds, by design.",
    address_creation: "PLATFORM_ONLY — CRIXCOIN address creation and the user_id → address mapping live exclusively in the Base44 app, written only by the platform server function. This engine cannot create or resolve wallets.",
  }, 200, origin);
}

// GET endpoints — all read-only, all authenticated (except the spec).
async function handleHealth(request, env, origin) {
  const solana = await solanaRead(env, "getSlot", []);
  return json({
    ok: true,
    engine: "CRIXCOIN read-only diagnostic engine",
    rails: {
      BASE: { asset_id: "CRXS", primary: true, status: "PAUSED — no production CRXS contract on Base Mainnet yet; transfers PAUSED on the platform side" },
      SOLANA: { asset_id: "CRIX_SOL", primary: false, status: "NOT_IMPLEMENTED — separate SPL representation; SOLANA_FALLBACK_ENABLED=false. Never presented as Base CRXS." },
    },
    solana_rpc: solana.ok ? "live (slot " + solana.result + ")" : "unavailable — " + solana.error,
    authority: "The Base44 platform backend is the ONLY money-movement authority. This engine is diagnostics/read-only.",
  }, 200, origin);
}

async function handleChainBase(request, env, origin) {
  const chainId = await rpcRead(MAINNET_RPC, "eth_chainId", []);
  const block = await rpcRead(MAINNET_RPC, "eth_blockNumber", []);
  const evidence = [{ check: "base_mainnet_rpc", pass: chainId.ok && block.ok, value: chainId.ok ? "chain " + parseInt(chainId.result, 16) + ", block " + (block.ok ? parseInt(block.result, 16) : "?") : chainId.error, source: "public Base Mainnet RPC" }];
  return json({ ok: chainId.ok && block.ok, chain_id_hex: chainId.result, latest_block: block.result ? parseInt(block.result, 16) : null, evidence }, 200, origin);
}

async function handleChainSolana(request, env, origin) {
  const slot = await solanaRead(env, "getSlot", []);
  const height = await solanaRead(env, "getBlockHeight", []);
  const evidence = [{ check: "solana_mainnet_rpc", pass: slot.ok && height.ok, value: slot.ok ? "slot " + slot.result + ", height " + (height.ok ? height.result : "?") : slot.error, source: "Solana Mainnet RPC" }];
  return json({ ok: slot.ok && height.ok, slot: slot.result, block_height: height.result, evidence }, 200, origin);
}

async function handleDeployment(request, env, url, origin) {
  const address = (url.searchParams.get("address") || "").trim();
  if (!address) {
    return json({ status: "NOT_DEPLOYED", detail: "No production CRXS contract address exists on Base Mainnet yet — honest state until the owner-signed deployment receipt exists. Do not claim CRXS is live on Base Mainnet until then." }, 200, origin);
  }
  if (!isEvmAddress(address)) return json({ error: "INVALID_ADDRESS" }, 400, origin);
  const code = await rpcRead(MAINNET_RPC, "eth_getCode", [address, "latest"]);
  const hasCode = code.ok && String(code.result || "") !== "0x" && String(code.result || "").length > 10;
  return json({ ok: true, address, has_contract_code: !!hasCode, evidence: [{ check: "eth_getCode", pass: code.ok, value: code.ok ? (hasCode ? "contract code present (" + (String(code.result).length / 2 - 1) + " bytes)" : "NO contract code — address is an EOA or empty") : code.error, source: "public Base Mainnet RPC" }] }, 200, origin);
}

async function handleBalance(request, env, url, address, origin) {
  const contract = (url.searchParams.get("contract") || "").trim();
  if (!isEvmAddress(address)) return json({ error: "INVALID_ADDRESS" }, 400, origin);
  if (!contract) {
    return json({ error: "NO_PRODUCTION_CONTRACT — there is no production CRXS contract on Base Mainnet yet, so a CRXS balance cannot be read. Honest state — nothing simulated." }, 409, origin);
  }
  if (!isEvmAddress(contract)) return json({ error: "INVALID_CONTRACT" }, 400, origin);
  // balanceOf(address) selector 0x70a08231
  const data = "0x70a08231000000000000000000000000" + address.slice(2).toLowerCase();
  const res = await rpcRead(MAINNET_RPC, "eth_call", [{ to: contract, data }, "latest"]);
  if (!res.ok) return json({ error: "RPC_UNAVAILABLE — " + res.error }, 502, origin);
  const raw = String(res.result || "0x0");
  return json({ ok: true, chain: "BASE_MAINNET", contract, address, balance_raw: BigInt(raw).toString(), balance_crxs: Number(BigInt(raw)) / 1e18, evidence: [{ check: "balanceOf_eth_call", pass: true, value: raw, source: "public Base Mainnet RPC" }] }, 200, origin);
}

async function handleTransaction(request, env, hash, origin) {
  if (!isTxHash(hash)) return json({ error: "INVALID_HASH" }, 400, origin);
  const res = await rpcRead(MAINNET_RPC, "eth_getTransactionReceipt", [hash]);
  if (!res.ok) return json({ error: "RPC_UNAVAILABLE — " + res.error }, 502, origin);
  const receipt = res.result;
  return json({ ok: true, chain: "BASE_MAINNET", found: !!receipt, status: receipt ? (receipt.status === "0x1" ? "CONFIRMED (success)" : "FAILED on chain") : null, block_number: receipt ? parseInt(receipt.blockNumber, 16) : null, evidence: [{ check: "eth_getTransactionReceipt", pass: true, value: receipt ? "receipt at block " + parseInt(receipt.blockNumber, 16) : "no receipt found", source: "public Base Mainnet RPC" }] }, 200, origin);
}

async function handleSolanaToken(request, env, url, address, origin) {
  if (!isSolanaAddress(address)) return json({ error: "INVALID_ADDRESS" }, 400, origin);
  const mint = (url.searchParams.get("mint") || "").trim();
  // Solana RPC shape: [owner, {mint | programId}, {encoding, commitment}]
  // SPL Token Program id — chain-sourced (read from a live token account's
  // owner field), never from memory.
  const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const filter = mint && isSolanaAddress(mint) ? { mint } : { programId: TOKEN_PROGRAM };
  const params = [address, filter, { encoding: "jsonParsed", commitment: "confirmed" }];
  const res = await solanaRead(env, "getTokenAccountsByOwner", params);
  if (!res.ok) return json({ error: res.error }, 502, origin);
  return json({ ok: true, chain: "SOLANA_MAINNET", owner: address, accounts: res.result && res.result.value ? res.result.value.length : 0, evidence: [{ check: "getTokenAccountsByOwner", pass: true, value: (res.result && res.result.value ? res.result.value.length : 0) + " token accounts", source: "Solana Mainnet RPC (read-only)" }] }, 200, origin);
}

const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "CRIXCOIN Engine (Read-Only)",
    version: "3.0.0",
    description: "Diagnostic read-only CRIXCOIN dual-rail engine. Base and Solana health/chain/balance/receipt reads only. There are NO fund-movement, signing, paymaster-submission or wallet-creation endpoints by design — all money movement stays on the Base44 platform backend, and external transfers stay PAUSED.",
  },
  servers: [{ url: "/", description: "This Worker" }],
  paths: {
    "/openapi.json": { get: { summary: "This OpenAPI specification", responses: { "200": { description: "The spec JSON" } } } },
    "/health": { get: { summary: "Engine + rail honest status summary", responses: { "200": { description: "Rail summary (all read-only)" } } } },
    "/chain/base": { get: { summary: "Base Mainnet chain id + latest block (read-only)", responses: { "200": { description: "Live chain state" } } } },
    "/chain/solana": { get: { summary: "Solana slot + block height (read-only)", responses: { "200": { description: "Live chain state" } } } },
    "/crixcoin/deployment": { get: { summary: "Contract existence/code check (?address=0x…)", responses: { "200": { description: "Honest deployment state" } } } },
    "/crixcoin/balance/{address}": { get: { summary: "CRXS balance read (?contract=0x…)", responses: { "200": { description: "Live balance" }, "409": { description: "No production contract" } } } },
    "/crixcoin/transaction/{hash}": { get: { summary: "Base Mainnet receipt read", responses: { "200": { description: "Live receipt state" } } } },
    "/solana/token/{address}": { get: { summary: "SPL token accounts read (?mint=…)", responses: { "200": { description: "Live token accounts" } } } },
    "/aa-health": {
      post: {
        summary: "Provider health probes (read-only, live responses only)",
        requestBody: { required: false, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Per-provider honest states with evidence" } },
      },
    },
    "/chain-read": {
      post: {
        summary: "Whitelisted read-only EVM RPC query on Base Sepolia or Base Mainnet",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["method"],
                properties: {
                  chain: { type: "string", enum: ["sepolia", "mainnet"] },
                  method: { type: "string" },
                  params: { type: "array" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Live RPC result with evidence" }, "403": { description: "Method not whitelisted" } },
      },
    },
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "*";
    if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
    if (url.pathname === "/openapi.json") return json(OPENAPI_SPEC, 200, origin);

    // Every data endpoint requires the shared secret — GET included.
    const auth = authorized(request, env);
    if (!auth.ok) return json({ error: "UNAUTHORIZED — " + auth.reason }, 401, origin);

    if (request.method === "GET") {
      if (url.pathname === "/health") return handleHealth(request, env, origin);
      if (url.pathname === "/chain/base") return handleChainBase(request, env, origin);
      if (url.pathname === "/chain/solana") return handleChainSolana(request, env, origin);
      if (url.pathname === "/crixcoin/deployment") return handleDeployment(request, env, url, origin);
      if (url.pathname.startsWith("/crixcoin/balance/")) return handleBalance(request, env, url, url.pathname.slice("/crixcoin/balance/".length), origin);
      if (url.pathname.startsWith("/crixcoin/transaction/")) return handleTransaction(request, env, url.pathname.slice("/crixcoin/transaction/".length), origin);
      if (url.pathname.startsWith("/solana/token/")) return handleSolanaToken(request, env, url, url.pathname.slice("/solana/token/".length), origin);
      return json({ error: "NOT_FOUND" }, 404, origin);
    }

    if (request.method !== "POST") return json({ error: "NOT_FOUND — use GET for reads, POST for engine operations" }, 404, origin);
    if (url.pathname === "/aa-health") return handleAaHealth(request, env, origin);
    if (url.pathname === "/chain-read") return handleChainRead(request, env, origin);
    return json({ error: "NOT_FOUND — this engine exposes only read-only operations" }, 404, origin);
  },
};