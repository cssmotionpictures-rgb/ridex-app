// CRXS AERODROME MARKET — client side of the owner-signed DEX launch.
//
// The app builds, simulates, budget-guards and verifies every transaction; the
// OWNER signs each one in MetaMask. No private key ever touches this app.
// All money math is integer (wei / raw base units). Fail closed on uncertainty.
//
// Verified live on Base Mainnet (2026-09-16): official Aerodrome router + factory
// code-verified through public RPC, router weth() returns canonical Base WETH,
// and NO CRXS/WETH pool exists yet.

export const CRXS = "0xb7a10024941f5286d9686b0bb8ebf6cb88c7453f";
export const WETH = "0x4200000000000000000000000000000000000006";
export const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
export const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
export const CRXS_LAUNCH_WALLET = "0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1";
export const CHAIN_ID_HEX = "0x2105"; // Base Mainnet = 8453
export const RPCS = ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.meowrpc.com"];

// HARD money guard — never overridable from the UI.
export const MAX_OPERATION_BUDGET_WEI = 110000000000000n; // 0.000110 ETH total ops
export const ETH_RESERVE_GUARD_WEI = 200000000000000n; // 0.000200 ETH protected forever
export const INITIAL_LIQUIDITY_ETH_WEI = 50000000000000n; // 0.000050 ETH liquidity side
export const MICRO_SWAP_CRXS_RAW = 100000n * 10n ** 18n; // 100,000 CRXS genuine first trade

// `cumulativeWei` = committed spend so far PLUS the new transaction — checked
// against the hard budget. `newSpendWei` = only the transaction being signed
// now: the live chain balance already reflects every past spend, so only the
// NEW cost is subtracted for the reserve check — committed ETH is never
// double-counted against the wallet.
export function canSpend(cumulativeWei, newSpendWei, balanceWei) {
  return BigInt(cumulativeWei) <= MAX_OPERATION_BUDGET_WEI && BigInt(balanceWei) - BigInt(newSpendWei) >= ETH_RESERVE_GUARD_WEI;
}

// ABI encoding — fixed-shape words, verified selectors.
const padAddr = (a) => String(a).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const padU = (v) => BigInt(v).toString(16).padStart(64, "0");
const padBool = (b) => (b ? "1" : "0").padStart(64, "0");

export function encodeBalanceOf(owner) { return "0x70a08231" + padAddr(owner); }
export function encodeAllowance(owner, spender) { return "0xdd62ed3e" + padAddr(owner) + padAddr(spender); }
export function encodeApprove(spender, amount) { return "0x095ea7b3" + padAddr(spender) + padU(amount); }
export function encodeGetPool(a, b, stable) { return "0x79bc57d5" + padAddr(a) + padAddr(b) + padBool(stable); }
export function encodeTotalSupply() { return "0x18160ddd"; }

export function encodeAddLiquidityETH(token, stable, amountTokenDesired, amountTokenMin, amountETHMin, to, deadline) {
  return (
    "0xb7e0d4c0" + padAddr(token) + padBool(stable) +
    padU(amountTokenDesired) + padU(amountTokenMin) + padU(amountETHMin) +
    padAddr(to) + padU(deadline)
  );
}

export function encodeSwapExactTokensForTokens(amountIn, amountOutMin, routeFrom, routeStable, routeTo, to, deadline) {
  // Aerodrome's Route struct has FOUR fields — (from, to, stable, factory).
  // Verified live against the deployed router bytecode: selector 0xcac88ea9
  // matches swapExactTokensForTokens(uint256,uint256,(address,address,bool,address)[],address,uint256).
  // head: amountIn, amountOutMin, offset(=5 words → 0xa0), to, deadline
  // array: length 1, then the Route struct flattened (from, to, stable, factory)
  return (
    "0xcac88ea9" + padU(amountIn) + padU(amountOutMin) + padU(160) +
    padAddr(to) + padU(deadline) +
    padU(1) + padAddr(routeFrom) + padAddr(routeTo) + padBool(routeStable) + padAddr(AERODROME_FACTORY)
  );
}

// Public Base reads with endpoint failover. Returns null when none answer.
export async function baseRpc(method, params) {
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      });
      const j = await res.json();
      if (j.result !== undefined) return j.result;
    } catch (e) { /* try the next endpoint */ }
  }
  return null;
}

// Worst-case cost of a transaction BEFORE signing: live estimate + live gas
// price + 30% safety margin. Never signs on a failed estimate (fail closed).
export async function estimateTxCost(from, to, data, valueWei) {
  const value = BigInt(valueWei || 0n);
  const call = { from, to, data, value: "0x" + value.toString(16) };
  // Public RPCs occasionally drop one estimate — try a second pass before
  // failing closed, so a transient network blip never blocks an affordable sign.
  let gasHex = null;
  for (let attempt = 0; attempt < 2 && !gasHex; attempt++) {
    gasHex = await baseRpc("eth_estimateGas", [call]);
  }
  if (!gasHex) throw new Error("Could not estimate gas from Base — nothing was signed (fail closed).");
  const priceHex = await baseRpc("eth_gasPrice", []);
  if (!priceHex) throw new Error("Could not read the live Base gas price — nothing was signed (fail closed).");
  const gas = BigInt(gasHex);
  const gasPrice = BigInt(priceHex);
  const maxGasWei = (gas * gasPrice * 130n) / 100n;
  return { gas, gasPrice, maxGasWei, valueWei: value, totalWei: maxGasWei + value };
}

export async function readPoolState(poolAddress) {
  const call = async (sel) => {
    const r = await baseRpc("eth_call", [{ to: poolAddress, data: sel }, "latest"]);
    return r && r !== "0x" ? r : null;
  };
  const t0 = await call("0x0dfe1681"); // token0()
  const t1 = await call("0xd21220a7"); // token1()
  const res = await call("0x0902f1ac"); // getReserves()
  const stab = await call("0x22be3de1"); // stable()
  const words = ((res || "0x").slice(2).match(/.{64}/g) || []);
  return {
    token0: t0 ? "0x" + t0.slice(-40).toLowerCase() : "",
    token1: t1 ? "0x" + t1.slice(-40).toLowerCase() : "",
    reserve0: words[0] ? BigInt("0x" + words[0]) : 0n,
    reserve1: words[1] ? BigInt("0x" + words[1]) : 0n,
    stable: stab ? BigInt(stab) === 1n : null,
  };
}

// Constant-product quote with the 0.3% volatile-pool fee — integer math only.
export function quoteVolatileOut(amountInRaw, reserveInRaw, reserveOutRaw) {
  if (reserveInRaw <= 0n || reserveOutRaw <= 0n || amountInRaw <= 0n) return 0n;
  const amountInWithFee = amountInRaw * 9970n;
  return (amountInWithFee * reserveOutRaw) / (reserveInRaw * 10000n + amountInWithFee);
}

// Live CRXS reference price from the owner-launched bonding curve (wei per CRXS).
export async function liveCurvePriceWei() {
  const { loadCurveStats } = await import("@/lib/buyCurveClient");
  const stats = await loadCurveStats();
  return stats && stats.price ? stats.price : 0n;
}

// Matching CRXS side for an ETH amount at the live price — integer math.
export function matchCrxsForEth(ethWei, priceWeiPerCrxs) {
  if (!priceWeiPerCrxs || priceWeiPerCrxs <= 0n) return 0n;
  return (BigInt(ethWei) * 10n ** 18n) / priceWeiPerCrxs;
}

// Independent indexer checks — honest, never assumed.
export async function dexscreenerSearch() {
  try {
    const r = await fetch("https://api.dexscreener.com/token-pairs/v1/base/" + CRXS);
    if (!r.ok) return { ok: false, found: false, pairs: [], note: "DEX Screener HTTP " + r.status };
    const pairs = await r.json();
    return {
      ok: true,
      found: Array.isArray(pairs) && pairs.length > 0,
      pairs: (pairs || []).map((p) => ({
        pairAddress: p.pairAddress,
        dex: p.dexId,
        base: p.baseToken && p.baseToken.address,
        quote: p.quoteToken && p.quoteToken.address,
        priceUsd: p.priceUsd,
        liquidityUsd: p.liquidity && p.liquidity.usd,
        volume24h: p.volume && p.volume.h24,
        txns24h: p.txns && p.txns.h24 ? (p.txns.h24.buys || 0) + (p.txns.h24.sells || 0) : null,
        priceNative: p.priceNative,
        url: "https://dexscreener.com/base/" + p.pairAddress,
      })),
    };
  } catch (e) {
    return { ok: false, found: false, pairs: [], note: "DEX Screener unreachable: " + (e.message || e) };
  }
}

export async function geckoSearch() {
  try {
    const r = await fetch("https://api.geckoterminal.com/api/v2/networks/base/tokens/" + CRXS + "/pools");
    if (!r.ok) return { ok: false, found: false, pools: [], note: "GeckoTerminal HTTP " + r.status };
    const j = await r.json();
    const pools = (j.data || []).map((p) => ({
      address: String(p.id || "").split("_")[1] || "",
      name: p.attributes && p.attributes.name,
    }));
    return { ok: true, found: pools.length > 0, pools, note: pools.length ? pools.length + " pool(s) reported" : "no pools reported yet" };
  } catch (e) {
    return { ok: false, found: false, pools: [], note: "GeckoTerminal unreachable: " + (e.message || e) };
  }
}