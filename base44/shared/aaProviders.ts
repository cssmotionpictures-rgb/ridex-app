// Provider-independent account-abstraction (ERC-4337) contracts + real
// JSON-RPC clients for CRIXCOIN on Base Mainnet.
//
// CRIXCOIN codes ONLY against the three interfaces below so the primary
// provider (Alchemy) can be replaced later without touching business logic:
//   EmbeddedWalletProvider — creates/controls user smart accounts server-side
//   PaymasterProvider      — sponsors UserOperation gas (users never need ETH)
//   SettlementProvider     — real fiat→ETH settlement into the gas treasury
//
// Nothing in this module simulates: a capability that cannot be probed with
// real credentials is reported NOT_CONFIGURED, never assumed, never faked.
// All calls are plain JSON-RPC over fetch — no SDK, no key material here.

export const AA_STATES = ["NOT_CONFIGURED", "CONFIGURED", "VERIFIED", "OPERATIONAL", "FAILED"];
export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_MAINNET_CHAIN_ID_HEX = "0x2105";

export const PROVIDER_INTERFACES = {
  embedded_wallet: {
    interface: "EmbeddedWalletProvider",
    operations: ["createAccount", "getAccount", "signUserOperation", "waitForUserOperation"],
    description: "Creates and controls user smart accounts (ERC-4337) server-side. No private key material ever enters this app.",
  },
  paymaster: {
    interface: "PaymasterProvider",
    operations: ["getPaymasterStubData", "getPaymasterData", "sponsorshipPolicy"],
    description: "Sponsors UserOperation gas for ordinary sponsored CRIXCOIN transactions so users never need to hold ETH.",
  },
  settlement: {
    interface: "SettlementProvider",
    operations: ["fiatToEthRoute", "treasuryReconciliation"],
    description: "Real fiat→ETH settlement into the existing CRIXCOIN gas treasury. NOT_CONFIGURED until a real route exists.",
  },
};

// Canonical EntryPoint addresses as returned by bundlers — labeled by version.
export const KNOWN_ENTRY_POINTS = {
  "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789": "v0.6",
  "0x0000000071727de22e5e9d8baf0edac6f37da032": "v0.7",
};

export function labelEntryPoints(addresses) {
  if (!Array.isArray(addresses)) return "";
  return addresses
    .map((a) => {
      const label = KNOWN_ENTRY_POINTS[String(a).toLowerCase()];
      return label ? a + " (EntryPoint " + label + ")" : a;
    })
    .join(", ");
}

// One real JSON-RPC call — errors carry the provider's own message, never a
// fabricated substitute.
export async function aaRpcCall(endpoint, method, params) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (!json) throw new Error(method + " → HTTP " + res.status + " · non-JSON response");
  if (json.error) throw new Error(method + " → HTTP " + res.status + " · " + (json.error.message || JSON.stringify(json.error)));
  return json.result;
}

// GASLESS paymaster capability probe (ERC-7677). pm_getPaymasterStubData is a
// stub by definition — it never spends gas, signs nothing, transfers nothing.
// The userOp below is a deterministic probe shape (sender/entrypoint from the
// provider's own documented example), safe for capability verification.
export const PAYMASTER_PROBE_USEROP = {
  sender: "0xF7DCa789B08Ed2F7995D9bC22c500A8CA715D0A8",
  nonce: "0x192a01d5c9a0000000000000000",
  initCode: "0x",
  callData: "0xb61d27f6000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
  callGasLimit: "0x0",
  verificationGasLimit: "0x0",
  preVerificationGas: "0x0",
  maxFeePerGas: "0x0",
  maxPriorityFeePerGas: "0x0",
  paymasterAndData: "0x",
  signature: "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000041fffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c00000000000000000000000000000000000000000000000000000000000000",
};
export const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

export async function probePaymasterStub(endpoint) {
  try {
    const result = await aaRpcCall(endpoint, "pm_getPaymasterStubData", [PAYMASTER_PROBE_USEROP, ENTRY_POINT_V07, BASE_MAINNET_CHAIN_ID_HEX, {}]);
    const paymaster = result && (result.paymaster || String(result.paymasterAndData || "0x").slice(0, 42)) || "";
    return { pass: true, paymaster: paymaster === "0x" ? "" : paymaster };
  } catch (error) {
    return { pass: false, error: String(error.message).slice(0, 220) };
  }
}

// The conditions that must ALL be independently verified on Base Mainnet
// before external on-chain transfers can ever leave PAUSED. Nothing is
// enabled by configuration alone — each gate needs real on-chain evidence.
export const TRANSFER_GATE_CONDITIONS = [
  "Production CRXS contract deployed and server-verified on Base Mainnet",
  "Embedded wallet provider OPERATIONAL — a real smart account was created server-side",
  "A real UserOperation was submitted and sponsored through the paymaster",
  "Base Mainnet confirmation of that UserOperation verified independently",
  "Gas funded — real ETH in the gas treasury or real provider gas credits",
];