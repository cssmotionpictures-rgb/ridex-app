import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { sendGmail } from '../../shared/gmailSend.ts';

// CRXS WEEKLY DIGEST — per-user Gmail summary of (a) completed CrixCoin internal
// ledger balance changes and (b) new Mingle matches from the last 7 days.
//
// Sending rail: the authorized Gmail connector (gmail.send) — the token lives
// server-side only and is NEVER exposed to the frontend.
// Trigger model: zero-credit heartbeat (admin app-open in AppShell), same
// pattern as email-weekly. The function is idempotent: at most ONE real send
// per 7 days (guard stored in AutomationSetting 'global').
// dryRun=true previews the computed digests without sending anything.

function lagosDate(d = Date.now()) {
  return new Date(d + 60 * 60 * 1000).toISOString().slice(0, 10);
}

// (Gmail sending now lives in the shared module: ../../shared/gmailSend.ts)

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try { user = await base44.auth.me(); } catch {}
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json?.().catch(() => ({})) || {};
    const dryRun = !!body.dryRun;
    const force = !!body.force && user?.role === 'admin';

    const today = lagosDate();

    // Weekly idempotency: at most one real send per 7 days.
    let cfgList: any[] = [];
    try { cfgList = await base44.asServiceRole.entities.AutomationSetting.filter({ name: 'global' }); } catch {}
    const last = String(cfgList[0]?.last_crxs_digest_date || '');
    if (!dryRun && !force && last) {
      const daysSince = Math.floor((Date.parse(today) - Date.parse(last)) / 86400000);
      if (daysSince < 7) {
        return Response.json({ ok: true, skipped: 'already-sent-within-7-days', last, today });
      }
    }

    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [users, txs, matches, profiles] = await Promise.all([
      base44.asServiceRole.entities.User.list('-created_date', 1000),
      base44.asServiceRole.entities.CrixTransaction.list('-created_date', 1000),
      base44.asServiceRole.entities.MingleMatch.list('-created_date', 500),
      base44.asServiceRole.entities.MingleProfile.list('-created_date', 500),
    ]);

    const nameByUser: any = {};
    for (const p of profiles as any[]) nameByUser[p.user_id] = p.display_name || 'a new match';

    const digests: any[] = [];
    let sent = 0, failed = 0, inactive = 0;
    for (const u of users as any[]) {
      if (!u.email) continue;
      const myTxs = (txs as any[]).filter(
        (t) => t.status === 'COMPLETED' && String(t.created_date || '') >= since &&
          (t.sender_id === u.id || t.recipient_id === u.id)
      );
      const myMatches = (matches as any[]).filter(
        (m) => String(m.created_date || '') >= since && (m.members || []).includes(u.id)
      );
      if (myTxs.length === 0 && myMatches.length === 0) { inactive++; continue; }

      const lines = ['Your CrixCoin week in review (last 7 days):', ''];
      if (myTxs.length) {
        lines.push('BALANCE CHANGES (internal Crix ledger - not blockchain):');
        for (const t of myTxs) {
          const out = t.sender_id === u.id;
          const other = out ? (t.recipient_email || 'a Crix user') : (t.sender_email || 'a Crix user');
          lines.push(`- ${out ? 'Sent' : 'Received'} ${t.currency} ${t.amount} ${out ? 'to' : 'from'} ${other} (${t.crix_id})`);
        }
        lines.push('');
      }
      if (myMatches.length) {
        lines.push('NEW MINGLE MATCHES:');
        for (const m of myMatches) {
          const otherId = (m.members || []).find((id: string) => id !== u.id);
          lines.push(`- You matched with ${otherId ? (nameByUser[otherId] || 'a new match') : 'a new match'}. Open Mingle in Ride X to say hi.`);
        }
        lines.push('');
      }
      lines.push('CRXS launch status: PRE-LAUNCH - internal ledger only. No blockchain, contract or market exists yet.');
      lines.push('', 'Open the app: https://ridex-all-go.base44.app');
      const subject = 'Your weekly CrixCoin digest - Ride X';

      const d = { email: u.email, txCount: myTxs.length, matchCount: myMatches.length, bodyPreview: lines.slice(0, 8).join('\n') };
      if (dryRun) { digests.push(d); continue; }
      try {
        await sendGmail(base44, u.email, subject, lines.join('\n'));
        sent++; digests.push({ ...d, sent: true });
      } catch (e: any) {
        failed++; digests.push({ ...d, error: String(e?.message || e).slice(0, 120) });
      }
    }

    // Persist the guard date so the weekly cadence holds.
    if (!dryRun) {
      try {
        if (cfgList.length === 0) {
          await base44.asServiceRole.entities.AutomationSetting.create({ name: 'global', last_crxs_digest_date: today });
        } else {
          await base44.asServiceRole.entities.AutomationSetting.updateMany(
            { name: 'global' }, { $set: { last_crxs_digest_date: today } }
          );
        }
      } catch {}
    }

    return Response.json({
      ok: true, dryRun, today, users: (users as any[]).length,
      sent, failed, inactive, digestCount: digests.length,
      digests: digests.slice(0, 5),
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}