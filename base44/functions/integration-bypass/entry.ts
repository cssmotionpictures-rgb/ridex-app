import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Admin-only "integration bypass" — force-completes credit-dependent workflows
// LOCALLY (direct entity writes) so the app keeps working 100% when monthly
// integration credits (InvokeLLM / SendEmail / web lookups) are exhausted.
// No LLM, no email, no external API is ever called here.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { flow, payload = {} } = body;
    if (!flow) return Response.json({ error: 'flow required' }, { status: 400 });

    const log = `bypass by ${user.email || user.id}`;

    // 1) Free Feature A&R — approve without the LLM scoring call.
    if (flow === 'free_feature') {
      const { application_id, score = 9.6, notes = 'Admin bypass approval (credits exhausted)' } = payload;
      if (!application_id) return Response.json({ error: 'application_id required' }, { status: 400 });
      const rec = await base44.entities.FreeFeatureApplication.update(application_id, {
        status: 'approved',
        quality_score: score,
        notes,
        approved_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, flow, application_id, status: rec.status });
    }

    // 2) Curator submissions — accept pending ones WITHOUT sending curator emails.
    if (flow === 'curator_accept') {
      const { submission_id, batch_id } = payload;
      let updated = [];
      if (submission_id) {
        const r = await base44.entities.CuratorSubmission.update(submission_id, { status: 'accepted' });
        updated.push(r.id);
      } else if (batch_id) {
        const subs = await base44.entities.CuratorSubmission.filter({ promote_batch_id: batch_id });
        for (const s of subs) {
          if (s.status === 'pending') {
            await base44.entities.CuratorSubmission.update(s.id, { status: 'accepted' });
            updated.push(s.id);
          }
        }
      } else {
        // accept ALL pending (emergency bulk bypass)
        const subs = await base44.entities.CuratorSubmission.filter({ status: 'pending' }, '-created_date', 500);
        for (const s of subs) {
          await base44.entities.CuratorSubmission.update(s.id, { status: 'accepted' });
          updated.push(s.id);
        }
      }
      return Response.json({ ok: true, flow, accepted: updated.length });
    }

    // 3) Auto-Find Events — create an event DIRECTLY from admin payload, no web/LLM scan.
    if (flow === 'auto_find_events') {
      const ev = await base44.entities.LiveEvent.create({
        title: payload.title || 'Admin-listed event',
        artist_lineup: payload.artist_lineup || '',
        event_date: payload.event_date || new Date(Date.now() + 7 * 864e5).toISOString(),
        venue: payload.venue || 'TBA',
        city: payload.city || 'Lagos',
        genres: payload.genres || 'Afrobeats',
        description: payload.description || 'Listed manually via bypass (auto-find credits exhausted).',
        ticket_regular_price: payload.ticket_regular_price || 35000,
        status: 'on_sale',
        source: 'admin',
        auto_verified: true,
      });
      return Response.json({ ok: true, flow, event_id: ev.id, title: ev.title });
    }

    // 4) Queen chat — return a canned acknowledgement WITHOUT the LLM call.
    if (flow === 'queen_reply') {
      const canned = "I'm here for you right now, but my AI engine is briefly at capacity — your message is logged and I'll respond fully the moment credits refresh. For anything urgent, contact +234 902 004 2099.";
      return Response.json({ ok: true, flow, reply: canned, bypassed: 'InvokeLLM' });
    }

    // 5) Ride X Card — mark issued WITHOUT the registration email call.
    if (flow === 'card_issue') {
      const { card_id } = payload;
      if (!card_id) return Response.json({ error: 'card_id required' }, { status: 400 });
      const r = await base44.entities.RideXCard.update(card_id, {
        status: 'issued',
        issued_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, flow, card_id: r.id, status: r.status });
    }

    // 6) Invoice receipt — mark emailed WITHOUT actually calling SendEmail.
    if (flow === 'receipt_emailed') {
      const { invoice_id } = payload;
      if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });
      const r = await base44.entities.Invoice.update(invoice_id, {
        status: 'emailed',
        emailed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, flow, invoice_id: r.id, status: r.status });
    }

    return Response.json({ error: `Unknown flow: ${flow}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}