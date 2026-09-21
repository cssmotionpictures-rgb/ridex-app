// Official, legal football viewing sources + league catalog for Ride X Live Sports.

export const LEAGUES = [
  "All",
  "Premier League",
  "Champions League",
  "La Liga",
  "Bundesliga",
  "Serie A",
  "Ligue 1",
  "FIFA World Cup 2026",
  "FA Cup",
  "Copa America",
  "African Cup of Nations",
];

// Free / official platforms. Ride X links out to each provider — it does not host their streams.
export const OFFICIAL_SOURCES = [
  { name: "SportyTV", url: "https://www.youtube.com/@SportyTVAfrica", covers: "Premier League, Bundesliga, Serie A", note: "Free YouTube channel", emoji: "📺", color: "#ff0000" },
  { name: "ServusTV", url: "https://www.servustv.com", covers: "52 World Cup 2026 matches", note: "Free app & web", emoji: "🟥", color: "#e11d48" },
  { name: "FIFA+", url: "https://www.fifa.com/fifaplus", covers: "Replays, highlights, classic matches", note: "Official FIFA platform", emoji: "🏆", color: "#1e6f5c" },
  { name: "FIFA YouTube", url: "https://www.youtube.com/@FIFA", covers: "Live highlights, full replays", note: "Official FIFA channel", emoji: "▶️", color: "#ff0000" },
  { name: "DAZN", url: "https://www.dazn.com", covers: "Serie A, FIFA+ free tier", note: "Free access available", emoji: "🎬", color: "#f8e71c" },
  { name: "RedNote", url: "https://www.xiaohongshu.com", covers: "All 104 World Cup 2026 matches", note: "Free streams & replays", emoji: "📕", color: "#fe2c55" },
];

// ScoreBat free highlights API (no key, CORS-enabled). Used for the Highlights tab.
export const SCOREBAT_API = "https://www.scorebat.com/video-api/";

// Map our league names to ScoreBat's competition text for filtering.
export const SCOREBAT_LEAGUE_FILTER = {
  "Premier League": "premier league",
  "Champions League": "champions league",
  "La Liga": "la liga",
  "Bundesliga": "bundesliga",
  "Serie A": "serie a",
};