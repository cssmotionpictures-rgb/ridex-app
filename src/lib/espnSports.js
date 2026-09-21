import { base44 } from "@/api/base44Client";
import { registerParticipantIdentities } from "@/lib/participantIdentity";

// === ESPN PUBLIC FEEDS — THE VERIFIED MULTI-SPORT DATA SOURCE ===
// TheSportsDB's free day feed returns nothing for basketball, tennis, NFL or
// MLB fixtures, and the Sportradar trial key is soccer-entitled only (403 on
// every other sport). ESPN's site API is keyless and carries REAL fixtures
// with REAL final scores. All access runs through the app's espn-proxy
// backend function — some browser networks cannot reach site.api.espn.com
// directly, and the proxy's shared cache keeps every user on one fresh
// copy. The same scrutiny rules apply as everywhere else in the engine:
// no verified form on both sides → the game never enters, never a guess.
//
// FETCH FAILURES THROW — the pool scanners record them as API_ERROR in the
// scan-status registry (src/lib/scanStatus.js) so a failed feed is visible
// and distinguishable from a genuinely empty off-season day. Nothing is
// silently swallowed into an empty pool.

// Promise-cached per (league, window) — one invoke per league per scan.
const feedCache = new Map();

// One league feed: upcoming fixtures (today and later) plus real completed
// results from the past `pastDays` days — split client-side from the proxy's
// normalized event list. `ok: false` zero-event responses throw; a stale
// cached copy served during an upstream outage is still real data and passes.
export async function espnLeagueFeed(leaguePath, label, pastDays = 0, futureDays = 7) {
  const key = `${leaguePath}|${pastDays}|${futureDays}`;
  if (feedCache.has(key)) return feedCache.get(key);
  const req = (async () => {
    const res = await base44.functions.invoke("espn-proxy", { league: leaguePath, pastDays, futureDays });
    const evs = (res?.data?.events || []).map((e) => ({ ...e, strLeague: e.strLeague || label }));
    if (!evs.length && res?.data?.ok === false && res?.data?.stale !== true) {
      throw new Error(`espn-proxy league feed unavailable: ${leaguePath}`);
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    return {
      fixtures: evs.filter((e) => (e.dateEvent || "") >= todayStr),
      results: evs.filter((e) => e.espnState === "post" && e.intHomeScore != null && e.intAwayScore != null),
    };
  })();
  feedCache.set(key, req);
  return req;
}

// Tennis — each date's own scoreboard, asked for individually (dates=YYYYMMDD)
// so the 6-day rollover and the 7-day plan scan every day's real drawn
// fixtures instead of today's board alone. dayStats carries the proxy's
// honest per-date report ({date, fixtures, status}) — an undrawn future round
// is an honest 0, never a fabricated fixture.
const TENNIS_TTL_MS = 10 * 60 * 1000;
const tennisCache = new Map();

export function espnTennisScan(dates) {
  const list = (Array.isArray(dates) ? dates : [])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)))
    .slice(0, 14);
  if (!list.length) list.push(new Date().toISOString().slice(0, 10));
  const key = list.join(",");
  const hit = tennisCache.get(key);
  if (hit && Date.now() - hit.at < TENNIS_TTL_MS) return hit.promise;
  const promise = (async () => {
    const res = await base44.functions.invoke("espn-proxy", { mode: "tennis", dates: list });
    const matches = res?.data?.matches || [];
    // SHARED IDENTITY REGISTRATION — the single point where every verified
    // participant name + provider id from the authoritative payload feeds the
    // app-wide identity resolver (display enrichment only; ids stay the keys).
    registerParticipantIdentities(
      matches.flatMap((m) => [
        m?.home?.providerId ? { providerId: m.home.providerId, name: m.home.name, provenance: "espn tennis feed" } : null,
        m?.away?.providerId ? { providerId: m.away.providerId, name: m.away.name, provenance: "espn tennis feed" } : null,
      ]).filter(Boolean)
    );
    if (!matches.length && res?.data?.ok === false && res?.data?.stale !== true) {
      throw new Error("espn-proxy tennis scan unavailable");
    }
    return {
      matches,
      dayStats: res?.data?.dayStats || [],
      ok: res?.data?.ok !== false,
    };
  })();
  tennisCache.set(key, { at: Date.now(), promise });
  return promise;
}