import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { readCache, writeCache } from "../../shared/chunkedCache.ts";

// Server-side proxy for TheSportsDB's free public API (key "3"). In-browser
// calls to the public API fail intermittently (network/CORS throttling), and
// the shared free key rate-limits hard (HTTP 429) — so every fetch runs here,
// with one backoff retry per request, and ALL users share ONE fresh cached
// copy per sport (90s TTL). Failures never poison the cache: a fetch that
// fails upstream serves the stale cached copy instead, uncached.

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

// Marquee leagues per sport — only fetched on rest days (when the worldwide
// day schedule has almost nothing) so flagship competitions still appear.
const MARQUEE: Record<string, { id: string; name: string }[]> = {
  soccer: [
    { id: "4328", name: "English Premier League" }, { id: "4329", name: "English Championship" },
    { id: "4335", name: "Spanish La Liga" }, { id: "4331", name: "Italian Serie A" },
    { id: "4326", name: "German Bundesliga" }, { id: "4332", name: "French Ligue 1" },
    { id: "4480", name: "UEFA Champions League" }, { id: "4481", name: "UEFA Europa League" },
    { id: "4407", name: "Brazilian Serie A" }, { id: "4344", name: "MLS" },
  ],
  basketball: [
    { id: "4387", name: "NBA" }, { id: "4624", name: "EuroLeague" },
    { id: "4607", name: "Spanish Liga ACB" }, { id: "4605", name: "Turkish BSL" },
  ],
  tennis: [{ id: "4464", name: "ATP" }, { id: "4465", name: "WTA" }],
  american_football: [{ id: "4391", name: "NFL" }],
  baseball: [{ id: "4424", name: "MLB" }],
  ice_hockey: [{ id: "4380", name: "NHL" }],
  rugby: [{ id: "4462", name: "NRL" }, { id: "4459", name: "Premiership Rugby" }],
  motorsport: [{ id: "4370", name: "Formula 1" }],
  golf: [],
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

// Concurrency-limited runner — the shared free key rate-limits hard.
async function pooled(items: any[], fn: (x: any, i: number) => Promise<{ ok: boolean; events: any[] }>, concurrency: number) {
  const out: { ok: boolean; events: any[] }[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
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

    // The 7-day worldwide day schedule for this sport — every league that
    // plays, worldwide, on each of the next 7 days.
    const days = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      return dt.toISOString().slice(0, 10);
    });
    const dayResults = await pooled(days, (d) => tsd(`eventsday.php?d=${d}&s=${encodeURIComponent(cat)}`), 3);
    let events = dayResults.flatMap((r) => r.events);
    let anyOk = dayResults.some((r) => r.ok);

    // Rest days: pull marquee next/past so flagship leagues still appear —
    // but only when the day schedule actually came back (not on a throttle).
    if (anyOk && events.length < 8 && (MARQUEE[sport] || []).length) {
      const leagueResults = await pooled((MARQUEE[sport] || []).slice(0, 6), async (l) => {
        const [nx, ps] = await Promise.all([
          tsd(`eventsnextleague.php?id=${l.id}`),
          tsd(`eventspastleague.php?id=${l.id}`),
        ]);
        return { ok: nx.ok || ps.ok, events: [...nx.events, ...ps.events] };
      }, 2);
      events = [...events, ...leagueResults.flatMap((r) => r.events)];
      anyOk = anyOk || leagueResults.some((r) => r.ok);
    }

    // Upstream unreachable (throttled / network) — serve the stale cached
    // copy rather than an empty board, and DON'T refresh it, so the next call
    // retries live.
    if (!anyOk) {
      if (cached) {
        return Response.json({ cached: true, stale: true, sport, events: cached.data });
      }
      return Response.json({ cached: false, sport, events: [], rate_limited: true });
    }

    // Dedupe by event id, then slim for the cache + the response.
    const seen = new Set();
    const slimmed: any[] = [];
    for (const e of events) {
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