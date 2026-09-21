// Deep-scan pool for the SPECIAL ODDS slips (Hollow / Drama Queen / Ride X /
// Hammer / Fine Girl).
// Full-season fixtures + real form from the openfootball/football.json repo
// (jsDelivr CDN — keyless, CORS-friendly, zero workspace credits).
//
// Strictest scrutiny, same as the board plus two extra gates:
//   1. BOTH teams must have verified form (4+ played matches with real scores)
//   2. The model confidence must clear the 90% bar
//   3. Head-to-head history between the two sides nudges confidence up/down
//   4. A corners line from the VERIFIED corner feed (real corner-kick
//      statistics) is attached where both sides have tracked history —
//      never projected, never guessed
//   5. A PADDING pick — a second verified market on the same game at 90%+
//      confidence — multiplies each leg's odds; it is skipped whenever the
//      head-to-head record contradicts it or no honest combo exists
// The slips never add a leg that fails these gates. Note: no free injuries
// feed exists, so injuries can't be verified — the engine never claims to.

import { scoreFixture, pTotalAtLeast } from "@/lib/pickEngine";
import { fetchJsonResilient } from "@/lib/resilient";
import { cornersFromFeed } from "@/lib/cornerMarkets";
import { getCornerFeedTeams, lookupCornerStats, normalizeName } from "@/lib/cornerFeed";
import { fetchLiveFixtures } from "@/lib/liveFootballScores";
import { loadOpenLigaDb } from "@/lib/openLigaDb";

const CDN_BASE = "https://cdn.jsdelivr.net/gh/openfootball/football.json@master";
export const SEASON = "2026-27";
const PREV_SEASON = "2025-26";
const H2H_SEASON = "2024-25"; // extra season depth — H2H finds the real last meetings, not just the last two seasons
const MIN_CONF = 90; // "sure qualified" bar — only games the model is 90%+ confident in
const MIN_FORM_GAMES = 4; // both teams need at least 4 verified played matches
// Normalized team-name equality — openfootball names, API-FOOTBALL live-feed
// names and odds-provider names for the same club all match ("Arsenal FC" =
// "Arsenal"), which is what lets the live-feed capture find verified form.
const sameName = (a, b) => a === b || normalizeName(a) === normalizeName(b);

// OPENLIGADB CONFIRMATION — the official German league feed (Bundesliga, 2.
// Bundesliga, 3. Liga) acts as a second independent source: real results
// the season files don't carry yet are merged into the form/H2H window, and
// fixtures the official feed also carries are marked CONFIRMED.
const OLDB_CODE = { "de.1": "bl1", "de.2": "bl2", "de.3": "bl3" };
const nameTokens = (s) => normalizeName(s).split(" ").filter((t) => t.length >= 4);
const sharedToken = (a, b) => {
  const ta = nameTokens(a), tb = nameTokens(b);
  return ta.length > 0 && tb.length > 0 && ta.some((t) => tb.includes(t));
};
// Loose same-game match ACROSS sources — same date plus a shared name token
// on BOTH sides ("FC Bayern München" = "Bayern Munich" through "bayern").
const looseSameGame = (a, b) =>
  a.date === b.date &&
  ((sharedToken(a.team1, b.team1) && sharedToken(a.team2, b.team2)) ||
    (sharedToken(a.team1, b.team2) && sharedToken(a.team2, b.team1)));

// One league's verified season data — the openfootball season files,
// enriched with the official OpenLigaDB feed for the German leagues.
// `confirm(fixture)` reports whether the official league feed also carries
// that fixture (CONFIRMED — two independent sources).
async function leagueData(lg, oldb) {
  const [fixtures, history, h2hSeason] = await Promise.all([
    fetchSeason(lg.code, SEASON),
    fetchSeason(lg.code, PREV_SEASON),
    fetchSeason(lg.code, H2H_SEASON),
  ]);
  // Real played results: current season so far + previous two seasons —
  // the deeper window is what makes the H2H record the REAL last meetings.
  let played = [
    ...h2hSeason.filter((m) => m.score?.ft),
    ...history.filter((m) => m.score?.ft),
    ...fixtures.filter((m) => m.score?.ft),
  ];
  let allFixtures = fixtures;
  let confirm = () => false;
  const ol = OLDB_CODE[lg.code] ? oldb[OLDB_CODE[lg.code]] : null;
  if (ol && ol.length) {
    const known = (om) =>
      played.some((m) => looseSameGame(m, om)) || fixtures.some((m) => looseSameGame(m, om));
    // Official results the season files don't carry yet — freshest real scores
    played = [...played, ...ol.filter((m) => m.score?.ft && !known(m))];
    // Confirmed official fixtures missing from the season files
    allFixtures = [...fixtures, ...ol.filter((m) => !m.score?.ft && !known(m))];
    confirm = (m) => ol.some((om) => looseSameGame(om, m));
  }
  return { fixtures: allFixtures, played, confirm };
}
const WINDOW_DAYS = 170; // fixtures within this window are scanned (season run-in)

// PADDING PICK — a second verified market on the SAME game that multiplies
// the leg's odds. It comes from the same real scoring rates (Poisson goal
// model over verified results), must clear the 90%+ sure bar, and is skipped
// whenever the last-5 head-to-head contradicts the line. Only combos whose
// joint outcome stays honestly computable are used — no knife-edge pairings
// (e.g. Over 2.5 + Under 3.5 = "exactly 3 goals"), no implied pairings that
// fake extra odds. No verified data → no padding, never a guess.
const COMP_CONF = 0.90; // padding bar — 90%+ model confidence from real data
const LAM_MIN = 0.4, LAM_MAX = 4.5;

function companionFor(mainMarket, lam, h2h) {
  const pO05 = 1 - Math.exp(-lam);
  const pO15 = pTotalAtLeast(lam, 2);
  const pU35 = 1 - pTotalAtLeast(lam, 4);
  const pU45 = 1 - pTotalAtLeast(lam, 5);
  let cands;
  switch (String(mainMarket || "")) {
    case "1": case "X": case "2": case "1X": case "X2": case "12":
      cands = [
        { label: "Under 3.5 Goals", prob: pU35, line: 3.5, dir: "under" },
        { label: "Over 1.5 Goals", prob: pO15, line: 1.5, dir: "over" },
        { label: "Over 0.5 Goals", prob: pO05, line: 0.5, dir: "over" },
      ];
      break;
    // SAME-DIRECTION TOTALS NEVER PAIR — Over 1.5 + Over 0.5 on the same game
    // is a redundant combo no bookie lets you play, so an Over main only gets
    // an honest RANGE padding (Over 1.5 + Under 3.5 = 2-3 goals), then the
    // corner. No honest companion clears the bar → main pick + corner only.
    case "Over 1.5":
      cands = [
        { label: "Under 3.5 Goals", prob: pU35, line: 3.5, dir: "under" },
      ];
      break;
    case "Over 2.5":
      cands = [{ label: "Under 4.5 Goals", prob: pU45, line: 4.5, dir: "under" }];
      break;
    default:
      return null; // Under/BTTS mains: no honest companion exists — never padded
  }
  cands.sort((a, b) => a.prob - b.prob); // best odds that still clears the sure bar
  for (const c of cands) {
    if (c.prob < COMP_CONF) continue;
    if (h2h && h2h.n >= 2) {
      const avgGoals = (h2h.gf + h2h.ga) / h2h.n;
      if (c.dir === "over" ? avgGoals < c.line : avgGoals > c.line) continue; // H2H contradicts this line
    }
    return { label: c.label, prob: c.prob, fairOdds: 1 / c.prob };
  }
  return null;
}

// SECOND PADDING PICK — "home/away to score" from the same real scoring rates
// (Poisson: P(team scores 1+) = 1 - e^-rate). Same 90%+ bar, H2H-checked — a
// side that never scored across 3+ recent meetings is never picked. BTTS-No
// mains get none (direct contradiction). Still no guessing, ever.
function companion2For(mainMarket, team1, team2, hgf, agf, h2h) {
  if (String(mainMarket) === "BTTS No") return null;
  const cands = [
    { label: `${team1} to Score`, prob: 1 - Math.exp(-Math.max(0.1, hgf)), side: "home" },
    { label: `${team2} to Score`, prob: 1 - Math.exp(-Math.max(0.1, agf)), side: "away" },
  ].sort((a, b) => a.prob - b.prob); // best odds that still clears the bar
  for (const c of cands) {
    if (c.prob < COMP_CONF) continue;
    if (h2h && h2h.n >= 3) {
      if (c.side === "home" && h2h.gf === 0) continue; // never scored vs this opponent
      if (c.side === "away" && h2h.ga === 0) continue;
    }
    return { label: c.label, prob: c.prob, fairOdds: 1 / c.prob };
  }
  return null;
}

export const LEAGUES = [
  { code: "en.1", label: "Premier League" },
  { code: "es.1", label: "La Liga" },
  { code: "de.1", label: "Bundesliga" },
  { code: "it.1", label: "Serie A" },
  { code: "fr.1", label: "Ligue 1" },
  { code: "en.2", label: "Championship" },
  { code: "pt.1", label: "Primeira Liga" },
  { code: "nl.1", label: "Eredivisie" },
  // Second divisions — deep pool so every named slip fills to its odds target
  { code: "es.2", label: "La Liga 2" },
  { code: "it.2", label: "Serie B" },
  { code: "de.2", label: "2. Bundesliga" },
  { code: "fr.2", label: "Ligue 2" },
  { code: "pt.2", label: "Liga Portugal 2" },
  { code: "nl.2", label: "Eerste Divisie" },
  { code: "en.3", label: "League One" },
  // Third tiers + more countries — deeper still (missing season files no-op safely)
  { code: "en.4", label: "League Two" },
  { code: "de.3", label: "3. Liga" },
  { code: "sc.1", label: "Scottish Premiership" },
  { code: "gr.1", label: "Super League Greece" },
  { code: "tr.1", label: "Süper Lig" },
  { code: "be.1", label: "Pro League Belgium" },
  { code: "ru.1", label: "Russian Premier League" },
  // Scottish lower tiers — the rest of the openfootball coverage, so the
  // engine's reach spans every league the verified season files carry
  { code: "sc.2", label: "Scottish Championship" },
  { code: "sc.3", label: "Scottish League One" },
  { code: "sc.4", label: "Scottish League Two" },
];

// Shared season-file cache (promise-cached) — the SPECIAL ODDS deep pool and
// the CHOP EBA / SUGAR / DRINK 7UP market pool scan the same files once.
const seasonCache = new Map();
export async function fetchSeason(code, season) {
  const key = `${season}/${code}`;
  if (seasonCache.has(key)) return seasonCache.get(key);
  const req = (async () => {
    try {
      const j = await fetchJsonResilient(`${CDN_BASE}/${key}.json`, { timeoutMs: 12000, retries: 1 });
      return Array.isArray(j?.matches) ? j.matches : [];
    } catch {
      return []; // missing season files and CDN hiccups both no-op safely
    }
  })();
  seasonCache.set(key, req);
  return req;
}

// Recency-weighted last-5 form from real openfootball results
// (current-season games + tail of last season).
export function formOf(played, team) {
  const mine = played
    .filter((m) => m.score?.ft && (sameName(m.team1, team) || sameName(m.team2, team)))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-5);
  if (mine.length < MIN_FORM_GAMES) return null;
  const w = [0.35, 0.25, 0.2, 0.12, 0.08];
  let wsum = 0, wpts = 0, gf = 0, ga = 0;
  mine.forEach((m, i) => {
    const [h, a] = m.score.ft;
    const isHome = sameName(m.team1, team);
    const our = isHome ? h : a, opp = isHome ? a : h;
    gf += our;
    ga += opp;
    const pt = our > opp ? 1 : our === opp ? 0.5 : 0;
    wpts += pt * (w[i] ?? 0);
    wsum += w[i] ?? 0;
  });
  return { pts: wpts, gf, ga, n: mine.length, avg: wsum ? wpts / wsum : 0.5 };
}

// Head-to-head history between the two sides from real results — the LAST 5
// meetings (previous season + current season so far). share = home side's
// weighted points share.
function h2hOf(played, team1, team2) {
  const ms = played
    .filter((m) =>
      m.score?.ft &&
      ((sameName(m.team1, team1) && sameName(m.team2, team2)) || (sameName(m.team1, team2) && sameName(m.team2, team1)))
    )
    .slice(-5);
  if (!ms.length) return null;
  let pts = 0, wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
  ms.forEach((m) => {
    const [h, a] = m.score.ft;
    const t1Home = sameName(m.team1, team1);
    const our = t1Home ? h : a, opp = t1Home ? a : h;
    gf += our; ga += opp;
    if (our > opp) { pts += 1; wins++; }
    else if (our === opp) { pts += 0.5; draws++; }
    else losses++;
  });
  return { n: ms.length, wins, draws, losses, share: pts / ms.length, gf, ga };
}

// Honest H2H label — the ACTUAL number of meetings on record (never claims
// "last 5" when fewer exist), BOTH sides' W-D-L, and goals for each side.
export function h2hLabel(t1, t2, h) {
  if (!h) return null;
  return `last ${h.n} meetings on record — ${t1} ${h.wins}W-${h.draws}D-${h.losses}L · ${t2} ${h.losses}W-${h.draws}D-${h.wins}L · goals ${t1} ${h.gf} - ${t2} ${h.ga}`;
}

// Full qualified pool — every upcoming fixture across the 8 league season
// files that passes the scrutiny gates. Sorted surest first.
export async function buildSlipPool() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Verified corner feed — real corner-kick statistics per team (one invoke,
  // server-side aggregated and cached). Pairings without tracked corner
  // history simply carry no corner line.
  const cornerTeams = await getCornerFeedTeams();
  const oldb = await loadOpenLigaDb();

  const pools = await Promise.all(
    LEAGUES.map(async (lg) => {
      const { fixtures, played, confirm } = await leagueData(lg, oldb);
      const teams = new Set();
      fixtures.forEach((m) => {
        if (m.team1) teams.add(m.team1);
        if (m.team2) teams.add(m.team2);
      });
      const forms = {};
      teams.forEach((t) => {
        forms[t] = formOf(played, t);
      });

      const out = [];
      fixtures.forEach((m, i) => {
        if (m.score?.ft || !m.date || m.date < todayStr || m.date > cutoffStr) return;
        const hf = forms[m.team1], af = forms[m.team2];
        if (!hf || !af) return; // scrutiny: no verified form, no leg
        const e = {
          idEvent: `${lg.code}-${m.date}-${i}`,
          strTimestamp: `${m.date}T12:00:00Z`,
          strHomeTeam: m.team1,
          strAwayTeam: m.team2,
          strLeague: lg.label,
          strTime: "",
          dateEvent: m.date,
        };
        const p = scoreFixture(e, hf, af, "soccer", null);
        if (!p.hasData) return;

        // Head-to-head scrutiny — the last 5 real meetings nudge confidence,
        // and a record that directly contradicts the selected pick
        // disqualifies the leg outright (needs 2+ real meetings).
        const h2h = h2hOf(played, m.team1, m.team2);
        let conf = p.confidence;
        let contradicted = false;
        if (h2h) {
          conf = Math.round(Math.max(0, Math.min(99, conf + (h2h.share - 0.5) * 18)));
          const ou = /^(over|under)\s*\+?(\d+\.5)/i.exec(String(p.market || ""));
          if (ou && h2h.n >= 2) {
            const line = parseFloat(ou[2]);
            const avgGoals = (h2h.gf + h2h.ga) / h2h.n;
            if (ou[1].toLowerCase() === "over" ? avgGoals < line : avgGoals > line) contradicted = true;
          }
        }

        // Padding pick — second verified market from the same real scoring
        // rates, 90%+ confidence, H2H-checked. Skipped when no honest
        // companion clears the bar.
        const hgf = hf.gf / hf.n, agf = af.gf / af.n;
        const lam = Math.max(LAM_MIN, Math.min(LAM_MAX, hgf + agf));
        const companion = companionFor(p.market, lam, h2h);
        const companionReason = companion
          ? `Padding pick (verified) — ${companion.label} at ${Math.round(companion.prob * 100)}% from real scoring rates (${hgf.toFixed(1)} + ${agf.toFixed(1)} goals/game)${h2h && h2h.n >= 2 ? ` · last-${h2h.n} H2H averaged ${((h2h.gf + h2h.ga) / h2h.n).toFixed(1)} goals — no contradiction` : ""}`
          : "No totals market cleared the 90% scrutiny bar for this game — main market only";
        const companion2 = companion2For(p.market, m.team1, m.team2, hgf, agf, h2h);
        const companion2Reason = companion2
          ? `Second padding pick (verified) — ${companion2.label} at ${Math.round(companion2.prob * 100)}% from real scoring rates${h2h && h2h.n >= 3 ? " · H2H checked, no contradiction" : ""}`
          : "No team-to-score market cleared the 90% scrutiny bar for this game";

        // Corner line — VERIFIED FEED ONLY (real match corner statistics).
        // No tracked history on both sides → no corner line, never a guess.
        const csH = lookupCornerStats(cornerTeams, m.team1);
        const csA = lookupCornerStats(cornerTeams, m.team2);
        const corners = cornersFromFeed(csH, csA);
        const cornerReason = corners
          ? `Corner feed (verified) — ${m.team1}: ${csH.avgFor.toFixed(1)} corners/game over ${csH.n} tracked matches · ${m.team2}: ${csA.avgFor.toFixed(1)} over ${csA.n} · avg ${corners.expected} match corners`
          : "No verified corner data for this pairing — corner line skipped";

        // Scoring / conceding ability per game from each side's verified results.
        const rates =
          `Scoring & conceding per game — ${m.team1}: ${(hf.gf / hf.n).toFixed(1)} scored, ${(hf.ga / hf.n).toFixed(1)} conceded · ` +
          `${m.team2}: ${(af.gf / af.n).toFixed(1)} scored, ${(af.ga / af.n).toFixed(1)} conceded`;

        if (conf >= MIN_CONF && !contradicted) {
          out.push({
            ...p,
            confidence: conf,
            confirmed: confirm(m),
            companion,
            companionReason,
            companion2,
            companion2Reason,
            corners,
            cornerReason,
            rates,
            h2h: h2hLabel(m.team1, m.team2, h2h),
          });
        }
      });
      return out;
    })
  );

  return pools
    .flat()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 300)
    .map((p) => ({
      fixtureId: p.id,
      timestamp: p.timestamp,
      date: p.date,
      localTime: p.time,
      home: p.home,
      away: p.away,
      league: p.league,
      marketLabel: p.market,
      probability: p.confidence / 100,
      qualityScore: p.confidence,
      fairOdds: p.confidence ? 100 / p.confidence : null,
      marketOdds: null,
      valueEdge: null,
      companion: p.companion,
      companion2: p.companion2,
      corners: p.corners,
      h2h: p.h2h,
      risk: "LOW RISK",
      dataQuality: "HIGH",
      sources: p.confirmed ? ["openfootball", "openligadb"] : ["openfootball"],
      confirmed: !!p.confirmed,
      status: "open",
      reasons: [
        p.basis,
        p.h2h ? `Head-to-head (${p.h2h})` : null,
        p.rates,
        p.companionReason,
        p.companion2Reason,
        p.cornerReason,
      ].filter(Boolean),
    }));
}

// === FULL MARKET POOL — CHOP EBA RISKY / SUGAR / DRINK 7UP slips ===
// Every upcoming fixture with verified form on BOTH sides carries the model's
// full market map: 1/X/2, double chance and BTTS from the same real scoring
// rates. The risky combo's probability is the EXACT joint distribution (both
// teams score AND 3+ total goals) computed from the per-team goal rates —
// never two marginals multiplied together. Head-to-head is consulted like the
// board: a record that contradicts the pick disqualifies it. No verified form
// → the game never enters the pool. Never a guess.

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
const pois = (k, l) => (Math.exp(-l) * Math.pow(l, k)) / FACT[k];
const clampP = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const SUGAR_DC_BAR = 0.8; // double-chance qualification bar
const SUGAR_HOME_BAR = 0.66; // home-win qualification bar
const WIN_BAR = 0.62; // DRINK 7UP — straight home or away win bar
const RISKY_BAR = 0.4; // Over 2.5 + BTTS Yes exact-joint floor

function bestOf(cands) {
  return cands.filter((c) => c.prob >= c.min).sort((a, b) => b.prob - a.prob)[0] || null;
}

// The scrutiny core shared by the market pool and the LIVE capture: 1X2 from
// verified recency-weighted form with the head-to-head nudge, the H2H
// contradiction gate, and every qualifying market (RISKY / SUGAR / DRINK 7UP
// bars plus the straight model markets the accumulator prices with real
// bookmaker quotes). No verified form on both sides → never called at all.
export function scrutinizedMarkets(home, away, hf, af, played) {
  const hgf = hf.gf / hf.n, agf = af.gf / af.n;
  const h2h = h2hOf(played, home, away);

  // 1X2 from verified recency-weighted form, head-to-head nudge applied
  let pH = clampP(0.46 + (hf.avg - af.avg) * 0.4 + 0.07, 0.2, 0.78);
  let pA = clampP(0.4 + (af.avg - hf.avg) * 0.4 - 0.07, 0.15, 0.7);
  if (h2h) {
    pH = clampP(pH + (h2h.share - 0.5) * 0.18, 0.05, 0.9);
    pA = clampP(pA - (h2h.share - 0.5) * 0.18, 0.05, 0.9);
  }
  const pD = Math.max(0.08, 1 - pH - pA);
  const s = pH + pA + pD;
  const p1 = pH / s, p2 = pA / s, pX = pD / s;

  // H2H contradiction gate — the last real meetings must not contradict
  const contradicts = (side) =>
    !!(h2h && h2h.n >= 2 && (side === "home" ? h2h.share <= 0.25 : h2h.share >= 0.75));
  const h2hGoals = h2h && h2h.n >= 2 ? (h2h.gf + h2h.ga) / h2h.n : null;

  // RISKY — Over 2.5 + BTTS Yes: exact joint from the goal model
  let pRisky = 0;
  for (let k = 1; k <= 10; k++)
    for (let j = 1; j <= 10; j++) if (k + j >= 3) pRisky += pois(k, hgf) * pois(j, agf);
  const risky =
    pRisky >= RISKY_BAR && (h2hGoals == null || h2hGoals >= 2.5)
      ? { key: "RISKY", label: "Over 2.5 + BTTS Yes", prob: pRisky }
      : null;

  // STRAIGHT MARKETS for the REAL-ODDS ACCUMULATOR — every provider-priced
  // market computed from the same real scoring rates. MODEL ESTIMATES offered
  // as candidates only: the accumulator prices every leg with a real
  // bookmaker quote and keeps just the positive-EV ones.
  const lam = clampP(hgf + agf, LAM_MIN, LAM_MAX);
  const pO25 = pTotalAtLeast(lam, 3);
  const pBttsY = clampP(
    (1 - Math.exp(-clampP(hgf, 0.2, 3))) * (1 - Math.exp(-clampP(agf, 0.2, 3))),
    0.01, 0.99
  );
  // EXTENDED VERIFIED MARKETS — exact Poisson totals and double-chance lines
  // from the same real scoring rates, so CHOP EBA's 90%+ bar and the specials'
  // 75%+ fill always have honest supply. H2H-contradiction-checked exactly
  // like SUGAR / DRINK 7UP: a record that contradicts the side disqualifies
  // the pick outright, and a draw-heavy H2H kills the "no draw" line.
  const pO05 = 1 - Math.exp(-lam);
  const pO15 = pTotalAtLeast(lam, 2);
  const pU35 = 1 - pTotalAtLeast(lam, 4);
  const pU45 = 1 - pTotalAtLeast(lam, 5);
  const reals = [
    { key: "1", label: `1 · ${home} to Win`, prob: p1 },
    { key: "X", label: "X", prob: pX },
    { key: "2", label: `2 · ${away} to Win`, prob: p2 },
    { key: "O2.5", label: "Over 2.5", prob: pO25 },
    { key: "U2.5", label: "Under 2.5", prob: 1 - pO25 },
    { key: "BTTS_Y", label: "BTTS Yes", prob: pBttsY },
    { key: "BTTS_N", label: "BTTS No", prob: 1 - pBttsY },
    { key: "O0.5", label: "Over 0.5 Goals", prob: pO05 },
    { key: "O1.5", label: "Over 1.5 Goals", prob: pO15 },
    { key: "U3.5", label: "Under 3.5 Goals", prob: pU35 },
    { key: "U4.5", label: "Under 4.5 Goals", prob: pU45 },
    !contradicts("home") && { key: "1X", label: `1X · ${home} or Draw`, prob: p1 + pX },
    !contradicts("away") && { key: "X2", label: `X2 · Draw or ${away}`, prob: pX + p2 },
    !(h2h && h2h.n >= 3 && h2h.draws >= 3) && { key: "12", label: `12 · ${home} or ${away} — no draw`, prob: p1 + p2 },
  ].filter(Boolean);

  const rates =
    `Scoring & conceding per game — ${home}: ${hgf.toFixed(1)} scored, ${(hf.ga / hf.n).toFixed(1)} conceded · ` +
    `${away}: ${agf.toFixed(1)} scored, ${(af.ga / af.n).toFixed(1)} conceded`;

  return {
    exp: { hs: Math.round(hgf), as: Math.round(agf) }, // expected scoreline from the same real scoring rates
    h2h,
    h2hGoals,
    rates,
    sugar: bestOf([
      !contradicts("home") && { key: "1X", label: `1X · ${home} or Draw`, prob: p1 + pX, min: SUGAR_DC_BAR },
      !contradicts("away") && { key: "X2", label: `X2 · Draw or ${away}`, prob: pX + p2, min: SUGAR_DC_BAR },
      !contradicts("home") && { key: "1", label: `1 · ${home} to Win`, prob: p1, min: SUGAR_HOME_BAR },
    ].filter(Boolean)),
    seven: bestOf([
      !contradicts("home") && { key: "1", label: `1 · ${home} to Win`, prob: p1, min: WIN_BAR },
      !contradicts("away") && { key: "2", label: `2 · ${away} to Win`, prob: p2, min: WIN_BAR },
    ].filter(Boolean)),
    risky,
    reals,
  };
}

export async function buildMarketPool() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const oldb = await loadOpenLigaDb();

  const pools = await Promise.all(
    LEAGUES.map(async (lg) => {
      const { fixtures, played, confirm } = await leagueData(lg, oldb);
      const forms = {};
      new Set(fixtures.flatMap((m) => [m.team1, m.team2].filter(Boolean))).forEach((t) => {
        forms[t] = formOf(played, t);
      });

      const out = [];
      fixtures.forEach((m, i) => {
        if (m.score?.ft || !m.date || m.date < todayStr || m.date > cutoffStr) return;
        const hf = forms[m.team1], af = forms[m.team2];
        if (!hf || !af) return; // scrutiny: no verified form on both sides, no pick — ever
        // One shared scrutiny core — the exact same computation the live
        // capture uses (1X2, H2H gate, risky joint, extended straight markets),
        // so the market pool and the live pool can never disagree.
        const mk = scrutinizedMarkets(m.team1, m.team2, hf, af, played);
        out.push({
          reals: mk.reals,
          exp: mk.exp,
          confirmed: confirm(m),
          fixtureId: `${lg.code}-${m.date}-${i}`,
          date: m.date,
          timestamp: `${m.date}T12:00:00Z`,
          home: m.team1,
          away: m.team2,
          league: lg.label,
          h2h: h2hLabel(m.team1, m.team2, mk.h2h),
          h2hGoals: mk.h2hGoals,
          rates: mk.rates,
          sugar: mk.sugar,
          seven: mk.seven,
          risky: mk.risky,
        });
      });
      return out;
    })
  );

  return pools.flat();
}

// === LIVE CAPTURE — all matches currently in progress ===
// The scanner now sweeps the API-FOOTBALL live feed (EVERY competition in
// play worldwide, not just the engine's leagues). A live match enters the
// pool only when BOTH sides have verified openfootball form in one of the
// engine's leagues — through the exact same scrutiny as everything else —
// and is flagged LIVE. Matches with no verified data are never guessed in.

let livePairsCache = { at: 0, set: null };
const LIVE_PAIRS_TTL_MS = 60 * 1000;

// Normalized home|away pairs of every match currently in progress — the
// render-time LIVE NOW flag for picks and tickets. 60s client cache; the
// backend caches the live feed server-side too.
export async function getLiveNowPairs() {
  const now = Date.now();
  if (livePairsCache.set && now - livePairsCache.at < LIVE_PAIRS_TTL_MS) return livePairsCache.set;
  try {
    const live = (await fetchLiveFixtures()).filter((m) => m.status === "live");
    const set = new Set(live.map((m) => `${normalizeName(m.home)}|${normalizeName(m.away)}`));
    livePairsCache = { at: now, set };
    return set;
  } catch {
    if (!livePairsCache.set) livePairsCache = { at: now, set: new Set() };
    return livePairsCache.set;
  }
}

export const liveNow = (pairs, home, away) => pairs.has(`${normalizeName(home)}|${normalizeName(away)}`);

export async function buildLivePool() {
  let inplay = [];
  try {
    inplay = (await fetchLiveFixtures()).filter((m) => m.status === "live");
  } catch {
    return [];
  }
  if (!inplay.length) return [];

  const oldb = await loadOpenLigaDb();

  const leagues = await Promise.all(
    LEAGUES.map(async (lg) => {
      const { fixtures, played, confirm } = await leagueData(lg, oldb);
      const forms = {};
      new Set(fixtures.flatMap((m) => [m.team1, m.team2].filter(Boolean))).forEach((t) => {
        forms[t] = formOf(played, t);
      });
      const normIndex = new Map();
      for (const [t, f] of Object.entries(forms)) {
        if (f) normIndex.set(normalizeName(t), f);
      }
      return { lg, normIndex, played, confirm };
    })
  );

  const out = [];
  const seen = new Set();
  for (const m of inplay) {
    const nk = `${normalizeName(m.home)}|${normalizeName(m.away)}`;
    if (seen.has(nk)) continue;
    seen.add(nk);
    for (const { lg, normIndex, played, confirm } of leagues) {
      const hf = normIndex.get(normalizeName(m.home));
      const af = normIndex.get(normalizeName(m.away));
      if (!hf || !af) continue; // no verified form for this pairing in this league
      const mk = scrutinizedMarkets(m.home, m.away, hf, af, played);
      out.push({
        reals: mk.reals,
        confirmed: confirm({ date: new Date().toISOString().slice(0, 10), team1: m.home, team2: m.away }),
        fixtureId: `live-${m.id}`,
        date: new Date().toISOString().slice(0, 10),
        timestamp: m.kickoff ? new Date(m.kickoff).toISOString() : null,
        home: m.home,
        away: m.away,
        league: lg.label,
        live: true,
        liveScore: m.hs != null && m.as != null ? `${m.hs} - ${m.as}` : null,
        elapsed: m.elapsed,
        h2h: h2hLabel(m.home, m.away, mk.h2h),
        h2hGoals: mk.h2hGoals,
        rates: mk.rates,
        sugar: mk.sugar,
        seven: mk.seven,
        risky: mk.risky,
      });
      break; // verified in this league — stop searching
    }
  }
  return out;
}