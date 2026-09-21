import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { safeEmail } from '../../shared/safeIntegration.ts';

const APP_BASE = 'https://ridex-all-go.base44.app';

// Admin-only email operations: list subscribers, targeted broadcast by country,
// B2B business-email import, and B2B outreach. Single payload `action` switches.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');

    if (action === 'list') {
      const country = body.country ? String(body.country) : '';
      const subs = await base44.asServiceRole.entities.EmailSubscriber.list('-created_date', 500);
      const out = subs
        .filter((s: any) => !country || s.country === country)
        .map((s: any) => ({ email: s.email, country: s.country, referrals: s.referrals, opted_out: s.opted_out, ref_code: s.ref_code }));
      return Response.json({ subscribers: out, total: out.length });
    }

    if (action === 'broadcast') {
      const { country, subject, html } = body;
      if (!country || !subject || !html) {
        return Response.json({ error: 'Missing country, subject, or html' }, { status: 400 });
      }
      const subs = await base44.asServiceRole.entities.EmailSubscriber.filter({ country }, '-created_date', 500);
      let sent = 0, failed = 0;
      for (const s of subs as any[]) {
        if (s.opted_out) continue;
        const fullHtml = `${html}<p style="margin-top:24px;font-size:11px;color:#888">If you no longer wish to receive these emails, <a href="${APP_BASE}/functions/email-unsubscribe?email=${encodeURIComponent(s.email)}">unsubscribe here</a>.</p>`;
        const e = await safeEmail(base44, { to: s.email, subject, body: fullHtml });
        e.ok ? sent++ : failed++;
      }
      return Response.json({ sent, failed });
    }

    if (action === 'import') {
      const { emails, country } = body;
      if (!emails || !country) {
        return Response.json({ error: 'Emails and country required' }, { status: 400 });
      }
      const arr = String(emails).split(/[\n,]/).map((e: string) => e.trim().toLowerCase()).filter((e: string) => e.includes('@'));
      let imported = 0;
      for (const email of arr) {
        const ex = await base44.asServiceRole.entities.BusinessEmail.filter({ email }, undefined, 1);
        if (ex.length) continue;
        await base44.asServiceRole.entities.BusinessEmail.create({ email, country, source: 'manual-import', opted_out: false });
        imported++;
      }
      return Response.json({ imported, total: arr.length });
    }

    if (action === 'b2b') {
      const { country, subject, html } = body;
      if (!subject || !html) {
        return Response.json({ error: 'Missing subject or html' }, { status: 400 });
      }
      const list = await base44.asServiceRole.entities.BusinessEmail.list('-created_date', 500);
      let sent = 0, failed = 0;
      for (const b of list as any[]) {
        if (b.opted_out) continue;
        if (country && b.country !== country) continue;
        const fullHtml = `${html}<p style="margin-top:24px;font-size:11px;color:#888">If you no longer wish to receive emails from us, <a href="${APP_BASE}/functions/email-unsubscribe?email=${encodeURIComponent(b.email)}">unsubscribe here</a>.</p>`;
        const e = await safeEmail(base44, { to: b.email, subject, body: fullHtml });
        if (e.ok) {
          await base44.asServiceRole.entities.BusinessEmail.update(b.id, { last_sent_date: new Date().toISOString().slice(0, 10) });
          sent++;
        } else { failed++; }
      }
      return Response.json({ sent, failed });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}