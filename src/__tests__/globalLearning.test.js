// GLOBAL LEARNING ENGINE — automated tests for the pure software behavior:
// parser, matcher, global ids, duplicate hashes, settlement verdicts, factor
// attribution, calibration buckets and the pattern evidence gate. Synthetic
// fixtures are used ONLY here (deterministic software tests) and are clearly
// separated from real prediction evidence — they never enter real statistics.
import { describe, it, expect } from "vitest";
import { globalPredictionId, importHash, oddsRangeOf, marketFamilyOf } from "@/lib/globalLearning/globalId";
import { parseResultsText, parseLine } from "@/lib/globalLearning/parser";
import { matchParsedRow, normalizedScore } from "@/lib/globalLearning/matcher";
import { factorsOf, calibrationBuckets, patternCandidates, modelComparison, summaryOf } from "@/lib/globalLearning/analysis";
import { settleCanonical } from "@/lib/ensemble/markets";

describe("global prediction id", () => {
  it("is deterministic and idempotent", () => {
    expect(globalPredictionId("kala", "RX-2.0", "of-en.1-1", "O2.5", 1)).toBe(globalPredictionId("kala", "RX-2.0", "of-en.1-1", "O2.5", 1));
  });
  it("separates versions instead of overwriting", () => {
    expect(globalPredictionId("kala", "RX-2.0", "f", "1", 1)).not.toBe(globalPredictionId("kala", "RX-2.0", "f", "1", 2));
  });
  it("separates sections and models on the same fixture+market", () => {
    expect(globalPredictionId("kala", "RX-2.0", "f", "1", 1)).not.toBe(globalPredictionId("win-raba", "wr-v1", "f", "1", 1));
  });
});

describe("duplicate protection hash", () => {
  it("survives reordering and whitespace", () => {
    expect(importHash("Arsenal 2-1 Chelsea\n\nBayern 3-0 Bremen")).toBe(importHash("bayern 3-0 bremen\narsenal  2-1 chelsea"));
  });
  it("changes when the text changes", () => {
    expect(importHash("Arsenal 2-1 Chelsea")).not.toBe(importHash("Arsenal 2-2 Chelsea"));
  });
});

describe("result parser", () => {
  it("parses a messy single prediction line", () => {
    const p = parseLine("Arsenal 2-1 Chelsea Over 2.5 @1.90 WON");
    expect(p.resolved).toBe(true);
    expect(p.home).toBe("Arsenal");
    expect(p.away).toBe("Chelsea");
    expect(p.score).toEqual([2, 1]);
    expect(p.odds).toBeCloseTo(1.9);
    expect(p.resultHint).toBe("won");
    expect(p.marketHint.key).toBe("O2.5");
  });

  it("parses a vs-format line with date, market and bookmaker-less odds", () => {
    const p = parseLine("WIN RABA morning — CF Estrela da Amadora vs Sporting Clube de Braga DNB Home 1-1 2026-09-10 @1.85");
    expect(p.resolved).toBe(true);
    expect(p.home).toContain("Estrela");
    expect(p.away).toContain("Sporting");
    expect(p.date).toBe("2026-09-10");
    expect(p.sourceGuess).toBe("win-raba");
    expect(p.marketHint.key).toBe("DNB1");
  });

  it("parses a reversed-order line", () => {
    const p = parseLine("Sporting Clube de Braga 2-0 Estrela da Amadora");
    expect(p.resolved).toBe(true);
    expect(p.home).toContain("Sporting");
    expect(p.away).toContain("Estrela");
    expect(p.score).toEqual([2, 0]);
  });

  it("returns UNRESOLVED with a reason instead of guessing", () => {
    const p = parseLine("Over 2.5 WON");
    expect(p.resolved).toBe(false);
    expect(p.reason).toBeTruthy();
  });

  it("returns unresolved-with-reason for a line with teams but no score", () => {
    const p = parseLine("Arsenal vs Chelsea");
    expect(p.resolved).toBe(false);
    expect(p.reason).toContain("no score");
  });

  it("keeps an ISO date out of the score scan", () => {
    const p = parseLine("Arsenal 1-0 Chelsea 2026-09-10");
    expect(p.score).toEqual([1, 0]);
    expect(p.date).toBe("2026-09-10");
  });
});

describe("global matcher", () => {
  const rows = [
    { fixture_id: "f1", kickoff: "2026-09-10T20:15:00Z", home: "CF Estrela da Amadora", away: "Sporting Clube de Braga", market_key: "DNB1", status: "open" },
    { fixture_id: "f1", kickoff: "2026-09-10T20:15:00Z", home: "CF Estrela da Amadora", away: "Sporting Clube de Braga", market_key: "O2.5", status: "open" },
    { fixture_id: "f2", kickoff: "2026-09-11T20:15:00Z", home: "CF Estrela da Amadora", away: "Sporting Clube de Braga", market_key: "1", status: "open" },
  ];

  it("matches a fixture and returns every open market row of it", () => {
    const p = parseLine("Estrela da Amadora 1-1 Sporting Braga 2026-09-10");
    const m = matchParsedRow(p, rows);
    expect(m.status).toBe("EXACT_MATCH");
    expect(m.rows).toHaveLength(2);
  });

  it("matches reversed order at HIGH confidence and normalizes the score", () => {
    const p = parseLine("Sporting Braga 2-0 Estrela Amadora 2026-09-10");
    const m = matchParsedRow(p, rows);
    expect(m.status).toBe("HIGH_CONFIDENCE_MATCH");
    expect(m.reversed).toBe(true);
    expect(normalizedScore(p, true)).toEqual([0, 2]);
  });

  it("flags multiple fixtures as POSSIBLE — never auto-settles", () => {
    const p = parseLine("Estrela da Amadora 1-1 Sporting Braga");
    const m = matchParsedRow(p, rows);
    expect(m.status).toBe("POSSIBLE_MATCH");
    expect(m.rows).toHaveLength(0);
  });

  it("a date hint anchors the match and refuses wrong dates", () => {
    const p = parseLine("Estrela da Amadora 1-1 Sporting Braga 2026-12-25");
    const m = matchParsedRow(p, rows);
    expect(m.status).toBe("NO_MATCH");
  });

  it("returns NO_MATCH for unknown teams", () => {
    const p = parseLine("Real Madrid 1-0 Barcelona");
    const m = matchParsedRow(p, rows);
    expect(m.status).toBe("NO_MATCH");
  });
});

describe("settlement verdicts under canonical rules", () => {
  it("DNB draw is a PUSH, never a win or loss", () => {
    expect(settleCanonical("DNB1", 1, 1)).toBeNull();
  });
  it("totals use the line", () => {
    expect(settleCanonical("O2.5", 2, 1)).toBe(true);
    expect(settleCanonical("O2.5", 1, 1)).toBe(false);
    expect(settleCanonical("U3.5", 1, 2)).toBe(true);
  });
  it("unknown markets are never settled by generic logic", () => {
    expect(settleCanonical("WHATEVER", 1, 0)).toBeUndefined();
  });
  it("invalid scores are never settled", () => {
    expect(settleCanonical("1", "x", 2)).toBeUndefined();
  });
});

describe("win/loss factor attribution", () => {
  it("a priced win with positive edge is a predictive signal", () => {
    const f = factorsOf({ market_odds: 2.1, edge_pct: 5, agreement: 0.9, data_quality: "HIGH" }, "won", [2, 0]);
    expect(f.winFactors[0].factor).toContain("genuine model edge");
    expect(f.lossFactors).toHaveLength(0);
  });
  it("a priced win with NO edge is flagged fortuitous, not proof", () => {
    const f = factorsOf({ market_odds: 2.1, edge_pct: -2, agreement: 0.8 }, "won", [2, 0]);
    expect(f.winFactors[0].factor).toContain("fortuitous");
  });
  it("a loss with model disagreement attributes the disagreement", () => {
    const f = factorsOf({ market_odds: 0, agreement: 0.6 }, "lost", [0, 2]);
    expect(f.lossClass).toBe("G_model_disagreement");
  });
  it("an unexplainable loss stays UNKNOWN — causation is never invented", () => {
    const f = factorsOf({ market_odds: 2.0, edge_pct: 4, agreement: 0.9, data_quality: "HIGH" }, "lost", [0, 1]);
    expect(f.lossFactors.some((x) => x.class === "UNKNOWN")).toBe(true);
    expect(f.lossClass).toBe("UNCLASSIFIED");
  });
});

describe("calibration + pattern evidence gate", () => {
  const synth = (i, prob, won, extra = {}) => ({
    global_prediction_id: `g${i}`,
    source_section: i % 2 ? "kala" : "win-raba",
    market_key: "2",
    market_odds: 3.4,
    probability: prob,
    status: won ? "won" : "lost",
    agreement: 0.9,
    data_quality: "HIGH",
    ...extra,
  });

  it("computes calibration buckets", () => {
    const rows = [synth(1, 0.8, true), synth(2, 0.8, false), synth(3, 0.8, true)];
    const b = calibrationBuckets(rows).find((x) => x.bucket === "80–89");
    expect(b.n).toBe(3);
    expect(b.actual).toBeCloseTo(66.7, 0);
  });

  it("requires a real sample before a pattern becomes a hypothesis", () => {
    const few = Array.from({ length: 10 }, (_, i) => synth(i, 0.8, i % 3 === 0));
    expect(patternCandidates(few, { minN: 20 })).toHaveLength(0);
    const many = Array.from({ length: 40 }, (_, i) => synth(i, 0.8, i % 3 === 0)); // ~33% actual vs 80% predicted
    const cands = patternCandidates(many, { minN: 20 });
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0].sections.length).toBe(2); // spans two sections → GLOBAL scope
    expect(cands[0].gap).toBeLessThan(0); // overconfident
  });

  it("model comparison never declares a winner from paired rows", () => {
    const rows = [synth(1, 0.7, true, { model_version: "RX-2.0", source_section: "kala", fixture_id: "f", market_key: "1" })];
    const cmp = modelComparison(rows);
    expect(cmp.champion.n).toBe(1);
    expect(cmp.verdict).toContain("not established");
  });

  it("summary counts void as nothing", () => {
    const s = summaryOf([{ status: "won" }, { status: "void" }, { status: "push" }]);
    expect(s.settled).toBe(1);
    expect(s.void).toBe(2);
  });
});

describe("odds + market families", () => {
  it("ranges and families used by the pattern scan", () => {
    expect(oddsRangeOf(3.4)).toBe("3.00–3.99");
    expect(oddsRangeOf(0)).toBe("model only");
    expect(marketFamilyOf("2")).toBe("away win");
    expect(marketFamilyOf("BTTS_Y")).toBe("btts");
  });
});