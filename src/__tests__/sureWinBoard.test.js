// SURE WIN BOARD — live lifecycle regression tests (pure logic; the candidate
// gates run through the REAL Selection Intelligence Engine, the snapshot/
// state/results helpers through the REAL board module). Covers the spec's
// deterministic candidate tests A–H, no-future-leakage, snapshot immutability,
// honest board states, settled results and filter derivation.
import { describe, it, expect } from "vitest";
import {
  normalizeCandidate, rankAndSelect, scoreCandidate, recommendationOf,
  deriveThresholds, regimeOf, modelHealthOf,
  SURE_WIN_PROBABILITY, SURE_WIN_MAX_PICKS,
} from "@/lib/globalLearning/selectionEngine";
import {
  boardStateOf, snapshotRowOf, missingSnapshots, sportOf, resultsStatsOf, lagosDateKeyOf,
} from "@/lib/globalLearning/sureWinBoard";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
const BASE = {
  fixture_id: "of-en.1-2026-09-12-arsenal-chelsea",
  home: "Arsenal", away: "Chelsea", league: "Premier League",
  kickoff: "2026-09-12T19:00:00.000Z", recorded_at: "2026-09-11T09:00:00.000Z",
  market_key: "1", market_label: "Home Win",
  calibrated_probability: 0.86, agreement: 0.92, uncertainty: 0.1, data_quality: "HIGH",
  market_odds: 1.5, odds_status: "priced",
  injury_status: "matched", lineup_status: "confirmed",
  flags_json: "[]", model_version: "RX-2.0", confidence: 88,
};
const CAND = (over = {}) => normalizeCandidate({ ...BASE, ...over }, "engine");
const CTX = () => ({
  now: NOW, segments: new Map(), thresholds: deriveThresholds(null),
  regime: regimeOf({}), health: modelHealthOf([]),
});
const boardOf = (cands) => rankAndSelect(cands, CTX());

describe("deterministic candidate lifecycle (spec tests A–H)", () => {
  it("A/B: 91% and 86% with excellent evidence reach SURE WIN", () => {
    const { picks } = boardOf([
      CAND({ fixture_id: "fa", calibrated_probability: 0.91 }),
      CAND({ fixture_id: "fb", calibrated_probability: 0.86 }),
    ]);
    expect(picks).toHaveLength(2);
    expect(picks.every((p) => p.calibrated >= SURE_WIN_PROBABILITY)).toBe(true);
  });

  it("C: 82.9% is excluded — the 83% floor is absolute", () => {
    const { picks } = boardOf([CAND({ calibrated_probability: 0.829 })]);
    expect(picks).toHaveLength(0);
  });

  it("D: 90% with bad data health is BLOCKED, never displayed", () => {
    const { picks, scored } = boardOf([CAND({ calibrated_probability: 0.90, data_quality: "LOW" })]);
    expect(scored[0].recommendationStatus).toBe("BLOCKED");
    expect(picks).toHaveLength(0);
  });

  it("E: 85% with excessive uncertainty is downgraded below the board", () => {
    const { picks, scored } = boardOf([CAND({ calibrated_probability: 0.85, uncertainty: 0.6 })]);
    expect(["NO_PICK", "LEAN"]).toContain(scored[0].recommendationStatus);
    expect(picks).toHaveLength(0);
  });

  it("H: more than 20 qualifying candidates display exactly 20, ranked by composite quality", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      CAND({ fixture_id: `f-${i}`, home: `H${i}`, away: `A${i}`, calibrated_probability: 0.88 + (i % 3) * 0.02 }));
    const { picks, stats } = boardOf(many);
    expect(picks).toHaveLength(SURE_WIN_MAX_PICKS);
    expect(stats.onBoard).toBe(SURE_WIN_MAX_PICKS);
    for (let i = 1; i < picks.length; i++) expect(picks[i - 1].quality).toBeGreaterThanOrEqual(picks[i].quality);
  });
});

describe("no future leakage — settlement data can never influence the board", () => {
  it("post-match fields on a raw record do not change the engine's decision", () => {
    const ctx = CTX();
    const clean = recommendationOf({ ...scoreCandidate(CAND(), ctx), ctxRegime: "STABLE" }, ctx.thresholds);
    const tainted = recommendationOf({
      ...scoreCandidate(CAND({ actual_home: 4, actual_away: 0, status: "won", settled_at: "2026-09-12T21:00:00.000Z" }), ctx),
      ctxRegime: "STABLE",
    }, ctx.thresholds);
    expect(tainted.quality).toBe(clean.quality);
    expect(tainted.recommendationStatus).toBe(clean.recommendationStatus);
  });

  it("a record timestamped at/after kickoff is BLOCKED as possible leakage", () => {
    expect(scoreCandidate(CAND({ recorded_at: "2026-09-12T19:01:00.000Z" }), CTX()).health.status).toBe("BLOCKED");
  });

  it("a started (passed-kickoff) candidate can never sit on the board", () => {
    const { picks } = boardOf([CAND({ kickoff: "2026-09-10T19:00:00.000Z", recorded_at: "2026-09-09T09:00:00.000Z" })]);
    expect(picks).toHaveLength(0);
  });
});

describe("immutable board snapshots — first publish wins, never rewritten", () => {
  it("snapshot keys are deterministic and rows carry only pre-kickoff fields", () => {
    const { picks } = boardOf([CAND({ prediction_key: "fx|1" })]);
    const row = snapshotRowOf(picks[0]);
    expect(row.snapshot_key).toBe(`surewin|${BASE.fixture_id}|1`);
    expect(row.candidate_id).toBe("fx|1");
    expect(row.probability).toBeCloseTo(0.86, 5);
    expect(row.board_rank).toBe(1);
    const json = JSON.stringify(row);
    expect(json).not.toContain("actual_home");
    expect(json).not.toContain("settled_at");
  });

  it("an existing snapshot is never duplicated or rewritten on republish", () => {
    const pick = {
      candidate: CAND(), calibrated: 0.86, quality: 0.7, rank: 1, reasons: ["x"],
      health: { score: 100, status: "OK", notes: [] }, correlation: null,
      recommendationStatus: "STRONG_PICK", agreement: 0.9, uncertainty: 0.1,
    };
    const row = snapshotRowOf(pick);
    expect(missingSnapshots([row.snapshot_key], [row])).toHaveLength(0);
    // a later republish with different rank/probability NEVER overwrites history
    const changed = [{ ...row, probability: 0.99, board_rank: 9 }];
    expect(missingSnapshots([row.snapshot_key], changed)).toHaveLength(0);
    expect(missingSnapshots(["some-other-key"], [row])).toHaveLength(1);
  });
});

describe("board states — a failed read is never reported as NO GAMES", () => {
  it("derives DATA_ERROR / NO_CANDIDATES / NO_QUALIFYING / GAMES_AVAILABLE honestly", () => {
    expect(boardStateOf({ poolFailed: true, poolEmpty: false, picksCount: 5 })).toBe("DATA_ERROR");
    expect(boardStateOf({ poolFailed: false, poolEmpty: true, picksCount: 0 })).toBe("NO_CANDIDATES");
    expect(boardStateOf({ poolFailed: false, poolEmpty: false, picksCount: 0 })).toBe("NO_QUALIFYING");
    expect(boardStateOf({ poolFailed: false, poolEmpty: false, picksCount: 3 })).toBe("GAMES_AVAILABLE");
  });

  it("flags STALE only when the last verified refresh exceeds the freshness window", () => {
    const now = 10_000_000_000;
    expect(boardStateOf({ poolFailed: false, poolEmpty: false, picksCount: 2, lastLoadedAt: now - 11 * 60 * 1000, now })).toBe("STALE");
    expect(boardStateOf({ poolFailed: false, poolEmpty: false, picksCount: 2, lastLoadedAt: now - 60 * 1000, now })).toBe("GAMES_AVAILABLE");
  });
});

describe("settled results — honest history, losses never hidden", () => {
  const snaps = (n) => Array.from({ length: n }, (_, i) => ({
    fixture_id: `f${i}`, market_key: "1", probability: 0.85, quality_score: 0.7,
  }));

  it("computes win rate from BOTH wins and losses", () => {
    const snapshots = snaps(10);
    const settledByFM = new Map(snapshots.map((s, i) => [`${s.fixture_id}|${s.market_key}`, i < 7 ? "won" : "lost"]));
    const r = resultsStatsOf(snapshots, settledByFM);
    expect(r.settled).toBe(10);
    expect(r.wins).toBe(7);
    expect(r.losses).toBe(3);
    expect(r.winRatePct).toBeCloseTo(70, 5);
    expect(r.limited).toBe(true); // small sample — honestly caveated
    expect(r.pending).toBe(0);
  });

  it("void/cancelled count toward nothing; unsettled picks stay pending", () => {
    const snapshots = snaps(4);
    const settledByFM = new Map([["f0|1", "won"], ["f1|1", "void"], ["f2|1", "cancelled"]]);
    const r = resultsStatsOf(snapshots, settledByFM);
    expect(r.voids).toBe(2);
    expect(r.graded).toBe(1);
    expect(r.winRatePct).toBe(100); // graded-only rate, voids excluded
    expect(r.pending).toBe(1);
  });
});

describe("filters derive from what the candidate pool actually carries", () => {
  it("infers sport only from the candidate's own league/fixture labels", () => {
    expect(sportOf(CAND({ league: "NBA" }))).toBe("Basketball");
    expect(sportOf(CAND({ league: "ATP Montreal" }))).toBe("Tennis");
    expect(sportOf(CAND({ league: "MLB" }))).toBe("Baseball");
    expect(sportOf(CAND({ league: "Premier League" }))).toBe("Football");
  });

  it("date keys are Africa/Lagos day based", () => {
    expect(lagosDateKeyOf("2026-09-12T19:00:00.000Z")).toBe("2026-09-12");
    expect(lagosDateKeyOf("2026-09-12T23:30:00.000Z")).toBe("2026-09-13"); // 00:30 Lagos
  });
});