// srModeling.ts — PHASE 3: the modeling engine on top of the normalized
// Sportradar database. Team attack/defense rates with sample-size shrinkage,
// a Poisson score matrix and honest market probabilities. A fixture with
// insufficient stored history is a MANDATORY PASS — never a forced pick.
// NO odds: the provider's odds/probabilities feeds are NOT SUBSCRIBED, and no
// price is ever invented or presented as a bookmaker quote. The model fair
// price is explicitly labeled a model estimate.

import { normalizeScheduleEntry } from './srIngestion.ts';

const MAX_GOALS = 8;
const MIN_MATCHES = 6; // per team, per season — below this the engine PASSES
const SHRINK_K = 4;    // James-Stein-style pull toward the league mean

const FACTORIALS = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

export function poissonPmf(lambda, k) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / FACTORIALS[k];
}

function clampNum(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

// Ratings from REAL stored results only. Rates are shrunk toward the league
// mean by sample size (w = played / (played + K)) — a team with 2 stored
// matches is mostly league-average, never an extrapolated extreme.
export function buildRatings(rows) {
  let count = 0;
  let homeGoals = 0;
  let awayGoals = 0;
  let coverageSum = 0;
  const teams = new Map();
  const team = (id, name) => {
    if (!teams.has(id)) teams.set(id, { id, name: name || '', played: 0, gf: 0, ga: 0 });
    return teams.get(id);
  };
  for (const m of rows || []) {
    if (!m.home_id || !m.away_id || m.home_score == null || m.away_score == null) continue;
    count++;
    homeGoals += m.home_score;
    awayGoals += m.away_score;
    coverageSum += m.coverage_score || 0;
    const h = team(m.home_id, m.home_name);
    const a = team(m.away_id, m.away_name);
    h.played++; a.played++;
    h.gf += m.home_score; h.ga += m.away_score;
    a.gf += m.away_score; a.ga += m.home_score;
  }
  if (count === 0) return null;
  const leagueHomeRate = homeGoals / count;
  const leagueAwayRate = awayGoals / count;
  const teamAvgRate = (leagueHomeRate + leagueAwayRate) / 2;
  for (const t of teams.values()) {
    const rawAtt = (t.gf / t.played) / teamAvgRate;
    const rawDef = (t.ga / t.played) / teamAvgRate;
    const w = t.played / (t.played + SHRINK_K);
    t.att = 1 + w * (rawAtt - 1);
    t.def = 1 + w * (rawDef - 1);
    t.weight = w;
  }
  return { count, leagueHomeRate, leagueAwayRate, teams, avgCoverage: coverageSum / count };
}

// One fixture prediction — PREDICT only when both teams clear the data floor.
// The quality score is a DATA-QUALITY metric (sample size + provider
// coverage), never a win-likelihood or safety measure.
export function predictFromRatings(ratings, fixture) {
  const h = ratings.teams.get(fixture.home_id);
  const a = ratings.teams.get(fixture.away_id);
  const minPlayed = h && a ? Math.min(h.played, a.played) : 0;

  if (!h || !a || minPlayed < MIN_MATCHES) {
    const reason = !h || !a
      ? 'no stored history for one or both teams in this season'
      : `only ${minPlayed} stored match(es) — below the ${MIN_MATCHES}-match data floor`;
    return {
      decision: 'PASS', reason, data_quality: 'LOW',
      quality_score: Math.min(30, minPlayed * 5),
    };
  }

  const lamH = clampNum(ratings.leagueHomeRate * h.att * a.def, 0.15, 4.5);
  const lamA = clampNum(ratings.leagueAwayRate * a.att * h.def, 0.15, 4.5);
  let pHome = 0, pDraw = 0, pAway = 0, pOver = 0, pUnder = 0, pBttsY = 0, pBttsN = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    const pi = poissonPmf(lamH, i);
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = pi * poissonPmf(lamA, j);
      if (i > j) pHome += p; else if (i === j) pDraw += p; else pAway += p;
      if (i + j > 2.5) pOver += p; else pUnder += p;
      if (i > 0 && j > 0) pBttsY += p; else pBttsN += p;
    }
  }
  const markets = [
    { key: '1', label: `${fixture.home_name} win`, prob: pHome },
    { key: 'X', label: 'Draw', prob: pDraw },
    { key: '2', label: `${fixture.away_name} win`, prob: pAway },
  ].sort((x, y) => y.prob - x.prob);

  return {
    decision: 'PREDICT', reason: null,
    lambda_home: Number(lamH.toFixed(2)), lambda_away: Number(lamA.toFixed(2)),
    prob_home: pHome, prob_draw: pDraw, prob_away: pAway,
    prob_over25: pOver, prob_under25: pUnder, prob_btts_yes: pBttsY, prob_btts_no: pBttsN,
    pick_market: markets[0].key, pick_label: markets[0].label, pick_probability: markets[0].prob,
    model_fair_price: Number((1 / markets[0].prob).toFixed(2)),
    uncertainty: 1 - Math.min(h.weight, a.weight),
    data_quality: minPlayed >= 12 ? 'HIGH' : 'MEDIUM',
    quality_score: Math.min(100, Math.round((minPlayed / 16) * 70 + (ratings.avgCoverage || 0) * 0.3)),
    sample: { home_played: h.played, away_played: a.played },
  };
}

// Predict a full day of scheduled fixtures from the stored database — ONE
// provider request (the day schedule), everything else computed locally.
export async function predictFixtures(base44, client, date) {
  const sched = await client.get(`/schedules/${date}/schedules`, { ttlMs: 10 * 60 * 1000 });
  if (!sched || !Array.isArray(sched.schedules)) {
    return { ok: false, error: String(client.metrics.lastError || 'schedule unavailable for ' + date) };
  }
  const fixtures = sched.schedules
    .map(normalizeScheduleEntry)
    .filter((m) => m.event_id && (!m.match_status || m.match_status === 'not_started'))
    .slice(0, 40);

  const rows = await base44.asServiceRole.entities.SrMatchResult.filter({ match_status: 'ended' }, '-kickoff', 500);
  const bySeason = new Map();
  for (const r of rows || []) {
    if (!r.season_id) continue;
    if (!bySeason.has(r.season_id)) bySeason.set(r.season_id, []);
    bySeason.get(r.season_id).push(r);
  }
  const ratingsBySeason = new Map();
  for (const [sid, list] of bySeason) ratingsBySeason.set(sid, buildRatings(list));

  const out = [];
  let predicted = 0;
  let passed = 0;
  for (const f of fixtures) {
    const ratings = f.season_id ? ratingsBySeason.get(f.season_id) : null;
    const prediction = ratings
      ? predictFromRatings(ratings, f)
      : { decision: 'PASS', reason: 'no stored history for this competition season yet', data_quality: 'LOW', quality_score: 0 };
    if (prediction.decision === 'PREDICT') predicted++; else passed++;
    out.push({
      event_id: f.event_id, kickoff: f.kickoff,
      competition: f.competition_name, season: f.season_name,
      home_id: f.home_id, home_name: f.home_name,
      away_id: f.away_id, away_name: f.away_name,
      coverage_level: f.coverage_level,
      ...prediction,
    });
  }
  return {
    ok: true, date, fixtures: out, predicted, passed,
    model: {
      type: 'shrunk-poisson v1', min_matches: MIN_MATCHES,
      history_rows: (rows || []).length, seasons_with_history: bySeason.size,
    },
    note: 'Probabilities are MODEL ESTIMATES computed from stored Sportradar results only — not bookmaker odds, not guarantees.',
    generated_at: new Date().toISOString(),
  };
}