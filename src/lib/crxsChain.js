// CRXS ON-CHAIN CLIENT LAYER — thin, dependency-free EIP-1193 (MetaMask) helpers.
// REAL chain data only: every value comes from actual wallet / RPC responses.
// Nothing here fabricates addresses, hashes or balances, and this layer never
// touches private keys — signing happens in the owner's own wallet.

// ONE authoritative network definition — shared with the MetaMask wallet layer.
import { BASE_SEPOLIA } from "@/lib/baseSepoliaNetwork";
import { walletRequest } from "@/lib/metamaskConnect";
export { BASE_SEPOLIA };

// ——— wallet connection layer (delegated to the ONE MetaMask abstraction) ———
// Connection, session restore and network switching live in @/lib/metamaskConnect
// (current MetaMask Connect architecture: EIP-6963 injected provider first,
// createEVMClient() → client.connect() second). These re-exports keep every
// existing call site working against the same single implementation.
export {
  connectWallet, connectMetaMask, restoreSession, currentChainId,
  ensureBaseSepolia, switchToBaseSepolia, hasWallet, waitForWallet, walletRequest,
} from "@/lib/metamaskConnect";

// ——— minimal ABI encoding / decoding (fixed shapes only) ———

function strip0x(h) {
  return String(h).startsWith("0x") ? String(h).slice(2) : String(h);
}

export function encodeUint256Arg(argString) {
  const v = BigInt(argString);
  if (v <= 0n) throw new Error("Constructor supply must be a positive integer.");
  return v.toString(16).padStart(64, "0");
}

export function encodeAddressArg(address) {
  const a = strip0x(address).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(a)) throw new Error("Invalid Ethereum address.");
  return "0".repeat(24) + a;
}

export function buildDeployData(creationBytecode, argString) {
  if (!/^0x[0-9a-fA-F]+$/.test(creationBytecode)) throw new Error("Invalid creation bytecode.");
  return creationBytecode.toLowerCase() + encodeUint256Arg(argString);
}

export function decodeUint(hexData, byteIndex = 0) {
  const h = strip0x(hexData);
  const start = byteIndex * 2;
  if (h.length < start + 64) throw new Error("Not enough data to decode a uint256.");
  return BigInt("0x" + h.slice(start, start + 64));
}

export function decodeString(hexData) {
  const h = strip0x(hexData);
  const offset = Number(BigInt("0x" + h.slice(0, 64)));
  const len = Number(BigInt("0x" + h.slice(offset * 2, offset * 2 + 64)));
  const bytes = h.slice(offset * 2 + 64, offset * 2 + 64 + len * 2);
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = parseInt(bytes.substr(i * 2, 2), 16);
  return new TextDecoder().decode(arr);
}

// ——— contract interaction ———

const SIG = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
  balanceOf: "0x70a08231",
};

export async function readTokenState(contractAddress, walletAddress) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) throw new Error("Invalid contract address.");
  const call = async (data) => {
    const res = await walletRequest("eth_call", [{ to: contractAddress, data }, "latest"]);
    if (!res || res === "0x") throw new Error("The contract call returned no data — the address is not a live contract on this chain.");
    return res;
  };
  const [nameHex, symbolHex, decimalsHex, supplyHex, balanceHex] = await Promise.all([
    call(SIG.name),
    call(SIG.symbol),
    call(SIG.decimals),
    call(SIG.totalSupply),
    call(SIG.balanceOf + encodeAddressArg(walletAddress)),
  ]);
  return {
    name: decodeString(nameHex),
    symbol: decodeString(symbolHex),
    decimals: Number(decodeUint(decimalsHex)),
    totalSupplyRaw: decodeUint(supplyHex).toString(),
    deployerBalanceRaw: decodeUint(balanceHex).toString(),
  };
}

export async function sendDeploymentTransaction({ from, data }) {
  const txHash = await walletRequest("eth_sendTransaction", [{ from, data, value: "0x0" }]);
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("The wallet did not return a valid transaction hash.");
  return txHash;
}

// ——— post-deployment transfer test (owner signs via MetaMask) ———

const TRANSFER_SELECTOR = "0xa9059cbb";
export const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function encodeTransferData(recipient, amountRawString) {
  return TRANSFER_SELECTOR + encodeAddressArg(recipient) + encodeUint256Arg(amountRawString);
}

export async function sendTransferTransaction({ from, to, data }) {
  const txHash = await walletRequest("eth_sendTransaction", [{ from, to, data, value: "0x0" }]);
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("The wallet did not return a valid transaction hash.");
  return txHash;
}

// Decodes the ERC-20 Transfer(from, to, amount) event from a REAL receipt.
// Returns null when the receipt holds no Transfer event for this contract.
export function extractTransferEvent(receipt, contractAddress) {
  const logs = (receipt.logs || []).filter((l) => String(l.address || "").toLowerCase() === String(contractAddress).toLowerCase());
  const log = logs.find((l) => String((l.topics || [])[0] || "").toLowerCase() === TRANSFER_EVENT_TOPIC);
  if (!log || !log.topics || log.topics.length < 3 || !log.data) return null;
  return {
    from: ("0x" + String(log.topics[1]).slice(-40)).toLowerCase(),
    to: ("0x" + String(log.topics[2]).slice(-40)).toLowerCase(),
    amountRaw: BigInt(log.data).toString(),
  };
}

export async function readAddressBalance(contractAddress, address) {
  const res = await walletRequest("eth_call", [{ to: contractAddress, data: SIG.balanceOf + encodeAddressArg(address) }, "latest"]);
  if (!res || res === "0x") throw new Error("The contract call returned no data — the address cannot be read on this chain.");
  return BigInt(res).toString();
}

// Honest RPC outcome states: pending | confirmed | reverted | unknown.
// A transaction is only ever treated as deployed after a successful receipt.
export async function pollDeploymentReceipt(txHash, { intervalMs = 4000, timeoutMs = 300000, onTick, rpcUrl } = {}) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("Invalid transaction hash.");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // MetaMask's RPC transport times out on repeated mobile reads — a read-only
    // public RPC fallback keeps polling alive without touching the wallet.
    let receipt = null;
    try {
      receipt = await walletRequest("eth_getTransactionReceipt", [txHash]);
    } catch (e) { /* wallet transport hiccup — fall through to the public RPC */ }
    if (!receipt && rpcUrl) {
      try { receipt = await rpcGetTransactionReceipt(txHash, rpcUrl); } catch (e) { /* retry next tick */ }
    }
    if (receipt) {
      if (String(receipt.status) === "0x1") return { status: "confirmed", receipt };
      return { status: "reverted", receipt };
    }
    if (onTick) onTick();
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { status: "unknown", receipt: null };
}

// Read-only receipt poll against the official Base Sepolia RPC — used to resume
// a pending deployment after a page reload or app switch, before the wallet is
// reconnected. The transaction hash is the idempotency key: the SAME transaction
// is polled, a second deployment is never submitted.
export async function rpcGetTransactionReceipt(txHash, rpcUrl) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("Invalid transaction hash.");
  const res = await fetch(rpcUrl || BASE_SEPOLIA.rpcUrls[0], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
  });
  const json = await res.json();
  return json && json.result ? json.result : null;
}