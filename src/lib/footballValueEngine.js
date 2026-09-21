// REAL FOOTBALL VALUE ENGINE — Ride X sports tab.
// Client-side port of the value-engine spec, running entirely through the
// cached api-football proxy (server-side key, zero workspace credits):
//   - last 5 head-to-head meetings
//   - last 8 matches of form per side (goals for/against, over rates, W/D/L)
//   - injuries / sidelined players for the upcoming fixture
//   - the official API-Football prediction (blended into the 1X2 model)
//   - REAL bookmaker odds — no pick is ever published without a real price
// Model probabilities are Poisson + empirical estimates, NEVER guarantees.
// Weak or poorly supported selections are rejected. Odds snapshots for every
// accumulated pick are saved locally (localStorage).

import { apiFootball } from "@/lib/apiFootball";
import { cornersFromFeed } from "@/lib/cornerMarkets";
import { getCornerFeedTeams, lookupCornerStats } from "@/lib/cornerFeed";

export const FORM_MATCHES = 8;
export const H2H_MATCHES = 5;
export const MIN_ODDS = 1.05;
export const MAX_ODDS = 2.5;
export const MIN_MODEL_PROBABILITY = 0.72; // estimate bar — NOT a guarantee
export const MIN_EDGE = 0.015;
export const TARGET_MATCHES = 50;           // analyzed matches in the 1M accumulator
export const TARGET_ODDS = 1000000;

const DONE_STATUSES = ["FT", "AET", "PEN"];                       // a match that has finished
const LIVE_STATUSES = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"]; // in play right now

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = (arr) => {
  const v = (arr || []).filter((x) => x != null && !isNaN(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
};

// Free-plan pacing: space fresh upstream calls ~6.5s apart so the per-minute
// request cap is never tripped. Cached responses return instantly.
const paceState = { lastFreshAt: 0 };
async function rows(endpoint, params) {
  const wait = paceState.lastFreshAt ? 6500 - (Date.now() - paceState.lastFreshAt) : 0;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  let payload;
  try {
    payload = await apiFootball(endpoint, params);
  } catch (e) {
    const err = new Error("data service unavailable");
    err.serviceDown = true; // quota exhausted / rate limited — surfaced honestly upstream
    throw err;
  }
  if (payload && payload.cached === false) paceState.lastFreshAt = Date.now();
  const body = payload?.data;
  if (!body || !Array.isArray(body.response)) throw new Error("no data");
  return body.response;
}

// ----------------------------------------------------------------------------
// Team search
// ----------------------------------------------------------------------------
export async function searchTeam(name) {
  if (!name || !name.trim()) return null;
  const list = await rows("teams", { search: name.trim() });
  if (!list.length) return null;
  const q = name.trim().toLowerCase();
  const exact = list.find((r) => (r?.team?.name || "").toLowerCase() === q);
  const t = (exact || list[0]).team;
  return { id: t.id, name: t.name, logo: t.logo || "", country: t.country || "" };
}

// ----------------------------------------------------------------------------
// Form model — recency-weighted results for one team
// ----------------------------------------------------------------------------
function resultForTeam(f, teamId) {
  const s = (f?.fixture?.status?.short || "").toUpperCase();
  if (!["FT", "AET", "PEN"].includes(s)) return null;
  const hg = f?.goals?.home;
  const ag = f?.goals?.away;
  if (hg == null || ag == null) return null;
  const isHome = f?.teams?.home?.id === teamId;
  const gf = isHome ? hg : ag;
  const ga = isHome ? ag : hg;
  return { gf, ga, total: gf + ga, result: gf > ga ? "W" : gf === ga ? "D" : "L" };
}

export function calcForm(teamId, fixtures) {
  const rs = (fixtures || []).map((f) => resultForTeam(f, teamId)).filter(Boolean).slice(0, FORM_MATCHES);
  if (!rs.length) {
    return { matches: 0, gfPg: 0, gaPg: 0, over15: 0, over25: 0, wins: 0, draws: 0, losses: 0, string: "" };
  }
  return {
    matches: rs.length,
    gfPg: mean(rs.map((r) => r.gf)),
    gaPg: mean(rs.map((r) => r.ga)),
    over15: rs.filter((r) => r.total >= 2).length / rs.length,
    over25: rs.filter((r) => r.total >= 3).length / rs.length,
    wins: rs.filter((r) => r.result === "W").length,
    draws: rs.filter((r) => r.result === "D").length,
    losses: rs.filter((r) => r.result === "L").length,
    string: rs.map((r) => r.result).join(""),
  };
}

// ----------------------------------------------------------------------------
// H2H model — last 5 meetings
// ----------------------------------------------------------------------------
export function calcH2h(h2hFixtures, teamAId, teamBId) {
  const list = [];
  for (const f of (h2hFixtures || []).slice(0, H2H_MATCHES)) { // newest-first sample of the last 5
    const hg = f?.goals?.home;
    const ag = f?.goals?.away;
    list.push({
      id: f?.fixture?.id,
      date: f?.fixture?.date ? f.fixture.date.slice(0, 10) : "",
      league: f?.league?.name,
      season: f?.league?.season,
      home: f?.teams?.home?.name,
      away: f?.teams?.away?.name,
      homeId: f?.teams?.home?.id,
      hg,
      ag,
      played: hg != null && ag != null,
    });
  }
  const playedList = list.filter((m) => m.played);
  const totals = playedList.map((m) => m.hg + m.ag);
  return {
    list,
    matches: playedList.length,
    avgTotal: mean(totals),
    over15: playedList.length ? playedList.filter((m) => m.hg + m.ag >= 2).length / playedList.length : 0,
    over25: playedList.length ? playedList.filter((m) => m.hg + m.ag >= 3).length / playedList.length : 0,
  };
}

// H2H W-D-L record, attributed by the real team ids in each meeting
function h2hRecord(h2h, teamAId, teamBId) {
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  for (const m of h2h.list.filter((x) => x.played)) {
    if (m.hg === m.ag) {
      draws++;
    } else {
      const homeWon = m.hg > m.ag;
      const homeIsA = m.homeId === teamAId;
      if (homeWon === homeIsA) winsA++;
      else winsB++;
    }
  }
  return { winsA, winsB, draws };
}

// ----------------------------------------------------------------------------
// Goal expectancy (Poisson inputs)
// ----------------------------------------------------------------------------
function expectedGoals(formA, formB, h2h) {
  const aAtk = formA.gfPg;
  const aDef = formA.gaPg;
  const bAtk = formB.gfPg;
  const bDef = formB.gaPg;
  const avgAtk = mean([aAtk, bAtk]);
  let hxg = 0.45 * aAtk + 0.30 * bDef + 0.25 * avgAtk;
  let axg = 0.45 * bAtk + 0.30 * aDef + 0.25 * avgAtk;
  if (h2h.matches >= 3) {
    const cur = hxg + axg;
    const blended = 0.85 * cur + 0.15 * h2h.avgTotal; // H2H gets a small weight — it can go stale
    const scale = blended / Math.max(cur, 0.01);
    hxg *= scale;
    axg *= scale;
  }
  return [clamp(hxg, 0.05, 4.5), clamp(axg, 0.05, 4.5)];
}

function poissonP(lam, k) {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let term = Math.exp(-lam);
  for (let i = 1; i <= k; i++) term *= lam / i;
  return term;
}

function poissonOver(lam, line) {
  const threshold = Math.floor(line); // over 2.5 -> at least 3
  let underOrEqual = 0;
  for (let g = 0; g <= threshold; g++) underOrEqual += poissonP(lam, g);
  return clamp(1 - underOrEqual, 0, 1);
}

function oneXTwo(hxg, axg) {
  let h = 0;
  let d = 0;
  let a = 0;
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

// Corner lines price ONLY from the verified corner feed (see modelProbability).
function pAtLeast(lam, min) {
  let cum = 0;
  let term = Math.exp(-lam);
  for (let k = 0; k < min; k++) {
    if (k > 0) term *= lam / k;
    cum += term;
  }
  return clamp(1 - cum, 0, 1);
}

// ----------------------------------------------------------------------------
// Odds normalization — real bookmaker prices only
// ----------------------------------------------------------------------------
export function normalizeBet(betName, selection) {
  const b = (betName || "").toLowerCase();
  const s = (selection || "").trim().toLowerCase();
  if (!b || !s) return null;

  if (b.includes("corner")) {
    const m = /(over|under)\s*\+?(\d+\.5)/.exec(s);
    if (m) return { family: `CORN${m[2]}`, key: `C_${m[1] === "over" ? "O" : "U"}${m[2]}`, label: `${m[1] === "over" ? "Over" : "Under"} ${m[2]} Corners` };
    return null;
  }
  if (b.includes("goals over/under") || b.includes("over/under")) {
    const m = /(over|under)\s*\+?(\d+\.5)/.exec(s);
    if (m) return { family: `OU${m[2]}`, key: `${m[1] === "over" ? "O" : "U"}${m[2]}`, label: `${m[1] === "over" ? "Over" : "Under"} ${m[2]} Goals` };
    return null;
  }
  if (b.includes("both teams")) {
    if (s === "yes") return { family: "BTTS", key: "BTTS_Y", label: "BTTS — Yes" };
    if (s === "no") return { family: "BTTS", key: "BTTS_N", label: "BTTS — No" };
    return null;
  }
  if (b.includes("double chance")) {
    if (s.includes("home") && s.includes("draw")) return { family: "DC", key: "1X", label: "Double Chance 1X" };
    if (s.includes("home") && s.includes("away")) return { family: "DC", key: "12", label: "Double Chance 12" };
    if (s.includes("draw") && s.includes("away")) return { family: "DC", key: "X2", label: "Double Chance X2" };
    return null;
  }
  if (b.includes("match winner") || b.includes("home/away")) {
    // Home/Away two-way prices map to the same straight home/away win selection
    if (s === "home") return { family: "1X2", key: "1", label: "Home Win" };
    if (s === "away") return { family: "1X2", key: "2", label: "Away Win" };
    if (s === "draw" && b.includes("match winner")) return { family: "1X2", key: "X", label: "Draw" };
    return null;
  }
  return null;
}

export function parseOdds(oddsRows) {
  const out = [];
  for (const row of oddsRows || []) {
    const bookmaker = row?.bookmaker?.name || "Unknown";
    for (const bet of row?.bookmaker?.bets || []) {
      for (const v of bet?.values || []) {
        const odd = parseFloat(v?.odd);
        const n = normalizeBet(bet?.name, v?.value);
        if (!n || !(odd > 1)) continue;
        if (odd < MIN_ODDS || odd > MAX_ODDS) continue; // no absurdly short/high-risk prices
        out.push({ ...n, selection: v.value, bookmaker, odds: odd });
      }
    }
  }
  // best available real price per market selection (dedupe across bookmakers)
  const best = new Map();
  for (const c of out) {
    const prev = best.get(c.key);
    if (!prev || c.odds > prev.odds) best.set(c.key, c);
  }
  return [...best.values()];
}

// ----------------------------------------------------------------------------
// Market probability model (estimates, never guarantees)
// ----------------------------------------------------------------------------
function modelProbability(key, ctx) {
  const { hxg, axg, formA, formB, h2h, apiPct } = ctx;
  const total = hxg + axg;

  if (["1", "X", "2"].includes(key)) {
    const g = oneXTwo(hxg, axg);
    const base = key === "1" ? g.h : key === "X" ? g.d : g.a;
    const api = apiPct ? (key === "1" ? apiPct.home : key === "X" ? apiPct.draw : apiPct.away) : null;
    const p = api != null ? 0.65 * base + 0.35 * api : base; // blend with the API's own prediction
    return clamp(p, 0.01, 0.99);
  }
  if (["1X", "X2", "12"].includes(key)) {
    const parts = key === "1X" ? ["1", "X"] : key === "X2" ? ["X", "2"] : ["1", "2"];
    return clamp(parts.reduce((s, k) => s + modelProbability(k, ctx), 0), 0.01, 0.99);
  }

  const ou = /^([OU])(\d+\.5)$/.exec(key);
  if (ou) {
    const line = parseFloat(ou[2]);
    const overP = poissonOver(total, line);
    if (ou[1] === "O") {
      const empirical =
        line === 1.5
          ? mean([formA.over15, formB.over15, h2h.matches ? h2h.over15 : formA.over15])
          : line === 2.5
          ? mean([formA.over25, formB.over25, h2h.matches ? h2h.over25 : formB.over25])
          : null;
      return clamp(empirical != null ? 0.7 * overP + 0.3 * empirical : overP, 0.01, 0.995);
    }
    return clamp(1 - overP, 0.005, 0.99);
  }

  if (key === "BTTS_Y" || key === "BTTS_N") {
    const pY = (1 - poissonP(hxg, 0)) * (1 - poissonP(axg, 0));
    return clamp(key === "BTTS_Y" ? pY : 1 - pY, 0.01, 0.995);
  }

  const co = /^C_([OU])(\d+\.5)$/.exec(key);
  if (co) {
    // Real corner-kick statistics only — no tracked feed history for both
    // sides means the market is unsupported, never guessed.
    if (ctx.cornerLam == null) return null;
    const need = Math.ceil(parseFloat(co[2]));
    const over = pAtLeast(ctx.cornerLam, need);
    return clamp(co[1] === "O" ? over : 1 - over, 0.005, 0.995);
  }
  return null; // unsupported market — rejected honestly
}

// ----------------------------------------------------------------------------
// Compatibility — block contradictory same-match combinations
// ----------------------------------------------------------------------------
const lineOf = (c) => {
  const m = /(\d+\.5)/.exec(c.key);
  return m ? parseFloat(m[1]) : null;
};
const isOver = (c) => /^(O|C_O)/.test(c.key);
const isUnder = (c) => /^(U|C_U)/.test(c.key);

function compatible(a, b) {
  if (a.family === b.family) return false; // same market / duplicate selections
  for (const [x, y] of [[a, b], [b, a]]) {
    // over a higher line + under a lower line can never both land
    if (isOver(x) && isUnder(y)) {
      const lx = lineOf(x);
      const ly = lineOf(y);
      if (lx != null && ly != null && ly < lx) return false;
    }
  }
  return true;
}

// ----------------------------------------------------------------------------
// Injury penalty — deliberately small & conservative
// ----------------------------------------------------------------------------
function injuryPenalty(injuries) {
  if (!injuries || !injuries.length) return 0;
  let serious = 0;
  for (const i of injuries) {
    const reason = String(i?.reason || "").toLowerCase();
    if (["injury", "suspended", "illness"].some((w) => reason.includes(w))) serious++;
  }
  return clamp(serious * 0.01 + Math.max(0, injuries.length - 3) * 0.005, 0, 0.12);
}

// ----------------------------------------------------------------------------
// Two best compatible picks per match
// ----------------------------------------------------------------------------
function scorePick(probability, odds, edge, dataQuality) {
  return 0.5 * probability + 0.25 * clamp(edge, -0.2, 0.2) + 0.15 * dataQuality + 0.1 * Math.log(Math.max(odds, 1.01));
}

export function generateTwoPicks(qualified, dataQuality) {
  const sorted = [...qualified].sort((x, y) => y.score - x.score);
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (!compatible(a, b)) continue;
      const joint = a.probability * b.probability * 0.92; // correlation haircut — never blind multiplication
      const pairOdds = a.odds * b.odds;
      const score =
        0.45 * joint + 0.25 * (a.edge + b.edge) + 0.2 * dataQuality + 0.1 * Math.log(Math.max(pairOdds, 1.01));
      if (score > bestScore) {
        bestScore = score;
        best = { pick1: a, pick2: b, jointProbability: joint, pairOdds };
      }
    }
  }
  if (best) return best;
  if (sorted.length) {
    return { pick1: sorted[0], pick2: null, jointProbability: sorted[0].probability, pairOdds: sorted[0].odds };
  }
  return null;
}

// Played fixtures from a season list, newest first (form sample source)
function sortPlayed(fixtures) {
  return (fixtures || [])
    .filter(
      (f) =>
        f?.fixture?.date &&
        ["FT", "AET", "PEN"].includes((f.fixture.status?.short || "").toUpperCase()) &&
        f?.goals?.home != null &&
        f?.goals?.away != null
    )
    .sort((x, y) => (y.fixture.date || "").localeCompare(x.fixture.date || ""));
}

// ----------------------------------------------------------------------------
// Full match analysis
// ----------------------------------------------------------------------------
export async function analyzeMatch(nameA, nameB) {
  const teamA = await searchTeam(nameA);
  const teamB = await searchTeam(nameB);
  if (!teamA || !teamB) return { notFound: { a: !teamA, b: !teamB } };

  // ONE head-to-head call returns the full meeting list: the upcoming fixture,
  // a match that is LIVE right now, and the played history. The free plan
  // blocks the next/last params, so this is the quota-friendly route.
  let dataUnavailable = false; // honest flag — a fetch failed (quota / rate limit)
  let h2hRaw = [];
  try {
    h2hRaw = await rows("fixtures/headtohead", { h2h: `${teamA.id}-${teamB.id}` });
  } catch {
    dataUnavailable = true;
  }
  const sortedH2h = [...(h2hRaw || [])].sort((x, y) => (x?.fixture?.date || "").localeCompare(y?.fixture?.date || ""));
  const statusOf = (f) => (f?.fixture?.status?.short || "").toUpperCase();
  const fixture =
    sortedH2h.find((f) => ["NS", "TBD"].includes(statusOf(f))) ||
    sortedH2h.find((f) => LIVE_STATUSES.includes(statusOf(f))) || // in play right now
    null;
  const isLive = fixture ? LIVE_STATUSES.includes(statusOf(fixture)) : false;
  const playedH2h = sortedH2h
    .filter((f) => DONE_STATUSES.includes(statusOf(f)) && f?.goals?.home != null && f?.goals?.away != null)
    .reverse(); // newest first — a live match never pollutes the played history
  const lastMeet = playedH2h[0] || null;
  const season =
    fixture?.league?.season ||
    lastMeet?.league?.season ||
    (new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1);

  // Sequential + paced — fresh calls are spaced for the free plan; cached hits
  // are instant.
  let lastA = [];
  let lastB = [];
  try {
    lastA = sortPlayed(await rows("fixtures", { team: teamA.id, season }));
  } catch {
    dataUnavailable = true;
  }
  try {
    lastB = sortPlayed(await rows("fixtures", { team: teamB.id, season }));
  } catch {
    dataUnavailable = true;
  }
  const mapStats = (raw) =>
    (raw || []).map((r) => {
      const map = {};
      for (const s of r?.statistics || []) map[s.type] = s.value;
      return { team: r?.team?.name || "", map };
    });
  const injuriesRaw = fixture ? await rows("injuries", { fixture: fixture.fixture.id }).catch(() => []) : [];
  const predictionRaw = fixture ? await rows("predictions", { fixture: fixture.fixture.id }).catch(() => []) : [];
  // pre-match prices only — once a match is in play the value scan stays closed
  const oddsRaw = fixture && !isLive ? await rows("odds", { fixture: fixture.fixture.id }).catch(() => []) : [];
  const statsRaw = lastMeet ? await rows("fixtures/statistics", { fixture: lastMeet.fixture.id }).catch(() => []) : [];
  const liveStatsRaw = isLive ? await rows("fixtures/statistics", { fixture: fixture.fixture.id }).catch(() => []) : [];

  const formA = calcForm(teamA.id, lastA);
  const formB = calcForm(teamB.id, lastB);
  const h2h = calcH2h(playedH2h, teamA.id, teamB.id);

  const injuries = (injuriesRaw || []).map((r) => ({
    player: r?.player?.name || "",
    reason: r?.player?.reason || r?.player?.type || "",
    team: r?.team?.name || "",
  }));

  const pred = predictionRaw?.[0] || null;
  const pct = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? null : n / 100;
  };
  const apiPct = pred?.percent
    ? { home: pct(pred.percent.home), draw: pct(pred.percent.draw), away: pct(pred.percent.away) }
    : null;

  const lastMeetStats = mapStats(statsRaw);

  const [hxg, axg] = expectedGoals(formA, formB, h2h);
  // Verified corner feed — real corner-kick statistics for both sides. No
  // tracked history → no corner line and no corner candidates (never guessed).
  const cornerTeams = await getCornerFeedTeams();
  const csA = lookupCornerStats(cornerTeams, teamA?.name);
  const csB = lookupCornerStats(cornerTeams, teamB?.name);
  const corners = cornersFromFeed(csA, csB);
  const cornerLam = csA && csB
    ? (csA.avgTotal * csA.n + csB.avgTotal * csB.n) / (csA.n + csB.n)
    : null;

  // data quality per spec: enough form on both sides, H2H depth, real prices
  let dataQuality = 0;
  if (formA.matches >= 5) dataQuality += 0.25;
  if (formB.matches >= 5) dataQuality += 0.25;
  if (h2h.matches >= 3) dataQuality += 0.15;
  if ((oddsRaw || []).length) dataQuality += 0.25;
  dataQuality = clamp(dataQuality, 0, 1);

  const penalty = injuryPenalty(injuries);
  const ctx = { hxg, axg, formA, formB, h2h, apiPct, cornerLam };

  const candidates = [];
  for (const c of parseOdds(oddsRaw)) {
    const prob = modelProbability(c.key, ctx);
    if (prob == null || prob <= 0) {
      const noFeed = /^C_/.test(c.key) && ctx.cornerLam == null;
      candidates.push({ ...c, modelProb: null, implied: 1 / c.odds, edge: null, qualified: false, reason: noFeed ? "No verified corner feed" : "Unsupported market" });
      continue;
    }
    const adjusted = clamp(prob - penalty, 0.01, 0.995);
    const implied = 1 / c.odds;
    const edge = adjusted - implied;
    let qualified = true;
    let reason = "";
    if (adjusted < MIN_MODEL_PROBABILITY) {
      qualified = false;
      reason = `Model ${Math.round(adjusted * 100)}% — below the ${Math.round(MIN_MODEL_PROBABILITY * 100)}% bar`;
    } else if (edge < MIN_EDGE) {
      qualified = false;
      reason = "No edge vs the bookmaker price";
    }
    candidates.push({
      ...c,
      modelProb: adjusted,
      implied,
      edge,
      qualified,
      reason,
      score: qualified ? scorePick(adjusted, c.odds, edge, dataQuality) : null,
    });
  }
  candidates.sort((x, y) => (y.qualified - x.qualified) || (y.score || 0) - (x.score || 0));

  const picks = !isLive && candidates.some((c) => c.qualified)
    ? generateTwoPicks(candidates.filter((c) => c.qualified), dataQuality)
    : null; // in play → picks stay locked; pre-match prices are no longer honest

  const record = h2hRecord(h2h, teamA.id, teamB.id);

  return {
    teamA,
    teamB,
    fixture,
    isLive,
    live: isLive
      ? {
          status: statusOf(fixture),
          elapsed: fixture?.fixture?.status?.elapsed,
          hg: fixture?.goals?.home,
          ag: fixture?.goals?.away,
          stats: mapStats(liveStatsRaw),
        }
      : null,
    dataUnavailable,
    noFixture: !fixture,
    formA,
    formB,
    h2h: { ...h2h, ...record },
    injuries,
    injuryPenalty: penalty,
    apiPrediction: pred ? { ...apiPct, advice: pred.advice || "" } : null,
    lastMeet: lastMeet
      ? {
          date: lastMeet.fixture?.date?.slice(0, 10) || "",
          home: lastMeet.teams?.home?.name,
          away: lastMeet.teams?.away?.name,
          hg: lastMeet.goals?.home,
          ag: lastMeet.goals?.away,
          stats: lastMeetStats,
        }
      : null,
    xg: { home: hxg, away: axg },
    corners,
    candidates,
    picks,
    noOdds: fixture && !(oddsRaw || []).length,
    dataQuality,
  };
}

// ----------------------------------------------------------------------------
// 50-MATCH ACCUMULATOR — odds snapshots saved locally
// ----------------------------------------------------------------------------
const ACC_KEY = "ridex-value-engine-acc-v1";

export function getAccumulator() {
  try {
    return JSON.parse(localStorage.getItem(ACC_KEY)) || [];
  } catch {
    return [];
  }
}
function saveAcc(list) {
  try {
    localStorage.setItem(ACC_KEY, JSON.stringify((list || []).slice(0, TARGET_MATCHES)));
  } catch {}
}

export function addMatchToAccumulator(analysis) {
  const picks = analysis?.picks;
  if (!picks?.pick1) return getAccumulator();
  const fixtureId = String(analysis.fixture?.fixture?.id || `${analysis.teamA.name}-${analysis.teamB.name}`);
  const list = getAccumulator().filter((e) => e.fixtureId !== fixtureId);
  const capturedAt = new Date().toISOString();
  list.push({
    fixtureId,
    home: analysis.fixture?.teams?.home?.name || analysis.teamA.name,
    away: analysis.fixture?.teams?.away?.name || analysis.teamB.name,
    league: analysis.fixture?.league?.name || "",
    kickoff: analysis.fixture?.fixture?.date || "",
    addedAt: capturedAt,
    pairOdds: picks.pairOdds,
    jointProbability: picks.jointProbability,
    picks: [picks.pick1, picks.pick2].filter(Boolean).map((p) => ({
      key: p.key,
      label: p.label,
      selection: p.selection,
      odds: p.odds,
      bookmaker: p.bookmaker,
      probability: p.probability != null ? p.probability : p.modelProb,
      edge: p.edge,
      capturedAt,
    })),
  });
  saveAcc(list);
  return getAccumulator();
}

export function removeMatch(fixtureId) {
  saveAcc(getAccumulator().filter((e) => e.fixtureId !== String(fixtureId)));
  return getAccumulator();
}

export function clearAccumulator() {
  saveAcc([]);
  return [];
}

export function accumulatorStats(list = getAccumulator()) {
  const combined = (list || []).reduce((p, e) => p * (e.pairOdds || 1), 1);
  return {
    matches: (list || []).length,
    legs: (list || []).reduce((s, e) => s + (e.picks?.length || 0), 0),
    combinedOdds: combined,
    targetOdds: TARGET_ODDS,
    // log-scale progress toward 1M — honest about how far the ticket has to go
    progress: clamp(Math.log10(Math.max(combined, 1)) / Math.log10(TARGET_ODDS), 0, 1),
    avgPairOdds: (list || []).length ? Math.pow(combined, 1 / (list || []).length) : 0,
  };
}

// ----------------------------------------------------------------------------
// VERIFIED AUTO SLIP — up to 50 games, all kicking off within the next 7 days,
// rebuilt automatically every morning. Each leg is qualified by the model
// against REAL bookmaker prices; fixtures without a verifiable prediction or
// without odds are skipped, never faked.
// ----------------------------------------------------------------------------
const AUTO_KEY = "ridex-value-engine-autoslip-v1";
const AUTO_HORIZON_DAYS = 7;  // never more than one week of games on the slip
const AUTO_FRESH_BUDGET = 60; // fresh upstream calls per build — protects the free daily quota
const AUTO_SCAN_CAP = 90;    // fixtures examined per build
const SLIP_LEAGUE_IDS = new Set([39, 140, 78, 135, 61, 2, 3, 203]); // EPL, La Liga, Bundesliga, Serie A, Ligue 1, UCL, UEL, Süper Lig

function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The stored slip is valid ONLY today: on a new morning (or once every kickoff
// has passed) it reads as stale and the UI rebuilds it automatically.
export function getAutoSlip() {
  try {
    const s = JSON.parse(localStorage.getItem(AUTO_KEY));
    if (!s) return null;
    const now = Date.now();
    const entries = (s.entries || []).filter((e) => {
      const t = new Date(e.kickoff).getTime();
      return !isNaN(t) && t > now; // started / finished games drop automatically
    });
    // A slip from a previous day stays VISIBLE (marked stale) until a fresh
    // verified build replaces it — the accumulator is never hidden just
    // because the rebuild couldn't run (quota / rate limit).
    return { ...s, entries, stale: s.builtOn !== localDayKey() };
  } catch {
    return null;
  }
}

export function saveAutoSlip(entries, extra = {}) {
  try {
    localStorage.setItem(
      AUTO_KEY,
      JSON.stringify({ builtOn: localDayKey(), ...extra, entries: (entries || []).slice(0, TARGET_MATCHES) })
    );
  } catch {}
}

// Probability for the bulk scan, from the official API-Football prediction's
// expected goals + outcome percentages (Poisson, same blend as the H2H model).
// Corner markets need per-team form, which the bulk scan doesn't fetch — those
// keys return null and are rejected honestly rather than guessed.
function slipProbability(key, ctx) {
  const { hxg, axg, apiPct } = ctx;
  const total = hxg + axg;
  if (["1", "X", "2"].includes(key)) {
    const g = oneXTwo(hxg, axg);
    const base = key === "1" ? g.h : key === "X" ? g.d : g.a;
    const api = apiPct ? (key === "1" ? apiPct.home : key === "X" ? apiPct.draw : apiPct.away) : null;
    return clamp(api != null ? 0.65 * base + 0.35 * api : base, 0.01, 0.99);
  }
  if (["1X", "X2", "12"].includes(key)) {
    const parts = key === "1X" ? ["1", "X"] : key === "X2" ? ["X", "2"] : ["1", "2"];
    return clamp(parts.reduce((s, k) => s + slipProbability(k, ctx), 0), 0.01, 0.99);
  }
  const ou = /^([OU])(\d+\.5)$/.exec(key);
  if (ou) {
    const overP = poissonOver(total, parseFloat(ou[2]));
    return clamp(ou[1] === "O" ? overP : 1 - overP, 0.01, 0.995);
  }
  if (key === "BTTS_Y" || key === "BTTS_N") {
    const pY = (1 - poissonP(hxg, 0)) * (1 - poissonP(axg, 0));
    return clamp(key === "BTTS_Y" ? pY : 1 - pY, 0.01, 0.995);
  }
  return null;
}

export async function buildAutoSlip(onProgress) {
  const now = Date.now();
  const horizon = now + AUTO_HORIZON_DAYS * 86400000;
  let fresh = 0;

  // paced, quota-aware fetch — shared with the H2H engine so the free plan's
  // per-minute cap is never tripped; cached responses are free
  const scanRows = async (endpoint, params) => {
    if (fresh >= AUTO_FRESH_BUDGET) {
      const e = new Error("scan budget reached");
      e.budgetOut = true;
      throw e;
    }
    const wait = paceState.lastFreshAt ? 6500 - (Date.now() - paceState.lastFreshAt) : 0;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    let payload;
    try {
      payload = await apiFootball(endpoint, params);
    } catch (e) {
      const err = new Error("data service unavailable");
      err.serviceDown = true;
      throw err;
    }
    if (payload && payload.cached === false) {
      paceState.lastFreshAt = Date.now();
      fresh++;
    }
    const body = payload?.data;
    return body && Array.isArray(body.response) ? body.response : [];
  };

  // 1) collect next-7-days fixtures from the major leagues (one call per day)
  const upcoming = [];
  let serviceDown = false;
  for (let d = 0; d < AUTO_HORIZON_DAYS; d++) {
    let list = [];
    try {
      list = await scanRows("fixtures", { date: localDayKey(new Date(now + d * 86400000)) });
    } catch (e) {
      serviceDown = true;
      break; // quota / rate limit — scan with what's already cached
    }
    for (const f of list) {
      const st = (f?.fixture?.status?.short || "").toUpperCase();
      if (st !== "NS" && st !== "TBD") continue; // only not-started games
      const t = f?.fixture?.date ? new Date(f.fixture.date).getTime() : NaN;
      if (isNaN(t) || t <= now || t > horizon) continue; // within one week only
      if (!SLIP_LEAGUE_IDS.has(f?.league?.id)) continue;
      upcoming.push(f);
    }
    onProgress?.({ daysDone: d + 1, daysTotal: AUTO_HORIZON_DAYS, scanned: 0, matches: 0 });
  }
  upcoming.sort((x, y) => (x?.fixture?.date || "").localeCompare(y?.fixture?.date || ""));
  const fixtures = upcoming.slice(0, AUTO_SCAN_CAP);

  // 2) qualify each fixture against real bookmaker prices + the official prediction
  const entries = [];
  const capturedAt = new Date().toISOString();
  for (let i = 0; i < fixtures.length && entries.length < TARGET_MATCHES; i++) {
    const f = fixtures[i];
    let oddsRaw = [];
    let predRaw = [];
    try {
      oddsRaw = await scanRows("odds", { fixture: f.fixture.id });
      predRaw = await scanRows("predictions", { fixture: f.fixture.id });
    } catch (e) {
      serviceDown = true;
      break; // keep what's verified so far — never pad with unverified games
    }
    const pred = predRaw?.[0];
    const hxg = parseFloat(pred?.goals?.home);
    const axg = parseFloat(pred?.goals?.away);
    const pct = (v) => {
      const n = parseFloat(v);
      return isNaN(n) ? null : n / 100;
    };
    const apiPct = pred?.percent
      ? { home: pct(pred.percent.home), draw: pct(pred.percent.draw), away: pct(pred.percent.away) }
      : null;
    if (hxg > 0 && axg > 0) {
      const qualified = [];
      for (const c of parseOdds(oddsRaw)) {
        const prob = slipProbability(c.key, { hxg, axg, apiPct });
        if (prob == null) continue;
        const implied = 1 / c.odds;
        const edge = prob - implied;
        if (prob < MIN_MODEL_PROBABILITY || edge < MIN_EDGE) continue;
        qualified.push({
          ...c,
          probability: prob,
          implied,
          edge,
          score: 0.5 * prob + 0.25 * clamp(edge, -0.2, 0.2) + 0.075 + 0.1 * Math.log(Math.max(c.odds, 1.01)),
        });
      }
      if (qualified.length) {
        const pair = generateTwoPicks(qualified, 0.5);
        if (pair?.pick1) {
          entries.push({
            fixtureId: String(f.fixture.id),
            home: f.teams?.home?.name,
            away: f.teams?.away?.name,
            league: f.league?.name || "",
            kickoff: f.fixture.date,
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
          });
        }
      }
    }
    onProgress?.({ daysDone: AUTO_HORIZON_DAYS, daysTotal: AUTO_HORIZON_DAYS, scanned: i + 1, matches: entries.length });
  }

  // only a build with verified games is stored — a failed scan retries later
  if (entries.length) saveAutoSlip(entries, { scanned: fixtures.length });
  return { entries, scanned: fixtures.length, serviceDown };
}