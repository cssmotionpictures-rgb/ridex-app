// INTELLIGENCE PAGE SNAPSHOT CACHE — cache-first reads for the Prediction
// Intelligence dashboard. The page used to re-traverse the ENTIRE global
// prediction ledger (thousands of raw rows across paced pages) on every open,
// repeatedly saturating the app-wide read window that every other surface of
// the app also needs. Now the canonical projection is persisted once as a
// snapshot, and every later open verifies freshness with a TWO-ROW
// change-marker probe instead of a scan:
//   · markers unchanged → zero heavy ledger reads this open
//   · markers changed   → one paced, batched background recount that saves
//     the new snapshot (last-good stays visible while it runs)
//   · probe throttled   → the cached snapshot stays on screen (PARTIAL),
//     and only the explicit "Sync all sections" button forces a full recount
import { base44 } from "@/api/base44Client";

const CACHE_VERSION = 3;
export const INTEL_CACHE_KEY = "ridex_intel_snapshot_v3";

// Heavy immutable blob fields — recorded on the ledger for audit, never used
// by the dashboard sections. Stripped from the cached copy so the snapshot
// fits browser storage comfortably.
const HEAVY_FIELDS = ["snapshot_json", "provenance_json", "models_json"];
const MAX_CACHED_STRING = 4000; // safety net: no giant blob is ever cached

export function slimRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const key of Object.keys(row)) {
    if (HEAVY_FIELDS.includes(key)) continue;
    const value = row[key];
    if (typeof value === "string" && value.length > MAX_CACHED_STRING) continue;
    out[key] = value;
  }
  return out;
}

export function readIntelCache() {
  try {
    const raw = localStorage.getItem(INTEL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== CACHE_VERSION || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeIntelCache(snapshot) {
  try {
    localStorage.setItem(
      INTEL_CACHE_KEY,
      JSON.stringify({ ...snapshot, v: CACHE_VERSION, savedAt: new Date().toISOString() })
    );
    return true;
  } catch {
    return false; // storage full/unavailable — the page just falls back to live reads
  }
}

export function clearIntelCache() {
  try { localStorage.removeItem(INTEL_CACHE_KEY); } catch { /* storage unavailable */ }
}

// Change markers computed from a FULL traversal: the newest-created row and
// the most-recently-updated row. A single later create or update anywhere in
// the ledger changes at least one marker — that is what makes the tiny probe
// a safe freshness test for the cached snapshot.
export function markersFromRows(rows) {
  let newestCreated = null;
  let latestUpdated = null;
  for (const r of rows || []) {
    if (!r) continue;
    if (!newestCreated || String(r.created_date || "") > String(newestCreated.created_date || "")) newestCreated = r;
    if (!latestUpdated || String(r.updated_date || "") > String(latestUpdated.updated_date || "")) latestUpdated = r;
  }
  return {
    created: newestCreated ? `${newestCreated.created_date}|${newestCreated.id}` : "",
    updated: latestUpdated ? `${latestUpdated.updated_date}|${latestUpdated.id}` : "",
  };
}

// TINY CHANGE-MARKER PROBE — two single-row reads instead of a ledger scan.
export async function probeLedgerMarkers() {
  const [newest, latest] = await Promise.all([
    base44.entities.GlobalPredictionLedger.list("-created_date", 1),
    base44.entities.GlobalPredictionLedger.list("-updated_date", 1),
  ]);
  const c = Array.isArray(newest) && newest[0];
  const u = Array.isArray(latest) && latest[0];
  return {
    created: c ? `${c.created_date}|${c.id}` : "",
    updated: u ? `${u.updated_date}|${u.id}` : "",
  };
}

// Fresh ONLY on an exact marker match from a non-empty probe — an empty or
// failed probe is never treated as "verified fresh" (safe direction: recount).
export function markersUnchanged(cached, current) {
  if (!cached || !current) return false;
  if (!current.created && !current.updated) return false;
  return cached.created === current.created && cached.updated === current.updated;
}