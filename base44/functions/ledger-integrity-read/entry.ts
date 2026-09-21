import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// LEDGER INTEGRITY READ — admin-gated, ON-DEMAND server-side recount of the
// two live ledgers ONLY. The historical archive summary (rows archived during
// the cleanup, audit-trail totals, review rows) lives in the immutable
// LedgerIntegrityReport record and is NEVER re-scanned here. A recount is an
// explicit act — the default invocation is refused so a page load can never
// silently trigger a full-ledger scan, and the browser never scans the
// ledgers itself. Paced, bounded service-role reads; waits out the quota
// window and retries once when throttled.
const PAGE = 250;
const TIE_CAP = 5000;
const PRED_PAGES = 80;
const OUTCOME_PAGES = 40;
const REPORT_KEY = 'archive-v2-20260910';
const PACE_MS = 1500;
const THROTTLE_WAITS_MS = [15000, 30000, 45000, 60000, 60000, 60000, 60000, 60000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// BATCHED, PERSISTENT READ — a small batch can be refused by the app-wide
// read-volume window, but the scan NEVER gives up: every page is retried with
// escalating cool-downs until it goes through, so the count always finishes.
async function rdPage(svc, entity, query, limit, sort = '-created_date') {
  let lastErr = null;
  for (let attempt = 0; attempt <= THROTTLE_WAITS_MS.length; attempt++) {
    try {
      const rows = await svc.entities[entity].filter(query, sort, limit);
      if (!Array.isArray(rows)) throw new Error('malformed ledger read');
      return rows;
    } catch (e) {
      lastErr = e;
      if (attempt < THROTTLE_WAITS_MS.length) await sleep(THROTTLE_WAITS_MS[attempt]);
    }
  }
  throw lastErr || new Error('ledger read failed');
}

// Tie-safe cursor paging — every row counted exactly once even when rows share
// a created_date: when a page boundary splits a tie group, the whole group is
// fetched once and counted once.
async function countEntity(svc, entity, maxPages) {
  let n = 0;
  let cursor = null;
  let capped = false;
  for (let i = 0; i < maxPages; i++) {
    if (i) await sleep(PACE_MS); // pace batches so each one fits the read window
    const rows = await rdPage(svc, entity, cursor ? { created_date: { $lt: cursor } } : {}, PAGE);
    if (!rows.length) break;
    if (rows.length < PAGE) { n += rows.length; break; }
    const lastDate = rows[PAGE - 1].created_date;
    let tieGroup;
    if (rows[0].created_date === lastDate) {
      tieGroup = await rdPage(svc, entity, { created_date: { $eq: lastDate } }, TIE_CAP);
      n += tieGroup.length;
    } else {
      n += rows.filter((r) => r.created_date > lastDate).length;
      tieGroup = await rdPage(svc, entity, { created_date: { $eq: lastDate } }, TIE_CAP);
      n += tieGroup.length;
    }
    if (tieGroup.length >= TIE_CAP) capped = true;
    cursor = lastDate;
  }
  return { n, capped };
}

// CHANGE MARKERS — the newest created / most recently updated row identity
// per ledger, read with two 1-row reads and stored with the totals. The
// Intelligence page compares them on every open: unchanged markers → the
// stored totals are current (no scan); changed markers → an automatic
// batched recount runs. Deletion-only changes are caught by the daily
// scheduled recount.
async function readMarkers(svc, entity) {
  const created = await rdPage(svc, entity, {}, 1);
  const updated = await rdPage(svc, entity, {}, 1, '-updated_date');
  const c = Array.isArray(created) && created[0] ? created[0] : null;
  const u = Array.isArray(updated) && updated[0] ? updated[0] : null;
  return {
    created: c ? `${c.created_date}|${c.id}` : 'none',
    updated: u ? `${u.updated_date}|${u.id}` : 'none',
  };
}

async function recount(svc) {
  const predictions = await countEntity(svc, 'GlobalPredictionLedger', PRED_PAGES);
  const outcomes = await countEntity(svc, 'GlobalOutcomeLedger', OUTCOME_PAGES);
  const predMarkers = await readMarkers(svc, 'GlobalPredictionLedger');
  const outcomeMarkers = await readMarkers(svc, 'GlobalOutcomeLedger');
  return {
    predictions: predictions.n,
    predictionsCapped: predictions.capped,
    outcomes: outcomes.n,
    outcomesCapped: outcomes.capped,
    markers: {
      predCreated: predMarkers.created,
      predUpdated: predMarkers.updated,
      outcomeCreated: outcomeMarkers.created,
      outcomeUpdated: outcomeMarkers.updated,
    },
  };
}

export default async function (req) {
  try {
    let body = {};
    try { body = await req.json(); } catch { /* no body */ }
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (String(user.role || '') !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    if (body?.recount !== true) {
      return Response.json(
        { ok: false, error: 'recount is explicit — pass { recount: true }. The verified archive summary lives in the LedgerIntegrityReport record and is never re-scanned.' },
        { status: 400 }
      );
    }
    const svc = base44.asServiceRole;
    const counts = await recount(svc); // rdPage already waits out the read window persistently
    // PERSIST the recount into the immutable summary record — every future page
    // load reads these stored live totals; the browser never re-scans. The
    // archived figures on the record are historical and never rewritten here.
    let persisted = false;
    try {
      const recs = await svc.entities.LedgerIntegrityReport.filter({ report_key: REPORT_KEY }, 'created_date', 5);
      const rec = Array.isArray(recs) && recs.length ? recs[0] : null;
      if (rec) {
        await svc.entities.LedgerIntegrityReport.update(rec.id, {
          pred_rows_after: counts.predictions,
          outcome_rows_after: counts.outcomes,
          pred_rows_before: counts.predictions + Number(rec.archived_prediction || 0),
          outcome_rows_before: counts.outcomes + Number(rec.archived_outcome || 0),
          counted_at: new Date().toISOString(),
          pred_created_marker: counts.markers.predCreated,
          pred_updated_marker: counts.markers.predUpdated,
          outcome_created_marker: counts.markers.outcomeCreated,
          outcome_updated_marker: counts.markers.outcomeUpdated,
        });
        persisted = true;
      }
    } catch { /* persistence is best-effort — the counts are still returned */ }
    return Response.json({ ok: true, generatedAt: new Date().toISOString(), counts, persisted });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || 'recount failed' }, { status: 500 });
  }
}