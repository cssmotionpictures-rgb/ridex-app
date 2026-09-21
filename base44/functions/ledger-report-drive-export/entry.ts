import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// LEDGER REPORT DRIVE EXPORT — admin-gated. Writes the latest ledger integrity
// summary (the immutable archive figures + the stored live totals) as a
// markdown file into the app's own Google Drive folder ("RIDE X Ledger
// Integrity Reports"), reusing the folder on every export so the records stay
// organized and accessible outside the app. Uses the shared Google Drive
// connector (drive.file scope — the app only touches files it created).
// NEVER scans the ledgers: everything exported comes from the persistent
// summary record.
const REPORT_KEY = 'archive-v2-20260910';
const FOLDER_NAME = 'RIDE X Ledger Integrity Reports';

const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WAT'
    : 'not counted';
const num = (n) => Number(n || 0).toLocaleString('en-US');

function buildMarkdown(rec, exportedAt) {
  let flags = '- none on record';
  try {
    const f = JSON.parse(rec.integrity_flags_json || '[]');
    if (Array.isArray(f) && f.length) flags = f.map((x) => `- ${x.label || String(x)}`).join('\n');
  } catch { /* flags are optional */ }
  return [
    '# RIDE X — Ledger Integrity Report',
    '',
    `- Cleanup run: **${rec.run_id || '—'}** (${rec.run_date || '—'})`,
    `- Report key: ${rec.report_key}`,
    `- Exported: ${exportedAt}`,
    '',
    '## Archived during cleanup (verified, immutable)',
    '',
    `- Global prediction ledger: **−${num(rec.archived_prediction)}** (${num(rec.archived_prediction_settled)} settled · ${num(rec.archived_prediction_open)} re-ingestions)`,
    `- Global outcome ledger: **−${num(rec.archived_outcome)}** (duplicate outcome grades)`,
    `- Archived total: ${num(rec.archived_total)}`,
    `- Audit records: ${num(rec.audit_records)} — every removal was audited BEFORE the row was archived · DELETE operations: 0`,
    `- Review rows retained: ${num(rec.review_rows_retained)}`,
    '',
    '## Currently present (live, stored totals)',
    '',
    `- Global prediction ledger: **${num(rec.pred_rows_after)}**`,
    `- Global outcome ledger: **${num(rec.outcome_rows_after)}**`,
    `- Counted at: ${fmt(rec.counted_at)}`,
    `- Derived before-cleanup rows: predictions ${num(rec.pred_rows_before)} · outcomes ${num(rec.outcome_rows_before)}`,
    '',
    '## Integrity flags',
    '',
    flags,
    '',
    '## Notes',
    '',
    rec.notes || '—',
    '',
  ].join('\n');
}

async function driveCall(path, accessToken, init) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Drive API ${res.status}`);
  return data;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (String(user.role || '') !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    const svc = base44.asServiceRole;
    const recs = await svc.entities.LedgerIntegrityReport.filter({ report_key: REPORT_KEY }, 'created_date', 5);
    const rec = Array.isArray(recs) && recs.length ? recs[0] : null;
    if (!rec) return Response.json({ ok: false, error: 'summary record not found — nothing was exported' }, { status: 404 });

    const { accessToken } = await svc.connectors.getConnection('googledrive');
    if (!accessToken) return Response.json({ ok: false, error: 'Google Drive is not connected' }, { status: 502 });

    // Reuse the organized export folder; create it on first export.
    let folderId = String(rec.drive_folder_id || '');
    if (!folderId) {
      const folder = await driveCall('/drive/v3/files?fields=id,name', accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
      });
      folderId = folder.id;
      await svc.entities.LedgerIntegrityReport.update(rec.id, { drive_folder_id: folderId });
    }

    const exportedAt = fmt(new Date().toISOString());
    const fileName = `RIDE X Ledger Integrity — ${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} WAT.md`;
    const markdown = buildMarkdown(rec, exportedAt);

    const boundary = `ridex-${Date.now()}`;
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'text/markdown' }),
      `--${boundary}`,
      'Content-Type: text/markdown; charset=UTF-8',
      '',
      markdown,
      `--${boundary}--`,
    ].join('\r\n');
    const file = await driveCall('/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });

    return Response.json({ ok: true, name: file.name, link: file.webViewLink, folderId });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || 'export failed' }, { status: 500 });
  }
}