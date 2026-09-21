// Client side of the Coinbase-free CRIXCOIN address flow.
//
// Everything happens in the customer's browser: their wallet provides the
// owner address and a personal_sign signature, and the account address is
// derived by the OFFICIAL Basescan-verified ERC-4337 SimpleAccountFactory on
// Base Mainnet — a plain blockchain read through public RPC. No Coinbase API,
// no billing, no custody, no key material in this app.
//
// The server independently re-derives and verifies everything before recording
// the address (crix-address-register), so a tampered browser cannot fake it.

import { connectMetaMask, walletRequest } from "@/lib/metamaskConnect";

export const SIMPLE_ACCOUNT_FACTORY = "0x91e60e0613810449d098b0b5ec8b51a0fe8c8985";
export const GET_ADDRESS_SELECTOR = "0x8cb84e18"; // getAddress(address,uint256)
const RPCS = ["https://mainnet.base.org", "https://base-rpc.publicnode.com"];

// Deterministic per-user salt (must match the server exactly).
export async function saltHexFor(userId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("CRIXCOIN-ADDRESS-SALT-V1|" + userId));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The binding message the customer signs (must match the server exactly).
export function bindingMessage(userId, owner) {
  return (
    "CRIXCOIN-ADDRESS-BINDING-V1\n" +
    "user_id: " + userId + "\n" +
    "owner: " + String(owner).toLowerCase() + "\n" +
    "chain: base-mainnet\n" +
    "factory: " + SIMPLE_ACCOUNT_FACTORY
  );
}

// Preview the account address in-browser via the official factory's view
// method. Fails closed — if no public Base endpoint answers, nothing proceeds.
export async function deriveAccountAddressInBrowser(owner, saltHex) {
  const calldata =
    GET_ADDRESS_SELECTOR.slice(2) +
    String(owner).toLowerCase().replace(/^0x/, "").padStart(64, "0") +
    saltHex;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "eth_call", params: [{ to: SIMPLE_ACCOUNT_FACTORY, from: owner, data: "0x" + calldata }, "latest"] }),
      });
      const j = await res.json();
      if (typeof j.result === "string" && j.result.length === 66) {
        return "0x" + j.result.slice(-40).toLowerCase();
      }
    } catch (e) {
      // try the next public endpoint
    }
  }
  throw new Error("Could not read the Base network right now. Nothing was created — please check your connection and try again.");
}

// Full in-browser preparation: connect the wallet, derive the address preview
// from the official factory, and sign the binding message with the owner key.
// Returns { owner, signature, preview } for the server function to verify.
export async function prepareCrixCoinAddress(userId) {
  const session = await connectMetaMask();
  const owner = String(session.account).toLowerCase();
  const saltHex = await saltHexFor(userId);
  const preview = await deriveAccountAddressInBrowser(owner, saltHex);
  const message = bindingMessage(userId, owner);
  const hexMessage = "0x" + Array.from(new TextEncoder().encode(message)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const signature = await walletRequest("personal_sign", [hexMessage, session.account]);
  return { owner, signature: String(signature).toLowerCase(), preview };
}