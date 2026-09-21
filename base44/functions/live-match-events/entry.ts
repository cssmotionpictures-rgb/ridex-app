import { secrets } from "base44:runtime";

// Fetches live match events (goals, penalties, red & yellow cards) from api-football.
// Free plan: 100 requests/day — this call uses 1 (live list) + up to 8 fixture-event
// fetches per invocation. Frontend polls on a throttled interval to respect the limit.
const API_BASE = "https://v3.football.api-sports.io";
const MAX_FIXTURES = 8; // cap per poll to stay within daily request limits

export default async function (req) {
  try {
    const apiKey = secrets.get("API_FOOTBALL_KEY");
    if (!apiKey) {
      return Response.json({ error: "api-football key not configured", events: [] }, { status: 503 });
    }

    const headers = { "x-apisports-key": apiKey };

    // 1. Get all currently live fixtures
    const liveRes = await fetch(`${API_BASE}/fixtures?live=all`, { headers });
    if (!liveRes.ok) {
      console.error("api-football live fetch failed:", liveRes.status, await liveRes.text().catch(() => ""));
      return Response.json({ error: "Live fixtures fetch failed", events: [] }, { status: 502 });
    }
    const liveData = await liveRes.json();
    const fixtures = (liveData.response || []).slice(0, MAX_FIXTURES);

    // 2. Fetch events for each live fixture in parallel
    const events = [];
    const eventPromises = fixtures.map(async (fx) => {
      const fixtureId = fx.fixture?.id;
      const home = fx.teams?.home?.name || "Home";
      const away = fx.teams?.away?.name || "Away";
      const league = fx.league?.name || "";
      try {
        const evRes = await fetch(`${API_BASE}/fixtures/events?fixture=${fixtureId}`, { headers });
        if (!evRes.ok) return;
        const evData = await evRes.json();
        for (const ev of evData.response || []) {
          const type = ev.type; // "card" | "goal" | "var" | "subst"
          const detail = ev.detail || "";
          const team = ev.team?.name || "";
          const player = ev.player?.name || "";
          const minute = ev.time?.elapsed ?? "";
          let alertType = null;
          if (type === "card" && /red/i.test(detail)) alertType = "redcard";
          else if (type === "card" && /yellow/i.test(detail)) alertType = "yellowcard";
          else if (type === "goal" && /penalty/i.test(detail) && !/missed/i.test(detail)) alertType = "penalty";
          else if (type === "goal" && !/missed/i.test(detail)) alertType = "goal";
          if (!alertType) continue;
          events.push({
            id: `${fixtureId}-${minute}-${alertType}-${player || team}`,
            type: alertType,
            team,
            player,
            minute,
            detail,
            fixture: `${home} vs ${away}`,
            league,
          });
        }
      } catch (e) {
        console.error(`events fetch failed for fixture ${fixtureId}:`, e.message);
      }
    });
    await Promise.all(eventPromises);

    return Response.json({ events, checkedFixtures: fixtures.length });
  } catch (error) {
    console.error("live-match-events error:", error.message);
    return Response.json({ error: error.message, events: [] }, { status: 500 });
  }
}