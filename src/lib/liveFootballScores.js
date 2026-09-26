import { apiFootball, todayISO } from "@/lib/apiFootball";
import { statusOf, fmtTime } from "@/lib/sportsScores";

// API-FOOTBALL live scores — the flagship competitions: Premier League,
// Champions League, La Liga, Bundesliga, Serie A, Ligue 1, Turkish Süper Lig
// and Europa League. Everything runs in the browser through the cached
// api-football proxy, so the free external quota is never hammered and the
// key stays server-side.

// Bzzoiro league IDs (not API-Football IDs — bzzoiro uses its own numbering).
// 1 = Premier League (verified via Arsenal team_id 18).
export const MAJOR_LEAGUES = [
  { id: 1,  name: "Premier League" },
  { id: 2,  name: "Championship" },
  { id: 3,  name: "Serie A" },
  { id: 4,  name: "Bundesliga" },
  { id: 5,  name: "Ligue 1" },
  { id: 6,  name: "Champions League" },
  { id: 17, name: "Europa League" },
  { id: 28, name: "Süper Lig" },
];

const MAJOR_IDS = new Set(MAJOR_LEAGUES.map((l) => l.id));
const LIVE_STATUSES = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"];
const FT_STATUSES = ["FT", "AET", "PEN"];

// The proxy wraps the API-FOOTBALL body as { cached, data, endpoint }.
const extract = (body) => {
  const arr = body?.data?.response ?? body?.response;
  return Array.isArray(arr) ? arr : [];
};

export function mapFixture(f) {
  const s = (f.fixture?.status?.short || "NS").toUpperCase();
  const status = LIVE_STATUSES.includes(s) ? "live" : FT_STATUSES.includes(s) ? "ft" : "upcoming";
  const kickoff = f.fixture?.date ? new Date(f.fixture.date) : null;
  const home = f.teams?.home?.name || "Home";
  const away = f.teams?.away?.name || "Away";
  return {
    id: String(f.fixture?.id || `${home}-${away}-${s}`),
    leagueId: f.league?.id,
    league: f.league?.name || "",
    home,
    away,
    homeLogo: f.teams?.home?.logo || "",
    awayLogo: f.teams?.away?.logo || "",
    hs: f.goals?.home ?? null,
    as: f.goals?.away ?? null,
    status,
    statusShort: s,
    elapsed: f.fixture?.status?.elapsed ?? null,
    kickoff,
    localTime: kickoff && !isNaN(kickoff) ? kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    isMajor: MAJOR_IDS.has(f.league?.id),
    // TheSportsDB-compatible aliases so the watch player and other shared
    // match components keep working untouched.
    idEvent: String(f.fixture?.id || ""),
    strEvent: `${home} vs ${away}`,
    strHomeTeam: home,
    strAwayTeam: away,
    strLeague: f.league?.name || "",
    intHomeScore: f.goals?.home ?? null,
    intAwayScore: f.goals?.away ?? null,
    strStatus: s,
    strHomeTeamBadge: f.teams?.home?.logo || "",
    strAwayTeamBadge: f.teams?.away?.logo || "",
  };
}

// All matches currently in play — EVERY competition the feed carries, not
// just the major leagues. Any live game shows on the board; majors are
// ranked first by the board's sort.
export async function fetchLiveFixtures() {
  const body = await apiFootball("fixtures", { live: "all" });
  return extract(body).map(mapFixture);
}

// Today's full major-league card — finished, live and upcoming kickoffs.
export async function fetchTodayMajorFixtures() {
  const body = await apiFootball("fixtures", { date: todayISO() });
  return extract(body)
    .map(mapFixture)
    .filter((m) => m.isMajor);
}

// Card / penalty events for one live fixture. Goals are detected from score
// changes instead, so they never double-fire.
export async function fetchFixtureAlerts(fixtureId) {
  const body = await apiFootball("fixtures/events", { fixture: String(fixtureId) });
  const alerts = [];
  for (const ev of extract(body)) {
    const detail = ev.detail || "";
    const team = ev.team?.name || "";
    const player = ev.player?.name || "";
    const minute = ev.time?.elapsed ?? "";
    let type = null;
    if (ev.type === "card" && /red/i.test(detail)) type = "redcard";
    else if (ev.type === "card" && /yellow/i.test(detail)) type = "yellowcard";
    else if (ev.type === "goal" && /penalty/i.test(detail) && !/missed/i.test(detail)) type = "penalty";
    else if (ev.type === "goal" && !/missed/i.test(detail)) type = "goal"; // real scorer names for the spoken GOAL call
    if (!type) continue;
    alerts.push({
      id: `${fixtureId}-${minute}-${type}-${player || team}`,
      type,
      team,
      player,
      minute,
      detail,
    });
  }
  return alerts;
}

// Normalize a TheSportsDB event (other sports) into the same shape the
// API-FOOTBALL board renders — one render path for every sport.
export function mapTsdEvent(e) {
  const s = (e.strStatus || "").toUpperCase();
  return {
    ...e,
    id: String(e.idEvent || `${e.strEvent}-${e.dateEvent}-${e.strTime}`),
    leagueId: null,
    league: e.strLeague || "",
    home: e.strHomeTeam,
    away: e.strAwayTeam,
    homeLogo: e.strHomeTeamBadge || "",
    awayLogo: e.strAwayTeamBadge || "",
    hs: e.intHomeScore != null ? Number(e.intHomeScore) : null,
    as: e.intAwayScore != null ? Number(e.intAwayScore) : null,
    status: statusOf(e),
    statusShort: s,
    elapsed: /^\d+$/.test(s) ? Number(s) : null,
    kickoff: e.strTimestamp ? new Date(e.strTimestamp) : null,
    localTime: fmtTime(e.strTime),
    isMajor: false,
  };
}

export function matchStatusLabel(m) {
  if (m.status === "live") {
    const s = m.statusShort;
    if (s === "HT" || s === "ET" || s === "BT" || s === "P") return s;
    return m.elapsed != null ? `${m.elapsed}'` : "LIVE";
  }
  if (m.status === "ft") return m.statusShort || "FT";
  return m.localTime || "";
}