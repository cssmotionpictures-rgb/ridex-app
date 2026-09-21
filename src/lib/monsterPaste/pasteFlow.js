// MONSTER PASTE FLOW — the orchestration behind PASTE BETTING GAMES.
// Paste any betting-site text → parse (no manual formatting) → match games
// against the SAME verified fixture pool the MONSTER board scans → analyze
// through the SAME RX-2.0 engine + MONSTER qualification gate → ranked
// MONSTER BEST PICKS + automatic ticket arrangements → permanent, idempotent
// records that settle automatically from the verified result and learn through
// the SAME global ledger row every section learns through.
//
// PRECISION OVER VOLUME: a pasted game that cannot be identified in the
// verified pool is REJECTED with its reason (INSUFFICIENT DATA) — the engine
// never invents analysis for a game it cannot verify, and it never forces a
// pick to fill a ticket.

import { base44 } from "@/api/base44Client";
import { buildWinRabaBoard } from "@/lib/winRaba";
import { recordObservations } from "@/lib/ensemble/observations";
import { getEngineCalibration, getEngineWeights } from "@/lib/ensemble/store";
import { buildMonster, correlationRiskOf } from "@/lib/monsterBoard";
import { recordMonsterPicks, mirrorMonsterSettlement } from "@/lib/monsterBoardLedger";
import { importHash } from "@/lib/globalLearning/globalId";
import { parseBettingPaste, matchGames } from "./parser";
import { buildArrangements } from "./arrangements";

// The verified board scan is shared with the MONSTER daily page and cached
// briefly so a follow-up paste doesn't re-traverse every league.
const BOARD_TTL_MS = 30 * 60 * 1000;
let boardCache = null;
let boardCacheAt = 0;

export async function getPasteBoard({ force = false, onProgress } = {}) {
  if (!force && boardCache && Date.now() - boardCacheAt < BOARD_TTL_MS) return boardCache;
  const [calibration, learnedWeights] = await Promise.all([
    getEngineCalibration().catch(() => null),
    getEngineWeights().catch(() => null),
  ]);
  const board = await buildWinRabaBoard({ force, calibration, learnedWeights, onProgress });
  boardCache = board;
  boardCacheAt = Date.now();
  return board;
}

// Deterministic PASTE selection identity — idempotent per fixture+market.
export const pasteIdOf = (fixtureId, marketKey, version) =>
  `paste|${fixtureId}|${marketKey}|v${version}`;

const uniqueFixtures = (board) => {
  const seen = new Map();
  for (const d of board?.days || []) {
    for (const p of d.all || []) {
      if (p?.fixtureId && !seen.has(p.fixtureId)) {
        seen.set(p.fixtureId, {
          fixtureId: p.fixtureId,
          home: p.home,
          away: p.away,
          league: p.league,
          kickoff: p.kickoff,
          lagosDateKey: p.lagosDateKey,
          session: p.session,
        });
      }
    }
  }
  return [...seen.values()];
};

// Full paste pipeline. `record` controls persistence (the UI always records;
// tests pass false).
export async function analyzePaste({ text, force = false, onProgress, record = true }) {
  // 1. PARSE — duplicates removed, unparseable lines kept visible
  const parsed = parseBettingPaste(text);
  const stats = { ...parsed.stats, gamesMatched: 0, gamesReview: 0, gamesNotFound: 0, picksQualified: 0, picksWatch: 0, picksRejected: 0, picksRecorded: 0 };

  if (!parsed.games.length) {
    const batch = {
      import_hash: importHash(text),
      raw_text: String(text || ""),
      source: "monster-paste",
      status: "empty",
      games_detected: 0,
      markets_detected: stats.marketsDetected,
      duplicates_removed: stats.duplicatesRemoved,
      unparseable_lines: stats.unparseableLines.length,
      summary_json: JSON.stringify({ unparseable: stats.unparseableLines }),
      imported_at: new Date().toISOString(),
    };
    if (record) await base44.entities.PasteImport.create(batch).catch(() => null);
    return { parsed, stats, picks: [], watch: [], rejected: [], gateRejected: [], arrangements: null, recorded: 0, batchStatus: "empty" };
  }

  // 2. MATCH — same verified fixture pool the MONSTER board scans
  const board = await getPasteBoard({ force, onProgress });
  const { matched, review, notFound } = matchGames(parsed.games, uniqueFixtures(board));
  stats.gamesMatched = matched.length;
  stats.gamesReview = review.length;
  stats.gamesNotFound = notFound.length;

  // 3. ANALYZE — only the matched fixtures' candidates, through the SAME
  // MONSTER gate, ranking and correlation control the daily board uses.
  const matchedIds = new Set(matched.map((m) => m.fixtureId));
  const filteredBoard = {
    days: (board.days || []).map((d) => ({
      ...d,
      all: (d.all || []).filter((p) => matchedIds.has(p.fixtureId)),
    })),
  };
  const monster = buildMonster(filteredBoard, { windowKey: "5d", session: "all" });
  const picks = monster.ranked || [];
  const correlation = Object.fromEntries(picks.map((p) => [`${p.fixtureId}|${p.marketKey}`, correlationRiskOf(p, picks)]));
  stats.picksQualified = picks.length;
  stats.picksWatch = (monster.watch || []).length;
  stats.picksRejected = (monster.rejected || []).length;

  // 4. ARRANGE — automatic ticket structures, qualified picks only
  const arrangements = buildArrangements(picks, correlation);

  // 5. RECORD — the same immutable evidence infrastructure every section
  // uses: observations first (idempotent), then the PASTE selections with
  // their own deterministic paste ids. They settle automatically from the
  // linked verified observation and learn through the shared global row.
  let recorded = 0;
  if (record && picks.length) {
    await recordObservations(board).catch(() => null);
    recorded = await recordMonsterPicks(
      picks.map((p, i) => ({ pick: p, rank: i + 1, correlation: correlation[`${p.fixtureId}|${p.marketKey}`] || "LOW" })),
      { idOf: pasteIdOf, section: "monster-paste" }
    ).catch(() => ({ recorded: 0 }));
    recorded = recorded?.recorded ?? recorded ?? 0;
    await mirrorMonsterSettlement().catch(() => null);
    stats.picksRecorded = recorded;
  }

  // 6. AUDIT — the paste batch record (import hash flags a repeated paste)
  const summary = {
    games: [
      ...matched.map((m) => ({ pasted: `${m.pasted.home} vs ${m.pasted.away}`, status: "matched", fixtureId: m.fixtureId, verified: `${m.home} vs ${m.away}` })),
      ...review.map((r) => ({ pasted: `${r.home} vs ${r.away}`, status: "review", reason: r.reason })),
      ...notFound.map((r) => ({ pasted: `${r.home} vs ${r.away}`, status: "not_found", reason: r.reason })),
    ],
    picksQualified: picks.map((p) => `${p.fixtureId}|${p.marketKey}|${p.masterScore ?? p.score ?? 0}`),
    arrangements: Object.fromEntries(Object.values(arrangements).map((a) => [a.key, a.legs?.length || 0])),
    unparseable: stats.unparseableLines,
  };
  const batchStatus = "imported";
  if (record) {
    const hash = importHash(text);
    const dup = await base44.entities.PasteImport.filter({ import_hash: hash }, "-created_date", 1).catch(() => []);
    await base44.entities.PasteImport
      .create({
        import_hash: hash,
        raw_text: String(text || ""),
        source: "monster-paste",
        status: (dup || []).length ? "duplicate" : batchStatus,
        games_detected: stats.gamesDetected,
        markets_detected: stats.marketsDetected,
        duplicates_removed: stats.duplicatesRemoved,
        games_matched: stats.gamesMatched,
        games_review: stats.gamesReview,
        games_not_found: stats.gamesNotFound,
        picks_qualified: stats.picksQualified,
        picks_watch: stats.picksWatch,
        picks_rejected: stats.picksRejected,
        picks_recorded: recorded,
        unparseable_lines: stats.unparseableLines.length,
        summary_json: JSON.stringify(summary),
        imported_at: new Date().toISOString(),
      })
      .catch(() => null);
  }

  return {
    parsed,
    stats,
    matched,
    picks,
    watch: monster.watch || [],
    correlation,
    rejected: [...review, ...notFound],
    gateRejected: (monster.rejected || []).map((r) => ({
      home: r.pick?.home,
      away: r.pick?.away,
      marketLabel: r.pick?.marketLabel,
      reason: r.reason,
    })),
    arrangements,
    recorded,
    batchStatus,
  };
}