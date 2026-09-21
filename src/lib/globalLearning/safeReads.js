// FAIL-SAFE READS — the strict data-integrity gate for the import pipelines
// and the learning layer. A throttled (429), timed-out, unavailable or
// malformed read must NEVER be treated as an empty dataset: dedup and
// matching decisions made on a silently-empty pool are exactly what creates
// duplicate tickets, failed matches and double-counted evidence.
//
// REQUIRED RULE: READ FAILURE → IMPORT PAUSED / BLOCKED → RETRY.
// Never silently continue. Writes only happen after every prerequisite read
// has SUCCEEDED.
import { base44 } from "@/api/base44Client";

export const PAUSED_READ_MESSAGE =
  "Import temporarily paused. Please retry shortly. No records were changed.";
export const PAUSED_DUP_MESSAGE =
  "IMPORT PAUSED — DUPLICATE CHECK COULD NOT BE VERIFIED. No records were changed. Please retry shortly.";

export class ReadFailure extends Error {
  constructor(label, reason) {
    super(`${label} failed (${reason}) — the import was paused before any records were changed`);
    this.name = "ReadFailure";
    this.label = label;
    this.reason = reason;
  }
}

const DEFAULT_RETRY = { retries: 2, baseDelayMs: 900 };

const describeError = (e) => String(e?.message || e?.detail || e || "read unavailable").slice(0, 160);

// One strict read with bounded retries. The read fn must THROW on failure —
// a swallowed error can never reach this gate — and must return an ARRAY: a
// malformed/incomplete response is a failure, not an empty dataset. RETRYING
// is surfaced through onState so the caller can show honest state.
export async function readOrThrow(
  fn,
  label,
  { retries = DEFAULT_RETRY.retries, baseDelayMs = DEFAULT_RETRY.baseDelayMs, onState = () => {} } = {}
) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) {
      onState("RETRYING");
      await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
    }
    try {
      const res = await fn();
      if (!Array.isArray(res)) throw new Error("malformed read response — expected a record list");
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new ReadFailure(label, describeError(lastErr));
}

// Strict paged read — mirrors the paced fetchAll transport, but every page
// failure THROWS (after its own bounded retries) instead of degrading to a
// silently-empty pool.
export async function fetchAllStrict(
  entity,
  sort,
  { retries = DEFAULT_RETRY.retries, baseDelayMs = DEFAULT_RETRY.baseDelayMs, onState = () => {}, label = "" } = {}
) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise((r) => setTimeout(r, 400)); // pace reads — burst reads trip the platform's traffic limit
    const page = await readOrThrow(
      () => base44.entities[entity].filter({}, sort, 1000),
      label || `entity read (${entity})`,
      { retries, baseDelayMs, onState }
    );
    if (!page.length) break;
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}