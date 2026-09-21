import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ODDS HISTORY — computes opening/current/highest/lowest odds, movement
// percentage and STEAM/DRIFT classification from the OddsSnapshot rows the
// bookmaker-odds function stores on every fresh provider poll. Movement is
// only ever labelled from REAL snapshot history — a single current price is
// never called steam or drift. Minimum movement threshold: 5%.

const MAX_EVENTS = 20;
const WINDOW_DAYS = 7;
const THRESHOLD_PCT = 5;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try {
      body = await req.json();
    } catch {}

    const eventIds = Array.isArray(body.eventIds)
      ? body.eventIds.map(String).filter(Boolean).slice(0, MAX_EVENTS)
      : [];
    if (!eventIds.length) return Response.json({ status: 'ok', history: [], active: false });

    const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
    const rows = await base44.asServiceRole.entities.OddsSnapshot.filter({
      event_id: { $in: eventIds },
      timestamp: { $gte: cutoff },
    });

    const bySelection = new Map();
    for (const r of rows || []) {
      const ts = new Date(r.timestamp).getTime();
      if (!Number.isFinite(ts)) continue;
      const key = `${r.event_id}|${r.market}|${r.selection}`;
      if (!bySelection.has(key)) bySelection.set(key, []);
      bySelection.get(key).push({
        ts,
        odds: Number(r.decimal_odds),
        bookmaker: r.bookmaker,
        eventId: r.event_id,
        market: r.market,
        selection: r.selection,
      });
    }

    const history = [];
    for (const arr of bySelection.values()) {
      arr.sort((a, b) => a.ts - b.ts);
      const opening = arr[0].odds;
      const current = arr[arr.length - 1].odds;
      const oddsVals = arr.map((s) => s.odds);
      const byBook = new Map();
      for (const s of arr) {
        if (!byBook.has(s.bookmaker)) byBook.set(s.bookmaker, []);
        byBook.get(s.bookmaker).push(s);
      }
      let booksMoving = 0;
      for (const list of byBook.values()) {
        if (list.length > 1 && list[0].odds !== list[list.length - 1].odds) booksMoving++;
      }
      let movementPct = null;
      let label = 'NO HISTORY';
      let direction = 'none';
      if (arr.length >= 2 && opening > 1) {
        movementPct = Math.round(((current - opening) / opening) * 10000) / 100;
        if (movementPct <= -THRESHOLD_PCT) {
          label = 'STEAM';
          direction = 'down';
        } else if (movementPct >= THRESHOLD_PCT) {
          label = 'DRIFT';
          direction = 'up';
        } else {
          label = 'STABLE';
          direction = movementPct < 0 ? 'down' : movementPct > 0 ? 'up' : 'none';
        }
      }
      history.push({
        event_id: arr[0].eventId,
        market: arr[0].market,
        selection: arr[0].selection,
        opening_odds: opening,
        current_odds: current,
        highest_odds: Math.max(...oddsVals),
        lowest_odds: Math.min(...oddsVals),
        movement_percentage: movementPct,
        label,
        direction,
        books_tracked: byBook.size,
        books_moving: booksMoving,
        period_ms: arr[arr.length - 1].ts - arr[0].ts,
        snapshots: arr.length,
        first_seen: new Date(arr[0].ts).toISOString(),
        last_seen: new Date(arr[arr.length - 1].ts).toISOString(),
      });
    }

    return Response.json({ status: 'ok', active: (rows || []).length > 0, history });
  } catch (error) {
    return Response.json({ error: error.message, status: 'error' }, { status: 500 });
  }
}