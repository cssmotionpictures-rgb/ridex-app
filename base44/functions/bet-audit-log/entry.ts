import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// BET & BANKROLL AUDIT LOG — one row per processed bet result or bankroll
// adjustment, appended to the "Bet Audit" tab of the owner's card-activity
// spreadsheet (CARD_TX_SHEET_ID). The tab is created on the very first
// write. A failed log returns a structured error and NEVER throws to the
// caller — the audit trail must never break the betting action behind it.
//
// Structured columns (A:L):
//   A timestamp  B user  C type  D sport  E match  F market  G odds
//   H stake  I result  J bankroll_before  K bankroll_after  L notes

const BET_TAB = 'Bet Audit';
const BET_RANGE = "'Bet Audit'!A:L";

const s = (v, max) => String(v ?? '').slice(0, max);
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : '');

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    // Single entry (rollover tracker) or a BATCH (settlement passes log every
    // settled leg in one call). Batches are admin-only: parallel settlement
    // by other app users must never write duplicate rows to the shared sheet.
    const isBatch = Array.isArray(body && body.entries);
    if (isBatch && user.role !== 'admin') {
      return Response.json({ ok: false, error: 'Batch audit entries are admin-only' }, { status: 403 });
    }
    const raw = isBatch ? body.entries.slice(0, 60) : [(body && body.entry) || {}];

    const sheetId = (secrets.get('CARD_TX_SHEET_ID') || '').trim();
    if (!sheetId) return Response.json({ ok: false, error: 'CARD_TX_SHEET_ID secret is not set' });

    const conn = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const accessToken = (conn && conn.accessToken) || '';
    if (!accessToken) return Response.json({ ok: false, error: 'Google Sheets connection unavailable — re-authorize the Sheets connector' });

    // Ensure the Bet Audit tab exists — created on the first write only.
    let tabError = '';
    try {
      const meta = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title&access_token=${encodeURIComponent(accessToken)}`
      );
      const metaText = await meta.text();
      if (!meta.ok) {
        tabError = `meta HTTP ${meta.status}: ${metaText.slice(0, 150)}`;
        console.error(`[bet-audit-log] spreadsheet meta FAILED — ${tabError}`);
      } else {
        const j = JSON.parse(metaText);
        const tabs = (j.sheets || []).map((x) => x.properties && x.properties.title).filter(Boolean);
        if (!tabs.includes(BET_TAB)) {
          const add = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate?access_token=${encodeURIComponent(accessToken)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requests: [{ addSheet: { properties: { title: BET_TAB } } }] }),
            }
          );
          const addText = await add.text();
          if (!add.ok) {
            tabError = `addSheet HTTP ${add.status}: ${addText.slice(0, 150)}`;
            console.error(`[bet-audit-log] addSheet FAILED — ${tabError}`);
          } else {
            console.log(`[bet-audit-log] created "${BET_TAB}" tab in spreadsheet ${sheetId}`);
          }
        }
      }
    } catch (e) {
      tabError = `ensure-tab exception: ${e?.message || e}`;
      console.error(`[bet-audit-log] ensure-tab exception — ${tabError}`);
    }

    const ts = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' });
    const values = [];
    for (const e of raw) {
      const type = s(e && e.type, 24);
      if (!type) continue;
      values.push([
        ts,
        s(user.email, 80),
        type,
        s(e.sport, 24),
        s(e.match, 120),
        s(e.market, 60),
        n(e.odds),
        n(e.stake),
        s(e.result, 8),
        n(e.bankrollBefore),
        n(e.bankrollAfter),
        s(e.notes, 200),
      ]);
    }
    if (!values.length) return Response.json({ ok: false, error: 'Missing entry type' }, { status: 400 });

    // NOTE: the runtime strips the Authorization header on sheets.googleapis.com
    // requests, so the token also goes through Google's supported access_token
    // query parameter (the header is kept too — whichever path reaches first).
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${BET_RANGE}:append` +
      `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      const detail = bodyText.slice(0, 250).replace(/\s+/g, ' ');
      console.error(`[bet-audit-log] append FAILED — HTTP ${res.status}: ${detail}`);
      return Response.json({ ok: false, error: `Sheets append HTTP ${res.status}: ${detail}` });
    }
    const updates = (JSON.parse(bodyText).updates) || {};
    console.log(`[bet-audit-log] append OK — ${updates.updatedRange || 'n/a'} (${updates.updatedRows || 0} row) by ${user.email}`);
    return Response.json({ ok: true, updatedRange: updates.updatedRange || '', updatedRows: updates.updatedRows || 0 });
  } catch (error) {
    console.error(`[bet-audit-log] FAILED: ${error?.message || error}`);
    return Response.json({ ok: false, error: error?.message || String(error) });
  }
}