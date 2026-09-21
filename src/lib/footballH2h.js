// Zero-credit, client-side football head-to-head & form lookups via TheSportsDB
// free public API (key "3", CORS-enabled). No backend, no credits.
const KEY = "3";
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

export async function searchTeams(name) {
  if (!name || !name.trim()) return [];
  const j = await jget(`${BASE}/searchteams.php?t=${encodeURIComponent(name.trim())}`);
  return (j.teams || []).map((t) => ({
    id: t.idTeam,
    name: t.strTeam,
    short: t.strTeamShort || t.strAlternate,
    league: t.strLeague,
    leagueId: t.idLeague,
    badge: t.strBadge,
    stadium: t.strStadium,
    country: t.strCountry,
    desc: t.strDescriptionEN,
  }));
}

export async function lastEvents(teamId, n = 5) {
  const j = await jget(`${BASE}/eventslast.php?id=${teamId}`);
  return (j.results || []).slice(0, n).map((e) => ({
    id: e.idEvent,
    title: e.strEvent,
    date: e.dateEvent,
    time: e.strTime,
    league: e.strLeague,
    season: e.strSeason,
    thumb: e.strThumb,
    home: e.strHomeTeam,
    away: e.strAwayTeam,
    homeScore: e.intHomeScore,
    awayScore: e.intAwayScore,
    status: e.strStatus,
    poster: e.strPoster,
  }));
}

function resultFor(ev, teamName) {
  const hs = parseInt(ev.homeScore, 10);
  const as = parseInt(ev.awayScore, 10);
  if (isNaN(hs) || isNaN(as)) return null;
  const isHome = ev.home === teamName;
  const our = isHome ? hs : as;
  const opp = isHome ? as : hs;
  if (our > opp) return "W";
  if (our < opp) return "L";
  return "D";
}

// Compare two teams: returns form, recent meetings (head-to-head) pulled from
// each team's last events, and an aggregate H2H record. The free tier only
// exposes a team's last few events, so meetings are limited to recent ones —
// honest, never fabricated.
export async function headToHead(nameA, nameB) {
  const [aRes, bRes] = await Promise.all([searchTeams(nameA), searchTeams(nameB)]);
  const a = aRes[0];
  const b = bRes[0];
  if (!a || !b) return { notFound: { a: !a, b: !b } };
  const [evsA, evsB] = await Promise.all([lastEvents(a.id, 5), lastEvents(b.id, 5)]);
  const formA = evsA.map((e) => resultFor(e, a.name)).filter(Boolean);
  const formB = evsB.map((e) => resultFor(e, b.name)).filter(Boolean);

  const seen = new Set();
  const meetings = [];
  for (const e of [...evsA, ...evsB]) {
    const isH2H =
      (e.home === a.name && e.away === b.name) ||
      (e.home === b.name && e.away === a.name);
    if (!isH2H || seen.has(e.id)) continue;
    seen.add(e.id);
    const hs = parseInt(e.homeScore, 10);
    const as = parseInt(e.awayScore, 10);
    const played = !isNaN(hs) && !isNaN(as);
    let winner = null;
    if (played) {
      if (hs > as) winner = e.home;
      else if (as > hs) winner = e.away;
      else winner = "draw";
    }
    meetings.push({ ...e, homeScore: hs, awayScore: as, played, winner });
  }
  meetings.sort((x, y) => (y.date || "").localeCompare(x.date || ""));

  let aWins = 0, bWins = 0, draws = 0;
  for (const m of meetings) {
    if (!m.played) continue;
    if (m.winner === "draw") draws++;
    else if (m.winner === a.name) aWins++;
    else if (m.winner === b.name) bWins++;
  }

  return { a, b, formA, formB, meetings, aWins, bWins, draws, recentA: evsA, recentB: evsB };
}

export const POPULAR_TEAMS = [
  "Arsenal", "Liverpool", "Chelsea", "Manchester United", "Manchester City",
  "Tottenham", "Barcelona", "Real Madrid", "Atletico Madrid", "PSG",
  "Bayern Munich", "Dortmund", "Juventus", "Inter", "AC Milan", "Napoli",
];