import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { SportradarClient, coverageLevel } from '../../shared/sportradarClient.ts';
import { runEntitlementProbe, ingestDayResults, storedMatchCount, backfillResults, recomputeTeamSeasonStats, srDatabaseStats } from '../../shared/srIngestion.ts';
import { predictFixtures } from '../../shared/srModeling.ts';

// SPORTRADAR SOCCER v4 — bounded, key-safe access to the premium data layer.
// Actions are whitelisted, ids strictly validated (no arbitrary paths), and
// every response is trimmed + standardized { success, data, provider,
// timestamp, errors }. Sportradar supplies DATA and per-event COVERAGE
// metadata only — never odds, never probabilities (not subscribed; never
// invented). The API key exists only server-side and never appears in a
// response, log or URL.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_RE = /^sr:sport_event:\d+$/;

function trimEvent(e) {
  const se = (e && e.sport_event) || e || {};
  const ctx = se.sport_event_context || {};
  const comps = Array.isArray(se.competitors) ? se.competitors : [];
  const st = (e && e.sport_event_status) || null;
  return {
    event_id: se.id || null,
    kickoff: se.start_time || null,
    competition: (ctx.competition && ctx.competition.name) || null,
    category: (ctx.category && ctx.category.name) || null,
    season: (ctx.season && ctx.season.name) || null,
    home: (comps.find((c) => c.qualifier === 'home') || {}).name || null,
    away: (comps.find((c) => c.qualifier === 'away') || {}).name || null,
    coverage: coverageLevel(se.coverage),
    status: (st && st.status) || null,
    home_score: st && st.home_score != null ? st.home_score : null,
    away_score: st && st.away_score != null ? st.away_score : null,
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const ts = new Date().toISOString();

    const client = new SportradarClient({ apiKey: secrets.get('SPORTRADAR_API_KEY') || undefined });
    if (!client.ready()) {
      return Response.json({
        success: false, data: null, provider: 'sportradar', timestamp: ts,
        error: { code: 'MISSING_KEY', message: 'Sportradar API key not configured' },
      }, { status: 503 });
    }

    const fail = (code, message) => Response.json({
      success: false, data: null, provider: 'sportradar', timestamp: ts,
      error: { code, message },
    }, { status: 502 });

    if (action === 'status') {
      const j = await client.get('/competitions', { ttlMs: 60 * 60 * 1000 });
      const snap = client.healthSnapshot();
      if (!j || !Array.isArray(j.competitions)) return fail('PROVIDER_ERROR', snap.lastError || 'no competition data');
      return Response.json({
        success: true, partial: false, provider: 'sportradar', timestamp: ts, errors: [],
        data: { status: snap.status, competitions: j.competitions.length, lastLatencyMs: snap.lastLatencyMs, requests: snap.requests },
      });
    }

    if (action === 'schedule') {
      const date = String(body.date || '');
      if (!DATE_RE.test(date)) return Response.json({ error: 'Invalid date (YYYY-MM-DD)' }, { status: 400 });
      const j = await client.get(`/schedules/${date}/schedules`, { ttlMs: 10 * 60 * 1000 });
      if (!j || !Array.isArray(j.schedules)) return fail('PROVIDER_ERROR', client.healthSnapshot().lastError || 'no schedule data');
      return Response.json({
        success: true, partial: false, provider: 'sportradar', timestamp: ts, errors: [],
        data: { date, events: j.schedules.slice(0, 600).map(trimEvent) },
      });
    }

    if (action === 'live') {
      const j = await client.get('/schedules/live/schedules', { ttlMs: 15 * 1000 });
      if (!j || !Array.isArray(j.schedules)) return fail('PROVIDER_ERROR', client.healthSnapshot().lastError || 'no live schedule data');
      return Response.json({
        success: true, partial: false, provider: 'sportradar', timestamp: ts, errors: [],
        data: { events: j.schedules.slice(0, 100).map(trimEvent), generated_at: j.generated_at || null },
      });
    }

    if (action === 'summary' || action === 'lineups' || action === 'timeline') {
      const id = String(body.event_id || '');
      if (!EVENT_RE.test(id)) return Response.json({ error: 'Invalid event id' }, { status: 400 });
      const j = await client.get(`/sport_events/${id}/${action}`, { ttlMs: action === 'summary' ? 30 * 60 * 1000 : 60 * 1000 });
      if (!j) return fail('PROVIDER_ERROR', client.healthSnapshot().lastError || `no ${action} data`);

      if (action === 'summary') {
        const se = j.sport_event || {};
        return Response.json({
          success: true, partial: false, provider: 'sportradar', timestamp: ts, errors: [],
          data: {
            event: trimEvent({ sport_event: se }),
            status: j.sport_event_status || null,
            conditions: se.sport_event_conditions || null,
            venue: se.venue || null,
          },
        });
      }
      if (action === 'lineups') {
        const lu = j.lineups;
        const lineups = Array.isArray(lu) ? lu : (lu && Array.isArray(lu.competitors)) ? lu.competitors : [];
        return Response.json({
          success: true, partial: false, provider: 'sportradar', timestamp: ts, errors: [],
          data: {
            available: lineups.length > 0,
            lineups: lineups.map((L) => ({
              team: (L.team && L.team.name) || null,
              formation: L.formation || null,
              confirmed: !!L.confirmed,
              players: (Array.isArray(L.players) ? L.players : []).slice(0, 32).map((p) => ({
                name: p.name || null,
                position: p.position || null,
                type: p.type || null,
                jersey_number: p.jersey_number != null ? p.jersey_number : null,
              })),
            })),
          },
        });
      }
      return Response.json({
        success: true, partial: false, provider: 'sportradar', timestamp: ts, errors: [],
        data: { timeline: (Array.isArray(j.timeline) ? j.timeline : []).slice(0, 80), status: j.sport_event_status || null },
      });
    }

    if (action === 'entitlements') {
      // Entitlement detection — live probe, cached 24h in SrProbeResult.
      const cached = await base44.asServiceRole.entities.SrProbeResult.filter({ suite: 'entitlements' }, '-checked_at', 50);
      const fresh = cached && cached.length && (Date.now() - new Date(cached[0].checked_at).getTime() < 24 * 3600 * 1000);
      const matchesStored = await storedMatchCount(base44);
      if (fresh && !body.force && Array.isArray(cached)) {
        const connected = cached.filter((r) => r.status === 'CONNECTED' && !String(r.feed).includes('probabilities') && r.feed !== 'betting_odds').length;
        return Response.json({
          success: true, partial: false, provider: 'sportradar', timestamp: ts, errors: [],
          data: { status: 'CONNECTED', connected, probed: connected, feeds: cached, checked_at: cached[0].checked_at, matchesStored },
        });
      }
      const out = await runEntitlementProbe(base44, client);
      return Response.json({
        success: true, partial: false, provider: 'sportradar', timestamp: ts, errors: [],
        data: { ...out, matchesStored },
      });
    }

    if (action === 'ingest_results') {
      // Pipeline: provider → raw store → normalized historical database.
      if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
      const date = String(body.date || new Date(Date.now() - 86400000).toISOString().slice(0, 10));
      if (!DATE_RE.test(date)) return Response.json({ error: 'Invalid date (YYYY-MM-DD)' }, { status: 400 });
      const out = await ingestDayResults(base44, client, date, body.limit);
      return Response.json({
        success: !!out.ok, partial: out.skipped > 0, provider: 'sportradar', timestamp: ts,
        errors: out.ok ? [] : [{ code: 'INGEST_ERROR', message: out.error || 'ingestion failed' }],
        data: out,
      });
    }

    if (action === 'db_stats') {
      const stats = await srDatabaseStats(base44);
      return Response.json({
        success: true, partial: false, provider: 'sportradar', timestamp: ts, errors: [],
        data: stats,
      });
    }

    if (action === 'backfill') {
      if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
      const out = await backfillResults(base44, client, {
        days: body.days, perDay: body.per_day, withLineups: !!body.with_lineups,
      });
      const stats = await srDatabaseStats(base44);
      return Response.json({
        success: !!out.ok, partial: out.remaining_days > 0, provider: 'sportradar', timestamp: ts,
        errors: out.ok ? [] : [{ code: 'BACKFILL_ERROR', message: out.error || 'backfill failed' }],
        data: { ...out, stats },
      });
    }

    if (action === 'recompute_stats') {
      if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
      const out = await recomputeTeamSeasonStats(base44);
      const stats = await srDatabaseStats(base44);
      return Response.json({
        success: !!out.ok, partial: false, provider: 'sportradar', timestamp: ts, errors: [],
        data: { ...out, stats },
      });
    }

    if (action === 'predict') {
      const date = String(body.date || new Date().toISOString().slice(0, 10));
      if (!DATE_RE.test(date)) return Response.json({ error: 'Invalid date (YYYY-MM-DD)' }, { status: 400 });
      const out = await predictFixtures(base44, client, date);
      if (!out.ok) return fail('MODEL_ERROR', out.error || 'prediction unavailable');
      return Response.json({
        success: true, partial: out.passed > 0, provider: 'sportradar', timestamp: ts, errors: [],
        data: out,
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}