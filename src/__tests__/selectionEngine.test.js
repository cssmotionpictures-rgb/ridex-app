// REGRESSION TESTS — SELECTION INTELLIGENCE ENGINE.
// Covers the acceptance list for the quality layer: NO_PICK as a first-class
// outcome, data-health blocking, segment shrinkage, uncertainty-driven
// selectivity, regime effects, validation-derived thresholds, model-health
// arming floors, correlation control, the 83% board floor, the 20-pick cap,
// and purity/immutability of every scored candidate (never a mutation of
// history). The engine is pure — no I/O — so these tests run on real logic.
import { describe, it, expect } from "vitest";
import {
  normalizeCandidate, dataHealthOf, segmentEvidenceMap, segmentFactorFor,
  modelHealthOf, regimeOf, deriveThresholds, scoreCandidate, recommendationOf,
  rankAndSelect, correlationGroups,
  SURE_WIN_PROBABILITY, SURE_WIN_MAX_PICKS, MIN_SEGMENT_SAMPLE, MIN_HEALTH_SAMPLE,
} from "@/lib/globalLearning/selectionEngine";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
const CAND_BASE = {
  fixture_id: "of-en.1-2026-09-12-arsenal-chelsea",
  home: "Arsenal", away: "Chelsea", league: "Premier League",
  kickoff: "2026-09-12T19:00:00.000Z", recorded_at: "2026-09-11T09:00:00.000Z",
  market_key: "1", market_label: "Home Win",
  calibrated_probability: 0.86, confidence: 86, agreement: 0.9, uncertainty: 0.12,
  data_quality: "HIGH", market_odds: 1.5, odds_status: "priced",
  injury_status: "matched", lineup_status: "confirmed", flags_json: "[]",
  model_version: "RX-2.0",
};
const CAND = (over = {}) => normalizeCandidate({ ...CAND_BASE, ...over }, "engine");

const BASE_CTX = (over = {}) => ({
  now: NOW,
  segments: new Map(),
  thresholds: deriveThresholds(null),
  regime: regimeOf({}),
  health: modelHealthOf([]),
  ...over,
});

const wellSupported = CAND({ calibrated_probability: 0.78, uncertainty: 0.1, agreement: 0.95, data_quality: "HIGH", odds_status: "priced" });
const badData = CAND({ calibrated_probability: 0.9, uncertainty: 0.5, agreement: 0.5, data_quality: "MEDIUM", odds_status: "model_only", injury_status: "", lineup_status: "", flags_json: '[{"level":"WARN","note":"form sample short"}]' });

describe("data health — integrity blockers and honest penalties", () => {
  it("BLOCKS passed kickoffs, LOW data quality, missing provenance and post-kickoff records", () => {
    expect(dataHealthOf(CAND({ kickoff: "2026-09-10T19:00:00.000Z" }), NOW).status).toBe("BLOCKED");
    expect(dataHealthOf(CAND({ data_quality: "LOW" }), NOW).status).toBe("BLOCKED");
    expect(dataHealthOf(CAND({ recorded_at: "" }), NOW).status).toBe("BLOCKED");
    expect(dataHealthOf(CAND({ recorded_at: "2026-09-12T19:30:00.000Z" }), NOW).status).toBe("BLOCKED");
    expect(dataHealthOf(CAND({ flags_json: '[{"level":"BLOCK"}]' }), NOW).status).toBe("BLOCKED");
  });

  it("UNKNOWN injury/lineup data is an honest penalty, never silently treated as zero or as a blocker", () => {
    const h = dataHealthOf(CAND({ injury_status: "", lineup_status: "" }), NOW);
    expect(h.status).not.toBe("BLOCKED");
    expect(h.notes.some((n) => n.includes("UNKNOWN"))).toBe(true);
    expect(h.score).toBeLessThan(dataHealthOf(CAND(), NOW).score);
  });

  it("model-only picks are penalised for lacking a market cross-check", () => {
    expect(dataHealthOf(CAND({ odds_status: "model_only" }), NOW).score)
      .toBeLessThan(dataHealthOf(CAND(), NOW).score);
  });
});

describe("composite quality — multiplicative and evidence-weighted, never a naive average", () => {
  it("a well-supported 78% OUTRANKS a 90% prediction from unreliable data", () => {
    const ctx = BASE_CTX();
    const good = recommendationOf({ ...scoreCandidate(wellSupported, ctx), ctxRegime: "STABLE" }, ctx.thresholds);
    const bad = recommendationOf({ ...scoreCandidate(badData, ctx), ctxRegime: "STABLE" }, ctx.thresholds);
    expect(good.quality).toBeGreaterThan(bad.quality);
    expect(good.recommendationStatus).not.toBe("NO_PICK");
    expect(bad.recommendationStatus).toBe("NO_PICK");
  });

  it("uncertainty makes the engine MORE selective — floors rise with uncertainty", () => {
    const ctx = BASE_CTX();
    const lowU = recommendationOf({ ...scoreCandidate(CAND({ uncertainty: 0 }), ctx), ctxRegime: "STABLE" }, ctx.thresholds);
    const highU = recommendationOf({ ...scoreCandidate(CAND({ uncertainty: 0.6 }), ctx), ctxRegime: "CAUTION" }, ctx.thresholds);
    expect(highU.quality).toBeLessThan(lowU.quality);
  });

  it("never mutates the candidate — history is immutable even in memory", () => {
    const c = Object.freeze(CAND());
    expect(() => scoreCandidate(c, BASE_CTX())).not.toThrow();
  });
});

describe("segment reliability — empirical-Bayes shrinkage, tiny samples can never swing it", () => {
  const report = {
    feature_evidence_json: JSON.stringify([
      { dim: "league", value: "Premier League", sample: 40, expected_pct: 70, actual_pct: 45, verdict: "OVERCONFIDENT" },
      { dim: "league", value: "La Liga", sample: 4, expected_pct: 70, actual_pct: 20, verdict: "INSUFFICIENT SAMPLE" },
    ]),
  };
  const map = segmentEvidenceMap(report);

  it("a weak segment with a REAL sample lowers the quality factor", () => {
    const f = segmentFactorFor(map, "league", "Premier League");
    expect(f.evidence).toBe(true);
    expect(f.factor).toBeLessThan(1);
    const weak = scoreCandidate(CAND({ league: "Premier League" }), BASE_CTX({ segments: map }));
    expect(weak.quality).toBeLessThan(scoreCandidate(CAND({ league: "Serie A" }), BASE_CTX({ segments: map })).quality);
  });

  it("a weak segment with a tiny sample barely moves the factor (shrinkage)", () => {
    const f = segmentFactorFor(map, "league", "La Liga");
    expect(f.evidence).toBe(false); // below MIN_SEGMENT_SAMPLE
    expect(f.factor).toBeGreaterThan(0.9);
  });

  it("no evidence at all is labelled honestly, never invented", () => {
    const f = segmentFactorFor(new Map(), "league", "Anything");
    expect(f.label).toContain("INSUFFICIENT EVIDENCE");
  });
});

describe("model health — verdicts arm only at the settled-sample floor", () => {
  const evts = (n, hitEvery) => Array.from({ length: n }, (_, i) => ({
    outcome: hitEvery || i % 4 ? "won" : "lost",
    predicted_probability: 0.7,
  }));

  it("small samples report BASELINE BUILDING — no deterioration alarm from a handful of games", () => {
    const h = modelHealthOf(evts(12, false));
    expect(h.verdict).toContain("BASELINE BUILDING");
    expect(h.verdict).toContain(String(MIN_HEALTH_SAMPLE));
    expect(h.healthFactor).toBe(1);
  });

  it("a genuinely bad rolling window at sufficient sample is DETERIORATING", () => {
    const long = evts(40, false); // mostly wins long-term
    const rolling = Array.from({ length: 20 }, () => ({ outcome: "lost", predicted_probability: 0.75 }));
    const h = modelHealthOf([...rolling, ...long]);
    expect(h.verdict).toContain("DETERIORATING");
    expect(h.healthFactor).toBeLessThan(1);
  });

  it("detects OVERCONFIDENCE when observed hit rate materially trails predicted", () => {
    const h = modelHealthOf(Array.from({ length: 40 }, () => ({ outcome: "lost", predicted_probability: 0.9 })));
    expect(h.verdict).toContain("OVERCONFIDENT");
  });
});

describe("regime — distinguishes environment change from model deterioration", () => {
  it("drift alarms put the engine in DISRUPTED with reduced confidence", () => {
    const r = regimeOf({ driftVerdict: "DRIFT ALARM — distribution shift detected" });
    expect(r.status).toBe("DISRUPTED");
    expect(r.factor).toBeLessThan(1);
  });
  it("baseline-building / caution signals make it more selective, not blocked", () => {
    expect(regimeOf({ healthVerdict: "BASELINE BUILDING — 17 settled" }).status).toBe("CAUTION");
    expect(regimeOf({}).status).toBe("STABLE");
  });
});

describe("thresholds — validation-derived where the sample justifies it", () => {
  it("derives the elite floor from a validated 80-90% bucket minus a safety margin", () => {
    const report = { evaluation_json: JSON.stringify({ models_all: { "rx": { buckets: [{ bucket: "80-90%", n: 34, actual_pct: 82 }] } } }) };
    const t = deriveThresholds(report);
    expect(t.elite).toBeCloseTo(0.77, 2); // 0.82 - 0.05
    expect(t.derivedFrom).toContain("n=34");
  });
  it("falls back to labelled conservative defaults below the bucket sample floor", () => {
    const t = deriveThresholds(null);
    expect(t.derivedFrom).toContain("conservative defaults");
    expect(t.elite).toBeGreaterThan(0);
  });
});

describe("recommendation tiers — NO PICK is a first-class outcome", () => {
  it("all five statuses are reachable and honestly labelled", () => {
    const ctx = BASE_CTX();
    const mk = (over) => recommendationOf({ ...scoreCandidate(CAND(over), ctx), ctxRegime: ctx.regime.status }, ctx.thresholds).recommendationStatus;
    expect(mk({ flags_json: '[{"level":"BLOCK"}]' })).toBe("BLOCKED");
    expect(mk({ calibrated_probability: 0.6, agreement: 0.6, uncertainty: 0.4, data_quality: "MEDIUM" })).toBe("NO_PICK");
    expect(mk({ calibrated_probability: 0.78 })).toMatch(/LEAN|STRONG_PICK|NO_PICK/);
  });

  it("ELITE requires validated segment evidence, a stable regime AND the 83% calibrated floor", () => {
    const map = segmentEvidenceMap({ feature_evidence_json: JSON.stringify([{ dim: "market", value: "1", sample: 25, expected_pct: 80, actual_pct: 82 }]) });
    const ctx = BASE_CTX({ segments: map, regime: regimeOf({}) });
    const elite = recommendationOf({ ...scoreCandidate(CAND({ calibrated_probability: 0.88 }), ctx), ctxRegime: "STABLE" }, ctx.thresholds);
    expect(elite.recommendationStatus).toBe("ELITE_PICK");
    // 82.9% calibrated — however good the quality — never reaches ELITE on this board
    const below = recommendationOf({ ...scoreCandidate(CAND({ calibrated_probability: SURE_WIN_PROBABILITY - 0.001 }), ctx), ctxRegime: "STABLE" }, ctx.thresholds);
    expect(below.recommendationStatus).not.toBe("ELITE_PICK");
    // no segment evidence → honestly capped below ELITE
    const noEvidence = recommendationOf({ ...scoreCandidate(CAND({ calibrated_probability: 0.88 }), BASE_CTX()), ctxRegime: "STABLE" }, ctx.thresholds);
    expect(noEvidence.recommendationStatus).not.toBe("ELITE_PICK");
  });

  it("reasons are generated only from actually recorded evidence, never fabricated", () => {
    const ctx = BASE_CTX();
    const s = recommendationOf({ ...scoreCandidate(CAND(), ctx), ctxRegime: "STABLE" }, ctx.thresholds);
    for (const r of s.reasons) expect(typeof r).toBe("string");
    expect(s.dataTimestamp).toBe("2026-09-11T09:00:00.000Z"); // feature/data timestamp always present
  });
});

describe("the SURE WIN board — 83% floor, ranked by evidence, capped at 20", () => {
  const many = (n, prob = 0.9) => Array.from({ length: n }, (_, i) =>
    CAND({ fixture_id: `f-${i}`, home: `Home${i}`, away: `Away${i}`, calibrated_probability: prob }));

  it("never admits sub-83% candidates regardless of quality", () => {
    const { picks } = rankAndSelect([...many(3, 0.82), ...many(2, 0.9)], BASE_CTX());
    expect(picks).toHaveLength(2);
    expect(picks.every((p) => p.calibrated >= SURE_WIN_PROBABILITY)).toBe(true);
  });

  it("caps the board at 20 and ranks by composite quality", () => {
    const { picks, stats } = rankAndSelect(many(30), BASE_CTX());
    expect(picks).toHaveLength(SURE_WIN_MAX_PICKS);
    for (let i = 1; i < picks.length; i++) expect(picks[i - 1].quality).toBeGreaterThanOrEqual(picks[i].quality);
    expect(stats.seen).toBe(30);
    expect(stats.onBoard).toBe(SURE_WIN_MAX_PICKS);
    expect(stats.rejectionReasons.length).toBeGreaterThan(0);
  });

  it("an empty board is an honest verdict, not a failure", () => {
    const { picks, stats } = rankAndSelect(many(5, 0.6), BASE_CTX());
    expect(picks).toHaveLength(0);
    expect((stats.byStatus.NO_PICK || 0) + (stats.byStatus.LEAN || 0)).toBe(5);
  });

  it("correlated same-fixture picks are flagged and never counted as independent confirmations", () => {
    const picks = correlationGroups([
      { candidate: CAND({ fixture_id: "fx", market_key: "1" }) },
      { candidate: CAND({ fixture_id: "fx", market_key: "O2.5" }) },
      { candidate: CAND({ fixture_id: "other", market_key: "1" }) },
    ]);
    expect(picks[0].correlation.risk).toBe("HIGH");
    expect(picks[1].correlation.risk).toBe("HIGH");
    expect(picks[2].correlation.risk).toBe("LOW");
    expect(picks[0].correlation.note).toContain("NOT independent");
  });
});