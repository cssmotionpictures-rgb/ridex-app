// GLOBAL RESULT IMPORT — the "ANALYZE RIDE X RESULTS" pipeline. A user pastes
// results from ANY RIDE X prediction section; the pipeline parses, matches to
// the immutable Global Prediction Ledger, verifies against the verified results
// provider where league coverage exists, settles under each market's canonical
// rule, records outcomes with automated win/loss factor analysis, and refreshes
// the learning queue. User results NEVER override a conflicting verified
// provider result (CONFLICT — review required). Duplicates are refused.
import { base44 } from "@/api/base44Client";
import { settleCanonical } from "@/lib/ensemble/markets";
import { findResultByFixture } from "@/lib/ensemble/fixtures";
import { importHash } from "./globalId";
import { parseResultsText } from "./parser";
import { matchParsedRow, normalizedScore } from "./matcher";
import { outcomeOf } from "./ledger";
import { refreshInsights } from "./insights";
import { readOrThrow, fetchAllStrict, ReadFailure, PAUSED_READ_MESSAGE, PAUSED_DUP_MESSAGE } from "./safeReads";
import { detectSportyBetText } from "./sportybetParser";
import { runSportyBetImport } from "./sportybetImport";
import { classifySettledReimport } from "./conflictResolutionCore";
import { knownSeriesScoreNote } from "./fixtureIdentity";

const nowIso = () => new Date().toISOString();
const SETTLED = new Set(["won", "lost", "void", "push", "cancelled"]);

export async function analyzeRideXResults(rawText, { onProgress = () => {} } = {}) {
  // LARGE SPORTYBET TICKET BATCHES — routed into the dedicated full-batch
  // pipeline (ticket structure, per-leg evidence, dedup, external retention).
  if (detectSportyBetText(rawText)) return runSportyBetImport(rawText, { onProgress });

  // DUPLICATE PROTECTION — the same text pasted twice is refused. The check
  // read is STRICT: a throttled/malformed read pauses the import instead of
  // being treated as "no previous batch".
  onProgress("READING");
  const hash = importHash(rawText);
  let dup;
  try {
    dup = await readOrThrow(
      () => base44.entities.ResultImportBatch.filter({ import_hash: hash }, "-imported_at", 5),
      "duplicate-batch check",
      { onState: (s) => onProgress(s) }
    );
  } catch (e) {
    if (e instanceof ReadFailure) {
      return {
        paused: true,
        state: "BLOCKED",
        readFailed: e.label,
        customerMessage: /duplicate/i.test(e.label) ? PAUSED_DUP_MESSAGE : PAUSED_READ_MESSAGE,
      };
    }
    throw e;
  }
  if (dup.length) return { duplicate: true, batch: dup[0] };

  onProgress("PARSING");
  const parsed = parseResultsText(rawText);
  const resolved = parsed.filter((p) => p.resolved);
  const unresolved = parsed.filter((p) => !p.resolved);

  onProgress("MATCHING");
  let all;
  try {
    all = await fetchAllStrict("GlobalPredictionLedger", "-created_date", {
      label: "global prediction ledger",
      onState: (s) => onProgress(s),
    });
  } catch (e) {
    if (e instanceof ReadFailure) {
      return { paused: true, state: "BLOCKED", readFailed: e.label, customerMessage: PAUSED_READ_MESSAGE };
    }
    throw e;
  }
  const now = Date.now();
  // Leakage guard: only predictions whose kickoff has passed (or legacy rows
  // with no kickoff time) can be settled from a pasted result.
  const settleable = all.filter(
    (r) => !SETTLED.has(r.status) && (!r.kickoff || new Date(r.kickoff).getTime() <= now)
  );
  const alreadySettled = all.filter((r) => SETTLED.has(r.status));

  const counts = { parsed: resolved.length, unresolved: unresolved.length, exact: 0, high: 0, possible: 0, unmatched: 0, conflicts: 0, verified: 0, userSupplied: 0, wins: 0, losses: 0, voids: 0, skippedMarkets: 0, alreadySettled: 0 };
  const detail = [];
  const globalUpdates = [];
  const outcomeRows = [];

  for (const p of resolved) {
    const match = matchParsedRow(p, settleable);
    const settledMatch = matchParsedRow(p, alreadySettled);
    const entry = { line: p.raw, teams: `${p.home} v ${p.away}`, score: p.score ? `${p.score[0]}-${p.score[1]}` : "—" };

    if (match.status === "NO_MATCH") {
      if (settledMatch.status !== "NO_MATCH") {
        // RE-IMPORT CONSISTENCY — a fixture that already carries a confirmed
        // canonical result is never re-settled: the same score is ALREADY
        // RESOLVED, a different score is a CONFLICT back to REVIEW. Zero writes.
        const clash = classifySettledReimport(settledMatch.rows || [], p.score, { reversed: settledMatch.reversed });
        if (clash.review) {
          counts.conflicts++;
          const fxNote = knownSeriesScoreNote({ home: p.home, away: p.away, score: settledMatch.reversed ? [p.score[1], p.score[0]] : p.score });
          detail.push({
            ...entry,
            outcome: "RESULT CONFLICT — REVIEW REQUIRED",
            note: `this fixture already carries a confirmed canonical result (${clash.canonicalScore}) — the pasted score differs and was NOT written${fxNote ? ` · ${fxNote}` : ""}`,
          });
        } else {
          counts.alreadySettled += settledMatch.rows?.length || 1;
          detail.push({ ...entry, outcome: "ALREADY SETTLED / ALREADY RESOLVED — matched predictions were graded earlier", match: settledMatch.status });
        }
      } else {
        counts.unmatched++;
        detail.push({ ...entry, outcome: "NO MATCH", reason: match.reason });
      }
      continue;
    }
    if (match.status === "POSSIBLE_MATCH") {
      counts.possible++;
      detail.push({ ...entry, outcome: "POSSIBLE MATCH — multiple fixtures, review required", fixtures: match.fixtures });
      continue;
    }
    if (match.status === "EXACT_MATCH") counts.exact++;
    if (match.status === "HIGH_CONFIDENCE_MATCH") counts.high++;
    if (!match.rows.length) {
      // RE-IMPORT CONSISTENCY — same rule as above: same score = ALREADY
      // RESOLVED, different score = CONFLICT back to REVIEW. Zero writes.
      const clash = classifySettledReimport(settledMatch.rows || [], p.score, { reversed: settledMatch.reversed });
      if (clash.review) {
        counts.conflicts++;
        const fxNote = knownSeriesScoreNote({ home: p.home, away: p.away, score: settledMatch.reversed ? [p.score[1], p.score[0]] : p.score });
        detail.push({
          ...entry,
          outcome: "RESULT CONFLICT — REVIEW REQUIRED",
          note: `this fixture already carries a confirmed canonical result (${clash.canonicalScore}) — the pasted score differs and was NOT written${fxNote ? ` · ${fxNote}` : ""}`,
        });
      } else {
        counts.alreadySettled += settledMatch.rows?.length || 0;
        detail.push({ ...entry, outcome: "ALREADY SETTLED / ALREADY RESOLVED — matched predictions were graded earlier", match: settledMatch.status || match.status });
      }
      continue;
    }

    const userScore = normalizedScore(p, match.reversed);
    const rep = match.rows.find((r) => r.league_code && r.kickoff) || match.rows[0];

    onProgress("VERIFYING");
    let verified = null;
    if (rep?.league_code && rep?.kickoff) {
      try {
        verified = await findResultByFixture(rep.home, rep.away, String(rep.kickoff).slice(0, 10), rep.league_code);
      } catch {
        verified = null; // feed hiccup — user result proceeds as USER-SUPPLIED, disclosed
      }
    }

    const verifiedScore = verified && Number.isFinite(verified.home) && Number.isFinite(verified.away) ? [verified.home, verified.away] : null;
    if (verifiedScore && (verifiedScore[0] !== userScore[0] || verifiedScore[1] !== userScore[1])) {
      // CONFLICT — the user result disagrees with the verified provider. NEVER settled.
      counts.conflicts++;
      detail.push({
        ...entry,
        outcome: "RESULT CONFLICT — REVIEW REQUIRED",
        userScore: `${userScore[0]}-${userScore[1]}`,
        verifiedScore: `${verifiedScore[0]}-${verifiedScore[1]}`,
      });
      continue;
    }
    const score = verifiedScore || userScore;
    const verification = verifiedScore ? "verified_provider" : "user_supplied";
    if (verifiedScore) counts.verified++;
    else counts.userSupplied++;

    onProgress("SETTLING");
    let settledAny = false;
    for (const row of match.rows) {
      const won = settleCanonical(row.market_key, score[0], score[1]);
      if (won === undefined) {
        counts.skippedMarkets++;
        continue; // unknown market — never settled by generic logic
      }
      const status = won === null ? "push" : won ? "won" : "lost";
      settledAny = true;
      if (status === "won") counts.wins++;
      else if (status === "lost") counts.losses++;
      else counts.voids++;
      const settledRow = {
        ...row,
        status,
        verification,
        actual_home: score[0],
        actual_away: score[1],
        result_source: verifiedScore ? "openfootball verified result (result import)" : "user result import",
        settled_at: nowIso(),
      };
      globalUpdates.push({
        id: row.id,
        status,
        verification,
        actual_home: score[0],
        actual_away: score[1],
        result_source: settledRow.result_source,
        settled_at: settledRow.settled_at,
      });
      outcomeRows.push(outcomeOf(settledRow));
    }
    detail.push({
      ...entry,
      outcome: settledAny ? `SETTLED — ${verification === "verified_provider" ? "VERIFIED" : "USER-SUPPLIED"} ${score[0]}-${score[1]}` : "NOTHING SETTLED (unknown markets)",
      markets: match.rows.map((r) => r.market_label),
    });
  }

  if (globalUpdates.length) await base44.entities.GlobalPredictionLedger.bulkUpdate(globalUpdates);
  if (outcomeRows.length) await base44.entities.GlobalOutcomeLedger.bulkCreate(outcomeRows);

  onProgress("ANALYZING + LEARNING");
  // Post-write learning refresh — a failed read is SURFACED as PARTIAL —
  // REVIEW REQUIRED, never swallowed and never guessed.
  let learning = {
    created: 0,
    updated: 0,
    candidates: 0,
    skipped: true,
    reason: "learning queue refresh deferred — records were imported unchanged; re-run to refresh the queue",
  };
  let partial = false;
  try {
    const settledRows = (await fetchAllStrict("GlobalPredictionLedger", "-created_date", {
      label: "learning ledger read",
    })).filter((r) => SETTLED.has(r.status));
    learning = await refreshInsights(settledRows);
    learning.skipped = false;
  } catch {
    partial = true;
  }

  const batch = await base44.entities.ResultImportBatch.create({
    import_hash: hash,
    raw_text: String(rawText || "").slice(0, 5000),
    source_guess: resolved.find((p) => p.sourceGuess)?.sourceGuess || parsed.find((p) => p.sourceGuess)?.sourceGuess || "",
    status: "imported",
    parsed_count: counts.parsed,
    unresolved_count: counts.unresolved,
    exact_matches: counts.exact,
    high_matches: counts.high,
    possible_matches: counts.possible,
    unmatched: counts.unmatched,
    verified_count: counts.verified,
    user_supplied_count: counts.userSupplied,
    conflicts: counts.conflicts,
    wins: counts.wins,
    losses: counts.losses,
    voids: counts.voids,
    already_settled: counts.alreadySettled,
    insights_created: learning.created,
    summary_json: JSON.stringify(detail),
    imported_at: nowIso(),
  });

  return {
    duplicate: false,
    paused: false,
    state: partial ? "PARTIAL — REVIEW REQUIRED" : "COMPLETED",
    partial,
    counts,
    learning,
    detail,
    settledOutcomes: outcomeRows.length,
    batchId: batch?.id || null,
  };
}