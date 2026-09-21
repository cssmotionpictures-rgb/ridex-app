// srIngestion.ts — Phase 1/2 foundation for the Sportradar-backed engine.
// Live entitlement probing (never assumed), raw provider storage (chunked,
// exact bytes), and raw → normalized ingestion into the historical match
// database. Sportradar sr: IDs are the primary keys; names are display
// fields only. Missing data is UNKNOWN — never invented, never zero-filled.
// Probabilities and odds feeds are NOT SUBSCRIBED and are never requested.

import { SportradarClient, coverageLevel } from './sportradarClient.ts';

const CHUNK = 20000; // per-record payload chunk — respects entity field limits
const DAY_MS = 24 * 60 * 60 * 1000;

// Feeds the subscription does NOT include — declared honestly, never requested.
export const NOT_SUBSCRIBED = [
  { feed: 'soccer_probabilities', status: 'NOT_SUBSCRIBED' },
  { feed: 'soccer_extended_probabilities', status: 'NOT_SUBSCRIBED' },
  { feed: 'betting_odds', status: 'NOT_CONNECTED' },
];

function hashOf(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// DATA_COVERAGE_SCORE 0-100 — computed ONLY from the provider's real
// per-event coverage flags. No flags → INSUFFICIENT, never fabricated.
export function coverageScore(coverage) {
  const base = coverageLevel(coverage); // {level, score, ratio}
  const p = (coverage && coverage.sport_event_properties) || {};
  const extended = ['extended_play_by_play', 'extended_player_stats', 'extended_team_stats',
    'deeper_play_by_play', 'deeper_player_stats', 'deeper_team_stats', 'commentary', 'ballspotting']
    .filter((k) => p[k]).length;
  const score = Math.round(Math.min(100, base.ratio * 72 + (extended / 8) * 28));
  return { level: base.level, score };
}

// Normalized schedule entry — sr IDs are the keys, names are display only.
export function normalizeScheduleEntry(s) {
  const ev = (s && s.sport_event) || {};
  const st = (s && s.sport_event_status) || {};
  const ctx = ev.sport_event_context || {};
  const comps = Array.isArray(ev.competitors) ? ev.competitors : [];
  const home = comps.find((c) => c.qualifier === 'home') || {};
  const away = comps.find((c) => c.qualifier === 'away') || {};
  const periods = Array.isArray(st.period_scores) ? st.period_scores : [];
  const first = periods.find((p) => p.number === 1) || null;
  const cov = coverageScore(ev.coverage);
  return {
    event_id: ev.id || null,
    kickoff: ev.start_time || null,
    competition_id: (ctx.competition && ctx.competition.id) || null,
    competition_name: (ctx.competition && ctx.competition.name) || null,
    category_name: (ctx.category && ctx.category.name) || null,
    season_id: (ctx.season && ctx.season.id) || null,
    season_name: (ctx.season && ctx.season.name) || null,
    home_id: home.id || null,
    home_name: home.name || null,
    away_id: away.id || null,
    away_name: away.name || null,
    home_score: st.home_score != null ? st.home_score : null,
    away_score: st.away_score != null ? st.away_score : null,
    ht_home: first && first.home_score != null ? first.home_score : null,
    ht_away: first && first.away_score != null ? first.away_score : null,
    match_status: st.match_status || st.status || null,
    winner_id: st.winner_id || null,
    match_tie: !!st.match_tie,
    coverage_level: cov.level,
    coverage_score: cov.score,
  };
}

// RAW STORE — the exact provider response, chunked. Rows are replaced only
// for the SAME cache key (same feed + event); historical data is never
// silently overwritten across different matches.
export async function rawStore(base44, client, feed, cacheKey, path, ttlMs) {
  const data = await client.get(path, { ttlMs });
  if (!data) {
    return { ok: false, error: String(client.metrics.lastError || 'provider error'), data: null };
  }
  const raw = JSON.stringify(data);
  try {
    await base44.asServiceRole.entities.RawProviderFeed.deleteMany({ provider: 'sportradar', cache_key: cacheKey });
  } catch { /* no prior rows to replace */ }
  const parts = [];
  for (let i = 0; i < raw.length; i += CHUNK) parts.push(raw.slice(i, i + CHUNK));
  if (parts.length) {
    await base44.asServiceRole.entities.RawProviderFeed.bulkCreate(parts.map((payload, part) => ({
      provider: 'sportradar',
      feed,
      cache_key: cacheKey,
      part,
      total_parts: parts.length,
      http_status: 200,
      latency_ms: client.metrics.lastLatencyMs || 0,
      data_hash: hashOf(raw),
      payload,
      fetched_at: new Date().toISOString(),
    })));
  }
  return { ok: true, size: raw.length, parts: parts.length, hash: hashOf(raw), data };
}

// Extended team statistics arrive inside the summary (statistics.totals).
// Only fields the provider actually returned are kept.
function extractTeamStats(summary) {
  const totals = summary && summary.statistics && summary.statistics.totals;
  if (!totals) return null;
  const comps = Array.isArray(totals) ? totals : Array.isArray(totals.competitors) ? totals.competitors : null;
  if (!comps || !comps.length) return null;
  return comps.map((c) => ({ id: c.id || null, name: c.name || null, statistics: c.statistics || {} }));
}

function capJson(value, maxChars) {
  const s = JSON.stringify(value);
  if (s.length <= maxChars) return s;
  return JSON.stringify(Array.isArray(value) ? value.map((c) => ({ id: c.id, name: c.name })) : value);
}

// Deeper normalized tables — upserts keyed on the provider's real sr: IDs.
// Missing data stays missing; nothing is invented or zero-filled.
async function upsertVenue(base44, venue) {
  if (!venue || !venue.id) return false;
  const record = {
    venue_id: venue.id,
    name: venue.name || '',
    city: venue.city_name || '',
    country: (venue.country && venue.country.name) || '',
    country_code: (venue.country && venue.country.id) || '',
    capacity: venue.capacity != null ? Number(venue.capacity) : null,
    coordinates: venue.map_coordinates ? JSON.stringify(venue.map_coordinates) : '',
    data_as_of: new Date().toISOString(),
  };
  const existing = await base44.asServiceRole.entities.SrVenue.filter({ venue_id: venue.id }, '-updated_date', 1);
  if (existing && existing[0]) {
    await base44.asServiceRole.entities.SrVenue.update(existing[0].id, record);
    return false;
  }
  await base44.asServiceRole.entities.SrVenue.create(record);
  return true;
}

async function upsertPlayers(base44, lineupsPayload) {
  const lu = lineupsPayload && lineupsPayload.lineups;
  // provider shape: { lineups: { competitors: [...] } } — array tolerated too
  const lineups = Array.isArray(lu) ? lu : (lu && Array.isArray(lu.competitors)) ? lu.competitors : [];
  const seen = new Map(); // player_id -> record (last lineup wins)
  for (const L of lineups) {
    const team = L.team || {};
    for (const p of (Array.isArray(L.players) ? L.players : []).slice(0, 32)) {
      if (!p.id) continue;
      seen.set(p.id, {
        player_id: p.id, name: p.name || '',
        team_id: team.id || '', team_name: team.name || '',
        position: p.position || '',
        jersey_number: p.jersey_number != null ? Number(p.jersey_number) : null,
        player_type: p.type || '',
        last_seen: new Date().toISOString(),
      });
    }
  }
  if (seen.size === 0) return 0;
  // ONE batched lookup — never a database call per player (rate limits!)
  const existing = await base44.asServiceRole.entities.SrPlayer.filter({ player_id: { $in: [...seen.keys()] } }, '-updated_date', 500);
  const byId = new Map((existing || []).map((r) => [r.player_id, r]));
  const toUpdate = [];
  const toCreate = [];
  for (const [pid, record] of seen) {
    const ex = byId.get(pid);
    if (ex) toUpdate.push({ id: ex.id, ...record });
    else toCreate.push(record);
  }
  if (toCreate.length) await base44.asServiceRole.entities.SrPlayer.bulkCreate(toCreate);
  if (toUpdate.length) await base44.asServiceRole.entities.SrPlayer.bulkUpdate(toUpdate);
  return toCreate.length;
}

// THE PIPELINE — a REAL fixture goes provider → raw store → normalization →
// historical database, exactly as the master spec requires. Bounded per run
// (trial plan ≈ 1 req/s): richest-coverage matches first. opts.withLineups
// also normalizes player lineups; opts.skipExisting spends no provider
// request on a match already stored (bulk backfill dedupe).
export async function ingestDayResults(base44, client, date, limit, opts = {}) {
  const cap = Math.max(1, Math.min(12, Number(limit) || 6));
  const withLineups = !!opts.withLineups;
  const sched = await client.get(`/schedules/${date}/schedules`, { ttlMs: 10 * 60 * 1000 });
  if (!sched || !Array.isArray(sched.schedules)) {
    return { ok: false, error: 'schedule unavailable for ' + date, ingested: 0 };
  }
  const ended = sched.schedules.map(normalizeScheduleEntry).filter((m) => m.match_status === 'ended' && m.event_id);
  let candidates = ended.sort((a, b) => (b.coverage_score || 0) - (a.coverage_score || 0));
  if (opts.skipExisting) {
    // ONE day-range query — never a database call per candidate (rate limits!)
    const storedRows = await base44.asServiceRole.entities.SrMatchResult.filter(
      { kickoff: { $gte: `${date}T00:00:00Z`, $lte: `${date}T23:59:59Z` } }, '-kickoff', 200
    );
    const storedIds = new Set((storedRows || []).map((r) => r.event_id));
    candidates = candidates.filter((m) => !storedIds.has(m.event_id));
  }
  const targets = candidates.slice(0, cap);
  let ingested = 0;
  let skipped = 0;
  let playersAdded = 0;
  let venuesAdded = 0;
  let sample = null;
  for (const m of targets) {
    const raw = await rawStore(base44, client, 'summary', `sportradar:summary:${m.event_id}`, `/sport_events/${m.event_id}/summary`, 30 * 60 * 1000);
    if (!raw.ok) { skipped++; continue; }
    if (await upsertVenue(base44, (raw.data.sport_event || {}).venue)) venuesAdded++;
    if (withLineups) {
      const luRaw = await rawStore(base44, client, 'lineups', `sportradar:lineups:${m.event_id}`, `/sport_events/${m.event_id}/lineups`, 60 * 60 * 1000);
      if (luRaw.ok) playersAdded += await upsertPlayers(base44, luRaw.data);
    }
    const teamStats = extractTeamStats(raw.data);
    const record = {
      ...m,
      team_stats: teamStats ? capJson(teamStats, 14000) : '',
      has_statistics: !!teamStats,
      raw_ref: `sportradar:summary:${m.event_id}`,
      data_as_of: new Date().toISOString(),
    };
    const existing = await base44.asServiceRole.entities.SrMatchResult.filter({ event_id: m.event_id }, '-updated_date', 1);
    if (existing && existing[0]) {
      await base44.asServiceRole.entities.SrMatchResult.update(existing[0].id, record);
    } else {
      await base44.asServiceRole.entities.SrMatchResult.create(record);
    }
    ingested++;
    if (!sample) {
      sample = {
        event_id: m.event_id, home: m.home_name, away: m.away_name,
        score: `${m.home_score}-${m.away_score}`, coverage: m.coverage_score, has_stats: !!teamStats,
      };
    }
  }
  const requestsUsed = 1 + targets.length + (withLineups ? targets.length : 0);
  return { ok: true, date, ended_found: ended.length, ingested, skipped, players_added: playersAdded, venues_added: venuesAdded, requests_used: requestsUsed, sample };
}

export async function storedMatchCount(base44) {
  try {
    const rows = await base44.asServiceRole.entities.SrMatchResult.filter({}, '-updated_date', 500);
    return Array.isArray(rows) ? Math.min(rows.length, 500) : 0;
  } catch {
    return null;
  }
}

// BULK HISTORICAL BACKFILL — walks backward day by day within a request
// budget (one invocation can never overrun the trial plan or a function
// timeout). Days already logged 'done' are skipped for free; the caller
// loops on remaining_days until the whole window is backfilled.
async function logBackfillDay(base44, day, status, out) {
  const record = {
    day, status,
    matches_found: out && out.ended_found != null ? out.ended_found : 0,
    ingested: (out && out.ingested) || 0,
    skipped: (out && out.skipped) || 0,
    players_added: (out && out.players_added) || 0,
    venues_added: (out && out.venues_added) || 0,
    ran_at: new Date().toISOString(),
  };
  const existing = await base44.asServiceRole.entities.SrBackfillLog.filter({ day }, '-updated_date', 1);
  if (existing && existing[0]) {
    record.ingested = (existing[0].ingested || 0) + record.ingested; // cumulative across walks
    await base44.asServiceRole.entities.SrBackfillLog.update(existing[0].id, record);
  } else await base44.asServiceRole.entities.SrBackfillLog.create(record);
}

export async function backfillResults(base44, client, opts = {}) {
  const days = Math.max(1, Math.min(14, Number(opts.days) || 3));
  const withLineups = !!opts.withLineups;
  const perDay = Math.max(1, Math.min(12, Number(opts.perDay) || (withLineups ? 4 : 8)));
  const targetDepth = Math.max(perDay, Math.min(24, Number(opts.targetDepth) || (withLineups ? 10 : 12)));
  let budget = Math.max(4, Math.min(30, Number(opts.maxRequests) || 18));

  // Stored counts per day for the whole window — ONE query (never per day).
  // Days below targetDepth are re-opened: skipExisting inside the ingest means
  // a re-walk only spends requests on matches NOT yet stored.
  const winStart = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10) + 'T00:00:00Z';
  const winEnd = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10) + 'T23:59:59Z';
  const storedByDay = new Map();
  try {
    const stored = await base44.asServiceRole.entities.SrMatchResult.filter(
      { kickoff: { $gte: winStart, $lte: winEnd } }, '-kickoff', 500
    );
    for (const r of (stored || [])) {
      const d = String(r.kickoff || '').slice(0, 10);
      if (d) storedByDay.set(d, (storedByDay.get(d) || 0) + 1);
    }
  } catch { /* nothing stored yet */ }

  const processed = [];
  let ingested = 0, skipped = 0, playersAdded = 0, venuesAdded = 0, requestsUsed = 0;

  for (let d = 1; d <= days && budget >= 2; d++) {
    const date = new Date(Date.now() - d * DAY_MS).toISOString().slice(0, 10);
    const stored = storedByDay.get(date) || 0;
    if (stored >= targetDepth) { processed.push({ day: date, status: 'at_depth', stored }); continue; }
    const out = await ingestDayResults(base44, client, date, perDay, { withLineups, skipExisting: true });
    const used = out.requests_used || 1;
    requestsUsed += used;
    budget -= used;
    if (!out.ok) {
      await logBackfillDay(base44, date, 'failed', out);
      processed.push({ day: date, status: 'failed', error: out.error });
      continue;
    }
    ingested += out.ingested;
    skipped += out.skipped;
    playersAdded += out.players_added || 0;
    venuesAdded += out.venues_added || 0;
    await logBackfillDay(base44, date, 'done', out);
    const effective = stored + out.ingested;
    storedByDay.set(date, effective);
    // A day is complete when stored depth reaches the target, or the day's
    // whole archive is already in (fewer ended matches than the target).
    const complete = effective >= targetDepth || (out.ended_found != null && effective >= out.ended_found);
    processed.push({ day: date, status: complete ? 'done' : 'deepening', found: out.ended_found, ingested: out.ingested, stored: effective });
  }

  let remainingDays = 0;
  for (let d = 1; d <= days; d++) {
    const date = new Date(Date.now() - d * DAY_MS).toISOString().slice(0, 10);
    if ((storedByDay.get(date) || 0) < targetDepth) remainingDays++;
  }

  return {
    ok: true, days_requested: days, target_depth: targetDepth, processed,
    remaining_days: remainingDays,
    ingested, skipped, players_added: playersAdded, venues_added: venuesAdded,
    requests_used: requestsUsed,
  };
}

// TEAM-SEASON TABLE — DERIVED from stored real results (played, W/D/L, goals,
// home/away splits, last-5 form). Never a provider feed, never synthesized.
export async function recomputeTeamSeasonStats(base44) {
  const rows = await base44.asServiceRole.entities.SrMatchResult.filter({ match_status: 'ended' }, '-kickoff', 500);
  const usable = (rows || []).filter((m) => m.season_id && m.home_id && m.away_id && m.home_score != null && m.away_score != null && m.kickoff);
  const bySeason = new Map();
  for (const m of usable) {
    if (!bySeason.has(m.season_id)) bySeason.set(m.season_id, []);
    bySeason.get(m.season_id).push(m);
  }
  let seasons = 0, written = 0;
  const rowsOut = [];
  for (const [seasonId, matches] of bySeason) {
    seasons++;
    const agg = new Map();
    const get = (id, name) => {
      if (!agg.has(id)) agg.set(id, {
        team_id: id, team_name: name || '',
        season_id: seasonId, season_name: matches[0].season_name || '',
        competition_name: matches[0].competition_name || '',
        played: 0, wins: 0, draws: 0, losses: 0,
        goals_for: 0, goals_against: 0,
        home_played: 0, home_wins: 0, away_played: 0, away_wins: 0,
        results: [],
      });
      return agg.get(id);
    };
    const sorted = matches.slice().sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    for (const m of sorted) {
      const h = get(m.home_id, m.home_name);
      const a = get(m.away_id, m.away_name);
      h.played++; a.played++;
      h.goals_for += m.home_score; h.goals_against += m.away_score;
      a.goals_for += m.away_score; a.goals_against += m.home_score;
      h.home_played++; a.away_played++;
      if (m.home_score === m.away_score) { h.draws++; a.draws++; h.results.push('D'); a.results.push('D'); }
      else if (m.home_score > m.away_score) { h.wins++; h.home_wins++; a.losses++; h.results.push('W'); a.results.push('L'); }
      else { a.wins++; a.away_wins++; h.losses++; h.results.push('L'); a.results.push('W'); }
    }
    for (const t of [...agg.values()].filter((t) => t.played > 0)) {
      const { results, ...rest } = t;
      rowsOut.push({
        ...rest,
        points: t.wins * 3 + t.draws,
        form: results.slice(-5).reverse().join(''),
        data_as_of: new Date().toISOString(),
      });
    }
  }
  // ONE delete + chunked writes — never a pair of database calls per season
  // (per-season deleteMany/bulkCreate bursts trip the platform rate limit).
  if (rowsOut.length) {
    try {
      await base44.asServiceRole.entities.SrTeamSeasonStat.deleteMany({ season_id: { $in: [...bySeason.keys()] } });
    } catch { /* nothing stored yet */ }
    for (let i = 0; i < rowsOut.length; i += 100) {
      await base44.asServiceRole.entities.SrTeamSeasonStat.bulkCreate(rowsOut.slice(i, i + 100));
      written += Math.min(100, rowsOut.length - i);
    }
  }
  return { ok: true, matches_used: usable.length, seasons, teams: rowsOut.length, rows_written: written };
}

// Live table counts for the admin panel. Counts are capped by the read limit —
// the UI shows "200+" when a table is at the cap.
export async function srDatabaseStats(base44) {
  const COUNT_CAP = 200;
  const count = async (entity) => {
    try {
      const r = await base44.asServiceRole.entities[entity].filter({}, '-updated_date', COUNT_CAP);
      return Array.isArray(r) ? r.length : 0;
    } catch { return null; }
  };
  let logs = [];
  try { logs = await base44.asServiceRole.entities.SrBackfillLog.filter({}, '-ran_at', 8); } catch { /* none yet */ }
  const [matches, players, venues, teamSeasons] = await Promise.all([
    count('SrMatchResult'), count('SrPlayer'), count('SrVenue'), count('SrTeamSeasonStat'),
  ]);
  const capped = [matches, players, venues, teamSeasons].some((v) => v != null && v >= COUNT_CAP);
  return {
    matches, players, venues, team_seasons: teamSeasons, count_cap: COUNT_CAP, capped,
    recent_backfills: (logs || []).map((r) => ({
      day: r.day, status: r.status, matches_found: r.matches_found, ingested: r.ingested, ran_at: r.ran_at,
    })),
  };
}

// ENTITLEMENT DETECTION — every feed is tested live; nothing is assumed.
// Results are persisted so the UI shows the verified truth without
// re-probing (24h freshness, or force).
export async function runEntitlementProbe(base44, client) {
  const rows = [];
  const probe = async (feed, path, ttlMs, note) => {
    const j = await client.get(path, { ttlMs });
    const ok = !!j;
    const err = ok ? '' : String(client.metrics.lastError || '');
    const http = ok ? 200 : Number((err.match(/HTTP (\d+)/) || [])[1]) || null;
    const status = ok ? 'CONNECTED'
      : http === 401 || http === 403 ? 'AUTH_ERROR'
      : http === 429 ? 'RATE_LIMITED'
      : 'UNAVAILABLE';
    rows.push({
      suite: 'entitlements', feed, status, http_status: http,
      latency_ms: ok ? client.metrics.lastLatencyMs || 0 : 0,
      note: ok ? note || '' : err.slice(0, 120),
      checked_at: new Date().toISOString(),
    });
    return j;
  };

  const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  await probe('competitions', '/competitions', 6 * 3600 * 1000, 'Soccer API v4 competitions');
  const sched = await probe('daily_schedules', `/schedules/${yesterday}/schedules`, 6 * 3600 * 1000, 'daily schedule ' + yesterday);
  await probe('live_schedules', '/schedules/live/schedules', 60 * 1000, 'live matches');
  const seasons = await probe('competition_seasons', '/competitions/sr:competition:17/seasons', 6 * 3600 * 1000, 'competition seasons');

  let seasonId = null;
  if (seasons && Array.isArray(seasons.seasons) && seasons.seasons.length) {
    const cur = seasons.seasons.find((x) => x.year === '26/27') || seasons.seasons[seasons.seasons.length - 1];
    seasonId = cur.id || null;
  }
  if (seasonId) {
    await probe('season_info', `/seasons/${seasonId}/info`, 6 * 3600 * 1000, 'season info + stages');
    await probe('season_competitors', `/seasons/${seasonId}/competitors`, 6 * 3600 * 1000, 'season teams');
    await probe('season_standings', `/seasons/${seasonId}/standings`, 6 * 3600 * 1000, 'standings');
    await probe('season_schedules', `/seasons/${seasonId}/schedules`, 6 * 3600 * 1000, 'season fixtures');
  }

  const flat = sched && Array.isArray(sched.schedules) ? sched.schedules : [];
  const ended = flat.find((s) => (s.sport_event_status || {}).match_status === 'ended') || null;
  if (ended && ended.sport_event) {
    const id = ended.sport_event.id;
    await probe('event_summary', `/sport_events/${id}/summary`, 30 * 60 * 1000, 'match summary + Extended team stats');
    await probe('event_timeline', `/sport_events/${id}/timeline`, 30 * 60 * 1000, 'play-by-play timeline');
    const lineups = await probe('event_lineups', `/sport_events/${id}/lineups`, 30 * 60 * 1000, 'lineups');
    const cid = (((ended.sport_event.competitors || [])[0]) || {}).id || null;
    if (cid) {
      await probe('competitor_profile', `/competitors/${cid}/profile`, 6 * 3600 * 1000, 'team profile');
      if (seasonId) {
        await probe('season_competitor_statistics', `/seasons/${seasonId}/competitors/${cid}/statistics`, 6 * 3600 * 1000, 'season team statistics (Extended)');
      }
    }
    const pl = (lineups && Array.isArray(lineups.lineups) && lineups.lineups[0] && lineups.lineups[0].players) || [];
    if (pl.length && pl[0].id) {
      await probe('player_profile', `/players/${pl[0].id}/profile`, 6 * 3600 * 1000, 'player profile');
    }
  }

  const declared = NOT_SUBSCRIBED.map((n) => ({
    suite: 'entitlements', feed: n.feed, status: n.status, http_status: null,
    latency_ms: 0, note: 'declared from subscription — never requested',
    checked_at: new Date().toISOString(),
  }));
  const all = [...rows, ...declared];
  try {
    await base44.asServiceRole.entities.SrProbeResult.deleteMany({ suite: 'entitlements' });
    await base44.asServiceRole.entities.SrProbeResult.bulkCreate(all);
  } catch { /* persistence failure must not fail the probe */ }

  const connected = rows.filter((r) => r.status === 'CONNECTED').length;
  const status = rows.some((r) => r.status === 'AUTH_ERROR') ? 'AUTH_ERROR'
    : connected === rows.length && rows.length > 0 ? 'CONNECTED'
    : 'DEGRADED';
  return { status, connected, probed: rows.length, feeds: all, checked_at: new Date().toISOString() };
}