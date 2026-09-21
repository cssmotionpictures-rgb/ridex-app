import { fetchRealBookmakerOdds } from "@/providers/odds/theOddsApi";

// US OPEN ODDS PARSER — real bookmaker prices for the US Open (ATP + WTA),
// fetched through the bookmaker-odds backend (The Odds API). Every price was
// quoted by a real bookmaker; nothing here is modelled or invented. Matches
// are keyed by normalized player names in BOTH orientations, so whichever
// side the fixture feed lists first still finds its real price.

export const TENNIS_SPORT_KEYS = ["tennis_atp_us_open", "tennis_wta_us_open"];

const TTL_MS = 15 * 60 * 1000;
let cache = { at: 0, promise: null };

export function normTennisName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, " ")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Map: "home|away" (normalized) → { p1: {price, bookmaker}, p2: {…} } — the
// REAL best bookmaker price per player for each covered US Open match.
export function getTennisOddsMap(force = false) {
  const now = Date.now();
  if (!force && cache.promise && now - cache.at < TTL_MS) return cache.promise;
  cache.at = now;
  cache.promise = (async () => {
    const map = new Map();
    try {
      const data = await fetchRealBookmakerOdds(TENNIS_SPORT_KEYS, { ttlMinutes: 20 });
      for (const sp of (data?.sports || []).filter(Boolean)) {
        for (const ev of sp.events || []) {
          const h = normTennisName(ev.home);
          const a = normTennisName(ev.away);
          if (!h || !a) continue;
          const q1 = ev.h2h?.["1"] || null;
          const q2 = ev.h2h?.["2"] || null;
          const pack = (q) => (q && Number(q[0]) > 1 ? { price: Number(q[0]), bookmaker: q[1] || "" } : null);
          const v = { p1: pack(q1), p2: pack(q2) };
          map.set(`${h}|${a}`, v);
          map.set(`${a}|${h}`, { p1: v.p2, p2: v.p1 });
        }
      }
    } catch {
      // odds feed unavailable → empty map, engine falls back to model fair odds
    }
    return map;
  })();
  return cache.promise;
}