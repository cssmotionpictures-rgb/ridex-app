import { secrets } from "base44:runtime";

// Real Base MAINNET RPC helpers — chain 8453. Every value returned comes from
// an actual RPC response; nothing here is simulated, cached or fabricated.
// Base Sepolia never uses this module.
// (redeploy retry 3 — GetBlock BASE_RPC_URL private endpoint tried first)

// Private GetBlock Base Mainnet endpoint (BASE_RPC_URL secret) is tried FIRST —
// 20 RPS with a public fallback list so a rate-limit (HTTP 429) or outage on
// one endpoint never stops a real verification. Only read calls are made.
// The GetBlock access token is a credential: it is never hardcoded, never
// logged, and always masked before it reaches any error or evidence string.
const GETBLOCK_RPC = (() => {
  try {
    return String(secrets.get("BASE_RPC_URL") || "").trim().replace(/\/+$/, "");
  } catch (error) {
    return "";
  }
})();

// Endpoints tried in order — private GetBlock first when configured.
export const BASE_MAINNET_RPCS = [
  ...(GETBLOCK_RPC ? [GETBLOCK_RPC] : []),
  "https://mainnet.base.org",
  "https://base.meowrpc.com",
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://1rpc.io/base",
];

export const BASE_MAINNET_CHAIN_ID = 8453;

// Mask an endpoint before it reaches a log, error message or evidence record:
// shows only the host and the first/last 3 characters of the access token.
export function maskRpcEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    const token = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!token) return u.host;
    return token.length <= 8 ? u.host + "/…/" : u.host + "/" + token.slice(0, 3) + "…" + token.slice(-3) + "/";
  } catch (error) {
    return "invalid-endpoint";
  }
}

export function isValidEvmAddress(address) {
  return typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function rpcCall(method, params) {
  let lastError = null;
  for (const endpoint of BASE_MAINNET_RPCS) {
    // Two attempts per endpoint with a short backoff — endpoints transiently
    // rate-limit (429) or drop a request; a real verification is never
    // fabricated from a failed read.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        });
        if (!res.ok) throw new Error("Base Mainnet RPC HTTP " + res.status + " (" + maskRpcEndpoint(endpoint) + ")");
        const json = await res.json();
        if (json.error) throw new Error("Base Mainnet RPC error: " + json.error.message + " (" + maskRpcEndpoint(endpoint) + ")");
        return json.result;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await wait(600);
      }
    }
  }
  throw lastError || new Error("All Base Mainnet RPC endpoints failed");
}

// Verify an address live on Base Mainnet: format, chain id, real balance,
// account type. Returns verification evidence only — it never mutates state.
export async function verifyAddressOnBaseMainnet(address) {
  const checks = [];
  const push = (check, pass, value) => checks.push({ check, pass, value: String(value) });

  push("address_format_valid", isValidEvmAddress(address), address);
  const chainIdHex = await rpcCall("eth_chainId", []);
  push("chain_id_is_8453", parseInt(chainIdHex, 16) === BASE_MAINNET_CHAIN_ID, parseInt(chainIdHex, 16));

  const balanceHex = await rpcCall("eth_getBalance", [address, "latest"]);
  const balanceWei = BigInt(balanceHex);
  push("eth_balance_read", true, balanceHex);

  const code = await rpcCall("eth_getCode", [address, "latest"]);
  const isEoa = code === "0x";
  push("account_type", true, isEoa ? "EOA (externally owned wallet)" : "CONTRACT");

  return {
    checks,
    eth_balance_wei: balanceWei.toString(),
    eth_balance: Number(balanceWei) / 1e18,
    rpc_endpoints: BASE_MAINNET_RPCS.map(maskRpcEndpoint),
    verified_at: new Date().toISOString(),
    all_passed: checks.every((c) => c.pass),
  };
}