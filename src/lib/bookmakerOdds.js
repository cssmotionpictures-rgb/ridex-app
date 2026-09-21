import { normalizeName } from "@/lib/cornerFeed";
import { marketKeyOf } from "@/lib/slipDealing";
import { fetchRealBookmakerOdds } from "@/providers/odds/theOddsApi";
import { parseMarketRequest as parseOddsMarket } from "@/lib/oddsMath";

export { parseOddsMarket };

// REAL BOOKMAKER ODDS LAYER — client side.
// Every "price" produced here comes from a real bookmaker feed (The Odds API
// via the bookmaker-odds backend function). This module NEVER generates,
// projects or pads a price: model numbers stay model numbers, bookmaker
// numbers stay bookmaker numbers, and they are always labeled separately.

export const ODDS_PROVIDER = "The Odds API";
export const ODDS_TTL_MINUTES = 30; // pre-match freshness window (spec M)

// Which odds-provider competition covers each scanned league. Leagues with
// no provider coverage simply carry no real odds — never a substitute price.
export const LEAGUE_ODDS_SPORT = {
  "Premier League": "soccer_epl",
  "La Liga": "soccer_spain_la_liga",
  "Bundesliga": "soccer_germany_bundesliga",
  "Serie A": "soccer_italy_serie_a",
  "Ligue 1": "soccer_france_ligue_one",
  "Championship": "soccer_efl_champ",
  "Primeira Liga": "soccer_portugal_primeira_liga",
  "Eredivisie": "soccer_netherlands_eredivisie",
  "La Liga 2": "soccer_spain_segunda_division",
  "Serie B": "soccer_italy_serie_b",
  "2. Bundesliga": "soccer_germany_bundesliga2",
  "Ligue 2": "soccer_france_ligue_two",
  "Scottish Premiership": "soccer_spl",
  "Süper Lig": "soccer_turkey_super_league",
  "Pro League Belgium": "soccer_belgium_first_div",
  "Russian Premier League": "soccer_russia_premier_league",
  // Additional leagues scanned by the engine's pool — each mapping lets more
  // games carry a REAL price (the accumulator refuses legs without one).
  // Keys verified against the provider's own /sports list (2026-09-09).
  // Liga Portugal 2 and Eerste Divisie are NOT carried by the provider —
  // removed so their candidates never consume a slot in the 12-league cap.
  "Super League Greece": "soccer_greece_super_league",
  "League One": "soccer_england_league1",
  "League Two": "soccer_england_league2",
  "3. Liga": "soccer_germany_liga3",
  // Worldwide pool leagues (API-FOOTBALL scan) — each mapping lets a world
  // league leg carry a REAL price. A key the provider doesn't serve simply
  // means no real price for that league — never a substitute.
  "Serie A (Brazil)": "soccer_brazil_campeonato",
  "Major League Soccer": "soccer_usa_mls",
  "J1 League (Japan)": "soccer_japan_j_league",
};

// Stabilize the key of a leg's pick — same game + same market = same key,
// whichever pool produced the leg.
export function oddsKey(leg) {
  return `${leg.date || ""}|${leg.home || ""}|${leg.away || ""}|${marketKeyOf(leg.marketLabel)}`;
}

// Market parsing / availability / optimizer / movement logic now lives in
// @/lib/oddsMath.js (pure, covered by the automated test suite) and is
// re-exported above. Same-game combinations (Bet Builder combos) are NOT
// priced by the provider — they are marked unavailable rather than
// multiplied into a fake "bookmaker" price.

// Confident team-name match between the engine fixture and the provider event.
function nameMatch(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true; // "valencia" ⊂ "valencia cf"
  const tx = x.split(" ");
  const ty = y.split(" ");
  const inter = tx.filter((t) => ty.includes(t)).length;
  return inter >= 2 && inter / Math.min(tx.length, ty.length) >= 0.6;
}

const MEM_TTL = 10 * 60 * 1000; // client-side memory cache — the function caches server-side too
let memCache = { key: "", at: 0, data: null };
let inflight = null;
let inflightKey = "";
let lastDiag = null;

// ENGINE AUDIT — the actual, current diagnostics of the last odds transport
// call (success or failure), so the audit page shows the REAL provider state
// and failure reason instead of a guess.
export function getOddsDiagnostics() {
  return lastDiag ? { ...lastDiag } : { at: null, providerStatus: "never_fetched" };
}

function bestPriceFor(event, parsed) {
  if (!event) return null;
  if (parsed.market === "h2h") return (event.h2h || {})[parsed.side] || null;
  if (parsed.market === "btts") return (event.btts || {})[parsed.side] || null;
  return ((event.totals || {})[parsed.point] || {})[parsed.side] || null;
}

function buildResult(legs, res, opts) {
  const map = new Map();
  const providerStatus =
    res?.status === "unavailable" ? "missing_key" : res?.status === "error" || res?.error ? "provider_error" : "ok";
  const sportsByKey = {};
  (res?.sports || []).forEach((s) => {
    if (s && s.sportKey) sportsByKey[s.sportKey] = s;
  });
  let creditsRemaining = null;
  for (const leg of legs) {
    const k = oddsKey(leg);
    if (map.has(k)) continue;
    if (providerStatus === "missing_key") {
      map.set(k, { status: "missing_key", reason: "Real bookmaker feed not connected — set THE_ODDS_API_KEY (The Odds API). Model estimates only." });
      continue;
    }
    // LIVE NOW — bookmakers suspend pre-match prices the moment a match
    // kicks off, so an in-progress leg has no real price BY DEFINITION. It is
    // reported as live (captured by the scanner), never as "unmatched".
    if (leg.live) {
      map.set(k, { status: "live_now", reason: "Match is LIVE NOW — bookmakers suspend pre-match prices at kickoff, so no real price exists for this leg" });
      continue;
    }
    const sk = LEAGUE_ODDS_SPORT[leg.league];
    if (!sk) {
      map.set(k, { status: "league_not_covered", reason: "League not covered by the connected odds provider — no real price exists in the feed" });
      continue;
    }
    const sport = sportsByKey[sk];
    if (!sport || sport.status === "error" || !Array.isArray(sport.events)) {
      map.set(k, { status: "league_not_covered", reason: (sport && sport.reason) || "Odds unavailable for this league right now" });
      continue;
    }
    if (sport.creditsRemaining != null && (creditsRemaining == null || sport.creditsRemaining < creditsRemaining)) {
      creditsRemaining = sport.creditsRemaining;
    }
    const parsed = parseOddsMarket(leg.marketLabel);
    if (parsed.unsupported) {
      map.set(k, { status: "market_not_offered", reason: parsed.reason });
      continue;
    }
    const ev = sport.events.find((e) => nameMatch(e.home, leg.home) && nameMatch(e.away, leg.away));
    if (!ev) {
      map.set(k, { status: "fixture_unmatched", reason: "Fixture not found in the bookmaker feed — excluded from real-odds tickets" });
      continue;
    }
    const sel = bestPriceFor(ev, parsed);
    if (!sel) {
      map.set(k, { status: "market_not_offered", reason: "Market suspended or not priced by the provider right now" });
      continue;
    }
    const [price, bookmaker, ts, pin] = sel;
    const tsMs = ts ? new Date(ts).getTime() : 0;
    if (!tsMs || Date.now() - tsMs > (opts.ttlMinutes || ODDS_TTL_MINUTES) * 60000) {
      map.set(k, { status: "stale", reason: `Odds snapshot older than the ${ODS_TTL_TEXT(opts)} freshness window — excluded` });
      continue;
    }
    const prob = Number(leg.prob ?? leg.probability) || 0;
    const implied = 1 / price;
    map.set(k, {
      price,
      bookmaker,
      timestamp: ts,
      provider: ODDS_PROVIDER,
      implied,
      fair: prob > 0 ? Number((1 / prob).toFixed(3)) : null,
      edgePct: prob > 0 ? Math.round((prob - implied) * 1000) / 10 : null,
      evPct: prob > 0 ? Math.round((prob * price - 1) * 1000) / 10 : null,
      // PINNACLE — the sharp book's own quote for this exact market when
      // Pinnacle priced it (null when Pinnacle did not quote it)
      pinnacle: Number(pin) > 1.01 ? Number(pin) : null,
      eventId: ev.id,
      books: ev.books,
    });
  }
  return {
    map,
    providerStatus,
    missingKey: res?.missingKey || null,
    providerMessage: res?.message || res?.error || null,
    creditsRemaining,
    fetchedAt: res?.sports?.[0]?.fetchedAt || null,
  };
}

const ODS_TTL_TEXT = (opts) => `${opts.ttlMinutes || ODDS_TTL_MINUTES} min`;

// Attach real bookmaker odds to a list of legs. Returns a Map keyed by
// oddsKey(leg) → either { price, bookmaker, timestamp, implied, fair, edge,
// ev } (a REAL price) or { status, reason } (why no real price exists).
export async function attachRealOdds(legs, opts = {}) {
  const list = (legs || []).filter(Boolean);
  if (!list.length) return { map: new Map(), providerStatus: "idle" };

  // Only fetch the provider competitions that the requested legs play in,
  // highest-volume first, capped — every request costs provider credits.
  const counts = {};
  for (const l of list) {
    const sk = LEAGUE_ODDS_SPORT[l.league];
    if (sk) counts[sk] = (counts[sk] || 0) + 1;
  }
  const sportKeys = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.maxLeagues || 12)
    .map(([k]) => k);
  const res = await fetchOddsChunked(sportKeys, opts);
  const result = buildResult(list, res, opts);
  // Diagnostics — the real state of the odds layer for the engine audit page.
  const statusCounts = {};
  let pricedCount = 0;
  result.map.forEach((v) => {
    if (v && v.price > 1) pricedCount++;
    const s = v?.status || "priced";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  lastDiag = {
    at: Date.now(),
    provider: ODDS_PROVIDER,
    providerStatus: result.providerStatus,
    providerMessage:
      result.providerMessage ||
      (result.providerStatus === "ok" ? null : "no failure message reported by the provider"),
    creditsRemaining: result.creditsRemaining,
    fetchedAt: result.fetchedAt,
    sportKeys,
    legsRequested: list.length,
    pricedCount,
    statusCounts,
  };
  return result;
}

// Shared odds transport — one inflight promise per competition set, cached in
// memory so repeated tab switches never refetch the feed.
async function fetchOdds(sportKeys, opts) {
  const key = sportKeys.join(",");
  const now = Date.now();
  if (!opts.force && memCache.data && memCache.key === key && now - memCache.at < MEM_TTL) {
    return memCache.data;
  }
  if (inflight && inflightKey === key) return inflight;
  inflightKey = key;
  inflight = (async () => {
    try {
      return await fetchRealBookmakerOdds(sportKeys, {
        ttlMinutes: opts.ttlMinutes || ODDS_TTL_MINUTES,
        force: opts.force === true,
      });
    } catch (e) {
      return { status: "error", reason: String(e?.message || e) };
    } finally {
      setTimeout(() => {
        if (inflightKey === key) inflight = null;
      }, 0);
    }
  })();
  const res = await inflight;
  // Cache only responses that actually carried real prices — a failed or
  // fully-error response must never poison the next 10 minutes of slip
  // pricing (the next attempt refetches instead of replaying the failure).
  const anyLeagueOk = (res?.sports || []).some((s) => s?.status === "ok");
  if (res?.status === "ok" && anyLeagueOk) memCache = { key, at: Date.now(), data: res };
  return res;
}

// CHUNKED TRANSPORT — the provider is pulled sequentially (a parallel burst
// trips its throttle), and 12 sequential league pulls can outrun the 45s
// client timeout on a cold cache — the exact cause of the scan-time
// "provider unavailable" failures. The aggregate is split into ≤6-league
// chunks so every chunk lands well inside the budget. Chunks reuse the same
// per-league server cache, so warm boards cost nothing extra.
async function fetchOddsChunked(sportKeys, opts) {
  if (!sportKeys || !sportKeys.length) return { status: "ok", provider: ODDS_PROVIDER, sports: [] };
  const chunks = [];
  for (let i = 0; i < sportKeys.length; i += 6) chunks.push(sportKeys.slice(i, i + 6));
  const sports = [];
  let status = "ok";
  let message = null;
  let creditsRemaining = null;
  let fetchedAt = null;
  for (const chunk of chunks) {
    const res = await fetchOdds(chunk, opts);
    (res?.sports || []).forEach((s) => sports.push(s));
    if (res?.status === "unavailable") status = "unavailable";
    else if (res?.status !== "ok" && status === "ok") status = res.status || "error";
    message ||= res?.message || (res?.error ? String(res.error) : res?.reason ? String(res.reason) : null);
    if (res?.creditsRemaining != null) creditsRemaining = res.creditsRemaining;
    if (res?.sports?.[0]?.fetchedAt) fetchedAt = res.sports[0].fetchedAt;
  }
  return { status, provider: ODDS_PROVIDER, sports, message, creditsRemaining, fetchedAt };
}

// The engine's default competition set (priority order) — used to warm the
// odds cache while the fixture scan is still running, so real prices are
// already arriving by the time the pools land.
export const DEFAULT_ODDS_LEAGUES = [
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_france_ligue_one",
  "soccer_efl_champ",
  "soccer_portugal_primeira_liga",
  "soccer_netherlands_eredivisie",
  "soccer_spain_segunda_division",
  "soccer_italy_serie_b",
  "soccer_germany_bundesliga2",
  "soccer_turkey_super_league",
];

// Prefetch — starts the odds feed early, in PARALLEL with the fixture scan
// (the accumulator used to wait for pools, then fetch odds serially). The
// provider credits spent are the same ones the accumulator would spend
// moments later — this removes the serial wait, not extra credits: the
// backend caches per competition, so the final attach reuses the warm cache.
export async function prefetchRealOdds(sportKeys, opts = {}) {
  return fetchOddsChunked((sportKeys && sportKeys.length ? sportKeys : DEFAULT_ODDS_LEAGUES).slice(0, 12), opts);
}