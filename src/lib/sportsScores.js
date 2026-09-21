// Shared TheSportsDB helpers — REAL fixtures & scores across every league the
// free public API tracks, worldwide, for multiple sports. Fetched through the
// cached server-side proxy (thesportsdb-proxy) — only live/real data.
import { base44 } from "@/api/base44Client";

export const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = String(Number(h)).padStart(2, "0");
  return `${hh}:${m}`;
};

export const statusOf = (e) => {
  const s = (e.strStatus || "").toUpperCase();
  if (s === "FT" || s === "FINISHED" || s === "AET" || s === "PEN") return "ft";
  if (s === "NS" || s === "" || s === "POSTPONED" || s === "CANCELLED" || s === "NOT STARTED") return "upcoming";
  // in-play: "1H", "HT", "2H", "ET", "BT", "P", "LIVE", or a minute number
  return "live";
};

export const statusLabel = (e) => {
  const s = (e.strStatus || "").toUpperCase();
  if (s === "FT") return "FT";
  if (s === "AET") return "AET";
  if (s === "PEN") return "PEN";
  if (s === "HT") return "HT";
  if (s === "1H" || s === "2H" || s === "ET" || s === "BT") return s;
  if (/^\d+$/.test(s)) return `${s}'`;
  if (s === "POSTPONED") return "PPD";
  if (s === "CANCELLED") return "CANC";
  return s || "—";
};

// All sports the live-scores switcher offers. `path` is the TheSportsDB category
// string used by eventsday.php. The breadth comes from eventsday (every league
// worldwide that plays that day for the sport); the marquee list below ensures
// flagship leagues always show on their off days too.
export const SPORTS = [
  { key: "soccer", label: "⚽ Soccer", path: "Soccer" },
  { key: "basketball", label: "🏀 Basketball", path: "Basketball" },
  { key: "tennis", label: "🎾 Tennis", path: "Tennis" },
  { key: "american_football", label: "🏈 Am. Football", path: "American Football" },
  { key: "baseball", label: "⚾ Baseball", path: "Baseball" },
  { key: "ice_hockey", label: "🏒 Ice Hockey", path: "Ice Hockey" },
  { key: "rugby", label: "🏉 Rugby", path: "Rugby League" },
  { key: "motorsport", label: "🏎️ Motorsport", path: "Motorsport" },
  { key: "golf", label: "⛳ Golf", path: "Golf" },
];

// Marquee leagues per sport — next + recent-finished always pulled so flagship
// competitions appear even on rest days. IDs are TheSportsDB league ids; any that
// the free key doesn't serve return empty gracefully (no breakage).
const MARQUEE = {
  soccer: [
    { id: "4328", name: "English Premier League" },
    { id: "4329", name: "English Championship" },
    { id: "4335", name: "Spanish La Liga" },
    { id: "4331", name: "Italian Serie A" },
    { id: "4326", name: "German Bundesliga" },
    { id: "4332", name: "French Ligue 1" },
    { id: "4480", name: "UEFA Champions League" },
    { id: "4481", name: "UEFA Europa League" },
    { id: "4482", name: "UEFA Conference League" },
    { id: "4337", name: "Dutch Eredivisie" },
    { id: "4330", name: "Portuguese Primeira Liga" },
    { id: "4336", name: "Scottish Premiership" },
    { id: "4350", name: "Greek Super League" },
    { id: "4358", name: "Danish Superliga" },
    { id: "4359", name: "Belgian Pro League" },
    { id: "4364", name: "Turkish Super Lig" },
    { id: "4407", name: "Brazilian Serie A" },
    { id: "4400", name: "Argentine Primera Division" },
    { id: "4402", name: "Mexican Liga MX" },
    { id: "4344", name: "MLS" },
    { id: "4346", name: "Australian A-League" },
    { id: "4521", name: "Norwegian Eliteserien" },
    { id: "4522", name: "Swedish Allsvenskan" },
    { id: "4356", name: "Russian Premier League" },
    { id: "4354", name: "Polish Ekstraklasa" },
  ],
  basketball: [
    { id: "4387", name: "NBA" },
    { id: "4624", name: "EuroLeague" },
    { id: "4607", name: "Spanish Liga ACB" },
    { id: "4605", name: "Turkish BSL" },
  ],
  tennis: [
    { id: "4464", name: "ATP" },
    { id: "4465", name: "WTA" },
  ],
  american_football: [{ id: "4391", name: "NFL" }],
  baseball: [{ id: "4424", name: "MLB" }],
  ice_hockey: [{ id: "4380", name: "NHL" }],
  rugby: [{ id: "4462", name: "NRL" }, { id: "4459", name: "Premiership Rugby" }],
  motorsport: [{ id: "4370", name: "Formula 1" }],
  golf: [],
};

// Back-compat export for any code still importing the old name.
export const MAJOR_LEAGUES = MARQUEE.soccer;

// Real fixtures & scores for a sport — today + tomorrow worldwide
// (eventsday.php returns every league that plays on a day). Two light sources
// in order: the cached server-side thesportsdb-proxy (all users share ONE
// fresh copy per sport), then a minimal 2-request browser fallback for when
// the proxy itself is throttled. The shared free key rate-limits hard, so no
// path ever fans out. Default sport = soccer (back-compat).
const TSD_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const browserCache = new Map(); // sport -> { at, events } — 60s, stops stacked polls

async function tsdDayInBrowser(cat, day) {
  try {
    const r = await fetch(`${TSD_BASE}/eventsday.php?d=${day}&s=${encodeURIComponent(cat)}`);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.events) ? j.events : [];
  } catch {
    return [];
  }
}

export async function fetchSportsEvents(sport = "soccer") {
  const cat = SPORTS.find((x) => x.key === sport)?.path || "Soccer";
  const mem = browserCache.get(sport);
  if (mem && Date.now() - mem.at < 60000) return mem.events;

  let events = [];
  try {
    const res = await base44.functions.invoke("thesportsdb-proxy", { sport });
    events = res?.data?.events || [];
  } catch { /* fall through to the browser path */ }
  if (!events.length) {
    const days = [0, 1].map((d) => {
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      return dt.toISOString().slice(0, 10);
    });
    events = (await Promise.all(days.map((d) => tsdDayInBrowser(cat, d)))).flat();
  }

  const seen = new Set();
  const deduped = events.filter((e) => {
    const id = e.idEvent || `${e.strEvent}-${e.dateEvent}-${e.strTime}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  browserCache.set(sport, { at: Date.now(), events: deduped });
  return deduped;
}

// Marquee-league list for a given sport (used by UI filters / pick engine).
export function marqueeLeagues(sport = "soccer") {
  return MARQUEE[sport] || [];
}