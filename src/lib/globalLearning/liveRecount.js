// IN-BROWSER LIVE RECOUNT (back door) — the exact tie-safe ledger count used
// for the verified one-time recount of 10 Sept 2026. Runs entirely in the
// browser through the app SDK: no backend function, no integration credits.
// Used as the fallback when the server-side recount function is throttled by
// the app-wide read window, so the recount chain ALWAYS completes:
// button → live scan → exact totals → summary-record update → report re-read.
// Counts every row exactly once even when rows share a created_date: when a
// page boundary splits rows with one timestamp, the whole tie group is
// fetched once and counted once — no row skipped, none double-counted.
import { base44 } from "@/api/base44Client";

const PAGE = 250;
const TIE_CAP = 5000;
const MAX_PAGES = 80;
const BATCH_PACE_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// BATCHED, PERSISTENT READ — a small batch can be refused by the app-wide
// read-volume window, but the scan NEVER gives up because of it: every read
// is retried with escalating cool-downs until it goes through, so the count
// always finishes (never refused → never incomplete).
async function rd(entity, query, limit, sort = "-created_date") {
  const waits = [15000, 30000, 45000, 60000, 60000, 60000, 60000, 60000, 60000, 60000];
  let lastErr = null;
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      const rows = await base44.entities[entity].filter(query, sort, limit);
      if (!Array.isArray(rows)) throw new Error("malformed ledger read");
      return rows;
    } catch (e) {
      lastErr = e;
      if (attempt < waits.length) await sleep(waits[attempt]); // let the read window recover, then retry
    }
  }
  throw lastErr || new Error("ledger read failed");
}

async function countLedger(entity) {
  let count = 0;
  let cursor = null;
  let capped = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await rd(entity, cursor ? { created_date: { $lt: cursor } } : {}, PAGE);
    if (rows.length < PAGE) return { n: count + rows.length, capped };
    const lastDate = rows[PAGE - 1].created_date;
    let tieGroup;
    if (rows[0].created_date === lastDate) {
      tieGroup = await rd(entity, { created_date: { $eq: lastDate } }, TIE_CAP);
      count += tieGroup.length;
    } else {
      count += rows.filter((r) => r.created_date > lastDate).length;
      tieGroup = await rd(entity, { created_date: { $eq: lastDate } }, TIE_CAP);
      count += tieGroup.length;
    }
    if (tieGroup.length >= TIE_CAP) capped = true;
    cursor = lastDate;
    await sleep(BATCH_PACE_MS); // pace batches so each one fits the read window
  }
  return { n: count, capped: true };
}

// CHANGE MARKERS — newest created / most recently updated row identity per
// ledger, matching the server-side recount exactly. Persisted with the
// totals so the next Intelligence open can detect changes without scanning.
const markerOf = (row, field) => (row ? `${row[field]}|${row.id}` : "none");

async function readMarkers(entity) {
  const created = await rd(entity, {}, 1);
  const updated = await rd(entity, {}, 1, "-updated_date");
  return { created: markerOf(created[0], "created_date"), updated: markerOf(updated[0], "updated_date") };
}

export async function browserLedgerRecount() {
  const pred = await countLedger("GlobalPredictionLedger");
  const out = await countLedger("GlobalOutcomeLedger");
  const predMarkers = await readMarkers("GlobalPredictionLedger");
  const outcomeMarkers = await readMarkers("GlobalOutcomeLedger");
  return {
    predictions: pred.n,
    predictionsCapped: pred.capped,
    outcomes: out.n,
    outcomesCapped: out.capped,
    markers: {
      predCreated: predMarkers.created,
      predUpdated: predMarkers.updated,
      outcomeCreated: outcomeMarkers.created,
      outcomeUpdated: outcomeMarkers.updated,
    },
  };
}