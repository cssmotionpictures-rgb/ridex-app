// IDEMPOTENCY GATES — the shared write-safety layer for every ledger writer.
//
// REQUIRED RULE: a write happens ONLY after the duplicate/identity check has
// been VERIFIED with a successful read. A throttled (429), timed-out or
// malformed check read PAUSES the write — never a silent continue. A
// silently-empty result is the exact failure mode that duplicated the
// observation ledger and the global ledger, so no writer may proceed on an
// unverified pool.
//
// Identity rules (from the duplicate audit):
//  - the deterministic key (observation_key / global_prediction_id) IS the
//    identity — display text, odds, confidence and provider payload wording
//    are NEVER identity fields
//  - batch sizes are bounded so a duplicate-heavy legacy ledger (up to ~40
//    copies per identity) can never overflow a single read and make an
//    existing identity look absent
import { base44 } from "@/api/base44Client";
import { ReadFailure } from "@/lib/globalLearning/safeReads";

export const PAUSED_DUP_WRITE_MESSAGE =
  "WRITE PAUSED — DUPLICATE CHECK COULD NOT BE VERIFIED. No records were written. The operation retries on the next run.";

const pace = (ms) => new Promise((r) => setTimeout(r, ms));
const describeError = (e) => String(e?.message || e?.detail || e || "read unavailable").slice(0, 160);

// One batched identity read with bounded retries. THROWS ReadFailure after
// the retries are exhausted — a failure is never returned as "no matches".
async function readBatch(entityName, keyField, batch, { retries = 2, baseDelayMs = 900 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await pace(baseDelayMs * attempt);
    try {
      const rows = await base44.entities[entityName].filter({ [keyField]: { $in: batch } }, "created_date", 1000);
      if (!Array.isArray(rows)) throw new Error("malformed read response — expected a record list");
      return rows;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new ReadFailure(`duplicate check (${entityName}.${keyField})`, describeError(lastErr));
}

// Batched $in identity check. Returns a Set of keys that ALREADY exist.
// Any read failure throws — the caller MUST pause before writing.
export async function existingKeySet(entityName, keyField, keys, opts = {}) {
  const found = new Set();
  const unique = [...new Set((keys || []).filter(Boolean))];
  const batchSize = opts.batchSize || 25;
  for (let i = 0; i < unique.length; i += batchSize) {
    if (i) await pace(400); // pace reads — burst reads trip the platform's traffic limit
    const rows = await readBatch(entityName, keyField, unique.slice(i, i + batchSize), opts);
    for (const r of rows) found.add(r[keyField]);
  }
  return found;
}

// Same batched check, keeping the EARLIEST-CREATED existing row per key —
// the canonical record (oldest wins; immutable history is never displaced
// by a later copy). Any read failure throws — pause before writing.
export async function existingRowMap(entityName, keyField, keys, opts = {}) {
  const map = new Map();
  const unique = [...new Set((keys || []).filter(Boolean))];
  const batchSize = opts.batchSize || 25;
  for (let i = 0; i < unique.length; i += batchSize) {
    if (i) await pace(400);
    const rows = await readBatch(entityName, keyField, unique.slice(i, i + batchSize), opts);
    for (const r of rows) {
      const cur = map.get(r[keyField]);
      if (!cur || String(r.created_date || "") < String(cur.created_date || "")) map.set(r[keyField], r);
    }
  }
  return map;
}

// Presentation-layer dedup — one row per RECORD ID. Display text is never a
// dedup key: two distinct records that happen to share a name stay separate.
export function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}