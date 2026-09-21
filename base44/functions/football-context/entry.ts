import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { normalizeTeamName, teamsMatch, currentSeason } from '../../shared/teamMatch.ts';

// FOOTBALL CONTEXT — provider-verified injuries and lineups for one fixture
// (API-Football, with Sportmonks/Sportradar status reporting). Nothing is
// inferred: if the plan does not allow an endpoint, or the provider has no
// data, the feature is marked UNAVAILABLE — the engine never invents an
// injury or a confirmed lineup.

const API_HOST = 'https://v3.football.api-sports.io';
const FIXTURE_TTL = 12 * 60;
const CONTEXT_TTL = 6 * 60;

const LEAGUE_IDS = {
  'Premier League': 39,
  'La Liga': 140,
  'Serie A': 135,
  'Bundesliga': 78,
  'Ligue 1': 61,
  Championship: 40,
  Eredivisie: 88,
  'Primeira Liga': 94,
  'La Liga 2': 141,
  'Serie B': 136,
  '2. Bundesliga': 79,
  'Ligue 2': 62,
  'Scottish Premiership': 179,
  'Süper Lig': 203,
  'Pro League Belgium': 144,
  'Russian Premier League': 235,
};

function injStatus(entry) {
  const type = String(entry?.player?.type || '').toLowerCase();
  const reason = String(entry?.player?.reason || '').toLowerCase();
  if (reason.includes('susp')) return 'SUSPENDED';
  if (type.includes('missing') || type.includes('injury') || reason.includes('injury')) return 'OUT';
  if (type.includes('questionable') || reason.includes('questionable')) return 'QUESTIONABLE';
  return 'DOUBTFUL';
}

// Cached provider GET with ApiFootballCache (shared cache entity). Returns
// { data } | { error, status, planRestricted }.
async function cachedGet(base44, cacheKey, url, headers, ttlMinutes) {
  let cached = null;
  try {
    const rows = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: cacheKey });
    cached = rows && rows[0] ? rows[0] : null;
    if (cached && cached.updated_date &&
        Date.now() - new Date(cached.updated_date).getTime() < ttlMinutes * 60000) {
      try {
        return { data: JSON.parse(cached.payload), cached: true };
      } catch {}
    }
  } catch {}
  let res;
  try {
    res = await fetch(url, { headers });
  } catch {
    return { error: 'provider unreachable', status: 0 };
  }
  if (!res.ok) {
    return { error: res.status === 403 ? 'plan restricted' : `provider error ${res.status}`, status: res.status, planRestricted: res.status === 403 };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { error: 'bad provider response', status: res.status };
  }
  try {
    const str = JSON.stringify(data);
    if (str.length < 28000) {
      if (cached) await base44.asServiceRole.entities.ApiFootballCache.update(cached.id, { endpoint: 'api-football', payload: str });
      else await base44.asServiceRole.entities.ApiFootballCache.create({ cache_key: cacheKey, endpoint: 'api-football', payload: str });
    }
  } catch {}
  return { data };
}

async function probe(url, headers) {
  try {
    const res = await fetch(url, { headers });
    return res.ok ? 'CONNECTED' : 'ERROR';
  } catch {
    return 'ERROR';
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try {
      body = await req.json();
    } catch {}

    const apiKey = (secrets.get('API_FOOTBALL_KEY_V2') || secrets.get('API_FOOTBALL_KEY') || '').trim();
    const headers = { 'x-apisports-key': apiKey };
    const nowIso = new Date().toISOString();

    // ---- action: status — cheap provider diagnostics for the status panel
    if (body.action === 'status') {
      let oddsHistoryActive = false;
      try {
        const recent = await base44.asServiceRole.entities.OddsSnapshot.list('-timestamp', 1);
        oddsHistoryActive = Array.isArray(recent) && recent.length > 0;
      } catch {}
      const oddsKey = (secrets.get('THE_ODDS_API_KEY') || secrets.get('ODDS_API_KEY') || '').trim();
      const smToken = (secrets.get('SPORTMONKS_API_TOKEN') || '').trim();
      const providers = {
        footballData: {
          sportmonks: smToken ? await probe('https://api.sportmonks.com/v3/football/leagues?api_token=' + encodeURIComponent(smToken) + '&per_page=1') : 'NOT CONFIGURED',
          sportradar: 'NOT CONFIGURED — no Sportradar subscription (adapter intentionally inactive)',
          apiFootball: apiKey ? await probe(API_HOST + '/status', headers) : 'NOT CONFIGURED',
        },
        bookmakerOdds: {
          theOddsApi: oddsKey ? await probe('https://api.the-odds-api.com/v4/sports/?apiKey=' + encodeURIComponent(oddsKey)) : 'NOT CONFIGURED',
        },
        injuries: 'UNKNOWN — probed on demand from a leg\'s detail',
        lineups: 'UNKNOWN — probed on demand from a leg\'s detail',
        oddsHistory: oddsHistoryActive ? 'ACTIVE' : 'INACTIVE',
      };
      return Response.json({ status: 'ok', providers, checkedAt: nowIso });
    }

    // ---- action: fixture — injuries + lineups for one match
    const date = String(body.date || '').slice(0, 10);
    const home = String(body.home || '');
    const away = String(body.away || '');
    const league = String(body.league || '');
    const leagueId = LEAGUE_IDS[league];
    const unavailable = (reason) => ({
      status: 'ok',
      fixtureId: null,
      injuries: { available: false, reason, updatedAt: nowIso },
      lineups: { status: 'UNKNOWN', reason, updatedAt: nowIso },
    });

    if (!leagueId) return Response.json(unavailable('LEAGUE NOT COVERED — the injury/lineup provider does not carry this competition'));
    if (!date || !home || !away) return Response.json(unavailable('INCOMPLETE FIXTURE — league, date and both teams required'));
    if (!apiKey) return Response.json(unavailable('API-FOOTBALL FEATURE UNAVAILABLE — no provider key configured'));

    const season = currentSeason(date);
    const fx = await cachedGet(
      base44,
      `api-football:fixtures:${leagueId}:${season}:${date}`,
      `${API_HOST}/fixtures?league=${leagueId}&season=${season}&date=${encodeURIComponent(date)}`,
      headers,
      FIXTURE_TTL
    );
    if (fx.error && fx.planRestricted) return Response.json(unavailable('API-FOOTBALL FEATURE UNAVAILABLE ON CURRENT PLAN'));
    if (fx.error || !Array.isArray(fx.data?.response)) return Response.json(unavailable('FIXTURE LOOKUP UNAVAILABLE — the provider feed did not answer'));

    const fxRow = fx.data.response.find(
      (f) => teamsMatch(f?.teams?.home?.name || '', home) && teamsMatch(f?.teams?.away?.name || '', away)
    );
    if (!fxRow) return Response.json(unavailable('FIXTURE NOT FOUND IN PROVIDER FEED — no injury or lineup data exists for it'));
    const fixtureId = String(fxRow?.fixture?.id || '');
    const kickoff = fxRow?.fixture?.date || null;

    // injuries
    let injuries;
    const inj = await cachedGet(base44, `api-football:injuries:${fixtureId}`, `${API_HOST}/injuries?fixture=${fixtureId}`, headers, CONTEXT_TTL);
    if (inj.error && inj.planRestricted) {
      injuries = { available: false, reason: 'API-FOOTBALL FEATURE UNAVAILABLE ON CURRENT PLAN', updatedAt: nowIso };
    } else if (inj.error || !Array.isArray(inj.data?.response)) {
      injuries = { available: false, reason: 'INJURY DATA: UNAVAILABLE — provider feed did not answer', updatedAt: nowIso };
    } else {
      injuries = {
        available: true,
        updatedAt: nowIso,
        source: 'API-Football',
        list: inj.data.response.map((e) => ({
          player: e?.player?.name || '',
          team: e?.team?.name || '',
          status: injStatus(e),
          reason: e?.player?.reason || e?.player?.type || '',
          source: 'API-Football',
          provider: 'API-Football',
          timestamp: nowIso,
        })).filter((i) => i.player),
      };
    }

    // lineups
    let lineups;
    const lu = await cachedGet(base44, `api-football:lineups:${fixtureId}`, `${API_HOST}/fixtures/lineups?fixture=${fixtureId}`, headers, CONTEXT_TTL);
    if (lu.error && lu.planRestricted) {
      lineups = { status: 'UNKNOWN', reason: 'API-FOOTBALL FEATURE UNAVAILABLE ON CURRENT PLAN', updatedAt: nowIso };
    } else if (lu.error || !Array.isArray(lu.data?.response)) {
      lineups = { status: 'UNKNOWN', reason: 'LINEUP DATA: UNAVAILABLE — provider feed did not answer', updatedAt: nowIso };
    } else {
      const sides = (lu.data.response || []).map((t) => ({
        team: t?.team?.name || '',
        formation: t?.formation || '',
        xi: (t?.startXI || []).map((p) => p?.player?.name || '').filter(Boolean),
      }));
      // Official lineups are published close to kickoff — before that the
      // data (when present) is a probable lineup, never claimed confirmed.
      const minsToKick = kickoff ? (new Date(kickoff).getTime() - Date.now()) / 60000 : null;
      const confirmed = sides.length >= 2 && minsToKick != null && minsToKick <= 120;
      lineups = {
        status: sides.length >= 2 ? (confirmed ? 'CONFIRMED' : 'PROBABLE') : 'UNKNOWN',
        reason: sides.length >= 2 ? '' : 'LINEUP DATA: UNAVAILABLE — provider returned no lineup',
        updatedAt: nowIso,
        source: 'API-Football',
        home: sides.find((s) => teamsMatch(s.team, home)) || null,
        away: sides.find((s) => teamsMatch(s.team, away)) || null,
      };
    }

    return Response.json({
      status: 'ok',
      fixtureId,
      kickoff,
      league,
      date,
      home: fxRow?.teams?.home?.name || home,
      away: fxRow?.teams?.away?.name || away,
      injuries,
      lineups,
      updatedAt: nowIso,
    });
  } catch (error) {
    return Response.json({ error: error.message, status: 'error' }, { status: 500 });
  }
}