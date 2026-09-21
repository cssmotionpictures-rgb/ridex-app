// CRIXCOIN SELF-FUNDING GAS ENGINE — server-side shared module.
// Every CRIXCOIN transfer carries a 0.2% network fee paid in CRIXCOIN
// (PLATFORM_FEE_BPS). Accumulated fees are swapped CRXS → ETH on Aerodrome
// (Base Mainnet) by the settlement router and delivered to the gas treasury
// that funds sponsored gas. The user never sees or pays ETH.
//
// Nothing here simulates: every address below was verified live on Base
// Mainnet (eth_getCode) before it was written here, and every rate the
// engine uses at settlement time is read live from the real pool — never
// typed in, never assumed.

import { PLATFORM_FEE_BPS } from "./cdpAdapter.ts";

export { PLATFORM_FEE_BPS };

// Gas treasury reserve thresholds (ETH) — the master architecture's policy.
// CRITICAL means sponsored transactions must halt honestly until the
// treasury is genuinely funded.
export const TREASURY_TARGET_ETH = 0.05;
export const TREASURY_MINIMUM_ETH = 0.01;
export const TREASURY_CRITICAL_ETH = 0.005;

// Settlement policy — a settlement that would move the price or slip beyond
// these limits is refused, never "best-effort" executed.
export const MAX_PRICE_IMPACT_PCT = 2.0; // % of the pool the swap may move
export const MAX_SLIPPAGE_PCT = 1.0; // % below the live quote allowed
export const MIN_SETTLE_AMOUNT_CRXS = 1000; // raw CRXS units — never settle dust

// Aerodrome on Base MAINNET — verified live via eth_getCode on 2026-09-13.
export const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
export const AERODROME_POOL_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
export const WETH_BASE_MAINNET = "0x4200000000000000000000000000000000000006";

// Treasury status derives ONLY from the live chain balance against the
// thresholds — never from a hoped-for or assumed value.
export function treasuryStatusFromBalance(balanceEth, target, minimum, critical) {
  if (balanceEth >= target) return "HEALTHY";
  if (balanceEth >= minimum) return "BELOW_TARGET";
  if (balanceEth >= critical) return "LOW";
  return "CRITICAL";
}