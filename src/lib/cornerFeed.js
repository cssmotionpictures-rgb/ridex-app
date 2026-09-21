import { invokeFunction } from "@/lib/resilient";

// VERIFIED CORNER FEED (client side). The corner-stats backend function
// maintains real corner-kick statistics per team, aggregated from finished
// API-Football matches. This module fetches that map (with a short in-memory
// TTL) and matches team names onto it. normalizeName below must stay in sync
// with the server copy in base44/functions/corner-stats/entry.ts.

const STOP = new Set([
  "fc", "cf", "afc", "ac", "ca", "sc", "cd", "ud", "sd", "calcio", "club",
  "de", "del", "la", "el", "di", "da", "do", "das", "dos", "e", "en", "the",
  "if", "bk", "sk", "fk", "pfc", "vfl", "vfb", "tsv", "tsg", "fsv", "fcs",
  "cs", "csc", "zs", "aa", "as", "sp", "og", "ag", "mfk", "nk", "a",
  "1", "04", "05", "07", "09", "1893", "1899", "1900", "2000",
]);

export function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .join(" ")
    .trim();
}

const TTL_MS = 10 * 60 * 1000; // the server scan keeps progressing between invokes
let cache = { teams: null, at: 0 };

export async function getCornerFeedTeams() {
  if (cache.teams && Date.now() - cache.at < TTL_MS) return cache.teams;
  try {
    const res = await invokeFunction("corner-stats", {}, { timeoutMs: 15000 });
    const teams = res?.teams || res?.data?.teams || [];
    if (Array.isArray(teams)) {
      cache = { teams: teams.map((t) => ({ ...t, norm: normalizeName(t.name) })), at: Date.now() };
    }
  } catch {
    if (!cache.teams) cache = { teams: [], at: Date.now() };
  }
  return cache.teams || [];
}

// Real corner history for one team — requires 2+ tracked finished matches,
// so a single observation is never sold as a "trend".
export function lookupCornerStats(teams, name) {
  const n = normalizeName(name);
  if (!n || !teams?.length) return null;
  let hit = teams.find((t) => t.norm === n);
  if (!hit) {
    // one name contained in the other ("rayo vallecano" ⊂ "rayo vallecano madrid")
    hit = teams.find((t) => t.norm && (t.norm.includes(n) || n.includes(t.norm)));
  }
  if (!hit) {
    // token overlap — at least 2 shared tokens covering 2/3 of the smaller
    // name, so "manchester united" never matches "manchester city"
    hit = teams.find((t) => {
      if (!t.norm) return false;
      const a = n.split(" ");
      const b = t.norm.split(" ");
      const inter = a.filter((x) => b.includes(x)).length;
      return inter >= 2 && inter / Math.min(a.length, b.length) >= 0.66;
    });
  }
  return hit && hit.n >= 2 ? hit : null;
}