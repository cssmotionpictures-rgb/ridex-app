import { describe, it, expect } from "vitest";
import { ledgerStatus, safeRows } from "@/lib/globalLearning/pageState";
import {
  summaryOf,
  sectionComparison,
  calibrationBuckets,
  modelComparison,
  brierOf,
  loglossOf,
} from "@/lib/globalLearning/analysis";
import { learnedReport } from "@/lib/globalLearning/insights";

// REGRESSION LOCK — the Prediction Intelligence page must NEVER render blank.
// The page's visible state is a pure function (ledgerStatus) and its data path
// always routes collections through safeRows before analytics. Origin: the
// page once gated all content on the first ledger read resolving; under the
// platform read throttle that read could stall and leave a blank screen.
describe("PredictionIntelligencePage — never-blank regression", () => {
  it("safeRows tolerates every malformed collection input", () => {
    expect(safeRows(undefined)).toEqual([]);
    expect(safeRows(null)).toEqual([]);
    expect(safeRows("nope")).toEqual([]);
    expect(safeRows({})).toEqual([]);
    expect(safeRows([null, undefined, 3, "row", {}, { status: "won" }])).toEqual([{}, { status: "won" }]);
  });

  it("every ledgerStatus combination resolves to an explicit visible state — never undefined/blank", () => {
    const matrix = [
      { initialLoading: true, ledgerError: false, rowsCount: 0, bgSync: "idle", expect: "loading" },
      { initialLoading: true, ledgerError: false, rowsCount: 500, bgSync: "idle", expect: "ready" },
      { initialLoading: false, ledgerError: false, rowsCount: 0, bgSync: "idle", expect: "ready" },
      { initialLoading: false, ledgerError: false, rowsCount: 1043, bgSync: "syncing", expect: "syncing" },
      { initialLoading: false, ledgerError: false, rowsCount: 1043, bgSync: "done", expect: "ready" },
      { initialLoading: false, ledgerError: false, rowsCount: 1043, bgSync: "failed", expect: "partial" },
      { initialLoading: false, ledgerError: true, rowsCount: 1043, bgSync: "idle", expect: "partial" },
      { initialLoading: false, ledgerError: true, rowsCount: 0, bgSync: "idle", expect: "error" },
      { initialLoading: false, ledgerError: true, rowsCount: 0, bgSync: "failed", expect: "partial" },
    ];
    matrix.forEach((m) => {
      const s = ledgerStatus(m);
      expect(s.key).toBe(m.expect);
      expect(typeof s.label).toBe("string");
      expect(s.label.length).toBeGreaterThan(0);
      expect(typeof s.note).toBe("string");
      expect(s.note.length).toBeGreaterThan(0);
      expect(s.dot).toBeTruthy();
      expect(s.tone).toBeTruthy();
    });
  });

  it("raw malformed rows WOULD crash analytics — safeRows is the page's guard", () => {
    const junk = [null, undefined, "row", 7, {}, { status: "won" }, { status: "lost", probability: 0.8, market_odds: 1.9 }];
    expect(() => summaryOf(junk)).toThrow();
    const safe = safeRows(junk);
    expect(() => summaryOf(safe)).not.toThrow();
    expect(() => sectionComparison(safe)).not.toThrow();
    expect(() => calibrationBuckets(safe)).not.toThrow();
    expect(() => modelComparison(safe)).not.toThrow();
    expect(() => learnedReport(safe, summaryOf(safe))).not.toThrow();
  });

  it("empty ledger data resolves to honest zero metrics, not a crash", () => {
    expect(summaryOf([])).toMatchObject({ n: 0, settled: 0, won: 0, lost: 0, brier: null, logloss: null });
    expect(sectionComparison([])).toEqual([]);
    expect(calibrationBuckets([])).toHaveLength(6); // the bucket table always renders
    expect(learnedReport([], summaryOf([])).findings).toEqual([]);
    expect(learnedReport([], summaryOf([])).whatChanged).toEqual([]);
  });

  it("populated + partial rows produce real metrics (no fabrication, no crash)", () => {
    const rows = safeRows([
      { source_section: "kala", model_version: "RX-2.0", status: "won", probability: 0.8, market_odds: 1.9, market_key: "1", fixture_id: "f1" },
      { source_section: "kala", model_version: "RX-2.0", status: "lost", probability: 0.7, market_odds: 1.5, market_key: "O2.5", fixture_id: "f2" },
      { source_section: "win-raba", model_version: "wr-v1", status: "open", probability: 0.6, market_key: "X2", fixture_id: "f3" },
      {}, // entity row with every optional field missing
    ]);
    const s = summaryOf(rows);
    expect(s.n).toBe(4);
    expect(s.settled).toBe(2);
    expect(s.won).toBe(1);
    expect(s.winRate).toBe(50);
    expect(s.brier).toBeGreaterThan(0);
    expect(sectionComparison(rows).map((x) => x.section).sort()).toEqual(["kala", "win-raba"]);
    expect(() => brierOf(rows)).not.toThrow();
    expect(() => loglossOf(rows)).not.toThrow();
  });
});