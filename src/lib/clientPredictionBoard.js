// Credit-free, in-browser fallback board for the prediction engine.
// When the workspace backend is unreachable (e.g. integration credits
// exhausted), this builds the same 7-day board shape entirely in the
// browser from keyless CORS-friendly public data (TheSportsDB free key +
// the client-side form/Poisson model in pickEngine.js). No backend
// function, no workspace credits, no API tokens.
//
// RESILIENCE: the whole scan runs inside a hard 20s deadline — a slow
// public feed can never hold the prediction board hostage. Every fetch in
// pickEngine.js is individually bounded too, so the deadline is a safety
// net, not the only line of defense.

import { fetchFixtures, buildPlan } from "@/lib/pickEngine";
import { withTimeoutMs, SLOW_PROVIDER_TIMEOUT_MS } from "@/lib/resilient";

const MIN_CONF = 65; // in-browser fallback confidence bar (%)

function mapPick(p) {
  const prob = p.confidence / 100;
  return {
    fixtureId: p.id,
    leagueId: p.leagueId || null,
    league: p.league,
    date: p.date,
    localTime: p.time,
    home: p.home,
    away: p.away,
    homeLogo: null,
    awayLogo: null,
    marketLabel: p.market,
    probability: prob,
    qualityScore: p.hasData ? p.confidence : Math.min(p.confidence, 50),
    agreementText: p.hasData ? "1 in-browser model" : "no form data",
    fairOdds: p.confidence ? 100 / p.confidence : null,
    marketOdds: null,
    valueEdge: null,
    predictedHome: p.home_score,
    predictedAway: p.away_score,
    risk: p.confidence >= 80 ? "LOW RISK" : p.confidence >= 68 ? "MEDIUM RISK" : "HIGH RISK",
    dataQuality: p.hasData ? "MEDIUM" : "LOW",
    sources: ["in-browser"],
    status: "open",
    reasons: [p.basis],
    models: [{ name: "In-browser form model", pick: p.market, prob }],
    flags: p.hasData ? [] : ["No recent form data for either team"],
  };
}

// The actual scan — bounded by the caller's deadline.
async function buildBoardNow() {
  const matches = await fetchFixtures("soccer");
  if (!matches.length) throw new Error("no fixtures available");
  const plan = await buildPlan(matches, "soccer", null, MIN_CONF);
  if (!plan.length) throw new Error("no plan built");

  const days = plan.map((d) => ({
    dateKey: d.date,
    morning: { picks: d.morningPicks.filter((p) => p.confidence >= MIN_CONF).map(mapPick) },
    evening: { picks: d.eveningPicks.filter((p) => p.confidence >= MIN_CONF).map(mapPick) },
  }));

  // Full qualified pool for the Million Odds Special Slip — every game across
  // the whole 7-day scan that passed the SAME confidence scrutiny as the board
  // (real form data, 65%+ model confidence), kickoffs still in the future,
  // stacked surest first. The slip builds from this at once — no drip-feeding.
  const now = new Date();
  const slipPool = plan
    .flatMap((d) => d.qualified || [])
    .filter((p) => !p.timestamp || new Date(p.timestamp) > now)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 250)
    .map(mapPick);
  const qualityPass = days.reduce((s, d) => s + d.morning.picks.length + d.evening.picks.length, 0);
  const leagues = new Set(matches.map((m) => m.idLeague).filter(Boolean));

  return {
    inBrowser: true,
    config: { minProbability: MIN_CONF / 100 },
    funnel: { available: matches.length, dataPass: matches.length, agreementPass: matches.length, probabilityPass: qualityPass, qualityPass },
    days,
    slipPool,
    providers: { inbrowser: { label: "In-browser engine", status: "ONLINE" } },
    updatedAt: new Date().toISOString(),
    timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || "local"),
    leaguesWithData: leagues.size,
    leaguesScanned: leagues.size,
    notes: "In-browser mode: fixtures and form fetched directly in your browser from keyless public data — zero workspace credits used. Settlement and history tracking resume on the server engine when it is reachable again.",
  };
}

// Returns the same board shape the server engine produces, so the
// PredictionBoard UI renders it unchanged — or throws within 20 seconds.
export async function buildClientBoard() {
  return withTimeoutMs(buildBoardNow(), SLOW_PROVIDER_TIMEOUT_MS, "in-browser board scan");
}