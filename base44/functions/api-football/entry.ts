import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from "base44:runtime";
import { readCache, writeCache } from "../../shared/chunkedCache.ts";

// Zero-credit proxy to API-FOOTBALL (api-sports.io). Every response is cached
// in the ApiFootballCache entity — CHUNKED, because entity fields cap around
// ~32KB (whole payloads used to silently fail to cache, which bled the free
// plan's 100 req/day quota). TTLs are tuned per endpoint AND per fixture
// params so the quota is never wasted on slow-moving data.

const API_BASE = "https://v3.football.api-sports.io";

// base TTLs in seconds — "fixtures" uses ttlFor() for param-aware freshness
const TTLS = {
  "standings": 3600,                // 1 hour
  "players": 3600,
  "players/topscorers": 3600,
  "players/topassists": 3600,
  "players/topyellowcards": 3600,
  "players/topredcards": 3600,
  "teams": 86400,                   // 24h — static-ish club info
  "teams/statistics": 86400,
  "leagues": 86400,
  "fixtures/events": 900,           // 15 min — card/penalty scan (quota-friendly)
  "fixtures/lineups": 300,          // 5 min — confirmed XI near kickoff (RX-2.1 challenger)
  "fixtures/headtohead": 21600,     // 6 h — H2H history + upcoming meeting (value engine)
  "fixtures/statistics": 86400,     // 24 h — full-time match stats
  "odds": 1800,                     // 30 min — real bookmaker prices
  "predictions": 21600,             // 6 h — API-Football match prediction
  "injuries": 21600,                // 6 h — sidelined players per fixture
};

const ALLOWED = new Set([...Object.keys(TTLS), "fixtures"]);

// Free plan: fixtures?live=all is the only real-time route worth its quota;
// team+season form data barely changes; the day card is static until kickoffs.
function ttlFor(endpoint: string, params: Record<string, string>): number {
  if (endpoint === "fixtures") {
    if (params.live) return 300;                    // live scores — 5 min
    if (params.team && params.season) return 21600;  // season form data — 6 h
    if (params.league && params.season && params.from) return 21600; // worldwide season-window scans — form data barely changes
    if (params.date) return 1800;                   // day card — 30 min
    return 900;
  }
  return TTLS[endpoint] ?? 600;
}

// ---- payload slimming: cache only the fields the app actually consumes ----
function slimFixture(f: any) {
  return {
    fixture: { id: f?.fixture?.id, date: f?.fixture?.date, referee: undefined, status: { short: f?.fixture?.status?.short, elapsed: f?.fixture?.status?.elapsed } },
    league: { id: f?.league?.id, name: f?.league?.name, season: f?.league?.season, country: f?.league?.country, round: f?.league?.round },
    teams: {
      home: { id: f?.teams?.home?.id, name: f?.teams?.home?.name, logo: f?.teams?.home?.logo, winner: f?.teams?.home?.winner },
      away: { id: f?.teams?.away?.id, name: f?.teams?.away?.name, logo: f?.teams?.away?.logo, winner: f?.teams?.away?.winner },
    },
    goals: { home: f?.goals?.home, away: f?.goals?.away },
  };
}
function slimTeamRow(r: any) {
  return { team: { id: r?.team?.id, name: r?.team?.name, logo: r?.team?.logo, country: r?.team?.country } };
}
function slim(endpoint: string, data: any) {
  if (!data || !Array.isArray(data.response)) return data;
  if (endpoint === "fixtures" || endpoint === "fixtures/headtohead") {
    return { ...data, response: data.response.map(slimFixture) };
  }
  if (endpoint === "teams") {
    return { ...data, response: data.response.map(slimTeamRow) };
  }
  return data; // events / odds / predictions / injuries / statistics kept whole
}

// readCache/writeCache live in the shared chunkedCache module (also used by
// the TheSportsDB proxy).

// ---- free-plan pacing: never burst past the upstream per-minute limit ------
const hitWindow: number[] = [];
async function paceUpstream() {
  try {
    const now = Date.now();
    while (hitWindow.length && now - hitWindow[0] > 60000) hitWindow.shift();
    if (hitWindow.length >= 8) {
      const waitMs = 60000 - (Date.now() - hitWindow[0]) + 250;
      if (waitMs > 0 && waitMs < 25000) await new Promise((r) => setTimeout(r, waitMs));
    }
    hitWindow.push(Date.now());
  } catch { /* best effort */ }
}

export default async function(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const endpoint = String(body.endpoint || "").trim();
    const params = body.params && typeof body.params === "object" ? body.params : {};
    if (!endpoint || !ALLOWED.has(endpoint)) {
      return Response.json({ error: "invalid endpoint" }, { status: 400 });
    }

    // normalize params — drop empties, stringify values
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined || v === "") continue;
      clean[k] = String(v);
    }
    const qs = new URLSearchParams(clean).toString();
    const cacheKey = `${endpoint}?${qs}`;
    const ttl = ttlFor(endpoint, clean);

    const base44 = createClientFromRequest(req);

    // 1. read cache (fresh hit returns immediately)
    const cachedHit = await readCache(base44, cacheKey, ttl);
    if (cachedHit?.fresh) {
      return Response.json({ cached: true, data: cachedHit.data, endpoint, params: clean });
    }

    // 2. fetch from API-FOOTBALL — the main key ONLY. The secondary key is
    // permanently dead ("Missing application key") and retrying dead
    // credentials burns the upstream per-minute budget, so it is removed
    // from rotation. The key's response body is still checked because an
    // invalid/expired key answers HTTP 200 with an errors object.
    const keys = [secrets.get("API_FOOTBALL_KEY")].filter(Boolean);
    if (!keys.length) return Response.json({ error: "api-football key not configured" }, { status: 503 });

    let data = null;
    let lastError = "";
    // Two passes max — cold-start hiccups and per-minute rate limits are
    // transient; one paced retry clears them instead of surfacing a 502.
    // The daily request limit is NOT transient (it resets at midnight UTC) —
    // that error fails fast so callers fall back immediately instead of
    // burning ~15s of retry waits.
    let dailyLimit = false;
    let planRestricted = false;
    for (let attempt = 0; attempt < 2 && !data && !dailyLimit; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 6000));
      for (const apiKey of keys) {
        try {
          await paceUpstream();
          const r = await fetch(`${API_BASE}/${endpoint}?${qs}`, { headers: { "x-apisports-key": apiKey } });
          if (!r.ok) {
            lastError = `api-football ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`;
            continue;
          }
          const upBody = await r.json();
          const errs = upBody?.errors;
          if (errs && Object.keys(errs).length > 0) {
            // plan-tier restrictions (free plans only cover a ~3-day fixture
            // window) are legitimate empty results — return them as an empty
            // response instead of treating the key as dead
            if (errs.plan) {
              data = slim(endpoint, { ...upBody, response: [], results: 0 });
              planRestricted = true;
              break;
            }
            lastError = JSON.stringify(errs).slice(0, 200);
            console.error("api-football rejected key:", lastError);
            if (/request limit for the day/i.test(lastError)) dailyLimit = true;
            continue;
          }
          data = slim(endpoint, upBody);
          break;
        } catch (e) {
          lastError = String(e?.message || e);
        }
      }
    }

    if (!data) {
      console.error("api-football unavailable:", lastError);
      // rate limits, dead keys, or network failure — serve stale cache rather
      // than failing the UI.
      if (cachedHit) {
        return Response.json({ cached: true, stale: true, data: cachedHit.data, endpoint, params: clean });
      }
      return Response.json({ error: `api-football unavailable: ${lastError}`, data: { response: [] } }, { status: 502 });
    }

    // 3. upsert cache (chunked, best effort) — never cache empty error bodies
    const hasResults = Array.isArray(data?.response) ? data.response.length > 0 : (data?.results > 0);
    // plan-tier restrictions are AUTHORITATIVE empty answers — cache them too,
    // otherwise out-of-plan requests (e.g. worldwide season windows on a free
    // plan) would re-fetch every TTL and burn the daily quota.
    if (hasResults || planRestricted) {
      await writeCache(base44, cacheKey, endpoint, data, cachedHit?.meta);
    }

    return Response.json({ cached: false, data, endpoint, params: clean });
  } catch (error) {
    console.error("api-football error:", error?.message || error);
    return Response.json({ error: error?.message || "unknown error" }, { status: 500 });
  }
}