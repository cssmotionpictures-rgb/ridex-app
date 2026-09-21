import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { readCache, writeCache } from "../../shared/chunkedCache.ts";

// Server-side proxy for ESPN's public site API (site.api.espn.com) — the
// verified multi-sport data source (TheSportsDB's free feed returns nothing
// for these sports and the Sportradar trial key is soccer-entitled only).
// Some browser networks cannot reach ESPN directly, so the multi-sport
// engine fetches server-side here. Input is strictly bounded: whitelisted
// leagues only, at most 14 past + 14 future days per call, and ALL app users
// share one cached copy (5-minute TTL) — the same pattern as
// thesportsdb-proxy. The endpoint is keyless; no secret is involved.

const ESPN = "https://site.web.api.espn.com/apis/site/v2/sports";
const CACHE_TTL = 300; // seconds — fixtures/results change slowly
const TENNIS_TTL = 120; // seconds — in-play tournaments move faster

const LEAGUES: Record<string, string> = {
  "basketball/nba": "NBA",
  "basketball/wnba": "WNBA",
  "baseball/mlb": "MLB",
  "football/nfl": "NFL",
  "hockey/nhl": "NHL",
};

function dayStamp(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

const upstreamDiag: any[] = [];
// Returns { events, ok } — an upstream failure (non-200 or network/timeout)
// is reported as ok:false so callers can tell a genuine zero-fixture day from
// an API error; nothing is fabricated either way.
async function espn(path: string): Promise<{ events: any[]; ok: boolean }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(`${ESPN}/${path}`, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.espn.com/",
        },
      });
      if (!r.ok) {
        upstreamDiag.push({ path, status: r.status });
        return { events: [], ok: false };
      }
      const j = await r.json();
      const evs = Array.isArray(j?.events) ? j.events : [];
      upstreamDiag.push({ path, status: r.status, events: evs.length });
      return { events: evs, ok: true };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    upstreamDiag.push({ path, error: String(e?.message || e) });
    return { events: [], ok: false };
  }
}

// Only the fields the engine consumes (the same common event shape
// formFromResults / h2hOf read).
function normEvent(ev: any, league: string, label: string) {
  const comp = (ev?.competitions?.[0]?.competitors) || [];
  const home = comp.find((c: any) => c?.homeAway === "home");
  const away = comp.find((c: any) => c?.homeAway === "away");
  if (!home?.team?.displayName || !away?.team?.displayName) return null;
  return {
    idEvent: `espn-${ev?.id}`,
    idLeague: league,
    strLeague: label,
    dateEvent: String(ev?.date || "").slice(0, 10),
    strTimestamp: ev?.date || "",
    strHomeTeam: home.team.displayName,
    strAwayTeam: away.team.displayName,
    intHomeScore: home.score != null && home.score !== "" ? Number(home.score) : null,
    intAwayScore: away.score != null && away.score !== "" ? Number(away.score) : null,
    espnState: ev?.status?.type?.state || "",
  };
}

// AUTHORITATIVE PARTICIPANT NAME — resolved once at the source from the
// provider's own payload: the athlete's display name (singles) or the roster
// display name (doubles pairs). The raw provider id is retained internally as
// `providerId` for deterministic identity — it is NEVER shown as the
// customer-facing name. A participant with no verifiable name displays
// "Unknown Player", never "Player {provider id}".
function participantOf(x: any) {
  const roster = x?.roster;
  const rosterAthletes = Array.isArray(roster?.athletes)
    ? roster.athletes.map((a: any) => a?.displayName || a?.fullName || "").filter(Boolean).join(" / ")
    : "";
  const name =
    (x?.athlete && (x.athlete.displayName || x.athlete.fullName || x.athlete.shortName)) ||
    (roster && (roster.displayName || roster.shortDisplayName)) ||
    rosterAthletes ||
    "";
  return {
    name: String(name).trim() || "Unknown Player",
    providerId: String(x?.id || ""),
    winner: !!x?.winner,
    setsWon: Array.isArray(x?.linescores) ? x.linescores.filter((s: any) => s && s.winner === true).length : null,
  };
}

// One tennis match from a tournament's groupings — sets won are counted from
// the provider's own per-set linescores (a set counts when marked won), never
// derived from anything else.
function normMatch(ev: any, c: any) {
  const comps = (c?.competitors || [])
    .map(participantOf)
    .filter((x: any) => !!x.name);
  if (comps.length !== 2) return null;
  return {
    id: String(c?.id || `${ev?.id}-${comps[0].name}-${comps[1].name}`),
    tournament: ev?.name || "Tennis",
    date: String(c?.date || ev?.date || "").slice(0, 10),
    state: c?.status?.type?.state || (comps.some((x: any) => x.winner) ? "post" : "pre"),
    home: comps[0],
    away: comps[1],
  };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "league");

    if (mode === "tennis") {
      // PER-DATE SCOREBOARD REQUESTS — each rollover day queries its own date
      // (dates=YYYYMMDD, the same parameter the league scoreboards take), so
      // days 2-6 scan their own real drawn fixtures instead of today's board
      // alone. An empty future round reports 0 fixtures honestly — nothing is
      // ever fabricated.
      const rawDates: any[] = Array.isArray(body?.dates) ? body.dates : [];
      const dates: string[] = rawDates
        .map((d: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : ""))
        .filter(Boolean)
        .slice(0, 14);
      if (!dates.length) dates.push(new Date().toISOString().slice(0, 10));

      const cacheKey = `espn:tennis:${dates.join(",")}`;
      const cached = await readCache(base44, cacheKey, TENNIS_TTL);
      // Only a real array can serve from cache — a malformed/wrapped cache row
      // falls through and refetches live instead of emptying the engine's pools.
      if (cached?.fresh && Array.isArray(cached.data)) {
        return Response.json({
          dayStats: cached.meta?.dayStats || [],
          ok: cached.meta?.ok !== false,
          cached: true,
          matches: cached.data,
        });
      }

      const stamp = (d: string) => d.replace(/-/g, "");
      const scanned = await Promise.all(
        dates.map(async (d) => {
          const [atp, wta] = await Promise.all([
            espn(`tennis/atp/scoreboard?dates=${stamp(d)}`),
            espn(`tennis/wta/scoreboard?dates=${stamp(d)}`),
          ]);
          return { d, boards: [atp, wta], ok: atp.ok && wta.ok };
        })
      );

      const seen = new Set();
      const matches: any[] = [];
      const dayStats: any[] = [];
      for (const { d, boards, ok } of scanned) {
        let found = 0;
        for (const board of boards) {
          for (const ev of board.events) {
            for (const grp of ev?.groupings || []) {
              for (const c of grp?.competitions || []) {
                const m = normMatch(ev, c);
                if (!m || seen.has(m.id)) continue;
                seen.add(m.id);
                matches.push(m);
                found++;
              }
            }
          }
        }
        // Every requested date reports its own real fixture count and status,
        // so the engine can tell a genuinely empty round (0 fixtures drawn) from
        // an upstream failure — never conflated, never padded.
        dayStats.push({ date: d, fixtures: found, status: ok ? "success" : "api_error" });
      }
      const allOk = scanned.every((s) => s.ok);

      // Upstream unreachable — serve the stale cached copy rather than an
      // empty board; the next call retries live.
      if (!matches.length) {
        if (cached && Array.isArray(cached.data)) {
          return Response.json({ dayStats: cached.meta?.dayStats || [], ok: false, cached: true, stale: true, matches: cached.data });
        }
        return Response.json({ dayStats, ok: allOk, cached: false, matches: [] });
      }
      await writeCache(base44, cacheKey, "espn", matches, { dayStats, ok: allOk });
      return Response.json({ dayStats, ok: allOk, cached: false, matches });
    }

    const league = String(body?.league || "");
    const label = LEAGUES[league];
    if (!label) return Response.json({ error: "unknown league" }, { status: 400 });
    const pastDays = Math.min(14, Math.max(0, Number(body?.pastDays) || 0));
    const futureDays = Math.min(14, Math.max(1, Number(body?.futureDays) || 7));

    const cacheKey = `espn:${league}:${pastDays}:${futureDays}`;
    const cached = await readCache(base44, cacheKey, CACHE_TTL);
    if (cached?.fresh && Array.isArray(cached.data)) {
      return Response.json({ cached: true, league, events: cached.data, ok: cached.meta?.ok !== false });
    }

    const offsets: number[] = [];
    for (let i = -pastDays; i < futureDays; i++) offsets.push(i);
    const boards = await Promise.all(offsets.map((o) => espn(`${league}/scoreboard?dates=${dayStamp(o)}`)));
    const seen = new Set();
    const events: any[] = [];
    let allOk = true;
    for (const board of boards) {
      if (!board.ok) allOk = false;
      for (const ev of board.events) {
        const e = normEvent(ev, league, label);
        if (!e || seen.has(e.idEvent)) continue;
        seen.add(e.idEvent);
        events.push(e);
      }
    }
    // ok:false with zero events = the upstream league feed failed (an API
    // error, never a silent success); a genuine off-season returns real empty
    // lists with ok:true.
    if (!events.length) {
      if (cached && Array.isArray(cached.data)) return Response.json({ cached: true, stale: true, league, events: cached.data, ok: false });
      return Response.json({ cached: false, league, events: [], ok: allOk, diag: upstreamDiag });
    }
    await writeCache(base44, cacheKey, "espn", events, { ok: allOk });
    return Response.json({ cached: false, league, events, ok: allOk });
  } catch (error) {
    return Response.json({ error: error?.message || "unknown error" }, { status: 500 });
  }
}