import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// RIDE X PREDICTION PERFORMANCE → GOOGLE SHEETS REPORT
// Admin-gated one-shot report generator: reads the Global Outcome Ledger (the
// graded, one-row-per-prediction record of every RIDE X prediction section),
// computes the same analytics family the Intelligence dashboard shows, and
// pushes a clean snapshot into a dedicated Google Sheet ("RIDE X Prediction
// Performance Report") for review outside the dashboard. The spreadsheet is
// created once and reused — the sheet ID is stored in ProviderApiKey, so
// every later run OVERWRITES the same sheet with the latest snapshot.
const PROVIDER_KEY = 'googlesheets-performance-report';
const GRADED = ['won', 'lost'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const round1 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10) / 10);
const round2 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 100) / 100);

function groupBy(list, fn) {
  const m = new Map();
  for (const r of list) {
    const k = fn(r) || 'unknown';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

function statsOf(list) {
  const graded = list.filter((r) => GRADED.includes(r.settlement));
  const won = graded.filter((r) => r.settlement === 'won').length;
  const lost = graded.length - won;
  const voids = list.filter((r) => ['void', 'push', 'cancelled'].includes(r.settlement)).length;
  let brier = null;
  let logloss = null;
  let avgP = null;
  if (graded.length) {
    let b = 0;
    let ll = 0;
    let pSum = 0;
    for (const r of graded) {
      const p = Math.min(0.999, Math.max(0.001, Number(r.predicted_probability) || 0.5));
      const y = r.settlement === 'won' ? 1 : 0;
      b += (p - y) * (p - y);
      ll -= y ? Math.log(p) : Math.log(1 - p);
      pSum += p;
    }
    brier = round2(b / graded.length);
    logloss = round2(ll / graded.length);
    avgP = round1((pSum / graded.length) * 100);
  }
  const clvRows = list.filter((r) => Number(r.clv_pct) !== 0 && !Number.isNaN(Number(r.clv_pct)));
  return {
    n: list.length,
    settled: graded.length,
    won,
    lost,
    voids,
    winRate: graded.length ? round1((won / graded.length) * 100) : null,
    avgP,
    calErr: graded.length && avgP != null ? round1((won / graded.length) * 100 - avgP) : null,
    brier,
    logloss,
    clv: clvRows.length ? round2(clvRows.reduce((s, r) => s + Number(r.clv_pct), 0) / clvRows.length) : null,
    priced: list.filter((r) => Number(r.market_odds) > 0).length,
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    // 1) Read the outcome ledger — paged + paced, bounded, tie-safe cursor.
    const rows = [];
    let cursor = null;
    let pages = 0;
    let capped = false;
    for (let i = 0; i < 5; i++) {
      if (i) await sleep(300);
      const query = cursor ? { created_date: { $lt: cursor } } : {};
      const page = await base44.asServiceRole.entities.GlobalOutcomeLedger.filter(query, '-created_date', 1000);
      pages++;
      if (!Array.isArray(page) || !page.length) break;
      rows.push(...page);
      if (page.length < 1000) break;
      if (i === 4) { capped = true; break; }
      cursor = page[page.length - 1].created_date;
    }

    // 2) Canonical projection — one row per prediction identity (defensive dedupe).
    const byId = new Map();
    for (const r of rows) {
      const key = r.global_prediction_id || r.id;
      const cur = byId.get(key);
      if (!cur || (GRADED.includes(r.settlement) && !GRADED.includes(cur.settlement))) byId.set(key, r);
    }
    const outcomes = [...byId.values()];

    // 3) Build the report matrix.
    const out = [];
    const row = (...cells) => out.push(cells.flat());
    const g = statsOf(outcomes);
    row(['RIDE X PREDICTION PERFORMANCE REPORT']);
    row(['Generated (UTC)', new Date().toISOString()]);
    row(['Generated (Lagos)', new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WAT']);
    row(['Source', 'Global Outcome Ledger — one graded row per prediction, every RIDE X prediction section']);
    row([]);
    row(['GLOBAL SUMMARY']);
    row(['Outcome rows scanned', rows.length]);
    row(['Unique predictions', outcomes.length]);
    row(['Read pages traversed', pages + (capped ? ' — PAGE CAP REACHED, totals may be partial' : ' — full traversal')]);
    row(['Settled (graded won/lost)', g.settled]);
    row(['Won', g.won]);
    row(['Lost', g.lost]);
    row(['Void / push / cancelled', g.voids]);
    row(['Win rate % (voids excluded)', g.winRate]);
    row(['Avg predicted probability %', g.avgP]);
    row(['Calibration error (observed − predicted, pp)', g.calErr]);
    row(['Brier score (lower is better)', g.brier]);
    row(['Log loss (lower is better)', g.logloss]);
    row(['Priced at T0 (real bookmaker price)', g.priced]);
    row(['Avg CLV % (where computable)', g.clv]);
    row([]);
    row(['PREDICTION SECTION PERFORMANCE']);
    row(['Section', 'Total', 'Settled', 'Won', 'Lost', 'Win rate %', 'Avg predicted %', 'Calibration err pp', 'Brier', 'Log loss']);
    for (const [k, list] of [...groupBy(outcomes, (r) => r.source_section).entries()].sort((a, b) => b[1].length - a[1].length)) {
      const s = statsOf(list);
      row([k, s.n, s.settled, s.won, s.lost, s.winRate, s.avgP, s.calErr, s.brier, s.logloss]);
    }
    row([]);
    row(['BY MARKET']);
    row(['Market', 'Total', 'Settled', 'Won', 'Win rate %', 'Brier']);
    for (const [k, list] of [...groupBy(outcomes, (r) => r.market_key).entries()].sort((a, b) => b[1].length - a[1].length)) {
      const s = statsOf(list);
      row([k, s.n, s.settled, s.won, s.winRate, s.brier]);
    }
    row([]);
    row(['BY VERIFICATION SOURCE']);
    row(['Verification', 'Rows', 'Share %']);
    for (const [k, list] of [...groupBy(outcomes, (r) => r.verification_source).entries()].sort((a, b) => b[1].length - a[1].length)) {
      row([k, list.length, outcomes.length ? round1((list.length / outcomes.length) * 100) : null]);
    }
    row([]);
    row(['BY SETTLED MONTH']);
    row(['Month', 'Settled', 'Won', 'Lost', 'Win rate %']);
    for (const [k, list] of [...groupBy(outcomes, (r) => String(r.settled_at || '').slice(0, 7)).entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const s = statsOf(list);
      row([k || 'unknown', s.settled, s.won, s.lost, s.winRate]);
    }
    row([]);
    row(['NOTES']);
    row(['Win rates exclude void/push/cancelled. Brier and log loss are computed on graded won/lost rows only.']);
    row(['CLV is averaged only where both a real T0 price and a verified pre-kickoff closing price exist.']);
    row(['RIDE X never guarantees wins — this report measures calibration and rejection quality honestly.']);

    // 4) Google Sheets — reuse the stored spreadsheet, create it on first run.
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const stored = await base44.asServiceRole.entities.ProviderApiKey.filter({ provider: PROVIDER_KEY }, 'created_date', 1);
    let sheetId = Array.isArray(stored) && stored[0] ? stored[0].api_key : null;
    let storedRecId = Array.isArray(stored) && stored[0] ? stored[0].id : null;

    if (sheetId) {
      const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!meta.ok) sheetId = null; // sheet was deleted — recreate below and update the stored record
    }
    if (!sheetId) {
      const created = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ properties: { title: 'RIDE X Prediction Performance Report' } }),
      });
      const sheet = await created.json().catch(() => null);
      if (!created.ok) {
        return Response.json({ error: 'Google Sheets create failed: ' + ((sheet && sheet.error && sheet.error.message) || 'unknown'), step: 'create' }, { status: 502 });
      }
      sheetId = sheet.spreadsheetId;
      if (storedRecId) {
        await base44.asServiceRole.entities.ProviderApiKey.update(storedRecId, { api_key: sheetId, updated_by: user.email });
      } else {
        await base44.asServiceRole.entities.ProviderApiKey.create({ provider: PROVIDER_KEY, api_key: sheetId, updated_by: user.email });
      }
    }

    // 5) Overwrite the sheet with the fresh snapshot — clear, then write.
    const clearRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent('A1:Z1000')}:clear`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    if (!clearRes.ok) {
      return Response.json({ error: 'Google Sheets clear failed', step: 'clear', status: clearRes.status }, { status: 502 });
    }
    const upd = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent('A1')}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ values: out }),
    });
    if (!upd.ok) {
      const err = await upd.json().catch(() => null);
      return Response.json({ error: 'Google Sheets write failed: ' + ((err && err.error && err.error.message) || 'unknown'), step: 'write' }, { status: 502 });
    }

    return Response.json({
      ok: true,
      url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      sheetId,
      generatedAt: new Date().toISOString(),
      scanned: rows.length,
      unique: outcomes.length,
      pages,
      capped,
      reportRows: out.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}