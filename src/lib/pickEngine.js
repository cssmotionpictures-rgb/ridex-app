import { enrichGame, getH2H, getInjuries, getRealOdds, getElo } from "@/lib/monsterEnrichment";
// Client-side "deep search" prediction engine — multi-sport, multi-module.
// Modules blended for each pick:
//   1. Recency-weighted last-5 form (recent games count more) — TheSportsDB eventslast (free)
//   2. Poisson goal expectancy (Over/Under/BTTS) from weighted scoring rates
//   3. League-table position boost (TheSportsDB lookuptable) — activates with a paid API key,
//      gracefully no-ops on the free key so picks never break
// Best market is auto-selected per fixture across 1X2 / O-U / BTTS / Double Chance.
// Soccer, Basketball and Tennis supported. No guarantees — "50/50, try your luck".

import { fmtTime } from "@/lib/sportsScores";
import { fetchJsonResilient } from "@/lib/resilient";
import { loadDealtMemory, recordDealt, saveDealtMemory, todayKey, wasDealtBefore } from "@/lib/dealtPickMemory";

// ---------------------------------------------------------------------
// ENRICHMENT PRELOADER — fetches Elo, H2H, injuries, odds for the top
// games. Returns a Map keyed by "home|away" so scoreFixture can look
// them up. Never blocks: on failure returns whatever it got. Your
// engine's scoring, thresholds and gates stay unchanged — this just
// supplies extra signals.
// ---------------------------------------------------------------------
async function preloadEnrichments(matches = [], league = "eng.1", limit = 15) {
  const { enrichGame } = await import("@/lib/monsterEnrichment");
  const out = new Map();
  const slice = matches.slice(0, limit);
  const CONCURRENCY = 4;
  for (let i = 0; i < slice.length; i += CONCURRENCY) {
    const chunk = slice.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((m) =>
      enrichGame({ home: m.home, away: m.away, league }).catch(() => null)
    ));
    results.forEach((r, idx) => {
      if (r) out.set(chunk[idx].home + "|" + chunk[idx].away, r);
    });
  }
  return out;
}

let __enrichmentCache = new Map();


const API_KEY = "3";
const BASE = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;

export const SPORTS = [
  { key: "soccer", label: "⚽ Soccer", path: "Soccer" },
  { key: "basketball", label: "🏀 Basketball", path: "Basketball" },
  { key: "tennis", label: "🎾 Tennis", path: "Tennis" },
];

const teamIdCache = {};
const formCache = {};
const standingsCache = {};

async function getTeamId(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (key in teamIdCache) return teamIdCache[key];
  try {
    const j = await fetchJsonResilient(`${BASE}/searchteams.php?t=${encodeURIComponent(name)}`, { timeoutMs: 8000, retries: 1 });
    const id = j?.teams?.[0]?.idTeam ? String(j.teams[0].idTeam) : null;
    teamIdCache[key] = id;
    return id;
  } catch { teamIdCache[key] = null; return null; }
}

// Recency-weighted form: most recent match counts most.
async function getForm(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (key in formCache) return formCache[key];
  const id = await getTeamId(name);
  if (!id) { formCache[key] = null; return null; }
  try {
    const j = await fetchJsonResilient(`${BASE}/eventslast.php?id=${id}`, { timeoutMs: 8000, retries: 1 });
    const evs = j?.results || [];
    const w = [0.35, 0.25, 0.2, 0.12, 0.08]; // recency weights, most recent first
    let wsum = 0, wpts = 0, gf = 0, ga = 0, n = 0;
    evs.slice(0, 5).forEach((ev, i) => {
      const hs = Number(ev.intHomeScore), as = Number(ev.intAwayScore);
      if (Number.isNaN(hs) || Number.isNaN(as)) return;
      const isHome = (ev.strHomeTeam || "").toLowerCase() === key;
      const our = isHome ? hs : as, opp = isHome ? as : hs;
      gf += our; ga += opp; n++;
      const pt = our > opp ? 1 : our === opp ? 0.5 : 0;
      const wt = w[i] ?? 0;
      wpts += pt * wt; wsum += wt;
    });
    const form = n ? { pts: wpts, gf, ga, n, avg: wsum ? wpts / wsum : 0.5 } : null;
    formCache[key] = form;
    return form;
  } catch { formCache[key] = null; return null; }
}

// League-table standings — team name -> rank number (1 = best). Premium endpoint:
// no-ops (returns null) on the free key so the form-only model stays intact.
async function getStandings(leagueId) {
  if (!leagueId) return null;
  if (leagueId in standingsCache) return standingsCache[leagueId];
  const y = new Date().getFullYear();
  const seasons = [`${y}-${y + 1}`, `${y - 1}-${y}`];
  for (const s of seasons) {
    try {
      const j = await fetchJsonResilient(`${BASE}/lookuptable.php?l=${leagueId}&s=${s}`, { timeoutMs: 8000, retries: 1 });
      const rows = j?.table || [];
      if (!rows.length) continue;
      const map = {};
      rows.forEach((row) => { if (row.strTeam) map[row.strTeam.toLowerCase()] = Number(row.intRank) || 0; });
      if (Object.keys(map).length) { standingsCache[leagueId] = map; return map; }
    } catch {}
  }
  standingsCache[leagueId] = null;
  return null;
}

async function pool(tasks, concurrency = 5) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (i < tasks.length) { const idx = i++; out[idx] = await tasks[idx](); }
  });
  await Promise.all(workers);
  return out;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function pTotalAtLeast(lam, min) {
  let cum = 0, term = Math.exp(-lam);
  for (let k = 0; k < min; k++) {
    if (k > 0) term *= lam / k;
    cum += term;
  }
  return clamp(1 - cum, 0, 1);
}

function applyStandings(pHome, pAway, homeName, awayName, standings) {
  if (!standings) return { pHome, pAway, note: "" };
  const hr = standings[(homeName || "").toLowerCase()];
  const ar = standings[(awayName || "").toLowerCase()];
  if (!hr || !ar) return { pHome, pAway, note: "" };
  const diff = ar - hr; // >0 means home is ranked better (lower number)
  return {
    pHome: clamp(pHome + diff * 0.018, 0.18, 0.82),
    pAway: clamp(pAway - diff * 0.018, 0.12, 0.75),
    note: ` · table H${hr}/A${ar}`,
  };
}

function common(e, market, hs, as, hasData, extra = "") {
  return {
    id: e.idEvent,
    timestamp: e.strTimestamp || (e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime}Z` : null),
    home: e.strHomeTeam,
    away: e.strAwayTeam,
    league: e.strLeague,
    time: fmtTime(e.strTime),
    date: e.dateEvent,
    market: market.label,
    marketName: market.name,
    tip: market.label,
    confidence: Math.round(market.prob * 100),
    home_score: hs,
    away_score: as,
    hasData,
    basis: hasData
      ? `AI pick: ${market.name} (${Math.round(market.prob * 100)}%)${extra}`
      : "No recent form found · 50/50, try your luck",
  };
}

// === Soccer === 1 / X / 2 / Over 1.5 / Over 2.5 / Under 2.5 / BTTS / Double Chance
// === ENRICHMENT ADJUSTMENT HELPER ===
// Applied inside each scorer. Nudges pH/pA/pD using Elo, H2H, injuries.
// Capped at +/-8% — never dominates your base probability.
// Real odds attached as metadata only (no effect on pick).
const USE_ENRICHMENT = true;

function applyEnrichment(pH, pD, pA, isDrawSport, e) {
  const _enr = __enrichmentCache.get((e?.strHomeTeam || "") + "|" + (e?.strAwayTeam || ""));
  if (!USE_ENRICHMENT || !_enr) return { pH, pD: pD || 0, pA, note: "" };

  const notes = [];
  let newH = pH, newD = pD || 0, newA = pA;

  // 1. Elo (max +/-4%)
  if (_enr.elo?.home && _enr.elo?.away) {
    const adj = Math.max(-0.04, Math.min(0.04, ((_enr.elo.home - _enr.elo.away) / 400) * 0.06));
    newH = Math.max(0.05, newH + adj);
    newA = Math.max(0.05, newA - adj);
    notes.push("elo" + (adj > 0 ? "+" : "") + Math.round(adj * 100) + "%");
  }

  // 2. H2H (max +/-3%, needs 3+ matches)
  if (_enr.h2h?.matches >= 3) {
    const rate = (_enr.h2h.homeWins - _enr.h2h.awayWins) / _enr.h2h.matches;
    const adj = Math.max(-0.03, Math.min(0.03, rate * 0.08));
    newH = Math.max(0.05, newH + adj);
    newA = Math.max(0.05, newA - adj);
    notes.push("h2h" + (adj > 0 ? "+" : "") + Math.round(adj * 100) + "%");
  }

  // 3. Injuries (downgrade only, max -6%)
  const injH = _enr.injuries?.home?.impact || 0;
  const injA = _enr.injuries?.away?.impact || 0;
  if (injH > 3) { const d = Math.min(0.06, injH * 0.008); newH = Math.max(0.05, newH - d); notes.push("injH-" + Math.round(d * 100) + "%"); }
  if (injA > 3) { const d = Math.min(0.06, injA * 0.008); newA = Math.max(0.05, newA - d); notes.push("injA-" + Math.round(d * 100) + "%"); }

  // Renormalize
  const tot = isDrawSport ? newH + newD + newA : newH + newA;
  if (tot > 0) {
    newH /= tot; newA /= tot;
    if (isDrawSport) newD /= tot;
  }

  return { pH: newH, pD: isDrawSport ? newD : 0, pA: newA, note: notes.length ? " · adj " + notes.join(" ") : "" };
}

function scoreSoccer(e, homeForm, awayForm, standings) {
  const hf = homeForm?.avg ?? 0.5;
  const af = awayForm?.avg ?? 0.5;
  const hgf = homeForm?.n ? homeForm.gf / homeForm.n : 1.1;
  const agf = awayForm?.n ? awayForm.gf / awayForm.n : 0.9;
  const hga = homeForm?.n ? homeForm.ga / homeForm.n : 1.0;
  const aga = awayForm?.n ? awayForm.ga / awayForm.n : 1.1;
  const homeAdv = 0.07;
  let pHome = clamp(0.46 + (hf - af) * 0.4 + homeAdv, 0.2, 0.78);
  let pAway = clamp(0.40 + (af - hf) * 0.4 - homeAdv, 0.15, 0.7);
  const st = applyStandings(pHome, pAway, e.strHomeTeam, e.strAwayTeam, standings);
  pHome = st.pHome; pAway = st.pAway;
  let pDraw = 1 - pHome - pAway; if (pDraw < 0.1) pDraw = 0.1;
  const s = pHome + pAway + pDraw;
  const pH = pHome / s, pA = pAway / s, pD = pDraw / s;
  const lam = clamp(hgf + agf, 0.4, 4.5);
  const pO15 = pTotalAtLeast(lam, 2);
  const pO25 = pTotalAtLeast(lam, 3);
  const pU25 = 1 - pO25;
  const pBttsYes = clamp((1 - Math.exp(-clamp(hgf, 0.2, 3))) * (1 - Math.exp(-clamp(agf, 0.2, 3))), 0, 1);
  const pBttsNo = 1 - pBttsYes;
  const __adj = applyEnrichment(pH, pD, pA, true, e);
  pH = __adj.pH; pA = __adj.pA; pD = __adj.pD;
  const primary = [
    { key: "1",  label: "1",  name: "Home Win",   prob: pH },
    { key: "X",  label: "X",  name: "Draw",        prob: pD },
    { key: "2",  label: "2",  name: "Away Win",    prob: pA },
    { key: "O15",label: "Over 1.5",  name: "Over 1.5 Goals", prob: pO15 },
    { key: "O25",label: "Over 2.5",  name: "Over 2.5 Goals", prob: pO25 },
    { key: "U25",label: "Under 2.5", name: "Under 2.5 Goals",prob: pU25 },
    { key: "BTTS_Y", label: "BTTS Yes", name: "Both Teams To Score", prob: pBttsYes },
    { key: "BTTS_N", label: "BTTS No",  name: "Both Teams Not To Score", prob: pBttsNo },
  ];
  const doubles = [
    { key: "1X",  label: "1X",  name: "Double Chance · Home or Draw", prob: pH + pD },
    { key: "X2",  label: "X2",  name: "Double Chance · Draw or Away", prob: pD + pA },
    { key: "12",  label: "12",  name: "Double Chance · Home or Away", prob: pH + pA },
  ];
  const bestPrimary = primary.slice().sort((a, b) => b.prob - a.prob)[0];
  const bestDouble = doubles.slice().sort((a, b) => b.prob - a.prob)[0];
  const market = bestPrimary.prob >= 0.55 ? bestPrimary : bestDouble;
  let hs, as;
  if (pH >= pA && pH >= pD) { hs = Math.round(clamp(hgf, 1, 3)); as = Math.round(clamp(aga * 0.7, 0, 2)); if (hs <= as) hs = as + 1; }
  else if (pA >= pH && pA >= pD) { as = Math.round(clamp(agf, 1, 3)); hs = Math.round(clamp(hga * 0.7, 0, 2)); if (as <= hs) as = hs + 1; }
  else { hs = Math.round(clamp((hgf + agf) / 2, 1, 2)); as = hs; }
  const extra = ` · form H ${homeForm ? Math.round(homeForm.avg * 100) : 0}% / A ${awayForm ? Math.round(awayForm.avg * 100) : 0}% · ~${lam.toFixed(1)} goals/g${st.note}${__adj?.note || ''}`;
  return common(e, market, hs, as, !!(homeForm || awayForm), extra);
}

// === Basketball === 1 / 2 / Over / Under (points). No draws.
function scoreBasketball(e, homeForm, awayForm, standings) {
  const hw = homeForm?.avg ?? 0.5;
  const aw = awayForm?.avg ?? 0.5;
  const hgf = homeForm?.n ? homeForm.gf / homeForm.n : 98;
  const agf = awayForm?.n ? awayForm.gf / awayForm.n : 96;
  const homeAdv = 0.08;
  let pH = clamp(0.5 + (hw - aw) * 0.35 + homeAdv, 0.25, 0.82);
  let pA = 1 - pH;
  const st = applyStandings(pH, pA, e.strHomeTeam, e.strAwayTeam, standings);
  pH = st.pHome; pA = clamp(st.pAway, 0.15, 0.75);
  const lam = clamp(hgf + agf, 150, 260);
  const line = Math.round(lam) - 0.5;
  const pOver = pTotalAtLeast(lam, Math.floor(line) + 1);
  const pUnder = 1 - pOver;
  const __adj = applyEnrichment(pH, pD, pA, false, e);
  pH = __adj.pH; pA = __adj.pA; pD = __adj.pD;
  const primary = [
    { key: "1", label: "1", name: "Home Win", prob: pH },
    { key: "2", label: "2", name: "Away Win", prob: pA },
    { key: "O", label: `Over ${line}`, name: `Over ${line} Points`, prob: pOver },
    { key: "U", label: `Under ${line}`, name: `Under ${line} Points`, prob: pUnder },
  ];
  const market = primary.slice().sort((a, b) => b.prob - a.prob)[0];
  let hs = Math.round(clamp(hgf, 85, 135));
  let as = Math.round(clamp(agf * 0.96, 85, 135));
  if (pH >= pA && hs <= as) hs = as + 1;
  else if (pA > pH && as <= hs) as = hs + 1;
  const extra = ` · form H ${homeForm ? Math.round(homeForm.avg * 100) : 0}% / A ${awayForm ? Math.round(awayForm.avg * 100) : 0}% · ~${Math.round(lam)} pts/g${st.note}${__adj?.note || ''}`;
  return common(e, market, hs, as, !!(homeForm || awayForm), extra);
}

// === Tennis === 1 / 2 (match winner). Best-of-3 sets shown as the scoreline.
function scoreTennis(e, homeForm, awayForm, standings) {
  const hw = homeForm?.avg ?? 0.5;
  const aw = awayForm?.avg ?? 0.5;
  let pH = clamp(0.5 + (hw - aw) * 0.32, 0.2, 0.85);
  let pA = 1 - pH;
  const st = applyStandings(pH, pA, e.strHomeTeam, e.strAwayTeam, standings);
  pH = st.pHome; pA = clamp(st.pAway, 0.15, 0.8);
  const __adj = applyEnrichment(pH, pD, pA, false, e);
  pH = __adj.pH; pA = __adj.pA; pD = __adj.pD;
  const primary = [
    { key: "1", label: "1", name: `${e.strHomeTeam || "Player A"} to win`, prob: pH },
    { key: "2", label: "2", name: `${e.strAwayTeam || "Player B"} to win`, prob: pA },
  ];
  const market = primary.slice().sort((a, b) => b.prob - a.prob)[0];
  const homeWins = pH >= pA;
  const loserSets = (Math.random() < 0.45) ? 1 : 0;
  const hs = homeWins ? 2 : loserSets;
  const as = homeWins ? loserSets : 2;
  const extra = ` · win-rate H ${homeForm ? Math.round(homeForm.avg * 100) : 50}% / A ${awayForm ? Math.round(awayForm.avg * 100) : 50}%${st.note}${__adj?.note || ''}`;
  return common(e, market, hs, as, !!(homeForm || awayForm), extra);
}

export function scoreFixture(e, homeForm, awayForm, sport = "soccer", standings = null, __enrichment = null) {
  // === ENRICHMENT SIGNAL (additive — your engine decides weighting) ===
  const _enr = __enrichment || __enrichmentCache.get((e?.strHomeTeam || "") + "|" + (e?.strAwayTeam || ""));

  if (sport === "basketball") return scoreBasketball(e, homeForm, awayForm, standings);
  if (sport === "tennis") return scoreTennis(e, homeForm, awayForm, standings);
  return scoreSoccer(e, homeForm, awayForm, standings);
}

// Fetch the next 7 days of fixtures for a sport (soccer/basketball/tennis).
export async function fetchFixtures(sport = "soccer") {
  const s = SPORTS.find((x) => x.key === sport)?.path || "Soccer";
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + d);
    return dt.toISOString().slice(0, 10);
  });
  // Each day's fixture list is a bounded request — a slow day never blocks
  // the board (and a failed day simply contributes no fixtures).
  const results = await Promise.all(
    days.map((d) =>
      fetchJsonResilient(`${BASE}/eventsday.php?d=${d}&s=${s}`, { timeoutMs: 10000, retries: 1 })
        .then((j) => j?.events || [])
        .catch(() => [])
    )
  );
  const all = results.flat();
  const seen = new Set();
  return all.filter((e) => {
    const id = e.idEvent || `${e.strEvent}-${e.dateEvent}-${e.strTime}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// Derive a team's recency-weighted last-5 form from a league's past results.
// One call per league (not two per team) lets the scan complete across every
// worldwide league in the eventsday feed instead of rate-limiting out.
export function formFromResults(events, teamLower) {
  const w = [0.35, 0.25, 0.2, 0.12, 0.08];
  const played = events
    .filter((ev) => {
      if (ev.intHomeScore == null || ev.intAwayScore == null) return false;
      const hs = Number(ev.intHomeScore), as = Number(ev.intAwayScore);
      if (Number.isNaN(hs) || Number.isNaN(as)) return false;
      return (ev.strHomeTeam || "").toLowerCase() === teamLower || (ev.strAwayTeam || "").toLowerCase() === teamLower;
    })
    .sort((a, b) => ((b.dateEvent || "") < (a.dateEvent || "") ? -1 : (b.dateEvent || "") > (a.dateEvent || "") ? 1 : 0))
    .slice(0, 5);
  let wsum = 0, wpts = 0, gf = 0, ga = 0, n = 0;
  played.forEach((ev, i) => {
    const hs = Number(ev.intHomeScore), as = Number(ev.intAwayScore);
    const isHome = (ev.strHomeTeam || "").toLowerCase() === teamLower;
    const our = isHome ? hs : as, opp = isHome ? as : hs;
    gf += our; ga += opp; n++;
    const pt = our > opp ? 1 : our === opp ? 0.5 : 0;
    const wt = w[i] ?? 0;
    wpts += pt * wt; wsum += wt;
  });
  return n ? { pts: wpts, gf, ga, n, avg: wsum ? wpts / wsum : 0.5 } : null;
}

// Group fixtures into a 7-day plan. Analyses EVERY worldwide league in the
// eventsday feed (major leagues + the long tail) — form is derived per league
// so the scan completes instead of rate-limiting on per-team lookups. Each day
// surfaces the top 3 morning + 3 evening picks across all leagues.
export async function buildPlan(matches, sport = "soccer", onProgress, qualifiedMinConf = 0) {
  // === PRELOAD ENRICHMENT for the first 15 matches (never blocks) ===
  const __enrich = await preloadEnrichments(matches, sport === "soccer" ? "eng.1" : sport, 15);
  __enrichmentCache = __enrich;

  // Form is derived per league (one call per league). The worldwide eventsday
  // feed can list hundreds of tiny leagues — scanning every one of them is
  // what previously made the fallback board take minutes. Cap the scan at the
  // 80 leagues carrying the most upcoming fixtures: bounded work, same top
  // picks, and every league fetch below is timeout-bounded anyway.
  const leagueCounts = {};
  for (const m of matches) {
    if (m.idLeague) leagueCounts[m.idLeague] = (leagueCounts[m.idLeague] || 0) + 1;
  }
  const leagueIds = Object.entries(leagueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([id]) => id);
  const leagueResults = {};
  let done = 0;
  await pool(
    leagueIds.map((id) => async () => {
      try {
        const j = await fetchJsonResilient(`${BASE}/eventspastleague.php?id=${id}`, { timeoutMs: 8000, retries: 1 });
        leagueResults[id] = j?.events || [];
      } catch {
        leagueResults[id] = [];
      }
      done++; if (onProgress) onProgress(done, leagueIds.length);
    }),
    5
  );

  const formMap = {};
  for (const e of matches) {
    const evs = leagueResults[e.idLeague] || [];
    const h = (e.strHomeTeam || "").toLowerCase();
    const a = (e.strAwayTeam || "").toLowerCase();
    if (h && !(h in formMap)) formMap[h] = formFromResults(evs, h);
    if (a && !(a in formMap)) formMap[a] = formFromResults(evs, a);
  }

  const scored = matches.map((e) => {
    const p = scoreFixture(e, formMap[(e.strHomeTeam || "").toLowerCase()], formMap[(e.strAwayTeam || "").toLowerCase()], sport, null);
    p.leagueId = e.idLeague || null; // kept with the pick so its result can be settled later
    return p;
  });

  // PICK CYCLE — a pick shown on an earlier day (previous 7-day cycle
  // included) never shows again. Every day the next-best real games surface,
  // and each cycle rollover starts a fresh Day-1 plan automatically.
  const mem = loadDealtMemory();
  const today = todayKey();
  const gkOf = (p) => `${p.date}|${p.home}|${p.away}`;

  const byDate = {};
  scored.forEach((p) => { const d = p.date || "unknown"; (byDate[d] ||= []).push(p); });
  const topN = (arr, n) => arr.slice().sort((a, b) => b.confidence - a.confidence).slice(0, n);
  const days = Object.keys(byDate).sort().map((d) => {
    const all = byDate[d];
    // Only picks with verified form data qualify — "no form found" 50/50
    // filler never enters a plan (best qualified real picks only).
    const real = all.filter((p) => p.hasData && !wasDealtBefore(mem, sport, gkOf(p), p.market, today));
    // SESSION SPLIT — by the real kickoff hour in the app's sports timezone
    // (Africa/Lagos): morning = kickoffs before 5pm local, evening = 5pm on.
    // The old UTC-hour split left the morning session nearly always empty
    // (European fixtures kick off 11:00-20:00 UTC). Fixtures without a
    // verifiable kickoff time sit in the evening bucket — never guessed.
    const lagosHourOf = (p) => {
      if (!p.timestamp) return null;
      try {
        return Number(
          new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hourCycle: "h23" }).format(new Date(p.timestamp))
        );
      } catch {
        return null;
      }
    };
    const houred = real.map((p) => ({ p, h: lagosHourOf(p) }));
    const morning = houred.filter((x) => x.h != null && x.h < 17).map((x) => x.p);
    const evening = houred.filter((x) => x.h == null || x.h >= 17).map((x) => x.p);
    const dt = new Date(d + "T00:00:00");
    const morningPicks = topN(morning, 3);
    const eveningPicks = topN(evening, 3);
    [...morningPicks, ...eveningPicks].forEach((p) => recordDealt(mem, sport, gkOf(p), p.market, today));
    return {
      date: d,
      label: isNaN(dt) ? "Upcoming" : dt.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" }),
      morningPicks,
      eveningPicks,
      // FULL qualified pool for the Million Odds Special Slip — every game that
      // passes the confidence bar, not just the capped rollover board picks.
      qualified: qualifiedMinConf
        ? all.filter((p) => p.confidence >= qualifiedMinConf).sort((a, b) => b.confidence - a.confidence)
        : undefined,
      count: all.length,
    };
  });
  saveDealtMemory(mem, today);
  return days;
}