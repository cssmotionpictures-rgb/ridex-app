import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { safeEmail } from "../../shared/safeIntegration.ts";

// Sends a personalised sponsorship-request email to each supplied sponsor lead.
// NOTE: the platform email integration always reaches REGISTERED app users; an
// address that is not a registered user only succeeds on a paid plan with the
// app enabled for external email. Failures are recorded on the lead so the
// admin can see exactly which addresses bounced.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const leadIds = Array.isArray(body?.lead_ids) ? body.lead_ids : null;

    let leads: any[] = [];
    if (leadIds && leadIds.length) {
      for (const id of leadIds) {
        const l = await base44.asServiceRole.entities.SponsorLead.get(id).catch(() => null);
        if (l) leads.push(l);
      }
    } else {
      leads = await base44.asServiceRole.entities.SponsorLead.filter({ status: 'pending' }, '-created_date', 100);
    }

    const results: any[] = [];
    for (const lead of leads) {
      const subject = 'Sponsorship Opportunity with RIDE X';
      const text =
        `Hi ${lead.name},\n\n` +
        `RIDE X — Nigeria's all-in-one lifestyle super-app (rides, deliveries, movies, live sports, concerts and gaming) — is opening sponsored ad slots, and we'd love to partner with ${lead.company || 'your company'}.\n\n` +
        `Your brand would reach thousands of engaged users every day through in-app video ads, sponsored placements and live-event partnerships — with flexible budgets and per-play pricing.\n\n` +
        `Would you be open to a quick call this week to explore a package that fits your goals? Reply to this email and we'll set it up.\n\n` +
        `Best regards,\nThe RIDE X Partnerships Team\nwww.ridexongo.com`;

      try {
        const _e = await safeEmail(base44, { to: lead.email, subject, body: text });
        if (!_e.ok) throw new Error(_e.error || 'email failed');
        await base44.asServiceRole.entities.SponsorLead.update(lead.id, {
          status: 'sent',
          last_sent_at: new Date().toISOString(),
          error: '',
        });
        results.push({ id: lead.id, email: lead.email, status: 'sent' });
      } catch (e) {
        await base44.asServiceRole.entities.SponsorLead.update(lead.id, {
          status: 'failed',
          last_sent_at: new Date().toISOString(),
          error: (e?.message || 'failed').slice(0, 300),
        }).catch(() => {});
        results.push({ id: lead.id, email: lead.email, status: 'failed', error: e?.message || 'failed' });
      }
    }

    return Response.json({
      ok: true,
      sent: results.filter((r) => r.status === 'sent').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}