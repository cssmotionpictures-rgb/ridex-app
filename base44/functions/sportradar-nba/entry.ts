// SPORTSRADAR NBA — production schedule proxy.
// Real NBA fixture data (game ids, teams, venues, tip-off times) straight
// from the builder's production NBA key, TTL-cached per day. No synthetic
// or demo data ever — a failed day is reported as failed.

import { secrets } from "base44:runtime";

const BASE = "https://api.sportradar.com/nba/production/v8/en";
const TTL_MS = 30 * 60 * 1000;
const cache = new Map(); // ISO day -> { at, games }

const dayKey = (d) => d.toISOString().slice(0, 10);

async function fetchDay(iso, apiKey) {
  const hit = cache.get(iso);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.games;
  const url = `${BASE}/games/${iso.replaceAll("-", "/")}/schedule.json?api_key=${apiKey}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`sportradar nba http ${res.status}`);
  const data = await res.json();
  const games = (data?.games || [])
    .map((g) => ({
      id: g?.id || "",
      date: g?.scheduled ? dayKey(new Date(g.scheduled)) : iso,
      scheduled: g?.scheduled || null,
      home: g?.home?.name || g?.home?.alias || "",
      away: g?.away?.name || g?.away?.alias || "",
      venue: g?.venue?.name || "",
      status: g?.status || "scheduled",
      league: "NBA",
    }))
    .filter((g) => g.home && g.away);
  cache.set(iso, { at: Date.now(), games });
  return games;
}

export default async function(req) {
  try {
    const apiKey = secrets.get("SPORTRADAR_NBA_KEY");
    if (!apiKey) return Response.json({ error: "NBA key not configured" }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body?.days) || 7, 1), 8);
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const games = [];
    const failed = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < days; i++) {
      const iso = dayKey(new Date(start.getTime() + i * 86400000));
      try {
        games.push(...(await fetchDay(iso, apiKey)));
      } catch (e) {
        // Sportradar paces ~1 request/sec — one spaced retry before giving up
        await sleep(1200);
        try {
          games.push(...(await fetchDay(iso, apiKey)));
        } catch (e2) {
          failed.push(iso); // reported honestly, never padded
        }
      }
      if (i < days - 1) await sleep(1100); // stay inside the provider rate limit
    }
    return Response.json({ games, failed, source: "sportradar-nba-production" });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}