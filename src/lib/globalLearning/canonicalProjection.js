// CANONICAL PROJECTION — the single deduplication rule for every customer-facing
// projection of the prediction ledger (Results & History, global performance,
// calibration, model comparison, learning evidence). One prediction identity =
// one visible result, one counted win/loss/void, one learning observation.
//
// IDENTITY — the canonical prediction identity is the deterministic
// GLOBAL_PREDICTION_ID (source_section | model_version | fixture_id |
// market_key | vN) already used by ingestion and settlement. When it is
// absent, the identity is reconstructed from the same immutable fields. Team
// names and scores are NEVER identity — espn-401816851 (Sep 7, 6–5) and
// espn-401816866 (Sep 9, 2–0) are two DIFFERENT predictions and stay separate.
//
// Raw duplicate / re-ingestion copies stay on the immutable ledger untouched —
// they remain available to audit, cleanup history and forensic tools — but they
// are never displayed or counted as separate finished predictions.
//
// This module NEVER mutates, merges or deletes ledger data. It is a pure
// projection: deduplication happens BEFORE any filtering, counting or
// pagination, so no boundary can re-split a duplicated identity.

const GRADED = new Set(["won", "lost", "void", "push", "cancelled"]);

// The deterministic identity of a prediction row. Rows sharing this key are
// copies of ONE prediction; rows differing in model version or prediction
// version are distinct predictions and are never collapsed.
export function canonicalIdentityOf(row) {
  if (!row) return "";
  if (row.global_prediction_id) return String(row.global_prediction_id);
  // Fallback: reconstruct from the immutable identity fields — the same
  // components the global id itself is built from.
  if (row.fixture_id) {
    return [
      String(row.source_section || ""),
      String(row.model_version || ""),
      String(row.fixture_id || ""),
      String(row.canonical_market || row.market_key || ""),
      String(row.prediction_version || 1),
    ].join("|");
  }
  // No global id AND no provider fixture id — identity is ambiguous, and
  // ambiguous rows are NEVER silently merged: each stays its own record.
  return `unresolved:${row.id}`;
}

const createdOf = (r) => String(r.created_date || r.recorded_at || "");

// Canonical copy of an identity: a graded (settled) record beats an open copy
// — the canonical row must carry the real result — then the earliest-created
// record wins, which is the ledger's own canonical rule (settlement mirrors
// append to the earliest-created row). Ties break deterministically by id.
function better(a, b) {
  const ga = GRADED.has(a.status) ? 0 : 1;
  const gb = GRADED.has(b.status) ? 0 : 1;
  if (ga !== gb) return ga < gb;
  const ca = createdOf(a);
  const cb = createdOf(b);
  if (ca !== cb) return ca < cb;
  return String(a.id) < String(b.id);
}

// One canonical row per prediction identity, in the order the identities were
// first seen. Duplicate copies are excluded here — BEFORE any consumer counts,
// filters or paginates.
export function canonicalizeRows(rows) {
  const groups = new Map();
  for (const r of rows || []) {
    if (!r) continue;
    const key = canonicalIdentityOf(r);
    if (!key) continue;
    const cur = groups.get(key);
    if (!cur || better(r, cur)) groups.set(key, r);
  }
  return [...groups.values()];
}

// Unique-identity counters — what every Results & History / performance
// surface must report. A prediction with 12 duplicate ledger rows counts as
// 1 finished prediction and 1 result, never 12 wins.
export function canonicalStats(rows) {
  const canon = canonicalizeRows(rows);
  const finished = canon.filter((r) => GRADED.has(r.status));
  const count = (st) => finished.filter((r) => r.status === st).length;
  return {
    raw: (rows || []).length,
    unique: canon.length,
    duplicateCopiesExcluded: (rows || []).length - canon.length,
    finished: finished.length,
    won: count("won"),
    lost: count("lost"),
    void: count("void") + count("push") + count("cancelled"), // counts toward nothing
  };
}