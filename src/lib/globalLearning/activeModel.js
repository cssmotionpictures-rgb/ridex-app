// ACTIVE MODEL RESOLVER — the single source of truth for which production
// model FUTURE predictions use. The learning cycle's promotion gate updates
// the ActiveModel registry; consumers resolve the champion through this
// module instead of a hard-coded version, so a genuinely validated promotion
// flows into future predictions automatically. Falls back to the current
// champion (RX-2.0) whenever the registry has not been read yet.
import { base44 } from "@/api/base44Client";

export const FALLBACK_ACTIVE_MODEL = {
  registry_key: "active-model",
  champion_version: "RX-2.0",
  challenger_version: "RX-2.1",
  promotion_status: "REGISTRY NOT READ YET — RX-2.0 is the current champion",
};

const CACHE_KEY = "ridex_active_model_v1";
// Short-lived in-memory memo — prediction-generation callers resolve the
// registry once per scan instead of one read per candidate batch, without
// ever serving a stale promotion decision across long sessions.
const MEMO_TTL_MS = 5 * 60 * 1000;
let memo = null;
let memoAt = 0;

export function getCachedActiveModel() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return FALLBACK_ACTIVE_MODEL;
}

export async function getActiveModel() {
  if (memo && Date.now() - memoAt < MEMO_TTL_MS) return memo;
  try {
    const rows = await base44.entities.ActiveModel.filter({ registry_key: "active-model" }, "-created_date", 1);
    if (rows?.length) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(rows[0]));
      } catch {
        /* storage unavailable */
      }
      memo = rows[0];
      memoAt = Date.now();
      return rows[0];
    }
  } catch {
    /* registry read failed — cached/fallback champion is still the honest answer */
  }
  return getCachedActiveModel();
}