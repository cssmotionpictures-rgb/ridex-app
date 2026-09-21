import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { readCache, writeCache } from "../../shared/chunkedCache.ts";

// Zero-credit, keyless proxy to UNDERSTAT (https://understat.com) — the public
// expected-goals (xG) source used by the xG research enrichment layer. The
// API-Football plan does not carry recent-fixture queries, so xG form comes
// from here instead: no API key, no daily quota. One request per
// competition+season, cached 24h server-side, whitelisted leagues only.
//
// Two modes:
//  - LEAGUE (league + season): per-team RECENT verified xG aggregates (average
//    xG for/against over each team's last 5 finished matches) PLUS per-player
//    season aggregates (xG, xA, goals, assists, shots, key passes, minutes) for
//    the player-stats research dashboard. A team with fewer than 3 xG-carrying
//    matches is OMITTED, never zero-filled; a player with 0 minutes is dropped.
//  - PLAYER (playerId): the player's own page, parsed for per-match xG/xA/goal
//    history — the trend data behind the individual athlete dashboard. One
//    page fetch per player, cached 24h server-side.

const TTL = 86400; // 24h — xG form moves only when a team plays
const MIN_MATCHES = 3;
const LAST_N = 5;

const SLUGS = new Set([
  "EPL", "La_Liga", "Bundesliga", "Serie_A", "Ligue_1",
  "Eredivisie", "Primeira", "Segunda", "Championship", "RFPL",
]);

// Understat's league endpoint answers { dates, teams, players } where each
// team carries its full per-match history (xG, xGA per finished match).
function teamsOfLeague(data) {
  const teams = data?.teams && typeof data.teams === "object" ? Object.values(data.teams) : [];
  const out = [];
  for (const t of teams) {
    const history = Array.isArray(t?.history) ? t.history : [];
    const played = history.filter((h) => h && h.xG != null && h.xGA != null);
    if (played.length < MIN_MATCHES) continue;
    const recent = played.slice(-LAST_N);
    const avg = (key) =>
      Math.round((recent.reduce((s, h) => s + Number(h[key] || 0), 0) / recent.length) * 100) / 100;
    out.push({ name: t?.title || "", matches: played.length, xgFor: avg("xG"), xgAgainst: avg("xGA") });
  }
  return out;
}

// Per-player SEASON aggregates, projected to exactly what the player dashboard
// needs — no per-match history here (that is the player mode below).
function playersOfLeague(data) {
  const players = data?.players && typeof data.players === "object" ? Object.values(data.players) : [];
  const out = [];
  for (const p of players) {
    const minutes = Number(p?.time) || 0;
    if (!minutes || !p?.player_name) continue; // a player who never played is dropped, not zero-filled
    out.push({
      id: String(p?.id || ""),
      name: String(p.player_name),
      team: String(p?.team_title || ""),
      position: String(p?.position || ""),
      goals: Number(p?.goals) || 0,
      assists: Number(p?.assists) || 0,
      xG: Number(p?.xG) || 0,
      xA: Number(p?.xA) || 0,
      shots: Number(p?.shots) || 0,
      keyPasses: Number(p?.key_passes) || 0,
      minutes,
    });
  }
  return out;
}

async function fetchSeason(slug, season) {
  try {
    const r = await fetch(`https://understat.com/getLeagueData/${slug}/${season}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RIDE-X/Research/1.0)",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `https://understat.com/league/${slug}/${season}`,
      },
    });
    if (!r.ok) return { teams: [], players: [] };
    const data = await r.json().catch(() => null);
    return { teams: teamsOfLeague(data), players: playersOfLeague(data) };
  } catch {
    return { teams: [], players: [] };
  }
}

// Per-match row from the verified getPlayerMatches feed, projected to the
// fields the trend dashboard renders. Fields arrive as strings — numbers are
// coerced; a missing field is 0, never invented.
function mapMatchRow(r) {
  return {
    date: String(r?.date || ""),
    home: String(r?.h_team || ""),
    away: String(r?.a_team || ""),
    homeGoals: Number(r?.h_goals) || 0,
    awayGoals: Number(r?.a_goals) || 0,
    goals: Number(r?.goals) || 0,
    assists: Number(r?.assists) || 0,
    xG: Number(r?.xG) || 0,
    xA: Number(r?.xA) || 0,
    shots: Number(r?.shots) || 0,
    keyPasses: Number(r?.key_passes) || 0,
    minutes: Number(r?.time) || 0,
  };
}

// The player page is a client-side app — the per-match history comes from the
// site's own AJAX endpoint (main/getPlayerMatches/<id>), the same JSON feed
// the player page renders. Verified live before shipping; a parse failure is
// UNAVAILABLE, never fabricated.
async function fetchPlayerHistory(playerId) {
  try {
    const r = await fetch(`https://understat.com/main/getPlayerMatches/${playerId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `https://understat.com/player/${playerId}`,
      },
    });
    if (!r.ok) return { __diag: `http_${r.status}` };
    const data = await r.json().catch(() => null);
    const rows = Array.isArray(data) ? data
      : Array.isArray(data?.response?.matches) ? data.response.matches
      : Array.isArray(data?.matches) ? data.matches
      : Array.isArray(data?.data) ? data.data
      : null;
    if (!rows) return { __diag: "no_rows" };
    return { rows };
  } catch (e) {
    return { __diag: `fetch_error: ${e?.message || e}` };
  }
}

export default async function(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req);

    // PLAYER MODE — per-match trend history for one athlete
    const playerId = String(body.playerId || "");
    if (playerId) {
      if (!/^\d+$/.test(playerId)) {
        return Response.json({ error: "invalid player id" }, { status: 400 });
      }
      const cacheKey = `understat-player?${playerId}`;
      const cached = await readCache(base44, cacheKey, TTL);
      if (cached?.fresh) {
        return Response.json({ cached: true, data: cached.data, playerId });
      }
      const res = await fetchPlayerHistory(playerId);
      if (res?.__diag) {
        return Response.json({ error: "player history unavailable", diag: res.__diag, bodyKeys: res.bodyKeys || null, head: res.head || null }, { status: 404 });
      }
      const rows = res?.rows;
      if (!rows || !rows.length) {
        return Response.json({ error: "player history unavailable" }, { status: 404 });
      }
      const matches = rows.map(mapMatchRow);
      matches.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const data = { playerId, matches, sample: rows[0] };
      await writeCache(base44, cacheKey, "understat-player", data, cached?.meta);
      return Response.json({ cached: false, data, playerId });
    }

    // LEAGUE MODE — team aggregates (xG enrichment) + player aggregates
    const slug = String(body.league || "");
    const season = Number(body.season) || new Date().getUTCFullYear();
    if (!SLUGS.has(slug) || !Number.isFinite(season)) {
      return Response.json({ error: "invalid league" }, { status: 400 });
    }

    const cacheKey = `understat-xg-v2?${slug}&${season}`; // v2 — league cache now carries player aggregates too
    const cached = await readCache(base44, cacheKey, TTL);
    if (cached?.fresh) {
      return Response.json({ cached: true, data: cached.data, league: slug, season });
    }

    // The requested season first; the previous season is the fallback when the
    // new campaign has not produced enough finished xG-carrying matches yet.
    let res = await fetchSeason(slug, season);
    if (res.teams.length < 5) {
      const prev = await fetchSeason(slug, season - 1);
      if (prev.teams.length > res.teams.length) res = prev;
    }

    const data = { league: slug, season, teams: res.teams, players: res.players };
    if (res.teams.length || res.players.length) {
      await writeCache(base44, cacheKey, "understat-xg", data, cached?.meta);
    }
    return Response.json({ cached: false, data, league: slug, season });
  } catch (error) {
    console.error("understat-xg error:", error?.message || error);
    return Response.json({ error: error?.message || "unknown error" }, { status: 500 });
  }
}