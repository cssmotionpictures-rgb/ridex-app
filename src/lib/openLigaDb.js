import { base44 } from "@/api/base44Client";

// OPENLIGADB (client side) — the official German league feed via the
// openligadb-proxy backend function. Finished games carry the REAL final
// score from the league itself; upcoming games are CONFIRMED scheduled
// fixtures. Used as a second independent source for Bundesliga, 2.
// Bundesliga and 3. Liga: results the season files don't carry yet are
// merged into the form/head-to-head window, and fixtures the official feed
// also carries are marked CONFIRMED. Day-keyed client cache — a fresh day
// refetches; a failure never breaks the engine (empty = ignored).

export const OPENLIGA_LEAGUES = { bl1: "Bundesliga", bl2: "2. Bundesliga", bl3: "3. Liga" };

// OpenLigaDB keys a season by its starting year — the 2026 file is the
// 2026/27 season. From July onward the new season has started.
const seasonStart = () => {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
};

let cache = { date: "", promise: null };

export function loadOpenLigaDb(force = false) {
  const today = new Date().toISOString().slice(0, 10);
  if (!force && cache.promise && cache.date === today) return cache.promise;
  const s = seasonStart();
  cache = {
    date: today,
    promise: (async () => {
      const res = await base44.functions.invoke("openligadb-proxy", { seasons: [s, s - 1, s - 2] });
      const data = res?.data || {};
      const byLeague = {};
      for (const entry of data.results || []) {
        if (!OPENLIGA_LEAGUES[entry.league]) continue;
        const matches = [];
        for (const season of entry.seasons || []) {
          if (season.status !== "ok") continue;
          for (const m of season.matches || []) {
            matches.push({
              date: m.date,
              team1: m.home,
              team2: m.away,
              score: Array.isArray(m.ft) ? { ft: m.ft } : null,
            });
          }
        }
        // Sanity — only a real multi-season archive counts as a loaded feed
        if (matches.length > 30) byLeague[entry.league] = matches;
      }
      return byLeague;
    })().catch(() => ({})),
  };
  return cache.promise;
}