// In-browser, credit-free football data for the Stats Hub.
// Standings + results are computed from the openfootball/football.json GitHub
// repo (served through the jsDelivr CDN — CORS-friendly, keyless, no backend,
// no integration credits). Live upcoming fixtures come from TheSportsDB's free
// key. Together they keep the Stats Hub 100% in-browser while the workspace is
// out of integration credits (the api-football server function is paused).

const CDN_BASE = "https://cdn.jsdelivr.net/gh/openfootball/football.json@master";
const TSD_BASE = "https://www.thesportsdb.com/api/v1/json/3";

// Seasons tried in order — the current (2026-27) season has no openfootball data
// yet, so we fall back to the most recent COMPLETE season for standings/results.
const SEASONS = ["2025-26", "2024-25"];

export const LEAGUES = [
  { key: "en.1", label: "Premier League", country: "England", tsd: "4328", inBrowser: true },
  { key: "es.1", label: "La Liga", country: "Spain", tsd: "4335", inBrowser: true },
  { key: "de.1", label: "Bundesliga", country: "Germany", tsd: "4326", inBrowser: true },
  { key: "it.1", label: "Serie A", country: "Italy", tsd: "4331", inBrowser: true },
  { key: "fr.1", label: "Ligue 1", country: "France", tsd: "4332", inBrowser: true },
  { key: "ucl", label: "Champions League", country: "Europe", tsd: "4480", inBrowser: false },
  { key: "uel", label: "Europa League", country: "Europe", tsd: "4481", inBrowser: false },
  { key: "wcq", label: "WC Qualifiers (UEFA)", country: "Europe", tsd: "848", inBrowser: false },
  { key: "afcon", label: "AFCON Qualifiers", country: "Africa", tsd: "610", inBrowser: false },
];

const seasonCache = {};
export async function getSeasonMatches(code) {
  if (seasonCache[code]) return seasonCache[code];
  for (const yr of SEASONS) {
    try {
      const d = await fetch(`${CDN_BASE}/${yr}/${code}.json`).then((r) => r.json());
      if (d && Array.isArray(d.matches) && d.matches.length) {
        seasonCache[code] = { matches: d.matches, season: yr, name: d.name || "" };
        return seasonCache[code];
      }
    } catch {}
  }
  return { matches: [], season: SEASONS[0], name: "" };
}

// Full league table computed in-browser from completed match results.
export function computeStandings(matches) {
  const t = {};
  const get = (n) => (t[n] ||= { team: n, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  for (const m of matches) {
    if (!m.score || !m.score.ft) continue;
    const [h, a] = m.score.ft;
    const H = get(m.team1), A = get(m.team2);
    H.p++; A.p++; H.gf += h; H.ga += a; A.gf += a; A.ga += h;
    if (h > a) { H.w++; A.l++; H.pts += 3; }
    else if (h < a) { A.w++; H.l++; A.pts += 3; }
    else { H.d++; A.d++; H.pts++; A.pts++; }
  }
  return Object.values(t)
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team));
}

export function getResults(matches) {
  return matches
    .filter((m) => m.score && m.score.ft)
    .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));
}

// Last-5 W/D/L form string for a team, computed from results.
export function teamForm(matches, team) {
  const played = matches
    .filter((m) => m.score && m.score.ft && (m.team1 === team || m.team2 === team))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-5);
  return (
    played
      .map((m) => {
        const [h, a] = m.score.ft;
        const home = m.team1 === team;
        const gf = home ? h : a, ga = home ? a : h;
        return gf > ga ? "W" : gf < ga ? "L" : "D";
      })
      .join("") || "—"
  );
}

// Real upcoming fixtures from TheSportsDB (current-season openers etc.),
// complementing openfootball's completed-season data.
export async function getUpcoming(tsdId) {
  try {
    const j = await fetch(`${TSD_BASE}/eventsnextleague.php?id=${tsdId}`).then((r) => r.json());
    return (j.events || []).map((e) => ({
      date: e.dateEvent,
      time: (e.strTime || "").slice(0, 5),
      team1: e.strHomeTeam,
      team2: e.strAwayTeam,
      status: e.strStatus || "NS",
    }));
  } catch {
    return [];
  }
}