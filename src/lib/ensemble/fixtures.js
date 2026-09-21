// RX FIXTURES — the engine's verified data layer. Full-season fixtures and
// real final scores from the openfootball/football.json repo (jsDelivr CDN —
// keyless, CORS-friendly, zero workspace credits), the same verified source
// the special-odds pool uses. Kickoff times are real provider times. Leagues
// whose season file is missing no-op safely — never padded.

import { fetchSeason, SEASON, LEAGUES } from "@/lib/slipPool";
import { normalizeName } from "@/lib/cornerFeed";

const sameName = (a, b) => a === b || normalizeName(a) === normalizeName(b);

// Previous season for form depth and head-to-head history.
const [sy1, sy2] = SEASON.split("-").map(Number);
export const PREV_SEASON = `${sy1 - 1}-${sy2 - 1}`;

// The scanned competition set — every league the verified season files carry
// that the odds provider also prices gets real bookmaker quotes; the rest are
// model-only, clearly labeled.
export const RX_LEAGUES = LEAGUES;
export const codeOfLabel = (label) => RX_LEAGUES.find((l) => l.label === label)?.code || null;

const leagueCache = new Map();

// Played matches (previous season + current season results) plus every
// current-season match, promise-cached per league code.
export async function loadLeague(code) {
  if (leagueCache.has(code)) return leagueCache.get(code);
  const p = (async () => {
    const [cur, prev] = await Promise.all([
      fetchSeason(code, SEASON),
      fetchSeason(code, PREV_SEASON),
    ]);
    return [...prev, ...cur];
  })().catch(() => []);
  leagueCache.set(code, p);
  return p;
}

// Real provider kickoff (UTC) — a match with no verifiable time returns null
// and never gets guessed into a Lagos session.
export function kickoffOf(m) {
  if (!m?.date || !m?.time) return null;
  const ts = `${m.date}T${m.time}:00Z`;
  return isNaN(new Date(ts).getTime()) ? null : ts;
}

export function fixtureIdOf(code, m) {
  const slug = (t) => normalizeName(t).replace(/\s+/g, "-");
  return `of-${code}-${m.date}-${slug(m.team1)}-${slug(m.team2)}`;
}

// The real final score of a recorded prediction, from the same verified feed
// the prediction was made from — no data leakage, no second source guessing.
export async function findResultByFixture(home, away, date, code) {
  const matches = await loadLeague(code);
  const m = matches.find(
    (x) => x.date === date && sameName(x.team1, home) && sameName(x.team2, away)
  );
  if (!m?.score?.ft) return null;
  return { home: Number(m.score.ft[0]), away: Number(m.score.ft[1]) };
}