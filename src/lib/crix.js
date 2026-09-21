import { base44 } from "@/api/base44Client";

// CRIX client helpers — display + invocation only. All money logic lives in the
// server-side crix-wallet function; the client never computes or trusts a balance.

export const CRIX_FIAT = [
  { code: "NGN", symbol: "₦", flag: "🇳🇬", name: "Nigerian Naira" },
  { code: "USD", symbol: "$", flag: "🇺🇸", name: "US Dollar" },
  { code: "GBP", symbol: "£", flag: "🇬🇧", name: "British Pound" },
  { code: "EUR", symbol: "€", flag: "🇪🇺", name: "Euro" },
  { code: "CAD", symbol: "C$", flag: "🇨🇦", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", flag: "🇦🇺", name: "Australian Dollar" },
  { code: "CHF", symbol: "₣", flag: "🇨🇭", name: "Swiss Franc" },
  { code: "JPY", symbol: "¥", flag: "🇯🇵", name: "Japanese Yen" },
  { code: "ZAR", symbol: "R", flag: "🇿🇦", name: "South African Rand" },
  { code: "GHS", symbol: "₵", flag: "🇬🇭", name: "Ghanaian Cedi" },
  { code: "KES", symbol: "KSh", flag: "🇰🇪", name: "Kenyan Shilling" },
  { code: "KWD", symbol: "KD", flag: "🇰🇼", name: "Kuwaiti Dinar" },
];

export const CRX_ASSET = { code: "CRX", symbol: "CRX", flag: "◆", name: "CrixCoin — native Crix Network asset" };

export const crixMeta = (code) => CRIX_FIAT.find((c) => c.code === code) || CRX_ASSET;

export function formatCrix(amount, code) {
  const meta = crixMeta(code);
  const n = Number(amount || 0);
  // KWD is a three-decimal currency (1 Dinar = 1,000 fils) — shown correctly.
  const decimals = code === "JPY" ? 0 : code === "KWD" ? 3 : 2;
  return meta.symbol + n.toLocaleString("en-NG", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "crx-" + Date.now() + "-" + Math.random().toString(36).slice(2);

// CRIXCOIN DUAL-CHANNEL ROUTING (§28 dual-path, same pattern as crxsEngine):
//   • Reads (balances, activity, receipts) use direct permission-protected data
//     reads — they NEVER depend on the processing channel and keep working
//     through any platform outage.
//   • CRXS diagnostics try the platform first and auto-fall back to the
//     read-only external engine (see crxsEngine.js).
//   • Money operations (open/send/freeze) run ONLY on the platform's secured
//     server function — always tried first. They are NEVER rerouted to a
//     browser or external substitute, because no substitute can be atomic,
//     idempotent and audited. If the platform channel itself is unreachable
//     (deploy-pipeline / transport outage), they refuse with the honest
//     message below and resume AUTOMATICALLY the moment the channel answers
//     again — no switch to flip, no conflict with the pause gates.

const CHANNEL_DOWN_MESSAGE =
  "Crix secure processing is temporarily unavailable (platform maintenance). Nothing was moved and nothing was rerouted — money operations run only on the secured server so they stay atomic and protected. Your balances and full history remain visible and safe, and this resumes automatically the moment the channel is back.";

function isPlatformChannelDown(e) {
  const raw = String((e && (e.message || e)) || "").trim().toLowerCase();
  if (/^(not found|404)$/.test(raw)) return true;
  if (/\b(function not found|no such function|does not exist)\b/.test(raw)) return true;
  if (/backend function .*not (found|deployed)|function .*not deployed/i.test(raw)) return true;
  if (/\b(failed to fetch|fetch failed|load failed|networkerror|network error)\b/.test(raw)) return true;
  if (/\b(502|503|504)\b|bad gateway|service unavailable|gateway timeout/.test(raw)) return true;
  return false;
}

export async function invokeCrixFunction(name, payload) {
  try {
    const res = await base44.functions.invoke(name, payload);
    return res.data;
  } catch (e) {
    const data = e?.response?.data || e?.data;
    // A real answer from a WORKING function is always surfaced as-is —
    // including honest refusals (pause gate, validation, risk holds).
    // An undeployed/missing function is a channel outage, never shown raw.
    if (data?.error || data?.message) {
      if (isPlatformChannelDown({ message: data.error || data.message })) {
        throw new Error(CHANNEL_DOWN_MESSAGE);
      }
      throw new Error(data.error || data.message);
    }
    if (isPlatformChannelDown(e)) {
      throw new Error(CHANNEL_DOWN_MESSAGE);
    }
    throw new Error("Crix is unavailable right now — nothing was moved.");
  }
}

export async function invokeCrix(payload) {
  return invokeCrixFunction("crix-wallet", payload);
}