// MODEL-VS-MARKET OBSERVATION LAYER — regression lock for the market math,
// disagreement classification, strict model/bookmaker odds separation, the
// tennis research cases, the tennis calibration track and the learning
// evidence gate. One observation NEVER changes a prediction, a weight or a
// threshold, and nothing is ever claimed from an insufficient sample.
import { describe, it, expect } from "vitest";
import {
  marketImpliedProbability,
  marginAdjustedProbability,
  marketProbOf,
  disagreementOf,
  marketObservationOf,
  marketObservations,
  disagreementStats,
  evidenceLabelOf,
  tennisCalibrationTrack,
  userSuppliedMarketCase,
  sportOfRow,
} from "@/lib/globalLearning/marketModel";
import { patternCandidates } from "@/lib/globalLearning/analysis";
import { evidenceLevelOf } from "@/lib/globalLearning/insights";

const CIRIC_ROW = {
  global_prediction_id: "monster|monster-v1|espn-183598|2|v1",
  source_section: "monster",
  model_version: "monster-v1",
  sport: "Tennis",
  league: "Montreux Nestlé Open",
  home: "Lucie Havlickova",
  away: "Lucija Ciric Bagaric",
  market_key: "2",
  market_label: "Lucija Ciric Bagaric to Win",
  probability: 0.6604750554779322,
  fair_odds: 1.5140617222498753,
  market_odds: 0,
  bookmaker: "",
  status: "open",
  prediction_version: 1,
  recorded_at: "2026-09-08T23:29:55.200Z",
};

const SABALENKA_ROW = {
  global_prediction_id: "monster|monster-v1|espn-182553|2|v1",
  source_section: "monster",
  model_version: "monster-v1",
  sport: "Tennis",
  league: "US Open",
  home: "Jessica Pegula",
  away: "Aryna Sabalenka",
  market_key: "2",
  market_label: "Aryna Sabalenka to Win",
  probability: 0.648,
  fair_odds: 1.5432098765432096,
  market_odds: 0,
  bookmaker: "",
  status: "open",
  prediction_version: 1,
  recorded_at: "2026-09-10T00:32:38.907Z",
};

const priced = (i, { prob, odds, status, won = false, league = "Premier League", sport = "", section = "kala", market = "1", marketProb = 0, fair = 0 }) => ({
  global_prediction_id: `g${i}`,
  source_section: section,
  model_version: "RX-2.0",
  sport,
  league,
  home: "Home FC",
  away: "Away FC",
  market_key: market,
  market_label: "Home Win",
  probability: prob,
  fair_odds: fair,
  market_odds: odds,
  bookmaker: "Bet9ja",
  market_probability: marketProb,
  margin_probability: 0,
  closing_odds: 0,
  clv_pct: 0,
  confidence: 80,
  odds_status: "priced",
  status: status || (won ? "won" : "lost"),
  prediction_version: 1,
  recorded_at: "2026-09-01T10:00:00Z",
  kickoff: "2026-09-05T15:00:00Z",
});

describe("market probability math", () => {
  it("computes implied probability from a real price — never from a model number", () => {
    expect(marketImpliedProbability(2.55)).toBeCloseTo(0.39216, 4);
    expect(marketImpliedProbability(0)).toBe(0);
    expect(marketImpliedProbability(1)).toBe(0);
    expect(marketImpliedProbability("junk")).toBe(0);
  });

  it("normalizes a same-market price set by the overround", () => {
    const probs = marginAdjustedProbability([2.0, 3.5, 4.0]);
    expect(probs.length).toBe(3);
    expect(probs.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 6);
    expect(probs[0]).toBeGreaterThan(probs[1]);
    expect(marginAdjustedProbability([2.0, 0, 4.0])).toEqual([]); // invalid price → never computed
  });

  it("prefers margin-adjusted, then stored, then the real price — and 0 for model-only rows", () => {
    expect(marketProbOf({ margin_probability: 0.55, market_probability: 0.6, market_odds: 1.8 })).toBeCloseTo(0.55, 6);
    expect(marketProbOf({ margin_probability: 0, market_probability: 0.6, market_odds: 1.8 })).toBeCloseTo(0.6, 6);
    expect(marketProbOf({ margin_probability: 0, market_probability: 0, market_odds: 2.0 })).toBeCloseTo(0.5, 6);
    expect(marketProbOf({ margin_probability: 0, market_probability: 0, market_odds: 0, fair_odds: 1.5 })).toBe(0);
  });
});

describe("disagreement classification", () => {
  it("bands by absolute probability difference with exact thresholds", () => {
    expect(disagreementOf(0.80, 0.77).band).toBe("CLOSE AGREEMENT"); // 3.0pp
    expect(disagreementOf(0.80, 0.769).band).toBe("MODERATE DISAGREEMENT"); // 3.1pp
    expect(disagreementOf(0.80, 0.72).band).toBe("MODERATE DISAGREEMENT"); // 8.0pp
    expect(disagreementOf(0.80, 0.719).band).toBe("HIGH DISAGREEMENT"); // 8.1pp
    expect(disagreementOf(0.80, 0.65).band).toBe("HIGH DISAGREEMENT"); // 15.0pp
    expect(disagreementOf(0.80, 0.649).band).toBe("EXTREME DISAGREEMENT"); // 15.1pp
  });

  it("carries direction and value in percentage points", () => {
    const d = disagreementOf(0.66, 0.39216);
    expect(d.direction).toBe("MODEL ABOVE MARKET");
    expect(d.valuePct).toBeGreaterThan(26);
    expect(d.absDiffPct).toBeGreaterThan(26);
  });
});

describe("model vs bookmaker odds separation", () => {
  it("a model-only row NEVER creates a market observation — fair odds are not a price", () => {
    expect(marketObservationOf(CIRIC_ROW)).toBeNull();
    expect(marketObservationOf({ ...CIRIC_ROW, market_odds: 1 })).toBeNull();
    expect(marketObservationOf({ ...CIRIC_ROW, market_odds: 1.9, odds_status: "model_only" })).toBeTruthy(); // a real price overrides the label
  });

  it("keeps model fair odds and bookmaker odds as permanently separate fields", () => {
    const obs = marketObservationOf(priced(1, { prob: 0.55, odds: 2.1, fair: 1.9, won: true }));
    expect(obs.model_fair_odds).toBe(1.9);
    expect(obs.bookmaker_odds).toBe(2.1);
    expect(obs.bookmaker).toBe("Bet9ja");
    expect(obs.model_fair_odds).not.toBe(obs.bookmaker_odds);
    expect(obs.model_probability).toBe(0.55);
    expect(obs.market_implied_probability).toBeCloseTo(0.476, 3);
  });

  it("computes the model fair odds from probability only when the row carried none — never a bookmaker number", () => {
    const obs = marketObservationOf(priced(2, { prob: 0.5, odds: 2.0, fair: 0 }));
    expect(obs.model_fair_odds).toBeCloseTo(2.0, 6);
    expect(obs.bookmaker_odds).toBe(2.0);
    expect(obs.market_data_quality).toBe("OK");
  });

  it("flags a stored market probability that disagrees with the recorded price (stale/mismatched data)", () => {
    const obs = marketObservationOf(priced(3, { prob: 0.5, odds: 2.0, marketProb: 0.7 }));
    expect(obs.market_data_quality).toContain("CHECK");
  });

  it("never fabricates closing odds — they are only carried when genuinely captured", () => {
    const obs = marketObservationOf(priced(4, { prob: 0.5, odds: 2.0 }));
    expect(obs.closing_odds).toBe(0);
    const withClose = marketObservationOf({ ...priced(5, { prob: 0.5, odds: 2.0 }), closing_odds: 1.95, clv_pct: -2.5 });
    expect(withClose.closing_odds).toBe(1.95);
    expect(withClose.clv_pct).toBe(-2.5);
  });
});

describe("Global Prediction ID preservation + dedupe", () => {
  it("preserves the Global Prediction ID and never duplicates a prediction", () => {
    const obs = marketObservationOf(priced(6, { prob: 0.5, odds: 2.0 }));
    expect(obs.global_prediction_id).toBe("g6");
    const all = marketObservations([
      { ...priced(7, { prob: 0.6, odds: 2.0 }), prediction_version: 1 },
      { ...priced(7, { prob: 0.65, odds: 2.2 }), prediction_version: 2 },
      priced(8, { prob: 0.55, odds: 1.9 }),
    ]);
    expect(all).toHaveLength(2);
    expect(all.find((o) => o.global_prediction_id === "g7").model_probability).toBe(0.65); // newest version wins
  });
});

describe("disagreement statistics + sample gating", () => {
  it("aggregates honestly with gated ROI and honest labels", () => {
    const rows = [
      priced(10, { prob: 0.55, odds: 1.8, won: true }),
      priced(11, { prob: 0.55, odds: 1.8, won: false }),
      priced(12, { prob: 0.55, odds: 1.8, won: true }),
      priced(13, { prob: 0.8, odds: 2.55, won: true }),
      priced(14, { prob: 0.8, odds: 2.55, won: false }),
      priced(15, { prob: 0.6, odds: 1.9, won: false }),
    ];
    const stats = disagreementStats(marketObservations(rows));
    expect(stats.total).toBe(6);
    expect(stats.settled).toBe(6);
    expect(stats.agreementRate).toBeCloseTo(50, 0); // 3 of 6 CLOSE
    expect(stats.largestDiff).toBeGreaterThan(40);
    const close = stats.byBand.find((b) => b.band === "CLOSE AGREEMENT");
    const extreme = stats.byBand.find((b) => b.band === "EXTREME DISAGREEMENT");
    const high = stats.byBand.find((b) => b.band === "HIGH DISAGREEMENT");
    expect(close.n).toBe(3);
    expect(close.winRate).toBeCloseTo(66.67, 0);
    expect(close.evidence).toBe("EVIDENCE ACCUMULATING");
    expect(close.roi).toBeNull(); // ROI is sample-gated — never shown from a tiny sample
    expect(extreme.n).toBe(2);
    expect(high.n).toBe(0);
    expect(high.evidence).toBe("INSUFFICIENT SAMPLE");
  });

  it("shows paper ROI only once a band has a sufficient settled sample", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      priced(100 + i, { prob: 0.55, odds: 1.8, won: i % 3 !== 0 })
    );
    const stats = disagreementStats(marketObservations(rows));
    const close = stats.byBand.find((b) => b.band === "CLOSE AGREEMENT");
    expect(close.settled).toBe(30);
    expect(close.roi).toBeTruthy();
    expect(close.roi.n).toBe(30);
  });

  it("labels evidence honestly at every sample size", () => {
    expect(evidenceLabelOf(0)).toBe("INSUFFICIENT SAMPLE");
    expect(evidenceLabelOf(5)).toBe("EVIDENCE ACCUMULATING");
    expect(evidenceLabelOf(40)).toBe("PATTERN DETECTED — NOT VALIDATED");
    expect(evidenceLabelOf(150)).toBe("EVIDENCE MATURING — VALIDATION PENDING");
    expect(evidenceLabelOf(40, { validated: true })).toBe("VALIDATED INSIGHT");
  });
});

describe("sports + tennis calibration track", () => {
  it("identifies sport from the recorded field and league labels — never guessing", () => {
    expect(sportOfRow({ sport: "Tennis", league: "" })).toBe("Tennis");
    expect(sportOfRow({ sport: "", league: "US Open" })).toBe("Tennis");
    expect(sportOfRow({ sport: "", league: "Montreux Nestlé Open" })).toBe("Tennis");
    expect(sportOfRow({ sport: "", league: "NBA" })).toBe("Basketball");
    expect(sportOfRow({ sport: "", league: "Premier League", source_section: "kala" })).toBe("Football");
    expect(sportOfRow({ sport: "", league: "Some Cup", source_section: "" })).toBe("Unspecified");
  });

  it("bands tennis Winner predictions by model probability with full metrics and honest labels", () => {
    const rows = [
      priced(20, { prob: 0.65, odds: 1.6, won: true, league: "Montreux Nestlé Open", sport: "Tennis", market: "1" }),
      priced(21, { prob: 0.66, odds: 1.62, won: false, league: "Montreux Nestlé Open", sport: "Tennis", market: "2" }),
      priced(22, { prob: 0.9, odds: 1.4, won: true, league: "Montreux Nestlé Open", sport: "Tennis", market: "1" }),
      priced(23, { prob: 0.9, odds: 1.42, won: false, league: "Montreux Nestlé Open", sport: "Tennis", market: "1" }),
      priced(24, { prob: 0.648, odds: 1.56, won: true, league: "US Open", sport: "Tennis", market: "2" }),
    ];
    const track = tennisCalibrationTrack(marketObservations(rows));
    expect(track.total).toBe(5);
    expect(track.settled).toBe(5);
    expect(track.evidence).toBe("EVIDENCE ACCUMULATING");
    const b60 = track.byBand.find((b) => b.band === "60–69");
    expect(b60.n).toBe(3);
    expect(b60.expected).toBeCloseTo(65.27, 1);
    expect(b60.actual).toBeCloseTo(66.67, 0);
    expect(b60.calErr).toBeCloseTo(1.4, 0);
    expect(b60.brier).not.toBeNull();
    expect(b60.logloss).not.toBeNull();
    expect(track.byBand.find((b) => b.band === "50–59").n).toBe(0);
    expect(track.byBand.find((b) => b.band === "50–59").evidence).toBe("INSUFFICIENT SAMPLE");
    expect(track.byTour.map((t) => t.key)).toContain("ITF / WTA 125 / Challenger");
    expect(track.byTour.map((t) => t.key)).toContain("Tour not identified"); // "US Open" carries no tour tag — honest
    expect(track.notes.some((n) => /never fabricated/.test(n))).toBe(true);
  });
});

describe("tennis research cases — observation only", () => {
  it("Ćirić-Bagarić v Havlíčková: EXTREME disagreement recorded without touching the prediction", () => {
    const before = JSON.parse(JSON.stringify(CIRIC_ROW));
    const caseObs = userSuppliedMarketCase(CIRIC_ROW, 2.55, "user-supplied SportyBet");
    expect(caseObs.band).toBe("EXTREME DISAGREEMENT");
    expect(caseObs.valuePct).toBeGreaterThan(26);
    expect(caseObs.model_probability).toBeCloseTo(0.6605, 3);
    expect(caseObs.model_fair_odds).toBeCloseTo(1.514, 2);
    expect(caseObs.market_price).toBe(2.55);
    expect(caseObs.market_implied_probability).toBeCloseTo(0.3922, 1);
    expect(caseObs.global_prediction_id).toBe("monster|monster-v1|espn-183598|2|v1");
    expect(caseObs.note).toContain("no value claim");
    expect(CIRIC_ROW).toEqual(before); // the prediction record is never altered
  });

  it("Sabalenka v Pegula: CLOSE AGREEMENT against the user-supplied price", () => {
    const caseObs = userSuppliedMarketCase(SABALENKA_ROW, 1.56, "user-supplied bookmaker");
    expect(caseObs.band).toBe("CLOSE AGREEMENT");
    expect(Math.abs(caseObs.valuePct)).toBeLessThan(1);
    expect(caseObs.model_fair_odds).toBeCloseTo(1.543, 2);
    expect(caseObs.market_price).toBe(1.56);
  });

  it("never manufactures a case without a real model probability and a real price", () => {
    expect(userSuppliedMarketCase({ ...CIRIC_ROW, probability: 0 }, 2.55)).toBeNull();
    expect(userSuppliedMarketCase(CIRIC_ROW, 0)).toBeNull();
    expect(userSuppliedMarketCase(CIRIC_ROW, 0.5)).toBeNull();
  });
});

describe("learning evidence gate — no production change from one result", () => {
  it("one settled observation NEVER becomes a pattern candidate", () => {
    const rows = [priced(30, { prob: 0.66, odds: 2.55, won: true, sport: "Tennis", league: "Montreux Nestlé Open" })];
    expect(patternCandidates(rows)).toHaveLength(0);
    // even the seeded research case: a single EXTREME disagreement is an
    // observation, never a model-vs-market pattern claim
    expect(patternCandidates(rows, { minN: 20 }).some((c) => c.dim === "model_vs_market")).toBe(false);
  });

  it("a sufficient settled sample in one disagreement band becomes a gated candidate", () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      priced(200 + i, { prob: 0.75, odds: 2.0, won: i % 2 === 0 })
    );
    const cands = patternCandidates(rows, { minN: 20 });
    const dm = cands.find((c) => c.dim === "model_vs_market");
    expect(dm).toBeTruthy();
    expect(dm.value).toContain("EXTREME DISAGREEMENT");
    expect(dm.sample).toBe(25);
    expect(dm.hypothesis).toBeTruthy(); // a hypothesis — never a fait accompli
  });

  it("keeps the learning queue evidence levels honest — one result is backtest-grade only", () => {
    expect(evidenceLevelOf(1)).toBe(1);
    expect(evidenceLevelOf(30)).toBe(2);
    expect(evidenceLevelOf(100)).toBe(3);
  });
});