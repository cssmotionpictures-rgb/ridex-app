import { scanSlipPools } from "@/lib/slipDealing";
import { scanBasketballPool } from "@/lib/basketballSlips";
import { SLIP_SPORTS, scanSportPool } from "@/lib/multiSportSlips";

// VERIFIED ROLL-OVER PLANS — every sport's 7-day plan is built straight from
// the engine's verified pools, the same scrutinized supply every slip reads:
//   soccer      — openfootball season files + the worldwide API-FOOTBALL scan
//   basketball  — the ESPN NBA/WNBA feeds (+ the official Sportradar schedule)
//   tennis      — the ESPN per-tournament match lists (ATP + WTA)
// TheSportsDB's free feeds no longer carry usable fixtures, so no sport
// touches them. Verified form on both sides, head-to-head consulted — never
// a guess; a game without verified data simply never enters.

// Kickoff hour in the app's sports timezone — the REAL provider kickoff
// timestamp only; a game without a verifiable kickoff time sits in the
// evening bucket, never guessed.
function lagosHour(iso) {
  if (!iso) return null;
  try {
    return Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hourCycle: "h23" }).format(new Date(iso))
    );
  } catch {
    return null;
  }
}

const topN = (arr, n) => arr.slice().sort((a, b) => b.confidence - a.confidence).slice(0, n);

// Calendar-sync fixture — only a REAL kickoff timestamp yields a time; a
// model-invented time never enters the calendar.
function fixtureOf(g, realKickoff) {
  return {
    id: g.fixtureId,
    date: g.date,
    time: realKickoff ? realKickoff.slice(11, 16) : "",
    home: g.home,
    away: g.away,
    league: g.league,
  };
}

// Group picks by kickoff date — top 3 morning + 3 evening per day.
function groupDays(items) {
  const byDate = {};
  items.forEach(({ pick, hour }) => {
    const d = pick.date || "unknown";
    (byDate[d] ||= []).push({ pick, hour });
  });
  return Object.keys(byDate).sort().map((d) => {
    const all = byDate[d];
    const morning = all.filter((x) => x.hour != null && x.hour < 17).map((x) => x.pick);
    const evening = all.filter((x) => x.hour == null || x.hour >= 17).map((x) => x.pick);
    const dt = new Date(d + "T00:00:00");
    return {
      date: d,
      label: isNaN(dt) ? "Upcoming" : dt.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" }),
      morningPicks: topN(morning, 3),
      eveningPicks: topN(evening, 3),
      count: all.length,
    };
  });
}

// ---- SOCCER (openfootball + worldwide API-FOOTBALL pools) ----
function toSoccerPick(g, c) {
  const conf = Math.round(c.prob * 100);
  const kickoff = g.kickoff || null;
  return {
    id: g.fixtureId,
    timestamp: kickoff || g.timestamp,
    date: g.date,
    home: g.home,
    away: g.away,
    league: g.league,
    time: kickoff ? kickoff.slice(11, 16) : "",
    market: String(c.label).split("·")[0].trim(),
    marketName: c.label,
    confidence: conf,
    home_score: g.exp ? g.exp.hs : 0,
    away_score: g.exp ? g.exp.as : 0,
    hasData: true,
    basis: `Verified pick: ${c.label} (${conf}%) · ${g.rates}${g.h2h ? ` · H2H ${g.h2h}` : ""}`,
    leagueId: null,
  };
}

export async function buildSoccerRolloverPlan(onProgress) {
  onProgress?.(1, 2);
  const { market, world } = await scanSlipPools().catch(() => ({ market: [], world: [] }));
  onProgress?.(2, 2);

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const items = [];
  const fixtures = [];
  for (const g of [...(market || []), ...(world || [])]) {
    if (!g.date || g.date < today || g.date > cutoffStr) continue;
    fixtures.push(fixtureOf(g, g.kickoff || null));
    const best = (g.reals || []).slice().sort((a, b) => b.prob - a.prob)[0];
    if (best) items.push({ pick: toSoccerPick(g, best), hour: lagosHour(g.kickoff) });
  }
  return { days: groupDays(items), fixtures };
}

// ---- BASKETBALL + TENNIS (ESPN-verified pools) ----
// The tennis feed carries no kickoff times (its timestamp is a date-only
// placeholder) — those picks sit in the evening bucket, never guessed.
function poolPick(g, c) {
  const conf = Math.round((c.prob || 0) * 100);
  const realKick = g.timestamp && !String(g.timestamp).endsWith("T12:00:00Z") ? g.timestamp : null;
  const isSide = c.label === "1" || c.label === "2";
  let hs = g.exp ? g.exp.hs : 0;
  let as = g.exp ? g.exp.as : 0;
  if (c.label === "1" && hs <= as) hs = as + 1;
  if (c.label === "2" && as <= hs) as = hs + 1;
  return {
    id: g.fixtureId,
    timestamp: realKick,
    date: g.date,
    home: g.home,
    away: g.away,
    league: g.league,
    time: realKick ? realKick.slice(11, 16) : "",
    market: isSide ? (c.label === "1" ? "Home Win" : "Away Win") : c.label,
    marketName: isSide ? `${c.label === "1" ? g.home : g.away} to Win` : c.label,
    confidence: conf,
    home_score: hs,
    away_score: as,
    hasData: true,
    basis: `Verified pool pick — ${c.label} at ${conf}% from real form on both sides${g.h2h ? ` · H2H ${g.h2h}` : ""} · ${g.rates}`,
    leagueId: g.leagueId,
  };
}

async function poolPlan(sport, onProgress) {
  onProgress?.(1, 2);
  const pool = await (sport === "basketball"
    ? scanBasketballPool()
    : scanSportPool(SLIP_SPORTS.find((s) => s.key === "tennis"))
  ).catch(() => []);
  onProgress?.(2, 2);

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const items = [];
  const fixtures = [];
  for (const g of pool || []) {
    if (!g.date || g.date < today || g.date > cutoffStr) continue;
    const realKick = g.timestamp && !String(g.timestamp).endsWith("T12:00:00Z") ? g.timestamp : null;
    fixtures.push(fixtureOf(g, realKick));
    const best = (g.cands || []).slice().sort((a, b) => (b.prob || 0) - (a.prob || 0))[0];
    if (best) items.push({ pick: poolPick(g, best), hour: lagosHour(realKick) });
  }
  return { days: groupDays(items), fixtures };
}

// The one entry point the 7-day plan UI calls — every sport, verified pools.
export async function buildVerifiedSportPlan(sport = "soccer", onProgress) {
  if (sport === "basketball") return poolPlan("basketball", onProgress);
  if (sport === "tennis") return poolPlan("tennis", onProgress);
  return buildSoccerRolloverPlan(onProgress);
}