// GLOBAL PREDICTION IDENTITY — one deterministic id for every prediction made
// anywhere in RIDE X. Every prediction surface speaks its own dialect, but the
// global learning engine joins them all through this id. Idempotent by
// construction: the same prediction can never enter the Global Prediction
// Ledger twice, and a pre-kickoff change creates a NEW version id — history is
// never overwritten.

export const GLOBAL_MODEL_VERSION = "RX-GLOBAL-1.0";
export const LEARNING_VERSION = "L-000";

export function globalPredictionId(source, model, fixtureId, marketKey, version = 1) {
  const clean = (s) => String(s ?? "").replace(/\|/g, "/").trim() || "unknown";
  return [clean(source), clean(model), clean(fixtureId), clean(marketKey), `v${Number(version) || 1}`].join("|");
}

export function oddsRangeOf(odds) {
  const o = Number(odds) || 0;
  if (o < 1.01) return "model only";
  if (o < 1.5) return "<1.50";
  if (o < 2) return "1.50–1.99";
  if (o < 3) return "2.00–2.99";
  if (o < 4) return "3.00–3.99";
  return "4.00+";
}

export function marketFamilyOf(marketKey) {
  const k = String(marketKey || "");
  if (k === "1") return "home win";
  if (k === "X") return "draw";
  if (k === "2") return "away win";
  if (["1X", "X2", "12"].includes(k)) return "double chance";
  if (/^O/.test(k)) return "over";
  if (/^U/.test(k)) return "under";
  if (/^BTTS/.test(k)) return "btts";
  if (/^DNB/.test(k)) return "draw no bet";
  return k || "unknown";
}

// Duplicate-protection hash for pasted result batches — the same text pasted
// twice (lines reordered, whitespace changed) resolves to the same hash and is
// refused, never double-counted.
export function importHash(text) {
  const norm = String(text || "")
    .toLowerCase()
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .sort()
    .join("\n");
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h * 33) ^ norm.charCodeAt(i)) >>> 0;
  return `imp-${h.toString(16)}-${norm.length}`;
}