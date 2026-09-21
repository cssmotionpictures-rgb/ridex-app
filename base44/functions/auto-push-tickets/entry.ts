import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { safeEmail } from '../../shared/safeIntegration.ts';

// Auto-Push Tickets — admin-only.
// For each approved/on_sale event:
//   1) Match users whose UserEventPreference matches the event (genre/artist/city)
//      → create EventReminder (on_sale) and send in-app + email notification.
//   2) Auto-generate a PerformanceSlot schedule from the event's artist_lineup.
// Pass { event_id } to target one event, or omit to process all on_sale events.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const eventId = (body.event_id || '').trim();

    let events = [];
    if (eventId) {
      const ev = await base44.asServiceRole.entities.LiveEvent.get(eventId);
      events = [ev];
    } else {
      events = await base44.asServiceRole.entities.LiveEvent.filter({ status: 'on_sale' });
    }

    const prefs = await base44.asServiceRole.entities.UserEventPreference.list('-created_date', 500);

    let totalReminders = 0;
    let totalEmails = 0;
    let totalSlots = 0;
    const perEvent = [];

    for (const ev of events) {
      // --- 1. Match preferences → push ticket reminders ---
      const eventGenres = (ev.genres || '').toLowerCase().split(',').map((g) => g.trim()).filter(Boolean);
      const eventArtists = (ev.artist_lineup || '').toLowerCase().split(',').map((a) => a.trim()).filter(Boolean);
      const eventCity = (ev.city || '').toLowerCase().trim();

      const matched = prefs.filter((p) => {
        if (!p.user_id) return false;
        const pGenres = (p.preferred_genres || '').toLowerCase().split(',').map((g) => g.trim()).filter(Boolean);
        const pArtists = (p.preferred_artists || '').toLowerCase().split(',').map((a) => a.trim()).filter(Boolean);
        const pCity = (p.city || '').toLowerCase().trim();
        const pTypes = (p.event_types || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);

        const genreMatch = !pGenres.length || pGenres.some((g) => eventGenres.includes(g));
        const artistMatch = !pArtists.length || pArtists.some((a) => eventArtists.some((ea) => ea.includes(a) || a.includes(ea)));
        const cityMatch = !pCity || pCity === eventCity;
        const typeMatch = !pTypes.length || pTypes.includes(ev.event_type);
        return genreMatch && artistMatch && cityMatch && typeMatch;
      });

      // De-duplicate existing reminders for this event
      const existingReminders = await base44.asServiceRole.entities.EventReminder.filter({ event_id: ev.id });
      const remindedUserIds = new Set(existingReminders.map((r) => r.user_id));

      const remindersToCreate = [];
      for (const p of matched) {
        if (remindedUserIds.has(p.user_id)) continue;
        remindersToCreate.push({
          event_id: ev.id,
          event_title: ev.title,
          user_id: p.user_id,
          reminder_type: 'on_sale',
          status: p.notify_email ? 'sent' : 'pending',
        });
      }

      let createdReminders = [];
      if (remindersToCreate.length) {
        createdReminders = await base44.asServiceRole.entities.EventReminder.bulkCreate(remindersToCreate);
        totalReminders += createdReminders.length;
      }

      // Send email notifications (post-response for the email blast)
      if (createdReminders.length) {
        const recipientPrefs = matched.filter((p) => p.notify_email && !remindedUserIds.has(p.user_id));
        // Look up users for emails — batch
        const userIds = recipientPrefs.map((p) => p.user_id).filter(Boolean);
        if (userIds.length) {
          const users = await base44.asServiceRole.entities.User.list('-created_date', 500);
          const userEmailMap = new Map(users.map((u) => [u.id, u.email]));
          const subject = `🎫 Tickets on sale: ${ev.title}`;
          const bodyText = `Tickets for ${ev.title} are now on sale on Ride X.\n\n${ev.artist_lineup ? 'Artists: ' + ev.artist_lineup + '\n' : ''}${ev.venue ? 'Venue: ' + ev.venue + '\n' : ''}${ev.event_date ? 'Date: ' + new Date(ev.event_date).toUTCString() + '\n' : ''}\nOpen the Ride X app → Events to grab your ticket with instant QR entry.`;
          for (const p of recipientPrefs) {
            const email = userEmailMap.get(p.user_id);
            if (!email) continue;
            try {
              await safeEmail(base44, { to: email, subject, body: bodyText });
              totalEmails++;
            } catch (e) { /* email failures are non-fatal */ }
          }
        }
      }

      // --- 2. Auto-generate performance slots from artist_lineup ---
      // Slot price scales with the event tier: festivals/mega concerts pay ₦5M per slot,
      // standard arena concerts ₦2M, mid-size ₦1M, club/streaming ₦500K.
      let slotsCreated = 0;
      if (ev.artist_lineup && ev.event_date) {
        const existingSlots = await base44.asServiceRole.entities.PerformanceSlot.filter({ event_id: ev.id });
        if (!existingSlots.length) {
          const artists = ev.artist_lineup.split(',').map((a) => a.trim()).filter(Boolean);
          const eventStart = new Date(ev.event_date);
          const vip = Number(ev.ticket_vip_price || 0);
          const isFestival = (ev.event_type === 'festival') || artists.length >= 5 || vip >= 250000;
          const slotPrice = isFestival ? 5000000
            : vip >= 200000 ? 3000000
            : vip >= 100000 ? 2000000
            : vip >= 50000 ? 1000000
            : 500000;
          // Doors open 1 hour before first act; each act 45 min with 15 min changeover
          let cursor = new Date(eventStart.getTime() + 60 * 60 * 1000);
          const slotRows = artists.map((artist, i) => {
            const set_time = new Date(cursor).toISOString();
            cursor = new Date(cursor.getTime() + 60 * 60 * 1000); // 45 min set + 15 min changeover
            return {
              event_id: ev.id,
              event_title: ev.title,
              artist_name: artist,
              set_time,
              duration_minutes: 45,
              slot_order: i + 1,
              stage: 'Main Stage',
              slot_price: slotPrice,
              status: 'confirmed',
            };
          });
          if (slotRows.length) {
            const createdSlots = await base44.asServiceRole.entities.PerformanceSlot.bulkCreate(slotRows);
            slotsCreated = createdSlots.length;
            totalSlots += slotsCreated;
          }
        }
      }

      perEvent.push({
        event_id: ev.id,
        title: ev.title,
        reminders_pushed: createdReminders.length,
        slots_created: slotsCreated,
      });
    }

    return Response.json({
      events_processed: events.length,
      reminders_pushed: totalReminders,
      emails_sent: totalEmails,
      slots_created: totalSlots,
      per_event: perEvent,
    });
  } catch (error) {
    console.error('auto-push-tickets error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}