// CDP server-side adapter — implements the EmbeddedWalletProvider and
// PaymasterProvider interfaces (see aaProviders.ts) against Coinbase
// Developer Platform, the single chosen provider for CRIXCOIN on Base
// Mainnet. Server-side only; credential values never leave this module.
//
// Nothing here simulates: a missing credential is reported NOT_CONFIGURED,
// and a capability is only marked real when CDP / Base Mainnet actually
// answered. The provider-independent interfaces remain the only surface
// CRIXCOIN business logic codes against, so CDP can be replaced later
// without touching any other file.

import { secrets } from "base44:runtime";
import { CdpClient } from "npm:@coinbase/cdp-sdk@1.55.0";

export const CDP_NETWORK = "base";
export const CDP_CHAIN_ID = 8453;

// SELF-FUNDING GAS ENGINE — every CRIXCOIN transfer carries a small fee paid
// in CRIXCOIN. The user never sees or pays ETH.
export const PLATFORM_FEE_BPS = 20n; // 0.2% — user-facing: "Network fee: 0.2% (paid in CRIXCOIN)"

// CDP's ERC-20 paymaster on Base Mainnet (from the master architecture file).
// It takes CRXS to pay gas in ETH — this address MUST be re-verified live
// on-chain (eth_getCode) before the transfer gate ever opens. Never assumed.
export const CRXS_ERC20_PAYMASTER_BASE_MAINNET = "0x2FAEB0760D4230Ef2aC21496Bb4F0b47D634FD4c";

// Defensive secret read — optional credentials (e.g. CDP_WALLET_SECRET before
// the Portal one is created) report as missing instead of crashing the
// adapter whose job is to state exactly what is not configured yet.
export function readCdpSecret(name) {
  try {
    const value = secrets.get(name);
    return value || null;
  } catch (error) {
    return null;
  }
}

export function readCdpCredentials() {
  const missing = [];
  const apiKeyId = readCdpSecret("CDP_API_KEY_ID");
  if (!apiKeyId) missing.push("CDP_API_KEY_ID");
  const apiKeySecret = readCdpSecret("CDP_API_SECRET");
  if (!apiKeySecret) missing.push("CDP_API_SECRET");
  const walletSecret = readCdpSecret("CDP_WALLET_SECRET");
  if (!walletSecret) missing.push("CDP_WALLET_SECRET (create it alongside the CDP API key in the Portal — required for server-side smart account creation)");
  const paymasterUrl = readCdpSecret("CDP_PAYMASTER_URL");
  if (!paymasterUrl) missing.push("CDP_PAYMASTER_URL (Portal → Onchain Tools → Paymaster, Base Mainnet selected)");
  return { apiKeyId, apiKeySecret, walletSecret, paymasterUrl, missing };
}

// The platform fee collection address — accumulates CRXS fees that later fund
// gas through the settlement route. Set it in Settings → Secrets once the
// real address exists; until then transfers honestly refuse.
export function readPlatformFeeWallet() {
  return readCdpSecret("CRXS_PLATFORM_FEE_WALLET");
}

export function buildCdpClient(creds) {
  return new CdpClient({
    apiKeyId: creds.apiKeyId,
    apiKeySecret: creds.apiKeySecret,
    walletSecret: creds.walletSecret,
  });
}

// TRANSFER GATE — the single authority on whether external on-chain movement
// is allowed. Reads the server-maintained gate row; it is OPERATIONAL only
// after every real on-chain condition was independently verified.
export async function readTransferGate(service) {
  const rows = await service.entities.CrxsAAProviderStatus.filter({ registry_key: "crxs-aa-transfer-gate" });
  const row = (rows || [])[0] || null;
  return row ? row.state : "NOT_CONFIGURED";
}

// The REAL production CRXS contract on Base Mainnet — only from the verified
// deployment record, never from a client submission, never a Sepolia address.
export async function readMainnetCrxsContract(service) {
  const rows = await service.entities.CrxsMainnetDeploymentRecord.filter({ registry_key: "crxs-mainnet-deployment" });
  const row = (rows || [])[0] || null;
  return row && row.deployment_status === "DEPLOYED" && row.contract_address ? row.contract_address : null;
}

// CDP user-operation status → the CRIXCOIN transaction state machine
// (created → submitted → pending → confirmed | failed | unknown).
// "unknown" is a real state, never silently resolved into failed.
export function mapUserOpStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "complete" || s === "confirmed" || s === "success") return "confirmed";
  if (s === "failed" || s === "reverted") return "failed";
  if (s === "unknown") return "unknown";
  return "pending";
}