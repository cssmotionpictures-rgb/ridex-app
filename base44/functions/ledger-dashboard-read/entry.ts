import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// LEDGER DASHBOARD READ — server-assisted read of the global prediction ledger
// for the Learning Hub. The platform's entity READ quota is app-wide (browser
// and server share it) and the hub's own background sync keeps it hot, so a
// throttled client read fails instantly and the page shows GLOBAL LEDGER —
// ERROR. This function is the fallback transport: it READS ONLY (never
// writes), pages through the same pages the client read asks for, waits out
// the quota window and retries once when throttled. Heavy immutable blob
// fields (models_json, snapshot_json, provenance_json) are stripped — the
// dashboard sections use only scalar fields, and full blobs would blow the
// response size on a large ledger. Admin-only.

const PAGE = 1000;
const PAGES = 5;
const RETRY_DELAY_MS = 20000;
const DROP_FIELDS = ["models_json", "snapshot_json", "provenance_json"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// TIE-SAFE CURSOR PAGING — every page resumes BEFORE the previous page's last
// created_date and the boundary tie group is read whole, so the read can never
// silently cap the ledger at the newest PAGE rows (which hid older settled
// results from the performance counters).
async function readAll(svc) {
  const out = [];
  let cursor = null;
  let pages = 0;
  let capped = false;
  for (let i = 0; i < PAGES; i++) {
    if (i) await sleep(400); // pace reads — burst reads trip the app-wide quota
    const rows = await svc.entities.GlobalPredictionLedger.filter(cursor ? { created_date: { $lt: cursor } } : {}, "-created_date", PAGE);
    pages++;
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
    if (i === PAGES - 1) { capped = true; break; } // read window exhausted while more rows remain
    const tail = rows[rows.length - 1].created_date;
    // bulk-created rows can share one created_date — read the whole tie group
    const tie = await svc.entities.GlobalPredictionLedger.filter({ created_date: { $eq: tail } }, "created_date", PAGE * 5);
    pages++;
    if (Array.isArray(tie)) out.push(...tie);
    cursor = tail;
  }
  return { rows: out, pages, capped };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (String(user.role || "") !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const svc = base44.asServiceRole;
    let raw;
    try {
      raw = await readAll(svc);
    } catch {
      await sleep(RETRY_DELAY_MS); // wait out the app-wide read quota window
      raw = await readAll(svc);
    }

    const rows = raw.rows.map((r) => {
      const o = { ...r };
      for (const f of DROP_FIELDS) delete o[f];
      return o;
    });
    // READ DIAGNOSTICS — pages/batches traversed and raw row count alongside
    // the rows, so the dashboard can expose a partial-pagination failure.
    return Response.json({
      ok: true,
      rows,
      count: rows.length,
      pages: raw.pages,
      capped: raw.capped,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "read failed" }, { status: 500 });
  }
}