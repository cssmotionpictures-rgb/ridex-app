// MONSTER ENRICHMENT — pure data signals for your prediction engine.
//
// This module does NOT make picks, does NOT compute confidence, does NOT
// filter games. It returns extra verified data (Elo, injuries, H2H, real
// odds, xG) so your engine can weight them however it wants.
//
// Every function returns null on failure — never throws, never blocks the
// engine. All calls are capped at 3.5 seconds. Results are cached in-memory
// for 10 minutes so a full board scan doesn't hammer the backend.

import { base44 } from "@/api/base44Client";

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.promise;
}

function cacheSet(key, promise) {
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

async function invoke(action, params, timeoutMs = 3500) {
  const run = base44.functions.invoke("monster-pool", { action, ...params });
  return Promise.race([
    run,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
  ]);
}

// ---------------------------------------------------------------------
// ENRICH A SINGLE GAME — Elo + injuries + H2H + real odds
// ---------------------------------------------------------------------
export async function enrichGame({ home, away, league, kickoff } = {}) {
  if (!home || !away) return null;
  const key = `enrich:${home}|${away}|${league || ""}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const promise = (async () => {
    try {
      const res = await invoke("enrich", { home, away, league, kickoff }, 4000);
      return res?.data?.enrichment || null;
    } catch (_) {
      return null;
    }
  })();
  return cacheSet(key, promise);
}

// ---------------------------------------------------------------------
// BATCH ENRICH — call this once per board scan, not per game
// ---------------------------------------------------------------------
export async function enrichGames(games = [], league = "eng.1", concurrency = 4) {
  const list = (games || []).slice(0, 20);
  const out = [];
  for (let i = 0; i < list.length; i += concurrency) {
    const slice = list.slice(i, i + concurrency);
    const batch = await Promise.all(slice.map((g) =>
      enrichGame({ home: g.home, away: g.away, league, kickoff: g.kickoff })
    ));
    out.push(...batch);
  }
  return out;
}

// ---------------------------------------------------------------------
// HEAD-TO-HEAD — last 10 verified meetings
// ---------------------------------------------------------------------
export async function getH2H(team1, team2) {
  if (!team1 || !team2) return null;
  const key = `h2h:${team1}|${team2}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const promise = (async () => {
    try {
      const res = await invoke("h2h", { team1, team2 }, 3500);
      return res?.data?.response || [];
    } catch (_) { return []; }
  })();
  return cacheSet(key, promise);
}

// ---------------------------------------------------------------------
// INJURIES — real injured players with severity
// ---------------------------------------------------------------------
export async function getInjuries(teamId, season) {
  if (!teamId) return { count: 0, impact: 0, list: [] };
  const y = season || new Date().getFullYear();
  const key = `inj:${teamId}:${y}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const promise = (async () => {
    try {
      const res = await invoke("injuries", { team: teamId, season: y }, 3500);
      const list = res?.data?.response || [];
      let impact = 0;
      for (const inj of list) {
        const reason = (inj.reason || "").toLowerCase();
        let w = 1;
        if (reason.includes("acl") || reason.includes("surgery") || reason.includes("fracture")) w = 3;
        else if (reason.includes("muscle") || reason.includes("hamstring") || reason.includes("groin")) w = 2;
        else if (reason.includes("knock") || reason.includes("illness")) w = 0.5;
        const pos = (inj.player?.position || "").toUpperCase();
        if (pos.includes("GK") || pos.includes("GOAL")) w *= 1.5;
        else if (pos.includes("FW") || pos.includes("ATT") || pos.includes("ST")) w *= 1.4;
        else if (pos.includes("DF") || pos.includes("DEF")) w *= 1.2;
        impact += w;
      }
      return { count: list.length, impact: Math.round(impact * 100) / 100, list };
    } catch (_) { return { count: 0, impact: 0, list: [] }; }
  })();
  return cacheSet(key, promise);
}

// ---------------------------------------------------------------------
// LINEUPS — starting XI for a fixture
// ---------------------------------------------------------------------
export async function getLineups(fixtureId) {
  if (!fixtureId) return { home: [], away: [] };
  const key = `lin:${fixtureId}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const promise = (async () => {
    try {
      const res = await invoke("lineups", { fixture: String(fixtureId) }, 3500);
      const list = res?.data?.response || [];
      const home = list.find((l) => l.team?.name)?.startXI?.map((p) => p.player?.name) || [];
      const away = list.filter((l) => l.team?.name).slice(1)[0]?.startXI?.map((p) => p.player?.name) || [];
      return { home, away };
    } catch (_) { return { home: [], away: [] }; }
  })();
  return cacheSet(key, promise);
}

// ---------------------------------------------------------------------
// ELO — team rating from ClubElo (free, no key)
// ---------------------------------------------------------------------
export async function getElo(teamName) {
  if (!teamName) return null;
  const key = `elo:${teamName}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const promise = (async () => {
    try {
      const res = await invoke("clubelo", { team: teamName }, 3000);
      return res?.data?.data?.elo || null;
    } catch (_) { return null; }
  })();
  return cacheSet(key, promise);
}

// ---------------------------------------------------------------------
// STANDINGS — league table
// ---------------------------------------------------------------------
export async function getStandings(competition = "PL") {
  const key = `std:${competition}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const promise = (async () => {
    try {
      const res = await invoke("standings", { competition }, 4000);
      return res?.data?.response || [];
    } catch (_) { return []; }
  })();
  return cacheSet(key, promise);
}

// ---------------------------------------------------------------------
// FIXTURES — upcoming matches
// ---------------------------------------------------------------------
export async function getFixtures(competition = "PL") {
  const key = `fix:${competition}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const promise = (async () => {
    try {
      const res = await invoke("fixtures", { competition }, 4000);
      return res?.data?.response || [];
    } catch (_) { return []; }
  })();
  return cacheSet(key, promise);
}

// ---------------------------------------------------------------------
// REAL ODDS — market consensus from providers
// ---------------------------------------------------------------------
export async function getRealOdds(home, away, league = "eng.1") {
  if (!home || !away) return null;
  const key = `odds:${home}|${away}|${league}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const promise = (async () => {
    try {
      const res = await invoke("enrich", { home, away, league }, 4000);
      return res?.data?.enrichment?.odds || null;
    } catch (_) { return null; }
  })();
  return cacheSet(key, promise);
}

// ---------------------------------------------------------------------
// MANUAL CACHE CLEAR
// ---------------------------------------------------------------------
export function clearEnrichmentCache() {
  cache.clear();
}
