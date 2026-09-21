// GLOBAL MATCHER — connects a parsed result line to the immutable Global
// Prediction Ledger. Matching is at FIXTURE level (a final score settles every
// open market row of that fixture — never guessed onto one market). Team-name
// equivalence uses the engine's strict token-subset matcher; ambiguous cases
// are POSSIBLE_MATCH (shown for review, never auto-settled) and a reversed
// team order is handled deterministically (score normalized to ledger order).
import { teamNameMatches } from "@/lib/ensemble/rx21Core";

const fixtureKeyOf = (r) => `${r.fixture_id}|${r.kickoff}`;

export function matchParsedRow(parsed, rows) {
  if (!parsed?.resolved || !parsed?.home || !parsed?.away) {
    return { status: "NO_MATCH", reason: parsed?.reason || "line unresolved", fixtures: [], rows: [] };
  }
  const pool = (rows || []).filter((r) => r.home && r.away);
  const searchPool = parsed.date
    ? pool.filter((r) => String(r.kickoff || "").slice(0, 10) === parsed.date)
    : pool;
  if (parsed.date && !searchPool.length) {
    return { status: "NO_MATCH", reason: `no prediction on record for ${parsed.date}`, fixtures: [], rows: [] };
  }
  const fwd = searchPool.filter((r) => teamNameMatches(parsed.home, r.home) && teamNameMatches(parsed.away, r.away));
  const rev = searchPool.filter((r) => teamNameMatches(parsed.home, r.away) && teamNameMatches(parsed.away, r.home));
  const matched = fwd.length ? fwd : rev;
  if (!matched.length) {
    return { status: "NO_MATCH", reason: "no prediction on record for these teams", fixtures: [], rows: [] };
  }
  const fixtures = [...new Set(matched.map(fixtureKeyOf))];
  if (fixtures.length > 1) {
    return { status: "POSSIBLE_MATCH", reason: `matches ${fixtures.length} different fixtures — review required`, fixtures, rows: [] };
  }
  const fixtureRows = searchPool
    .filter((r) => fixtureKeyOf(r) === fixtures[0])
  return { status: fwd.length ? "EXACT_MATCH" : "HIGH_CONFIDENCE_MATCH", reversed: !fwd.length, fixtures, rows: fixtureRows };
}

// Deterministic score normalization — when the user listed the teams in the
// opposite order from the ledger, the score follows the USER'S listed order,
// so it is swapped back onto the ledger's home/away. Never a guess.
export function normalizedScore(parsed, reversed) {
  if (!parsed?.score) return null;
  const [h, a] = parsed.score;
  return reversed ? [a, h] : [h, a];
}