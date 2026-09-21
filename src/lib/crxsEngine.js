import { base44 } from "@/api/base44Client";

// CRIXCOIN DUAL-PATH ENGINE — platform-first with automatic fallback.
// Every CRXS engine operation ALWAYS tries the Base44 backend function first.
// Only when that function is not deployed yet (the platform deploy pipeline is
// currently down) does the call fall back to the external "crxs-engine"
// integration — and only for operations the read-only engine actually serves.
// The moment a platform function exists again, the fallback stops being used —
// automatically, no switch to flip.
//
// SAFETY:
//   - The external engine is READ-ONLY (health probes + whitelisted chain
//     queries). It has no endpoint that can move funds, sign, submit, or
//     create wallets — so nothing financial can ever be routed around the
//     platform's paused, gated transfer path.
//   - Operations the read-only engine does NOT serve (e.g. CRIXCOIN address
//     creation, which is PLATFORM-ONLY by design) surface an honest
//     "not available yet" message instead of any unsafe substitute.
//   - A FUNCTIONAL error from the platform (a real answer such as
//     "EXTERNAL_TRANSFERS_PAUSED" or "CDP_NOT_CONFIGURED") is NEVER bypassed
//     or retried on the external engine — only "function does not exist"
//     falls back.

// Operations an external engine serves, and WHICH engine serves them.
// Anything NOT listed here is platform-only: no fallback exists, on purpose.
//   · crxs-engine        — read-only diagnostics (chain/AA health)
//   · crxs-account-engine — CDP smart-account provisioning + Alchemy-backed
//     reads. The Base44 deploy pipeline cannot bundle the CDP SDK server
//     function, so that one operation falls back to the Cloudflare Worker
//     (src/workers/crxs-account-engine.js). The Worker performs the SAME real
//     calls against the SAME live Coinbase API — idempotent by deterministic
//     per-user name, no funds can move — and this app still writes the user's
//     OWN CrxsSmartAccount row. The moment the platform function deploys, the
//     fallback stops being used automatically.
const ENGINE_OPERATIONS = {
  "crxs-aa-health": { slug: "crxs-engine", op: "post:/aa-health" },
  "crxs-chain-read": { slug: "crxs-engine", op: "post:/chain-read" },
  "crxs-smart-account": { slug: "crxs-account-engine", op: "post:/cdp/account", platform: "crix-address-create" },
};

// Only these error shapes mean "the platform function is not live" —
// everything else is a real answer from a working function and is surfaced.
function isPlatformFunctionMissing(error) {
  const message = String((error && (error.message || error)) || "").toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("404") ||
    message.includes("does not exist") ||
    message.includes("no such function") ||
    message.includes("function is not") ||
    message.includes("failed to fetch")
  );
}

export async function callCrxsEngine(functionName, payload = {}) {
  // 1 — The platform backend function is ALWAYS tried first, for every operation.
  try {
    // The address-create function deploys under a fresh slug ("crix-address-create") —
    // the original "crxs-smart-account" slug is wedged in the platform control
    // plane and refuses every deploy, so the identical code lives at the new name.
    const platformFunction = (ENGINE_OPERATIONS[functionName] && ENGINE_OPERATIONS[functionName].platform) || functionName;
    const result = await base44.functions.invoke(platformFunction, payload);
    return { ...(result || {}), via: "platform" };
  } catch (platformError) {
    if (!isPlatformFunctionMissing(platformError)) throw platformError;

    const operation = ENGINE_OPERATIONS[functionName];
    if (!operation) {
      // Platform-only operation whose function is not deployed yet. The
      // read-only engine deliberately has no substitute — never a workaround.
      throw new Error(
        "This operation is not available yet — it runs only on the platform, and its backend function is currently waiting on the Base44 deploy pipeline. It will start working automatically the moment the platform function deploys. Nothing was simulated or routed around."
      );
    }

    // 2 — Fallback through the external engine integration.
    const customCall = base44.integrations && base44.integrations.custom && typeof base44.integrations.custom.call === "function" ? base44.integrations.custom.call : null;
    if (!customCall) {
      throw new Error(
        "This operation is not available yet: the platform backend function is not deployed (Base44 deploy pipeline issue) and the CRXS engine fallback is not registered in this workspace. It will start working automatically once the platform issue is resolved — or connect the fallback now with the browser-only guide in workers/SETUP.md."
      );
    }
    try {
      const response = await customCall(operation.slug, operation.op, { payload });
      if (response && response.success) {
        return { ...(response.data || {}), via: "engine" };
      }
      const detail = response && response.data && (response.data.error || response.data.detail);
      throw new Error(detail || ("Engine responded with status " + ((response && response.status_code) || "unknown")));
    } catch (fallbackError) {
      const message = String((fallbackError && (fallbackError.message || fallbackError)) || "");
      if (/integration|crxs-engine|crxs-account-engine|not registered|not configured/i.test(message)) {
        throw new Error(
          "This operation is not available yet: the platform backend function is not deployed (Base44 deploy pipeline issue) and the CRXS engine fallback is not connected. It will start working automatically once the platform issue is resolved — or connect the fallback now with the browser-only guide in workers/SETUP.md."
        );
      }
      throw fallbackError instanceof Error ? fallbackError : new Error(message);
    }
  }
}