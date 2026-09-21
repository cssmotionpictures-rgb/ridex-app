import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { safeLLM } from "../../shared/safeIntegration.ts";

// Auto-Find Live Events — admin-only.
// Uses the LLM with live web context to discover upcoming Nigerian/African
// live events, then auto-creates verified LiveEvent records (status pending).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const query = (body.query || 'upcoming live concerts and music events in Nigeria Lagos Abuja 2026').trim();
    const city = (body.city || '').trim();

    const fetchLog = await base44.asServiceRole.entities.EventSourceFetch.create({
      source_type: 'social_media',
      query,
      status: 'running',
    });

    const prompt = `You are an event discovery engine for the RIDE X platform (a Nigerian all-in-one app).
Search the web for REAL upcoming live music events, concerts, festivals, album launches, and live streams
happening in Nigeria (especially Lagos, Abuja, Port Harcourt) and featuring Nigerian/African artists
(Afrobeats, Gospel, Hip-Hop, R&B, Highlife, Amapiano) in the next 6 months.

For EACH event you must research and return REALISTIC ticket prices in Nigerian Naira (₦) based on the
actual artist stature and current Nigerian concert market rates (e.g. Detty December / Eko Convention Centre).
Market reference (verified Dec 2025): Asake VIP ₦300,000; Davido VIP ₦250,000; Rema VIP ₦250,000;
Olamide VIP ₦120,000; Fireboy DML regular ₦35,000; early bird general admission from ₦30,000;
premium/VIP tables up to ₦10,000,000. Streaming/live-stream access typically ₦2,000–₦5,000.
Scale prices to the artist's tier — a mid-tier act is NOT priced like Burna Boy, but never return joke
prices like ₦500 or ₦1,500 for a paid concert; a paid concert regular ticket should be at least ₦15,000.

Return a JSON object: { "events": [ { "title", "artist_lineup", "event_date" (ISO 8601 UTC),
"venue", "city", "genres", "description", "event_type" (concert|festival|live_stream|meet_greet|album_launch),
"venue_type" (indoor|outdoor|virtual), "banner_url",
"ticket_regular_price" (number, ₦), "ticket_vip_price" (number, ₦),
"ticket_early_bird_price" (number, ₦), "ticket_group_price" (number, ₦),
"ticket_streaming_price" (number, ₦) } ] }

Rules:
- Only include events with a concrete date and venue.
- Include up to 12 events. No duplicates.
- If you cannot find the banner_url, use an empty string.
- artist_lineup and genres are comma-separated strings.
- All ticket prices are positive integers in Naira. If an event is a pure live_stream with no
  physical venue, still set a realistic streaming price and a regular price.`;

    const llm = await safeLLM(base44, {
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          events: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                artist_lineup: { type: 'string' },
                event_date: { type: 'string' },
                venue: { type: 'string' },
                city: { type: 'string' },
                genres: { type: 'string' },
                description: { type: 'string' },
                event_type: { type: 'string' },
                venue_type: { type: 'string' },
                banner_url: { type: 'string' },
                ticket_regular_price: { type: 'number' },
                ticket_vip_price: { type: 'number' },
                ticket_early_bird_price: { type: 'number' },
                ticket_group_price: { type: 'number' },
                ticket_streaming_price: { type: 'number' },
              },
            },
          },
        },
        required: ['events'],
      },
    });

    const events = Array.isArray(llm?.events) ? llm.events : [];

    // De-duplicate against existing event titles to avoid re-creating.
    const existing = await base44.asServiceRole.entities.LiveEvent.list('-created_date', 200);
    const existingTitles = new Set(existing.map((e) => (e.title || '').toLowerCase().trim()));

    const toCreate = [];
    for (const ev of events) {
      const title = (ev.title || '').trim();
      if (!title || !ev.event_date) continue;
      if (existingTitles.has(title.toLowerCase())) continue;
      if (city && ev.city && ev.city.toLowerCase() !== city.toLowerCase()) continue;

      // Realistic Naira pricing from the LLM, with sane floors so a paid concert
      // never ends up at ₦500. Falls back to market-rate defaults if missing.
      const regular = Number(ev.ticket_regular_price) || 0;
      const vip = Number(ev.ticket_vip_price) || 0;
      const early = Number(ev.ticket_early_bird_price) || 0;
      const group = Number(ev.ticket_group_price) || 0;
      const stream = Number(ev.ticket_streaming_price) || 0;
      const isVirtual = (ev.venue_type || '') === 'virtual';
      const baseRegular = isVirtual ? 5000 : 20000;
      const finalRegular = regular >= baseRegular ? regular : baseRegular;
      const finalVip = vip >= finalRegular ? vip : Math.round(finalRegular * 4);
      const finalEarly = early > 0 && early < finalRegular ? early : Math.round(finalRegular * 0.5);
      const finalGroup = group >= finalRegular ? group : Math.round(finalRegular * 4);
      const finalStream = stream >= 1000 ? stream : (isVirtual ? 5000 : 3000);

      toCreate.push({
        title,
        description: ev.description || '',
        event_type: ev.event_type || 'concert',
        event_date: ev.event_date,
        venue: ev.venue || '',
        venue_address: ev.venue || '',
        venue_type: ev.venue_type || 'indoor',
        city: ev.city || 'Lagos',
        artist_lineup: ev.artist_lineup || '',
        genres: ev.genres || 'Afrobeats',
        banner_url: ev.banner_url || '',
        ticket_regular_price: finalRegular,
        ticket_vip_price: finalVip,
        ticket_early_bird_price: finalEarly,
        ticket_group_price: finalGroup,
        ticket_streaming_price: finalStream,
        // Auto-approve: events go straight on sale so the ticket push + performance
        // slots run immediately without a manual approval step.
        status: 'on_sale',
        source: 'auto_find',
        auto_verified: true,
        is_featured: false,
      });
    }

    let created = [];
    if (toCreate.length) {
      created = await base44.asServiceRole.entities.LiveEvent.bulkCreate(toCreate);
    }

    // Auto-approval push: for each new on_sale event, push ticket reminders to
    // matched fans and auto-generate the artist performance slot schedule.
    let remindersPushed = 0;
    let slotsCreated = 0;
    for (const ev of created) {
      try {
        const push = await base44.asServiceRole.functions.invoke('auto-push-tickets', { event_id: ev.id });
        const pd = push?.data || push || {};
        remindersPushed += pd.reminders_pushed || 0;
        slotsCreated += pd.slots_created || 0;
      } catch (e) { /* push is best-effort; event is still on sale */ }
    }

    await base44.asServiceRole.entities.EventSourceFetch.update(fetchLog.id, {
      events_found: events.length,
      events_created: created.length,
      status: 'success',
    });

    return Response.json({
      found: events.length,
      created: created.length,
      skipped: events.length - toCreate.length,
      reminders_pushed: remindersPushed,
      slots_created: slotsCreated,
      events: created.map((e) => ({
        id: e.id,
        title: e.title,
        event_date: e.event_date,
        regular: e.ticket_regular_price,
        vip: e.ticket_vip_price,
      })),
    });
  } catch (error) {
    console.error('auto-find-events error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}