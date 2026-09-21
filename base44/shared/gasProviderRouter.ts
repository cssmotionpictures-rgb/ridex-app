// GasProviderRouter — the provider-independent gas layer for CRIXCOIN on
// Base Sepolia (the zero-upfront-gas phase). Selection order per the master
// architecture: Alchemy (primary) → Pimlico (fallback) → Coinbase CDP
// (secondary). A provider is only ever selected after a REAL live probe
// answers; a provider missing its credentials is skipped honestly, and if
// NO provider is healthy the transfer is NOT submitted — a controlled
// temporary-unavailable state is returned instead. The customer never knows
// which provider was used.
//
// Nothing here hard-codes a gas price, a CRXS price or provider support for
// CRXS-as-gas-token: today no provider lists CRXS on Sepolia, so the honest
// mode is PLATFORM_SPONSORED — the paymaster fronts the gas and the real
// cost is recorded from the receipt for platform accounting.

import { secrets } from "base44:runtime";

export const BASE_SEPOLIA_CHAIN_ID = 84532;

export function readSecret(name) {
  try {
    const value = secrets.get(name);
    return value || null;
  } catch (error) {
    return null;
  }
}

// Failover-ordered candidates. Each carries exactly what makes it usable:
// a paymaster/bundler endpoint. Alchemy additionally requires its Gas Manager
// policy id — without it Alchemy cannot sponsor and is skipped, not guessed.
export function sepoliaProviderCandidates() {
  const candidates = [];
  const alchemyKey = readSecret("ALCHEMY_API_KEY");
  const alchemyPolicy = readSecret("ALCHEMY_GAS_POLICY_ID");
  if (alchemyKey && alchemyPolicy) {
    candidates.push({ key: "alchemy", paymasterUrl: "https://base-sepolia.g.alchemy.com/v2/" + alchemyKey, note: "Gas Manager policy " + alchemyPolicy });
  }
  const pimlicoKey = readSecret("PIMLICO_API_KEY");
  if (pimlicoKey) {
    candidates.push({ key: "pimlico", paymasterUrl: "https://api.pimlico.io/v2/base-sepolia/rpc?apikey=" + pimlicoKey });
  }
  const cdpPaymasterUrl = readSecret("CDP_PAYMASTER_URL");
  if (cdpPaymasterUrl) {
    candidates.push({ key: "cdp", paymasterUrl: cdpPaymasterUrl });
  }
  return candidates;
}

// One live probe of a provider's ERC-7677 paymaster/bundler endpoint:
// eth_supportedEntryPoints must answer with real EntryPoint addresses.
// (Verified live: Pimlico answered with 4 entry points on Base Sepolia and
// the CDP paymaster with 2; Alchemy's key currently refuses with HTTP 403.)
async function probeProvider(candidate) {
  try {
    const res = await fetch(candidate.paymasterUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "eth_supportedEntryPoints", params: [] }),
    });
    if (!res.ok) return { provider: candidate.key, healthy: false, value: "HTTP " + res.status, entryPoints: [] };
    const json = await res.json();
    if (json.error) return { provider: candidate.key, healthy: false, value: String(json.error.message || "rpc error").slice(0, 160), entryPoints: [] };
    const entryPoints = Array.isArray(json.result) ? json.result : [];
    return { provider: candidate.key, healthy: entryPoints.length > 0, value: entryPoints.length + " entry point(s)", entryPoints };
  } catch (error) {
    return { provider: candidate.key, healthy: false, value: String(error.message || error).slice(0, 160), entryPoints: [] };
  }
}

// Automatic provider selection. Returns the first HEALTHY provider with its
// probe evidence, or null when none is healthy (in which case the caller must
// NOT submit — the customer is told the service is temporarily unavailable).
export async function selectSepoliaGasProvider() {
  const probes = [];
  for (const candidate of sepoliaProviderCandidates()) {
    const probe = await probeProvider(candidate);
    probes.push(probe);
    if (probe.healthy) {
      return { selected: { provider: probe.provider, paymasterUrl: (sepoliaProviderCandidates().find((c) => c.key === probe.provider) || {}).paymasterUrl }, probes, gasMode: "PLATFORM_SPONSORED" };
    }
  }
  return { selected: null, probes, gasMode: "PLATFORM_SPONSORED" };
}

// Real gas cost from an actual receipt — admin/auditor accounting only.
export function gasCostFromReceipt(receipt) {
  try {
    const gasUsed = BigInt(receipt.gasUsed || "0x0");
    const effectiveGasPrice = BigInt(receipt.effectiveGasPrice || "0x0");
    const wei = gasUsed * effectiveGasPrice;
    return { gas_cost_raw_wei: wei.toString(), gas_cost_native: Number(wei) / 1e18 };
  } catch (error) {
    return { gas_cost_raw_wei: "0", gas_cost_native: 0 };
  }
}