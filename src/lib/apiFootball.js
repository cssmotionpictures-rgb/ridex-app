import { base44 } from "@/api/base44Client";
import { fetchRss } from "@/lib/rssParser";

// API-FOOTBALL proxy helper for league data (standings, fixtures, scorers).
// Routed through the api-football backend function (cached, key kept server-side).
export async function apiFootball(endpoint, params = {}) {
  const res = await base44.functions.invoke("api-football", { endpoint, params });
  return res.data;
}

// Zero-credit football news — fetched directly in the browser from the BBC
// Sport Football / Sky Sports RSS feeds via a free CORS proxy, so it keeps
// working while backend functions are blocked by integration-credit exhaustion.
const NEWS_FEEDS = [
  { url: "https://feeds.bbci.co.uk/sport/football/rss.xml", name: "BBC Sport Football" },
  { url: "https://www.skysports.com/rss/12040", name: "Sky Sports Football" },
];

export async function footballNews() {
  for (const f of NEWS_FEEDS) {
    try {
      const items = await fetchRss(f.url, f.name);
      if (items.length) return { items, source: f.name };
    } catch (e) { /* try next feed */ }
  }
  return { items: [], source: "", error: "no feeds available" };
}

// API-FOOTBALL league IDs for the leagues Ride X surfaces.
export const LEAGUES = [
  { name: "Premier League", id: 39, country: "England" },
  { name: "La Liga", id: 140, country: "Spain" },
  { name: "Bundesliga", id: 78, country: "Germany" },
  { name: "Serie A", id: 135, country: "Italy" },
  { name: "Ligue 1", id: 61, country: "France" },
  { name: "Champions League", id: 2, country: "Europe" },
  { name: "Europa League", id: 3, country: "Europe" },
  { name: "World Cup Qualifiers (UEFA)", id: 848, country: "Europe" },
  { name: "AFCON Qualifiers", id: 610, country: "Africa" },
];

// API-FOOTBALL free plan only allows seasons 2022–2024 (server-enforced).
// Default to the latest available season so standings / top scorers / fixtures
// return real data. Bump this when the plan grants access to a newer season.
export const LATEST_SEASON = 2024;
export function currentSeason() {
  return LATEST_SEASON;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}