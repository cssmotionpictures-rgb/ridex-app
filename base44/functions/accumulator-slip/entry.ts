import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// MORNING ACCUMULATOR REBUILD — scheduled daily (cron 10:00 UTC = 6:00 AM
// America/Detroit). Clears the stored accumulator and rebuilds a fresh
// 50-game slip from fixtures kicking off within the next 7 days. Every leg
// is qualified against real bookmaker prices through the cached api-football
// proxy (shared keys + server-side caching — no duplicated key handling, no
// duplicated pacing logic). The in-app AutoSlip adopts this slip as
// "today's build" on first open, so a fresh verified 50-game slip is already
// waiting each morning.

const SLIP_KEY = 'accumulator-slip:current';
const HORIZON_DAYS = 7;
const TARGET_MATCHES = 50;
const SCAN_CAP = 60;
const FRESH_BUDGET = 55;
const SAVE_EVERY = 10;
const MIN_PROBABILITY = 0.72;
const MIN_EDGE = 0.015;
const MIN_ODDS = 1.05;
const MAX_ODDS = 2.5;
const LEAGUE_IDS = new Set([39, 140, 78, 135, 61, 2, 3, 203]);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function utcDayKey(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Poisson market model — same math as the in-browser value engine
// ---------------------------------------------------------------------------
function poissonP(lam, k) {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let term = Math.exp(-lam);
  for (let i = 1; i <= k; i++) term *= lam / i;
  return term;
}

function poissonOver(lam, line) {
  const threshold = Math.floor(line);
  let underOrEqual = 0;
  for (let g = 0; g <= threshold; g++) underOrEqual += poissonP(lam, g);
  return clamp(1 - underOrEqual, 0, 1);
}

function oneXTwo(hxg, axg) {
  let h = 0, d = 0, a = 0;
  for (let hg = 0; hg < 9; hg++) {
    for (let ag = 0; ag < 9; ag++) {
      const p = poissonP(hxg, hg) * poissonP(axg, ag);
      if (hg > ag) h += p;
      else if (hg === ag) d += p;
      else a += p;
    }
  }
  return { h, d, a };
}

function slipProbability(key, hxg, axg, apiPct) {
  const total = hxg + axg;
  if (['1', 'X', '2'].includes(key)) {
    const g = oneXTwo(hxg, axg);
    const base = key === '1' ? g.h : key === 'X' ? g.d : g.a;
    const api = apiPct ? (key === '1' ? apiPct.home : key === 'X' ? apiPct.draw : apiPct.away) : null;
    return clamp(api != null ? 0.65 * base + 0.35 * api : base, 0.01, 0.99);
  }
  if (['1X', 'X2', '12'].includes(key)) {
    const parts = key === '1X' ? ['1', 'X'] : key === 'X2' ? ['X', '2'] : ['1', '2'];
    return clamp(parts.reduce((s, k) => s + slipProbability(k, hxg, axg, apiPct), 0), 0.01, 0.99);
  }
  const ou = /^([OU])(\d+\.5)$/.exec(key);
  if (ou) {
    const overP = poissonOver(total, parseFloat(ou[2]));
    return clamp(ou[1] === 'O' ? overP : 1 - overP, 0.01, 0.995);
  }
  if (key === 'BTTS_Y' || key === 'BTTS_N') {
    const pY = (1 - poissonP(hxg, 0)) * (1 - poissonP(axg, 0));
    return clamp(key === 'BTTS_Y' ? pY : 1 - pY, 0.01, 0.995);
  }
  return null;
}

function normalizeBet(betName, selection) {
  const b = String(betName || '').toLowerCase();
  const s = String(selection || '').trim().toLowerCase();
  if (!b || !s) return null;
  if (b.includes('corner')) {
    const m = /(over|under)\s*\+?(\d+\.5)/.exec(s);
    if (m) return { family: `CORN${m[2]}`, key: `C_${m[1] === 'over' ? 'O' : 'U'}${m[2]}`, label: `${m[1] === 'over' ? 'Over' : 'Under'} ${m[2]} Corners` };
    return null;
  }
  if (b.includes('goals over/under') || b.includes('over/under')) {
    const m = /(over|under)\s*\+?(\d+\.5)/.exec(s);
    if (m) return { family: `OU${m[2]}`, key: `${m[1] === 'over' ? 'O' : 'U'}${m[2]}`, label: `${m[1] === 'over' ? 'Over' : 'Under'} ${m[2]} Goals` };
    return null;
  }
  if (b.includes('both teams')) {
    if (s === 'yes') return { family: 'BTTS', key: 'BTTS_Y', label: 'BTTS — Yes' };
    if (s === 'no') return { family: 'BTTS', key: 'BTTS_N', label: 'BTTS — No' };
    return null;
  }
  if (b.includes('double chance')) {
    if (s.includes('home') && s.includes('draw')) return { family: 'DC', key: '1X', label: 'Double Chance 1X' };
    if (s.includes('home') && s.includes('away')) return { family: 'DC', key: '12', label: 'Double Chance 12' };
    if (s.includes('draw') && s.includes('away')) return { family: 'DC', key: 'X2', label: 'Double Chance X2' };
    return null;
  }
  if (b.includes('match winner') || b.includes('home/away')) {
    if (s === 'home') return { family: '1X2', key: '1', label: 'Home Win' };
    if (s === 'away') return { family: '1X2', key: '2', label: 'Away Win' };
    if (s === 'draw' && b.includes('match winner')) return { family: '1X2', key: 'X', label: 'Draw' };
    return null;
  }
  return null;
}

// Best real price per market selection, deduped across bookmakers
function parseOdds(oddsRows) {
  const out = [];
  for (const row of oddsRows || []) {
    const bookmaker = row?.bookmaker?.name || 'Unknown';
    for (const bet of row?.bookmaker?.bets || []) {
      for (const v of bet?.values || []) {
        const odd = parseFloat(v?.odd);
        const n = normalizeBet(bet?.name, v?.value);
        if (!n || !(odd > 1) || odd < MIN_ODDS || odd > MAX_ODDS) continue;
        out.push({ ...n, selection: v.value, bookmaker, odds: odd });
      }
    }
  }
  const best = new Map();
  for (const c of out) {
    const prev = best.get(c.key);
    if (!prev || c.odds > prev.odds) best.set(c.key, c);
  }
  return [...best.values()];
}

// Two best compatible picks per match — contradictory combos are blocked
function compatible(a, b) {
  if (a.family === b.family) return false;
  const lineOf = (c) => {
    const m = /(\d+\.5)/.exec(c.key);
    return m ? parseFloat(m[1]) : null;
  };
  const isOver = (c) => /^(O|C_O)/.test(c.key);
  const isUnder = (c) => /^(U|C_U)/.test(c.key);
  for (const [x, y] of [[a, b], [b, a]]) {
    if (isOver(x) && isUnder(y)) {
      const lx = lineOf(x), ly = lineOf(y);
      if (lx != null && ly != null && ly < lx) return false;
    }
  }
  return true;
}

function bestPair(qualified) {
  const sorted = [...qualified].sort((x, y) => y.score - x.score);
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      if (!compatible(a, b)) continue;
      const joint = a.probability * b.probability * 0.92; // correlation haircut
      const score = joint + (a.edge + b.edge);
      if (score > bestScore) {
        bestScore = score;
        best = { pick1: a, pick2: b, jointProbability: joint, pairOdds: a.odds * b.odds };
      }
    }
  }
  if (best) return best;
  const top = sorted[0];
  return top ? { pick1: top, pick2: null, jointProbability: top.probability, pairOdds: top.odds } : null;
}

// ---------------------------------------------------------------------------
// Slip storage — one dated record in the cached-response store (RLS-bypassed
// via the service role; the payload is bounded well under the record limit)
// ---------------------------------------------------------------------------
async function readStored(base44) {
  const rows = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: SLIP_KEY });
  const rec = rows && rows[0];
  if (!rec) return null;
  try {
    return JSON.parse(rec.payload) || null;
  } catch {
    return null;
  }
}

async function writeStored(base44, slip) {
  const payload = JSON.stringify(slip);
  const rows = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: SLIP_KEY });
  if (rows && rows[0]) {
    await base44.asServiceRole.entities.ApiFootballCache.update(rows[0].id, { payload, endpoint: 'accumulator-slip' });
  } else {
    await base44.asServiceRole.entities.ApiFootballCache.create({
      cache_key: SLIP_KEY,
      endpoint: 'accumulator-slip',
      payload,
    });
  }
}

// "Clears the accumulator" — the previous stored slip is removed before the
// fresh build replaces it (exact-key filter, nothing else is touched).
async function clearStored(base44) {
  await base44.asServiceRole.entities.ApiFootballCache.deleteMany({ cache_key: SLIP_KEY });
}

// ---------------------------------------------------------------------------
// Rebuild — fresh 7-day scan, quota-protected through the cached proxy
// ---------------------------------------------------------------------------
async function proxy(base44, endpoint, params) {
  const res = await base44.functions.invoke('api-football', { endpoint, params });
  const d = res?.data ?? res;
  if (!d || d.error) throw new Error(String((d && d.error) || 'proxy error'));
  return d;
}

function trimEntry(f, pair, capturedAt) {
  return {
    fixtureId: String(f.fixture.id),
    home: (f.teams && f.teams.home && f.teams.home.name) || '',
    away: (f.teams && f.teams.away && f.teams.away.name) || '',
    league: (f.league && f.league.name) || '',
    kickoff: (f.fixture && f.fixture.date) || '',
    addedAt: capturedAt,
    pairOdds: pair.pairOdds,
    jointProbability: pair.jointProbability,
    auto: true,
    picks: [pair.pick1, pair.pick2].filter(Boolean).map((p) => ({
      key: p.key,
      label: p.label,
      selection: p.selection,
      odds: p.odds,
      bookmaker: p.bookmaker,
      probability: p.probability,
      edge: p.edge,
      capturedAt,
    })),
  };
}

async function rebuild(base44, today, scanLimit) {
  await clearStored(base44);
  const now = Date.now();
  const horizon = now + HORIZON_DAYS * 86400000;
  let fresh = 0;
  let serviceDown = false;

  const scan = async (endpoint, params) => {
    if (fresh >= FRESH_BUDGET) throw new Error('budget');
    const d = await proxy(base44, endpoint, params);
    if (d.cached === false) {
      fresh++;
      // free-plan pacing — fresh upstream calls are spaced so the per-minute
      // rate limit is never tripped (each proxy invoke is a fresh instance,
      // so the proxy's own in-memory pacing can't protect this loop)
      await new Promise((r) => setTimeout(r, 6500));
    }
    const body = d.data;
    return body && Array.isArray(body.response) ? body.response : [];
  };

  // Free plan covers only ~yesterday→tomorrow; later dates are plan-blocked
  // (the proxy returns empty for them), so only the accessible days are
  // scanned. The 6 AM daily rebuild keeps the board rolling-day fresh.
  // Day cards are queried PER LEAGUE — a whole-world fixtures?date= card is a
  // ~1MB response that can never cache and burns the quota on every rebuild,
  // while league+season+date responses are small and cache properly.
  const SCAN_DAYS = 2;
  const upcoming = [];
  const seen = new Set();
  for (let day = 0; day < SCAN_DAYS; day++) {
    const dateKey = utcDayKey(now + day * 86400000);
    for (const leagueId of LEAGUE_IDS) {
      let list = [];
      try {
        // NOTE: no season param — free plans only allow league+date queries for
        // the current season (season-filtered queries are plan-blocked)
        list = await scan('fixtures', { league: String(leagueId), date: dateKey });
      } catch (e) {
        serviceDown = true;
        continue; // rate-limit hiccup on one query — the others may still serve
      }
      for (const f of list) {
        const st = String((f && f.fixture && f.fixture.status && f.fixture.status.short) || '').toUpperCase();
        if (st !== 'NS' && st !== 'TBD') continue;
        const t = f && f.fixture && f.fixture.date ? new Date(f.fixture.date).getTime() : NaN;
        if (isNaN(t) || t <= now || t > horizon) continue;
        if (!LEAGUE_IDS.has(Number(f && f.league && f.league.id))) continue;
        const fid = String(f.fixture.id);
        if (seen.has(fid)) continue;
        seen.add(fid);
        upcoming.push(f);
      }
    }
  }
  upcoming.sort((a, b) =>
    String((a.fixture && a.fixture.date) || '').localeCompare(String((b.fixture && b.fixture.date) || ''))
  );
  const fixtures = upcoming.slice(0, scanLimit);

  const entries = [];
  const capturedAt = new Date().toISOString();
  const pct = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? null : n / 100;
  };

  for (let i = 0; i < fixtures.length && entries.length < TARGET_MATCHES; i++) {
    const f = fixtures[i];
    let oddsRows = [], predRows = [];
    try {
      oddsRows = await scan('odds', { fixture: String(f.fixture.id) });
      predRows = await scan('predictions', { fixture: String(f.fixture.id) });
    } catch (e) {
      serviceDown = true;
      break; // keep what's verified so far — never pad with unverified games
    }
    const pred = predRows && predRows[0];
    const hxg = parseFloat(pred && pred.goals && pred.goals.home);
    const axg = parseFloat(pred && pred.goals && pred.goals.away);
    if (!(hxg > 0) || !(axg > 0)) continue;
    const apiPct = pred && pred.percent
      ? { home: pct(pred.percent.home), draw: pct(pred.percent.draw), away: pct(pred.percent.away) }
      : null;

    const qualified = [];
    for (const c of parseOdds(oddsRows)) {
      const prob = slipProbability(c.key, hxg, axg, apiPct);
      if (prob == null) continue;
      const implied = 1 / c.odds;
      const edge = prob - implied;
      if (prob < MIN_PROBABILITY || edge < MIN_EDGE) continue;
      qualified.push({ ...c, probability: prob, edge, score: prob + clamp(edge, -0.2, 0.2) });
    }
    if (!qualified.length) continue;
    const pair = bestPair(qualified);
    if (!pair) continue;

    entries.push(trimEntry(f, pair, capturedAt));
    // progressive save — a long run still leaves a usable partial slip
    if (entries.length % SAVE_EVERY === 0) {
      await writeStored(base44, {
        builtOn: today,
        source: 'live',
        scanned: i + 1,
        entries: entries.slice(),
      }).catch(() => {});
    }
  }

  if (entries.length) {
    await writeStored(base44, {
      builtOn: today,
      source: 'live',
      scanned: fixtures.length,
      entries,
    });
  }
  console.log('accumulator-slip rebuild:', { entries: entries.length, scanned: fixtures.length, serviceDown, fresh });
  return { ok: true, builtOn: today, entries: entries.length, scanned: fixtures.length, serviceDown };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({})) || {};
    const action = String(body.action || '');

    // any app user may read the current slip
    if (action === 'get') {
      const slip = await readStored(base44);
      return Response.json(slip || { entries: [], builtOn: null, source: null });
    }

    // rebuild: allowed for the scheduled automation (no user) or an admin
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    const isAdmin = user && user.role === 'admin';
    const scheduled = !user;
    if (!scheduled && !isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const today = utcDayKey();
    if (action !== 'force') {
      const current = await readStored(base44);
      if (current && current.builtOn === today) {
        // idempotency — retries / multiple triggers never burn the quota twice
        return Response.json({
          ok: true,
          skipped: 'already-built-today',
          builtOn: today,
          entries: (current.entries || []).length,
        });
      }
    }

    const scanLimit = clamp(Number(body.scanLimit) || SCAN_CAP, 1, SCAN_CAP);
    const result = await rebuild(base44, today, scanLimit);
    return Response.json(result);
  } catch (error) {
    console.error('accumulator-slip error:', error && error.message ? error.message : error);
    return Response.json({ error: (error && error.message) || 'unknown' }, { status: 500 });
  }
}