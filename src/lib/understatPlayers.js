import { base44 } from "@/api/base44Client";

// Keyless expected-goals (xG) source served by the `understat-xg` backend
// function: per-player SEASON aggregates for the leaderboard, per-MATCH history
// for the profile trend view. Failures THROW — the UI shows an honest
// "unavailable" state, never zero-filled numbers. Provider names stay internal.

export const XG_LEAGUES = [
  { slug: "EPL", label: "Premier League", country: "England" },
  { slug: "La_Liga", label: "La Liga", country: "Spain" },
  { slug: "Bundesliga", label: "Bundesliga", country: "Germany" },
  { slug: "Serie_A", label: "Serie A", country: "Italy" },
  { slug: "Ligue_1", label: "Ligue 1", country: "France" },
  { slug: "Eredivisie", label: "Eredivisie", country: "Netherlands" },
  { slug: "Primeira", label: "Primeira Liga", country: "Portugal" },
  { slug: "Championship", label: "Championship", country: "England" },
  { slug: "Segunda", label: "La Liga 2", country: "Spain" },
  { slug: "RFPL", label: "Russian Premier Liga", country: "Russia" },
];

export const currentXgSeason = () => new Date().getFullYear();

const seasonCache = new Map();

// League mode — every player's season aggregates (goals, xG, assists, xA,
// shots, key passes, minutes). Promise-cached per league+season so switching
// back and forth costs one call, not a re-fetch each time.
export async function getXgLeaguePlayers(slug, season) {
  const key = `${slug}|${season}`;
  if (seasonCache.has(key)) return seasonCache.get(key);
  const req = (async () => {
    const res = await base44.functions.invoke("understat-xg", { league: slug, season });
    const payload = res?.data?.data || res?.data || {};
    const players = Array.isArray(payload?.players) ? payload.players : [];
    if (!players.length) throw new Error("No player data available for this league right now.");
    return { players, season: payload?.season || season };
  })();
  seasonCache.set(key, req.catch((e) => { seasonCache.delete(key); throw e; }));
  return req;
}

// Player mode — the player's per-match history (date, fixture, score, goals,
// xG, xA, shots, minutes) behind the trend charts.
export async function getPlayerXgHistory(playerId) {
  const res = await base44.functions.invoke("understat-xg", { playerId: String(playerId) });
  const payload = res?.data?.data || res?.data || {};
  if (res?.data?.error || payload?.error) throw new Error("Player history unavailable right now.");
  const matches = Array.isArray(payload?.matches) ? payload.matches : [];
  if (!matches.length) throw new Error("Player history unavailable right now.");
  return { matches };
}