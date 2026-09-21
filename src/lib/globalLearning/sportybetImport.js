// SPORTYBET FULL-BATCH HISTORICAL IMPORT — the dedicated pipeline behind
// PREDICTION RESULT IMPORT for large SportyBet ticket pastes. Pipeline:
// PARSE → NORMALIZE → DEDUPLICATE → MATCH → VERIFY → SETTLE → RETAIN → LEARN.
//
// * Every individual leg is independent evidence — the ticket result never
//   marks its winning legs as losses (accumulator structure is analyzed
//   separately at ticket level).
// * Settlement is derived canonically from the FT score; a supplied SportyBet
//   outcome that disagrees is a SETTLEMENT CONFLICT — both values preserved,
//   never silently chosen.
// * Duplicates (repeated tickets, repeated legs, earlier imports of the same
//   leg) are refused deterministically — nothing is ever double-counted.
// * Legs matched to a RIDE X prediction settle the existing global ledger
//   through the SAME verified/user-supplied path as the generic importer —
//   no new model, no new settlement authority.
// * Unmatched legs are retained as EXTERNAL HISTORICAL RESULTS — research
//   evidence that is NEVER attributed to a RIDE X prediction.
// * Learning: settled observations feed the EXISTING Global Learning Engine's
//   evidence-gated queue. One batch NEVER changes a production model —
//   PRODUCTION PROMOTIONS: 0 unless the full validation chain passes.
import { base44 } from "@/api/base44Client";
import { settleCanonical } from "@/lib/ensemble/markets";
import { findResultByFixture } from "@/lib/ensemble/fixtures";
import { importHash } from "./globalId";
import { parseSportyBetBatch, ticketTalliesOf } from "./sportybetParser";
import { normalizeSportyBetMarket, normalizeOutcomeText, settleSportyBetPick, oddsBandOf } from "./sportybetMarkets";
import { matchParsedRow, normalizedScore } from "./matcher";
import { outcomeOf } from "./ledger";
import { refreshInsights } from "./insights";
import { readOrThrow, fetchAllStrict, ReadFailure, PAUSED_READ_MESSAGE, PAUSED_DUP_MESSAGE } from "./safeReads";

const nowIso = () => new Date().toISOString();
const SETTLED = new Set(["won", "lost", "void", "push", "cancelled"]);

// One import at a time — a concurrent second paste must never race the first
// one's dedup checks (records would look absent mid-flight and duplicate).
let importInFlight = false;

export async function runSportyBetImport(rawText, { onProgress = () => {}, retry } = {}) {
  if (importInFlight) {
    return {
      paused: true,
      state: "BLOCKED",
      concurrent: true,
      customerMessage:
        "Import temporarily paused — another import is already running. Please retry once it finishes. No records were changed.",
    };
  }
  importInFlight = true;
  try {
    return await runSportyBetImportInner(rawText, { onProgress, retry });
  } finally {
    importInFlight = false;
  }
}

async function runSportyBetImportInner(rawText, { onProgress, retry }) {
  const readOpts = { ...(retry || {}), onState: (s) => onProgress(s) };
  const pausedOf = (e) => ({
    paused: true,
    state: /429|throttl|volume|traffic/i.test(e.reason || "") ? "THROTTLED" : "BLOCKED",
    readFailed: e.label,
    customerMessage: /duplicate/i.test(e.label || "") ? PAUSED_DUP_MESSAGE : PAUSED_READ_MESSAGE,
  });

  // — PREREQUISITE READS (strict + fail-safe) —
  // REQUIRED RULE: READ FAILURE → IMPORT PAUSED / BLOCKED → RETRY. A
  // throttled (429), timed-out, unavailable or malformed read is NEVER
  // treated as an empty pool — writing on a silently-empty pool is what
  // creates duplicate tickets and failed matches. Every dedup, matching and
  // ledger read must SUCCEED before any write: no half-imported tickets.
  onProgress("READING");
  const hash = importHash(rawText);
  let dup;
  try {
    dup = await readOrThrow(
      () => base44.entities.ResultImportBatch.filter({ import_hash: hash }, "-imported_at", 5),
      "duplicate-batch check",
      readOpts
    );
  } catch (e) {
    if (e instanceof ReadFailure) return pausedOf(e);
    throw e;
  }
  // — duplicate batch protection: the same text pasted twice is refused —
  if (dup.length) return { duplicate: true, batch: dup[0], sportybet: true };

  let all, existingExternalRows, existingTicketRows;
  try {
    all = await fetchAllStrict("GlobalPredictionLedger", "-created_date", { ...readOpts, label: "global prediction ledger" });
    existingExternalRows = await fetchAllStrict("ExternalHistoricalResult", "-created_date", {
      ...readOpts,
      label: "duplicate-leg check (historical results)",
    });
    existingTicketRows = await fetchAllStrict("SportyBetTicket", "-imported_at", { ...readOpts, label: "duplicate-ticket check" });
  } catch (e) {
    if (e instanceof ReadFailure) return pausedOf(e);
    throw e;
  }

  onProgress("PARSING");
  const parsed = parseSportyBetBatch(rawText);

  onProgress("MATCHING");
  const now = Date.now();
  const settleable = all.filter((r) => !SETTLED.has(r.status) && (!r.kickoff || new Date(r.kickoff).getTime() <= now));
  const alreadySettled = all.filter((r) => SETTLED.has(r.status));
  const existingExternal = new Set(existingExternalRows.map((r) => r.external_id));
  const existingTickets = new Set(existingTicketRows.map((r) => r.ticket_key));

  const counts = {
    ticketsDetected: parsed.ticketsDetected,
    uniqueTickets: parsed.uniqueTickets.length,
    duplicateTickets: parsed.duplicateTicketCopies,
    legsParsed: 0,
    settled: 0,
    pending: 0,
    suppliedOnly: 0,
    unresolved: 0,
    conflicts: 0,
    duplicatesRejected: parsed.duplicateLegs,
    rideXMatched: 0,
    externalHistorical: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    verified: 0,
    userSupplied: 0,
    alreadySettled: 0,
    skippedMarkets: 0,
  };
  const detail = [];
  const externalRows = [];
  const globalUpdates = [];
  const outcomeRows = [];
  const legResults = []; // per-leg settled results for batch aggregates
  const legClass = []; // per-leg classification → per-ticket tallies (pure)

  onProgress("NORMALIZING + SETTLING");
  for (const leg of parsed.legs) {
    counts.legsParsed++;
    const norm = leg.pick ? normalizeSportyBetMarket(leg.market, leg.pick) : null;
    const supplied = normalizeOutcomeText(leg.outcome);
    const hasScore = Array.isArray(leg.ftScore);
    let computed = null;
    if (hasScore && norm?.settleable) computed = settleSportyBetPick(norm, leg.ftScore[0], leg.ftScore[1]);

    const entry = {
      ticketIds: leg.ticketIds.join(","),
      gameId: leg.gameId,
      teams: `${leg.home} v ${leg.away}`,
      pick: leg.pick || "—",
      odds: leg.odds || 0,
      market: leg.market || norm?.family || "",
    };

    const extBase = {
      external_id: leg.identity,
      source: "sportybet",
      ticket_ids: leg.ticketIds.join(","),
      game_id: leg.gameId,
      home: leg.home,
      away: leg.away,
      kickoff: leg.kickoffDate ? `${leg.kickoffDate}T00:00:00Z` : "",
      kickoff_date_key: leg.kickoffDate || "",
      market_raw: leg.market || "",
      pick_raw: leg.pick || "",
      market_key: norm?.engineKey || "",
      canonical_market: norm?.canonical || "",
      market_family: norm?.family || "unknown",
      odds: leg.odds || 0,
      home_goals: hasScore ? leg.ftScore[0] : 0,
      away_goals: hasScore ? leg.ftScore[1] : 0,
      supplied_outcome: (leg.outcome || "").trim(),
      computed_settlement: computed || "",
      match_status: "external",
      matched_prediction_ids: "",
      research_only: true,
      unresolved_reason: "",
      recorded_at: nowIso(),
    };

    // — cross-import duplicate protection: the same leg was already retained —
    if (existingExternal.has(extBase.external_id)) {
      counts.duplicatesRejected++;
      detail.push({ ...entry, outcome: "ALREADY IMPORTED — this exact historical leg is already on record" });
      continue;
    }

    // — RIDE X MATCHING (fixture level, only meaningful with a final score) —
    let match = { status: "NO_MATCH", rows: [], reversed: false };
    let settledMatch = { status: "NO_MATCH", rows: [] };
    if (hasScore) {
      const probe = { resolved: true, home: leg.home, away: leg.away, score: leg.ftScore, date: leg.kickoffDate || "" };
      match = matchParsedRow(probe, settleable);
      if (match.status === "NO_MATCH" && probe.date) match = matchParsedRow({ ...probe, date: "" }, settleable);
      settledMatch = matchParsedRow({ ...probe, date: "" }, alreadySettled);
    }

    const isMatched = match.status === "EXACT_MATCH" || match.status === "HIGH_CONFIDENCE_MATCH";
    if (isMatched) counts.rideXMatched++;

    // — SETTLEMENT CONFLICT check: supplied outcome vs canonical settlement —
    let bucket;
    let status;
    if (computed && ["won", "lost", "push"].includes(supplied) && supplied !== computed) {
      bucket = "conflict";
      status = "conflict";
    } else if (computed) {
      bucket = "settled";
      status = computed;
    } else if (["won", "lost", "push"].includes(supplied)) {
      bucket = "suppliedOnly";
      status = supplied;
    } else if (!hasScore) {
      bucket = "pending";
      status = "pending";
    } else {
      bucket = "unresolved";
      status = "unknown";
    }

    if (bucket === "settled") {
      counts.settled++;
      if (status === "won") counts.wins++;
      else if (status === "lost") counts.losses++;
      else counts.pushes++;
      legResults.push({
        family: norm?.family || "unknown",
        band: oddsBandOf(leg.odds),
        status,
        matched: isMatched,
      });
      detail.push({ ...entry, outcome: `SETTLED FROM SCORE — ${status.toUpperCase()} ${leg.ftScore[0]}:${leg.ftScore[1]}${supplied ? ` (ticket said ${supplied.toUpperCase()})` : ""}` });
    } else if (bucket === "conflict") {
      counts.conflicts++;
      detail.push({ ...entry, outcome: `SETTLEMENT CONFLICT — ticket says ${supplied.toUpperCase()}, canonical settlement from ${leg.ftScore[0]}:${leg.ftScore[1]} is ${computed.toUpperCase()} — both preserved, review required` });
    } else if (bucket === "suppliedOnly") {
      counts.suppliedOnly++;
      detail.push({ ...entry, outcome: `SUPPLIED ONLY — ticket outcome ${status.toUpperCase()} kept, cannot be independently verified from the score` });
    } else if (bucket === "pending") {
      counts.pending++;
      detail.push({ ...entry, outcome: "PENDING — no final score yet, settled only when a verified result exists" });
    } else {
      counts.unresolved++;
      detail.push({ ...entry, outcome: `UNRESOLVED — ${norm?.note || "market could not be normalized"}${supplied ? ` (ticket outcome kept on record)` : ""}` });
    }
    legClass.push({ ticketId: leg.ticketIds[0], bucket, status });

    // — RETENTION: matched legs settle the ledger; unmatched legs are retained
    //   as EXTERNAL HISTORICAL RESULTS (research evidence, never attributed to
    //   a RIDE X prediction). Matched legs live in the ledger + legs snapshot.
    if (!isMatched) {
      externalRows.push({
        ...extBase,
        computed_settlement: computed || "",
        settlement_status:
          bucket === "settled" ? "settled_from_score"
          : bucket === "conflict" ? "conflict"
          : bucket === "suppliedOnly" ? "supplied_only"
          : bucket === "pending" ? "pending"
          : "unknown",
        status: bucket === "unresolved" && !norm?.note ? "unknown" : status,
        unresolved_reason: bucket === "unresolved" ? (norm?.note || "market could not be normalized") : "",
      });
      counts.externalHistorical++;
    }

    // — VERIFY + SETTLE the matched RIDE X predictions (fixture-level, the
    //   same verified/user-supplied path as the generic importer) —
    if (isMatched) {
      if (!match.rows.length) {
        counts.alreadySettled += settledMatch.rows?.length || 1;
        detail[detail.length - 1] = { ...detail[detail.length - 1], rideX: "RIDE X predictions for this fixture were already settled earlier" };
      } else {
        const userScore = normalizedScore({ score: leg.ftScore }, match.reversed);
        const rep = match.rows.find((r) => r.league_code && r.kickoff) || match.rows[0];
        onProgress("VERIFYING");
        let verified = null;
        if (rep?.league_code && rep?.kickoff) {
          try {
            verified = await findResultByFixture(rep.home, rep.away, String(rep.kickoff).slice(0, 10), rep.league_code);
          } catch {
            verified = null; // feed hiccup — the ticket score proceeds as USER-SUPPLIED, disclosed
          }
        }
        const verifiedScore = verified && Number.isFinite(verified.home) && Number.isFinite(verified.away) ? [verified.home, verified.away] : null;
        if (verifiedScore && (verifiedScore[0] !== userScore[0] || verifiedScore[1] !== userScore[1])) {
          counts.conflicts++;
          detail[detail.length - 1] = {
            ...detail[detail.length - 1],
            rideX: `RESULT CONFLICT — ticket score ${userScore[0]}-${userScore[1]} vs verified provider ${verifiedScore[0]}-${verifiedScore[1]} — RIDE X ledger untouched, review required`,
          };
        } else {
          const score = verifiedScore || userScore;
          const verification = verifiedScore ? "verified_provider" : "user_supplied";
          if (verifiedScore) counts.verified++;
          else counts.userSupplied++;
          onProgress("SETTLING");
          for (const row of match.rows) {
            const won = settleCanonical(row.market_key, score[0], score[1]);
            if (won === undefined) { counts.skippedMarkets++; continue; }
            const ledgerStatus = won === null ? "push" : won ? "won" : "lost";
            const settledRow = {
              ...row,
              status: ledgerStatus,
              verification,
              actual_home: score[0],
              actual_away: score[1],
              result_source: verifiedScore ? "openfootball verified result (SportyBet import)" : "SportyBet ticket result import",
              settled_at: nowIso(),
            };
            globalUpdates.push({
              id: row.id,
              status: ledgerStatus,
              verification,
              actual_home: score[0],
              actual_away: score[1],
              result_source: settledRow.result_source,
              settled_at: settledRow.settled_at,
            });
            outcomeRows.push(outcomeOf(settledRow));
          }
        }
      }
    }
  }

  // — TICKET-LEVEL RECORDS — one per genuine ticket; individual leg quality
  //   stays separate from accumulator structure risk —
  onProgress("ANALYZING");
  const talliesByTicket = ticketTalliesOf(legClass);
  const ticketRows = [];
  const ticketSummaries = [];
  parsed.uniqueTickets.forEach((t, i) => {
    const tKey = `sportybet|${t.ticketId || `no-id-${i}`}`;
    const tallies = talliesByTicket.get(t.ticketId || t.key) || { wins: 0, losses: 0, pushes: 0, pending: 0, unresolved: 0, legs: 0 };
    const settledCount = tallies.wins + tallies.losses;
    const status = tallies.losses > 0 ? "lost" : tallies.wins > 0 ? "won" : tallies.pending > 0 ? "pending" : "mixed";
    const families = {};
    t.legs.forEach((lg) => {
      const f = normalizeSportyBetMarket(lg.market, lg.pick)?.family || "unknown";
      families[f] = (families[f] || 0) + 1;
    });
    const marketConcentration = Object.entries(families).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${f}×${n}`).join(", ");
    const oddsValues = t.legs.map((lg) => lg.odds).filter(Boolean);
    const oddsDistribution = oddsValues.length
      ? `${Math.min(...oddsValues).toFixed(2)}–${Math.max(...oddsValues).toFixed(2)}`
      : "";
    if (existingTickets.has(tKey)) {
      counts.duplicatesRejected += t.legs.length;
      ticketSummaries.push({ ticketId: t.ticketId || tKey, legs: t.legs.length, ...tallies, status, duplicate: true });
      return;
    }
    ticketRows.push({
      ticket_key: tKey,
      source: "sportybet",
      ticket_id: t.ticketId || "",
      ticket_date: t.meta?.ticketDate || t.metaText.slice(0, 2).join(" ").slice(0, 120),
      stake: t.meta?.stake || 0,
      total_odds: t.meta?.totalOdds || 0,
      bets_count: t.meta?.betsCount || 0,
      legs_count: t.legs.length,
      settled_wins: tallies.wins,
      settled_losses: tallies.losses,
      pushes: tallies.pushes,
      pending_legs: tallies.pending,
      unresolved_legs: tallies.unresolved,
      status,
      result_note: settledCount
        ? `${tallies.wins} of ${settledCount} settled legs won${tallies.losses ? ` — ticket lost, individual leg quality analyzed separately from accumulator structure risk` : ""}`
        : "no independently settled legs yet",
      legs_json: JSON.stringify(t.legs.slice(0, 60).map((lg) => ({
        gameId: lg.gameId, home: lg.home, away: lg.away, kickoff: lg.kickoffDate,
        market: lg.market, pick: lg.pick, odds: lg.odds,
        ftScore: lg.ftScore ? `${lg.ftScore[0]}:${lg.ftScore[1]}` : "",
        outcome: lg.outcome,
      }))),
      market_concentration: marketConcentration,
      odds_distribution: oddsDistribution,
      imported_at: nowIso(),
    });
    ticketSummaries.push({ ticketId: t.ticketId || tKey, legs: t.legs.length, ...tallies, status, duplicate: false });
  });

  // — persist (chunked) —
  for (let i = 0; i < globalUpdates.length; i += 400) {
    await base44.entities.GlobalPredictionLedger.bulkUpdate(globalUpdates.slice(i, i + 400));
  }
  for (let i = 0; i < outcomeRows.length; i += 400) {
    await base44.entities.GlobalOutcomeLedger.bulkCreate(outcomeRows.slice(i, i + 400));
  }
  for (let i = 0; i < externalRows.length; i += 100) {
    await base44.entities.ExternalHistoricalResult.bulkCreate(externalRows.slice(i, i + 100));
  }
  for (let i = 0; i < ticketRows.length; i += 50) {
    await base44.entities.SportyBetTicket.bulkCreate(ticketRows.slice(i, i + 50));
  }

  // — LEARNING — settled observations feed the EXISTING evidence-gated queue.
  //   One batch NEVER promotes anything to production. A failed post-write
  //   learning read is SURFACED (PARTIAL — REVIEW REQUIRED), never swallowed.
  onProgress("ANALYZING + LEARNING");
  let learning = {
    created: 0,
    updated: 0,
    candidates: 0,
    skipped: true,
    reason: "learning queue refresh deferred — records were imported unchanged; re-run the import to refresh the queue",
  };
  let partial = false;
  try {
    const settledLedger = (await fetchAllStrict("GlobalPredictionLedger", "-created_date", {
      ...readOpts,
      label: "learning ledger read",
    })).filter((r) => SETTLED.has(r.status));
    learning = await refreshInsights(settledLedger);
    learning.skipped = false;
  } catch {
    partial = true;
  }

  // — batch aggregates (historical context, NOT validated learning) —
  const marketReport = {};
  const oddsBands = {};
  for (const r of legResults) {
    const m = (marketReport[r.family] = marketReport[r.family] || { legs: 0, wins: 0, losses: 0, pushes: 0 });
    m.legs++;
    if (r.status === "won") m.wins++;
    else if (r.status === "lost") m.losses++;
    else m.pushes++;
    const b = (oddsBands[r.band] = oddsBands[r.band] || { legs: 0, wins: 0, losses: 0, pushes: 0 });
    b.legs++;
    if (r.status === "won") b.wins++;
    else if (r.status === "lost") b.losses++;
    else b.pushes++;
  }

  const batch = await base44.entities.ResultImportBatch.create({
    import_hash: hash,
    raw_text: String(rawText || "").slice(0, 5000),
    source_guess: "sportybet",
    source: "sportybet",
    status: "imported",
    parsed_count: counts.legsParsed,
    unresolved_count: counts.unresolved,
    exact_matches: 0,
    high_matches: counts.rideXMatched,
    possible_matches: 0,
    unmatched: counts.externalHistorical,
    verified_count: counts.verified,
    user_supplied_count: counts.userSupplied,
    conflicts: counts.conflicts,
    wins: counts.wins,
    losses: counts.losses,
    voids: counts.pushes,
    already_settled: counts.alreadySettled,
    insights_created: learning.created,
    tickets_detected: counts.ticketsDetected,
    unique_tickets: counts.uniqueTickets,
    pending_count: counts.pending,
    supplied_only_count: counts.suppliedOnly,
    external_count: counts.externalHistorical,
    duplicates_rejected: counts.duplicatesRejected,
    summary_json: JSON.stringify({
      tickets: ticketSummaries,
      detail: detail.slice(0, 300),
      marketReport,
      oddsBands,
      learningSkipped: learning.skipped,
    }).slice(0, 40000),
    imported_at: nowIso(),
  });

  return {
    duplicate: false,
    paused: false,
    state: partial ? "PARTIAL — REVIEW REQUIRED" : "COMPLETED",
    partial,
    sportybet: true,
    counts,
    tickets: ticketSummaries,
    marketReport,
    oddsBands,
    learning,
    detail,
    settledOutcomes: outcomeRows.length,
    batchId: batch?.id || null,
  };
}