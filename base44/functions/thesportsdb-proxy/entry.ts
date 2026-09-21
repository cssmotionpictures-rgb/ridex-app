import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { readCache, writeCache } from "../../shared/chunkedCache.ts";

// Server-side proxy for TheSportsDB's free public API (key "3"). In-browser
// calls fail intermittently (network/CORS throttling) and the shared free key
// rate-limits hard (HTTP 429), so this proxy is deliberately MINIMAL: two
// eventsday requests per sport (today + tomorrow — every league worldwide),
// one backoff retry per request, and ALL users share ONE fresh cached copy
// (90s TTL). Failures never poison the cache: a fetch that fails upstream
// serves the stale cached copy instead, uncached. The frontend falls back to
// its own light browser fetch when even this is throttled.

const BASE = "https://www.thesportsdb.com/api/v1/json/3";
const CACHE_TTL = 90; // seconds

// Sport keys the app's switcher offers → TheSportsDB category names.
const SPORTS: Record<string, string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  tennis: "Tennis",
  american_football: "American Football",
  baseball: "Baseball",
  ice_hockey: "Ice Hockey",
  rugby: "Rugby League",
  motorsport: "Motorsport",
  golf: "Golf",
};

// Only the fields the app renders — slimming keeps chunked cache writes small.
function slimEvent(e: any) {
  if (!e) return null;
  return {
    idEvent: e.idEvent || null,
    strEvent: e.strEvent || "",
    strLeague: e.strLeague || "",
    idLeague: e.idLeague || null,
    strSport: e.strSport || "",
    strHomeTeam: e.strHomeTeam || "",
    strAwayTeam: e.strAwayTeam || "",
    strHomeTeamBadge: e.strHomeTeamBadge || "",
    strAwayTeamBadge: e.strAwayTeamBadge || "",
    intHomeScore: e.intHomeScore != null ? Number(e.intHomeScore) : null,
    intAwayScore: e.intAwayScore != null ? Number(e.intAwayScore) : null,
    strStatus: e.strStatus || "",
    strTimestamp: e.strTimestamp || "",
    strTime: e.strTime || "",
    dateEvent: e.dateEvent || "",
    intRound: e.intRound || null,
    strVenue: e.strVenue || "",
    strCountry: e.strCountry || "",
  };
}

// One upstream GET with a single backoff retry on throttle (429). Returns
// { ok, events } — ok=false means the request genuinely failed upstream.
async function tsd(path: string): Promise<{ ok: boolean; events: any[] }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${BASE}/${path}`);
      if (r.status === 429 && attempt === 0) {
        const wait = Math.min(6000, (Number(r.headers.get("retry-after")) || 4) * 1000);
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }
      if (!r.ok) return { ok: false, events: [] };
      const j = await r.json();
      return { ok: true, events: Array.isArray(j?.events) ? j.events : [] };
    } catch {
      return { ok: false, events: [] };
    }
  }
  return { ok: false, events: [] };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const sport = String(body?.sport || "soccer");
    const cat = SPORTS[sport];
    if (!cat) return Response.json({ error: "unknown sport" }, { status: 400 });

    const cacheKey = `tsd:events:${sport}`;
    const cached = await readCache(base44, cacheKey, CACHE_TTL);
    if (cached?.fresh) {
      return Response.json({ cached: true, sport, events: cached.data });
    }

    // Today + tomorrow only — two requests, worldwide coverage per day.
    const days = [0, 1].map((d) => {
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      return dt.toISOString().slice(0, 10);
    });
    const results = await Promise.all(days.map((d) => tsd(`eventsday.php?d=${d}&s=${encodeURIComponent(cat)}`)));
    const anyOk = results.some((r) => r.ok);

    // Upstream unreachable (throttled / network) — serve the stale cached
    // copy rather than an empty board, and DON'T refresh it, so the next call
    // retries live. The frontend falls back to its own browser fetch when it
    // receives this.
    if (!anyOk) {
      if (cached) {
        return Response.json({ cached: true, stale: true, sport, events: cached.data });
      }
      return Response.json({ cached: false, sport, events: [], rate_limited: true });
    }

    // Dedupe by event id, then slim for the cache + the response.
    const seen = new Set();
    const slimmed: any[] = [];
    for (const e of results.flatMap((r) => r.events)) {
      if (!e) continue;
      const id = e.idEvent || `${e.strEvent}-${e.dateEvent}-${e.strTime}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const s = slimEvent(e);
      if (s) slimmed.push(s);
    }

    await writeCache(base44, cacheKey, "thesportsdb", slimmed, cached?.meta);

    return Response.json({ cached: false, sport, events: slimmed });
  } catch (error) {
    return Response.json({ error: error?.message || "unknown error" }, { status: 500 });
  }
}