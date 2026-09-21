import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Pushes fixture kickoff events (with 30-min reminders) into the connected
// Google Calendar via the shared googlecalendar connector. Each event carries
// the league + teams so alerts are identifiable. Mirrors the same events in the
// browser-storage calendar store on the client so the UI always knows what's
// been synced even when this call is unavailable (credits exhausted / scope
// not yet granted).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const events = Array.isArray(body?.events) ? body.events : [];
    const remove = (Array.isArray(body?.remove) ? body.remove : []).filter((u) => /^ridex/.test(String(u)));
    if (!events.length && !remove.length) return Response.json({ error: 'No events to sync' }, { status: 400 });

    let accessToken;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googlecalendar');
      accessToken = conn?.accessToken;
    } catch (e) {
      return Response.json({ error: 'Google Calendar not connected', detail: e.message }, { status: 502 });
    }
    if (!accessToken) return Response.json({ error: 'Google Calendar not connected' }, { status: 502 });

    // UPSERT SYNC — Google Calendar rejects client-supplied event ids, so
    // every event we create is tagged with a private extended property
    // (ridexSync=1 + ridexKey=<uid>). The existing tags are listed first and
    // mapped to their real Google event ids: a re-sync PATCHes the existing
    // event in place (no duplicates), new events are created with a fresh id,
    // and remove[] deletes cancelled events by their mapped id.
    let existing = {};
    try {
      const listRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=250&privateExtendedProperty=ridexSync%3D1', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (listRes.ok) {
        const data = await listRes.json();
        for (const item of data.items || []) {
          const key = item?.extendedProperties?.private?.ridexKey;
          if (key && item.id) existing[key] = item.id;
        }
      }
    } catch {}

    let created = 0, updated = 0, failed = 0, removed = 0;
    for (const uid of remove) {
      const gid = existing[uid];
      if (!gid) { removed++; continue; } // never synced — nothing to delete
      try {
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gid)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok || res.status === 404 || res.status === 410) removed++;
      } catch {}
    }
    for (const ev of events) {
      const payload = {
        summary: ev.title || `${ev.home} vs ${ev.away}`,
        description: `Ride X · ${ev.league || 'Fixture'} · ${ev.home} vs ${ev.away} · Kickoff reminder`,
        // allDay events (a fixture whose kickoff time is unknown) use a
        // plain date instead of a dateTime, so no leg is ever skipped.
        ...(ev.allDay
          ? { start: { date: ev.start }, end: { date: ev.end } }
          : { start: { dateTime: ev.start }, end: { dateTime: ev.end } }),
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: ev.reminderMinutes || 30 }] },
        ...(ev.uid ? { extendedProperties: { private: { ridexSync: '1', ridexKey: ev.uid } } } : {}),
      };
      try {
        const gid = ev.uid ? existing[ev.uid] : null;
        if (gid) {
          const patch = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gid)}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (patch.ok) { updated++; continue; }
        }
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) created++; else failed++;
      } catch { failed++; }
    }
    return Response.json({ created, updated, removed, failed, total: events.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}