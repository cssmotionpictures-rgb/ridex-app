// SURE WIN BOARD — pure lifecycle helpers above the Selection Intelligence
// Engine. No I/O, no mutation: board-state derivation, immutable snapshot
// rows (first publish wins — never rewritten), sport inference from what the
// candidate pool actually carries, and settled-results statistics joined to
// the authoritative settlement records (losses never hidden).
//
// A failed read is NEVER reported as NO GAMES — boardStateOf separates
// DATA_ERROR from an honestly empty pool from a pool that simply did not
// qualify.

export const SURE_WIN_STALE_MS = 10 * 60 * 1000; // last verified refresh older than this = STALE

const LAGOS = "Africa/Lagos";
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

// Kickoff date key in Africa/Lagos (YYYY-MM-DD) — the board's own day key
export function lagosDateKeyOf(kickoffIso) {
  try {
    return new Date(kickoffIso).toLocaleDateString("en-CA", { timeZone: LAGOS });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// BOARD STATES — LOADING handled by the caller; every other state is derived
// so an API/database failure can never masquerade as an empty board.
export function boardStateOf({ poolFailed, poolEmpty, picksCount, lastLoadedAt = 0, now = Date.now(), staleAfterMs = SURE_WIN_STALE_MS }) {
  if (poolFailed) return "DATA_ERROR";
  if (poolEmpty) return "NO_CANDIDATES";
  if (!picksCount) return "NO_QUALIFYING";
  if (lastLoadedAt && now - lastLoadedAt > staleAfterMs) return "STALE";
  return "GAMES_AVAILABLE";
}

// ---------------------------------------------------------------------------
// IMMUTABLE BOARD SNAPSHOT. Deterministic key: one snapshot per fixture|market,
// created once when the candidate first enters the board and never rewritten.
export const snapshotKeyOf = (c) => `surewin|${c.fixture_id || `${c.home}|${c.away}`}|${c.market_key}`;

export function snapshotRowOf(pick) {
  const c = pick.candidate;
  return {
    snapshot_key: snapshotKeyOf(c),
    fixture_id: c.fixture_id,
    market_key: c.market_key,
    source: c.source,
    home: c.home,
    away: c.away,
    league: c.league,
    kickoff: c.kickoff,
    lagos_date_key: c.lagos_date_key || lagosDateKeyOf(c.kickoff),
    market_label: c.market_label,
    candidate_id: c.candidate_id || "",
    model_version: c.model_version || "",
    probability: clamp01(pick.calibrated), // authoritative calibrated probability at publish time
    quality_score: clamp01(pick.quality),
    recommendation_status: pick.recommendationStatus || "",
    gate_results_json: JSON.stringify({
      reasons: pick.reasons || [],
      dataHealth: { score: pick.health?.score ?? null, status: pick.health?.status || "", notes: pick.health?.notes || [] },
      agreement: pick.agreement ?? null,
      uncertainty: pick.uncertainty ?? null,
      correlation: pick.correlation || null,
    }),
    board_rank: pick.rank || 0,
    published_at: new Date().toISOString(),
  };
}

// First-publish-wins: existing snapshots are never duplicated or rewritten —
// only genuinely-new board entries are created.
export function missingSnapshots(existingKeys, rows) {
  const have = new Set((existingKeys || []).map(String));
  return (rows || []).filter((r) => !have.has(r.snapshot_key));
}

// ---------------------------------------------------------------------------
// SPORT INFERENCE — only from labels the candidate pool actually carries.
// The verified engine pool is football-first; monster multi-sport leagues are
// recognized from their own labels, never guessed.
const SPORT_RULES = [
  ["Basketball", /\b(nba|wnba|basketball|ncaab|euroleague)\b/i],
  ["American Football", /\b(nfl|ncaa football|american football)\b/i],
  ["Baseball", /\b(mlb|baseball)\b/i],
  ["Hockey", /\b(nhl|hockey)\b/i],
  ["Tennis", /\b(atp|wta|itf|tennis|wimbledon|roland garros)\b/i],
];

export function sportOf(cand) {
  const label = `${cand.league || ""} ${cand.fixture_id || ""}`;
  for (const [sport, re] of SPORT_RULES) if (re.test(label)) return sport;
  return "Football";
}

// ---------------------------------------------------------------------------
// SETTLED RESULTS — outcomes are joined from the authoritative prediction
// rows via fixture|market; the snapshot itself is never mutated. Win rate is
// computed from BOTH wins and losses; void/cancelled count toward nothing;
// a small settled sample is honestly caveated, never presented as proof.
export function resultsStatsOf(snapshots, settledByFM) {
  const rows = (snapshots || []).map((s) => ({
    probability: clamp01(s.probability),
    quality: clamp01(s.quality_score),
    outcome: (settledByFM && settledByFM.get(`${s.fixture_id}|${s.market_key}`)) || "unsettled",
  }));
  const settled = rows.filter((r) => ["won", "lost", "void", "cancelled"].includes(r.outcome));
  const graded = settled.filter((r) => r.outcome === "won" || r.outcome === "lost");
  const wins = settled.filter((r) => r.outcome === "won").length;
  const losses = settled.filter((r) => r.outcome === "lost").length;
  const voids = settled.filter((r) => r.outcome === "void" || r.outcome === "cancelled").length;
  const avg = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
  const brier = graded.length
    ? avg(graded.map((r) => (r.probability - (r.outcome === "won" ? 1 : 0)) ** 2))
    : 0;
  return {
    settled: settled.length,
    wins,
    losses,
    voids,
    graded: graded.length,
    winRatePct: graded.length ? (wins / graded.length) * 100 : 0,
    avgProbPct: avg(graded.map((r) => r.probability)) * 100,
    avgQuality: avg(graded.map((r) => r.quality)),
    brier,
    pending: rows.length - settled.length,
    limited: settled.length < 30, // honest small-sample caveat
  };
}