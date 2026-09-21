// CRXS RPC layer — shared by the server-side chain verification functions
// (redeploy retry 3 — GetBlock BASE_RPC_URL as Base Mainnet endpoint)
// (crxs-deployment-verify, crxs-transfer-verify, crxs-mainnet-deployment-verify).
// REAL chain data only: every value comes from actual public-RPC responses,
// nothing is fabricated or substituted. Testnet and Mainnet RPCs are strictly
// separate — a Sepolia receipt can never be verified against Mainnet and vice
// versa.

import { secrets } from 'base44:runtime';

export const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
// Private GetBlock Base Mainnet endpoint when configured (BASE_RPC_URL secret),
// with the official public endpoint as the honest fallback. The access token is
// a credential: rpcFetch error messages never include the URL, so it never leaks.
export const BASE_MAINNET_RPC = (() => {
  try {
    const url = String(secrets.get('BASE_RPC_URL') || '').trim();
    return url || 'https://mainnet.base.org';
  } catch (error) {
    return 'https://mainnet.base.org';
  }
})();
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function rpcFetch(rpcUrl, method, params) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error('rpc http ' + res.status);
      const json = await res.json();
      if (json.error) throw new Error('rpc: ' + JSON.stringify(json.error).slice(0, 200));
      return json.result;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw new Error('RPC unavailable: ' + String(lastError && lastError.message ? lastError.message : lastError).slice(0, 160));
}

// Base Sepolia (testnet) — the existing verified CRXS test contract lives here.
export async function rpc(method, params) {
  return rpcFetch(BASE_SEPOLIA_RPC, method, params);
}

// Base Mainnet (production) — used ONLY by the gated Mainnet deployment
// verifier. The RPC endpoint itself proves which chain a receipt belongs to.
export async function rpcOn(rpcUrl, method, params) {
  return rpcFetch(rpcUrl, method, params);
}

export async function callContract(to, data) {
  const res = await rpc('eth_call', [{ to, data }, 'latest']);
  if (!res || res === '0x') throw new Error('eth_call returned no data for selector ' + data.slice(0, 10));
  return res;
}

export async function callContractOn(rpcUrl, to, data) {
  const res = await rpcOn(rpcUrl, 'eth_call', [{ to, data }, 'latest']);
  if (!res || res === '0x') throw new Error('eth_call returned no data for selector ' + data.slice(0, 10));
  return res;
}

export function decodeAbiString(data) {
  const h = data.slice(2);
  const offset = Number(BigInt('0x' + h.slice(0, 64)));
  const len = Number(BigInt('0x' + h.slice(offset * 2, offset * 2 + 64)));
  const bytes = h.slice(offset * 2 + 64, offset * 2 + 64 + len * 2);
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = parseInt(bytes.substr(i * 2, 2), 16);
  return new TextDecoder().decode(arr);
}

// Decodes the ERC-20 Transfer(from, to, amount) log entry from a real receipt.
// Returns null when no Transfer event for this contract exists in the logs.
export function decodeTransferLog(log) {
  if (!log || !log.topics || log.topics.length < 3 || !log.data) return null;
  if (String(log.topics[0]).toLowerCase() !== TRANSFER_TOPIC) return null;
  return {
    from: ('0x' + String(log.topics[1]).slice(-40)).toLowerCase(),
    to: ('0x' + String(log.topics[2]).slice(-40)).toLowerCase(),
    amountRaw: BigInt(log.data).toString(),
    logIndex: log.logIndex,
  };
}