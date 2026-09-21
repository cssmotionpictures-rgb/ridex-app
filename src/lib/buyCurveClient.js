// Shared client layer for the public CRIXCOIN buy/sell pages — reads live state
// from the owner-launched bonding curve on Base Mainnet via public RPC. Every
// number comes from a real chain response; nothing is simulated.

export const CURVE = "0x593efbd536124de06ddfc129166df45021df9faa";
export const CRXS_TOKEN = "0xb7a10024941f5286d9686b0bb8ebf6cb88c7453f";
export const CHAIN_ID_HEX = "0x2105"; // Base Mainnet (8453)
export const RPCS = ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.meowrpc.com"];

// Selectors from the compiled CrixLaunchCurve artifact (solc 0.8.37).
export const SEL = {
  tokenReserve: "0xcbcb3171",
  ethReserve: "0xd62ccb3f",
  graduationThresholdEth: "0x57febfed",
  graduated: "0xe7c2b772",
  pricePerToken: "0x7b1b1de6",
  quoteBuy: "0x4beb394c", // quoteBuy(uint256) → (tokensOut, fee)
  buy: "0xd96a094a",     // buy(uint256 minTokensOut) — payable
  quoteSell: "0xa64190c4", // quoteSell(uint256) → (ethOut, fee)
  sell: "0xd79875eb",    // sell(uint256 tokenAmount, uint256 minEthOut)
  approve: "0x095ea7b3", // ERC-20 approve(spender, amount)
  allowance: "0xdd62ed3e", // ERC-20 allowance(owner, spender)
  balanceOf: "0x70a08231", // ERC-20 balanceOf(owner)
};

export const pad32 = (n) => BigInt(n).toString(16).padStart(64, "0");
export const padAddress = (a) => {
  const hex = String(a).toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(hex)) throw new Error("Invalid address.");
  return "0".repeat(24) + hex;
};

export function ethStringToWei(s) {
  const m = String(s || "").trim();
  if (!/^\d*\.?\d*$/.test(m) || m === "" || m === ".") return null;
  const [whole, frac = ""] = m.split(".");
  return BigInt(whole || "0") * 10n ** 18n + BigInt(frac.slice(0, 18).padEnd(18, "0"));
}

// Whole CRXS (e.g. "1000") → raw 18-decimal units.
export function crxsStringToRaw(s) {
  const m = String(s || "").trim();
  if (!/^\d*\.?\d*$/.test(m) || m === "" || m === ".") return null;
  const [whole, frac = ""] = m.split(".");
  return BigInt(whole || "0") * 10n ** 18n + BigInt(frac.slice(0, 18).padEnd(18, "0"));
}

export function fmtCrxs(raw) {
  const n = Number(raw) / 1e18;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2) + " CRXS";
}

export function fmtEth(wei) {
  const n = Number(wei) / 1e18;
  if (n === 0) return "0";
  if (Math.abs(n) < 0.0001) return n.toExponential(3);
  return String(Number(n.toFixed(8)));
}

export async function rpc(method, params) {
  let lastErr = null;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      });
      const b = await res.json();
      if (b.error) throw new Error(b.error.message || "RPC error");
      return b.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Could not reach Base Mainnet");
}

export const call = (to, selector, argHex) => rpc("eth_call", [{ to, data: selector + (argHex || "") }, "latest"]);

export async function loadCurveStats() {
  const s = SEL;
  const [tokens, eth, threshold, grad, price] = await Promise.all([
    call(CURVE, s.tokenReserve), call(CURVE, s.ethReserve),
    call(CURVE, s.graduationThresholdEth), call(CURVE, s.graduated), call(CURVE, s.pricePerToken),
  ]);
  return {
    tokens: BigInt(tokens), eth: BigInt(eth), threshold: BigInt(threshold),
    graduated: BigInt(grad) !== 0n, price: BigInt(price),
  };
}

// quoteBuy(ethInWei) → { tokensOut, fee } (BigInts)
export async function quoteBuyLive(ethInWei) {
  const res = await call(CURVE, SEL.quoteBuy, pad32(ethInWei));
  return { tokensOut: BigInt("0x" + res.slice(2, 66)), fee: BigInt("0x" + res.slice(66, 130)) };
}

// quoteSell(rawCrxs) → { ethOut, fee } (BigInts)
export async function quoteSellLive(rawCrxs) {
  const res = await call(CURVE, SEL.quoteSell, pad32(rawCrxs));
  return { ethOut: BigInt("0x" + res.slice(2, 66)), fee: BigInt("0x" + res.slice(66, 130)) };
}

export const readTokenBalance = (owner) =>
  call(CRXS_TOKEN, SEL.balanceOf, padAddress(owner)).then((r) => BigInt(r));

export const readTokenAllowance = (owner, spender) =>
  call(CRXS_TOKEN, SEL.allowance, padAddress(owner) + padAddress(spender)).then((r) => BigInt(r));

// Poll the public RPC for a receipt (no wallet needed). Returns the receipt or null.
export async function waitForReceipt(hash, tries = 24, gapMs = 5000) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, gapMs));
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
  }
  return null;
}