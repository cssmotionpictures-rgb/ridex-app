import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { sendGmail } from '../../shared/gmailSend.ts';

// CRXS SIGNIFICANT-TRANSACTION ALERT — emails the invoking admin (via the
// authorized Gmail connector) whenever a significant CrixCoin movement
// COMPLETES on the platform ledger: amount >= threshold since the last check
// window (default threshold 10,000 in the transaction's currency; first run
// scans the last 24h). Admin-only. Idempotent: the window guard
// (AutomationSetting 'global'.last_crxs_alert_at) only advances after a
// successful send (or a clean zero-alert check) — a failed send retries on
// the next invocation. dryRun=true previews without sending or advancing.

const FIRST_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

async function advanceGuard(base44, cfgList, nowIso) {
  try {
    if (!cfgList || cfgList.length === 0) {
      await base44.asServiceRole.entities.AutomationSetting.create({ name: 'global', last_crxs_alert_at: nowIso });
    } else {
      await base44.asServiceRole.entities.AutomationSetting.updateMany(
        { name: 'global' }, { $set: { last_crxs_alert_at: nowIso } }
      );
    }
  } catch {}
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json?.().catch(() => ({})) || {};
    const dryRun = !!body.dryRun;
    const threshold = Math.max(1, Number(body.threshold) || 10000);

    // Check window: since the last successful check, else last 24h.
    let cfgList: any[] = [];
    try { cfgList = await base44.asServiceRole.entities.AutomationSetting.filter({ name: 'global' }); } catch {}
    const lastRaw = String(cfgList[0]?.last_crxs_alert_at || '');
    const lastMs = Date.parse(lastRaw);
    const sinceMs = Number.isFinite(lastMs) && lastMs > 0 ? lastMs : Date.now() - FIRST_RUN_WINDOW_MS;
    const sinceIso = new Date(sinceMs).toISOString();

    const txs = await base44.asServiceRole.entities.CrixTransaction.list('-created_date', 200);
    const significant = (txs as any[]).filter((t) =>
      t.status === 'COMPLETED' &&
      Number(t.amount) >= threshold &&
      String(t.created_date || '') >= sinceIso
    );

    const nowIso = new Date().toISOString();
    if (significant.length === 0) {
      if (!dryRun) await advanceGuard(base44, cfgList, nowIso);
      return Response.json({ ok: true, alertCount: 0, since: sinceIso, threshold, dryRun });
    }

    const lines = [
      'Significant CrixCoin movement detected on the Ride X ledger:',
      '',
    ];
    for (const t of significant.slice(0, 25)) {
      lines.push(`- ${t.crix_id}: ${t.currency} ${Number(t.amount).toLocaleString('en-NG')} | ${(t.sender_email || 'sender')} -> ${(t.recipient_email || 'recipient')} | ${t.type} | ${new Date(t.created_date).toLocaleString('en-NG')}`);
    }
    if (significant.length > 25) lines.push(`...and ${significant.length - 25} more.`);
    lines.push('');
    lines.push(`Threshold: ${threshold.toLocaleString('en-NG')} | Window: since ${sinceIso}`);
    lines.push('Open the ledger: https://ridex-all-go.base44.app');

    if (dryRun) {
      return Response.json({ ok: true, alertCount: significant.length, since: sinceIso, threshold, dryRun, preview: lines.slice(0, 10).join('\n') });
    }

    await sendGmail(base44, user.email, `[Ride X] ${significant.length} significant CrixCoin transaction${significant.length === 1 ? '' : 's'}`, lines.join('\n'));
    await advanceGuard(base44, cfgList, nowIso);
    return Response.json({ ok: true, alertCount: significant.length, since: sinceIso, threshold, emailedTo: user.email });
  } catch (error) {
    return Response.json({ error: String(error?.message || error || 'failed') }, { status: 500 });
  }
}