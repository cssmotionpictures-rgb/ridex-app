import { describe, it, expect } from "vitest";
import {
  regradeOf, crossCheckSettlements, windowStartOf,
} from "@/lib/globalLearning/verifyLedger";

// SETTLEMENT VERIFICATION ROUTINE — every settled row is re-graded from its
// own stored real final score and cross-referenced across the observation
// ledger, the global ledger, the outcome ledger and the mirrored boards.
const T = "2026-09-09T12:00:00Z";
const GID = "kala|RX-2.0|fx|1|v1";

const obs = (over = {}) => ({
  observation_key: "fx|1",
  fixture_id: "fx",
  market_key: "1",
  market_label: "HOME WIN",
  model_version: "RX-2.0",
  home: "Arsenal",
  away: "Chelsea",
  status: "won",
  actual_home: 2,
  actual_away: 0,
  settled_at: T,
  ...over,
});
const ledgerRow = (over = {}) => ({
  global_prediction_id: GID,
  source_section: "kala",
  home: "Arsenal",
  away: "Chelsea",
  market_key: "1",
  market_label: "HOME WIN",
  status: "won",
  actual_home: 2,
  actual_away: 0,
  settled_at: T,
  ...over,
});
const outcomeRow = (over = {}) => ({
  global_prediction_id: GID,
  settlement: "won",
  final_home: 2,
  final_away: 0,
  ...over,
});

describe("regradeOf — a correct row always re-grades to itself", () => {
  it("re-grades every market family under its canonical rule", () => {
    expect(regradeOf({ market_key: "1", actual_home: 2, actual_away: 0 })).toBe("won");
    expect(regradeOf({ market_key: "1", actual_home: 1, actual_away: 1 })).toBe("lost");
    expect(regradeOf({ market_key: "X", actual_home: 1, actual_away: 1 })).toBe("won");
    expect(regradeOf({ market_key: "O2.5", actual_home: 2, actual_away: 1 })).toBe("won");
    expect(regradeOf({ market_key: "U2.5", actual_home: 2, actual_away: 1 })).toBe("lost");
    expect(regradeOf({ market_key: "BTTS_Y", actual_home: 1, actual_away: 1 })).toBe("won");
    expect(regradeOf({ market_key: "DNB1", actual_home: 1, actual_away: 1 })).toBe("void");
  });
  it("refuses to verify without an honest grade", () => {
    expect(regradeOf({ market_key: "1", actual_home: undefined, actual_away: 0 })).toBe(undefined);
    expect(regradeOf({ market_key: "mystery", actual_home: 1, actual_away: 0 })).toBe(undefined);
  });
});

describe("crossCheckSettlements — the day's settled results vs the prediction ledger", () => {
  it("a fully consistent day reports zero mismatches", () => {
    const r = crossCheckSettlements({
      observations: [obs()],
      ledger: [ledgerRow()],
      outcomes: [outcomeRow()],
      runo: [{ observation_key: "fx|1", home: "Arsenal", away: "Chelsea", market_label: "HOME WIN", status: "won" }],
      monster: [{ observation_key: "fx|1", home: "Arsenal", away: "Chelsea", market_label: "HOME WIN", status: "won" }],
      windowStart: 0,
    });
    expect(r.allConsistent).toBe(true);
    expect(r.mismatches).toEqual([]);
    expect(r.breakdown).toEqual({ observations: 1, globalLedger: 1, mirrors: 2 });
  });

  it("flags a settled row whose stored score grades differently", () => {
    const r = crossCheckSettlements({
      observations: [obs({ status: "lost" })], // 2-0 home win marked LOST
      ledger: [ledgerRow({ status: "lost" })],
      outcomes: [outcomeRow({ settlement: "lost" })],
      windowStart: 0,
    });
    expect(r.mismatches.some((m) => m.kind === "GRADE_MISMATCH" && m.severity === "HIGH")).toBe(true);
    expect(r.severityCounts.HIGH).toBeGreaterThanOrEqual(2); // observation + global ledger both re-grade it
  });

  it("flags a settled observation that was never ingested into the global ledger", () => {
    const r = crossCheckSettlements({
      observations: [obs()],
      ledger: [],
      outcomes: [],
      windowStart: 0,
    });
    expect(r.mismatches.some((m) => m.kind === "MISSING_GLOBAL_ROW")).toBe(true);
    expect(r.mismatches.some((m) => m.kind === "MISSING_OUTCOME")).toBe(true);
  });

  it("flags an outcome row that disagrees with the authoritative settlement", () => {
    const r = crossCheckSettlements({
      observations: [obs()],
      ledger: [ledgerRow()],
      outcomes: [outcomeRow({ settlement: "lost", final_home: 3 })],
      windowStart: 0,
    });
    expect(r.mismatches.some((m) => m.kind === "OUTCOME_MISMATCH")).toBe(true);
    expect(r.mismatches.some((m) => m.kind === "OUTCOME_SCORE_MISMATCH")).toBe(true);
  });

  it("flags mirrored boards that disagree with the authoritative settlement", () => {
    const r = crossCheckSettlements({
      observations: [obs()],
      ledger: [ledgerRow()],
      outcomes: [outcomeRow()],
      runo: [{ observation_key: "fx|1", home: "A", away: "B", market_label: "HOME WIN", status: "open" }],
      monster: [{ observation_key: "fx|1", home: "A", away: "B", market_label: "HOME WIN", status: "lost" }],
      windowStart: 0,
    });
    expect(r.mismatches.some((m) => m.kind === "MIRROR_UNSETTLED" && m.section === "run-o")).toBe(true);
    expect(r.mismatches.some((m) => m.kind === "MIRROR_MISMATCH" && m.section === "monster" && m.severity === "HIGH")).toBe(true);
  });

  it("only checks rows settled inside the window", () => {
    const r = crossCheckSettlements({
      observations: [obs({ settled_at: "2026-09-01T12:00:00Z" })],
      ledger: [],
      outcomes: [],
      windowStart: new Date("2026-09-09T00:00:00Z").getTime(),
    });
    expect(r.checked).toBe(0);
    expect(r.allConsistent).toBe(true); // nothing settled in the window — nothing to flag
  });

  it("void rows with no stored score are skipped, not flagged", () => {
    const r = crossCheckSettlements({
      observations: [obs({ status: "void", actual_home: undefined, actual_away: undefined })],
      ledger: [],
      outcomes: [],
      windowStart: 0,
    });
    expect(r.mismatches.some((m) => m.kind === "GRADE_MISMATCH")).toBe(false);
    expect(r.mismatches.some((m) => m.kind === "GRADE_UNVERIFIABLE")).toBe(true);
  });
});

describe("windowStartOf — Lagos day keys convert to exact UTC instants", () => {
  it("treats a Lagos date as UTC+1", () => {
    expect(windowStartOf("2026-09-09")).toBe(new Date("2026-09-08T23:00:00Z").getTime());
  });
});