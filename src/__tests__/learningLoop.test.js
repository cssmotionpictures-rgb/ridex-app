// AUTOMATED REGRESSION TESTS — the self-learning loop chain.
// These import the pure core (src/lib/globalLearning/learningCore.js) whose
// byte-identical copy (base44/shared/learningCore.ts) is what the production
// learning-cycle function executes — so the chain is proven on the code that
// actually runs, not a copy that can drift (the parity test below enforces
// that the two copies stay identical).
//
// Coverage (per the learning-loop acceptance list):
//   A. WIN outcome  -> learning event -> counted -> feature evidence -> evaluation dataset
//   B. LOSS outcome -> learning event -> counted -> error forensics -> evaluation dataset
//   C. Duplicate processing -> no second learning event
//   D. Calibration update -> candidate calibration generated (gate enforces the floor)
//   E. Challenger evaluation -> chronological OOS result
//   F. Promotion gate -> rejects insufficient evidence
//   G. Successful promotion -> Champion changes ONLY when the gate passes
//   H. Active model resolution -> promoted champion resolves (with fallback)
//   I. Historical prediction -> immutable (inputs never mutated)
//   J. VOID/PUSH/CANCELLED -> excluded from win/loss learning
//   K. Worker retry -> reprocessing creates nothing twice
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  eventKeyOf, classifyOutcome, buildLearningEvent, selectEventsToCreate,
  metricsOf, segmentEvidence, chronologicalSplit, promotionGateDecision,
  calibrationStatusOf, driftVerdictOf, resolveActiveModel, errorForensicsOf,
  MIN_OOS_PROMOTION, MIN_CALIBRATION_SAMPLE, CHAMPION_DEFAULT, CHALLENGER_DEFAULT,
} from "@/lib/globalLearning/learningCore";

const CTX = { now: "2026-09-11T12:00:00.000Z", batch: "cycle-test" };

const PRED = {
  id: "pred-row-1",
  fixture_id: "of-en.1-2026-09-01-arsenal-mancity",
  league: "Premier League",
  market_label: "Home Win",
  recorded_at: "2026-09-01T10:00:00.000Z",
  kickoff: "2026-09-01T19:00:00.000Z",
  kala_score: 88,
  grade: "STRONG",
  agreement: 0.9,
  uncertainty: 0.2,
  data_quality: "HIGH",
  market_odds: 1.9,
  bookmaker: "Bet365",
  fair_odds: 1.85,
  edge_pct: 3.1,
  adjusted_edge_pct: 1.2,
  ev_pct: 4.5,
  odds_status: "priced",
  market_probability: 0.526,
  margin_probability: 0.51,
  learning_version: "L-000",
  model_version: "RX-2.0",
  session: "evening",
  big_hammer: false,
};

const GID = "kala|RX-2.0|of-en.1-2026-09-01-arsenal-mancity|1|v1";
const wonOutcome = {
  id: "o-1",
  global_prediction_id: GID,
  source_section: "kala",
  home: "Arsenal",
  away: "Man City",
  league: "Premier League",
  market_key: "1",
  predicted_probability: 0.75,
  settlement: "won",
  confidence: 78,
  final_home: 2,
  final_away: 0,
  verification_source: "verified_provider",
  result_source: "openfootball verified result",
  settled_at: "2026-09-01T21:00:00.000Z",
  market_odds: 1.9,
  fair_odds: 1.85,
  edge_pct: 3.1,
  adjusted_edge_pct: 1.2,
  data_quality: "HIGH",
  model_disagreement: 0.1,
  clv_pct: 2.4,
  model_version: "RX-2.0",
};
const lostOutcome = {
  ...wonOutcome,
  id: "o-2",
  global_prediction_id: "kala|RX-2.0|of-en.1-2026-09-02-liverpool-chelsea|1|v1",
  home: "Liverpool",
  away: "Chelsea",
  settlement: "lost",
  predicted_probability: 0.72,
  final_home: 0,
  final_away: 1,
  clv_pct: 0,
};

describe("PARITY — the tested core and the production core are the same code", () => {
  it("the frontend copy and the server copy of learningCore are identical (comments aside)", () => {
    const root = process.cwd();
    const fe = readFileSync(path.join(root, "src/lib/globalLearning/learningCore.js"), "utf8");
    const be = readFileSync(path.join(root, "base44/shared/learningCore.ts"), "utf8");
    const body = (s) => s.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n").replace(/\s+/g, " ").trim();
    expect(body(fe)).toBe(body(be));
  });
});

describe("A/B — a settled outcome creates a counted learning event with features and forensics", () => {
  it("a WON outcome builds a counted event carrying the frozen pre-kickoff feature snapshot", () => {
    const evt = buildLearningEvent(wonOutcome, PRED, CTX);
    expect(evt.event_key).toBe(eventKeyOf(GID));
    expect(evt.status).toBe("counted");
    expect(evt.outcome).toBe("won");
    const features = JSON.parse(evt.features_json);
    expect(features.probability).toBe(0.75);
    expect(features.agreement).toBe(0.9);
    expect(features.market_odds).toBe(1.9);
    // no post-kickoff information enters the training features
    expect(features.final_home).toBeUndefined();
    expect(features.final_away).toBeUndefined();
  });

  it("a LOSS outcome gets evidence-based error forensics and enters the evaluation dataset identically", () => {
    const evt = buildLearningEvent(lostOutcome, { ...PRED, agreement: 0.5 }, CTX);
    expect(evt.outcome).toBe("lost");
    const f = JSON.parse(evt.forensics_json);
    expect(f.classification).toContain("MODEL DISAGREEMENT");
    expect(f.basis).toContain("50%");
    // loss and win contribute equally to the evaluation dataset
    const m = metricsOf([buildLearningEvent(wonOutcome, PRED, CTX), evt]);
    expect(m.n).toBe(2);
    expect(m.hit_rate_pct).toBe(50);
  });

  it("an unattributable loss stays INSUFFICIENT EVIDENCE — no invented cause", () => {
    const f = errorForensicsOf({ outcome: "lost", agreement: 0.9, uncertainty: 0.2, data_quality: "HIGH", market_odds: 1.9, edge_pct: 3, clv_pct: 0 });
    expect(f.classification).toContain("INSUFFICIENT EVIDENCE");
  });
});

describe("C/K — duplicate processing and worker retry never count anything twice", () => {
  it("reprocessing an already-counted outcome creates no second event", () => {
    const prior = [buildLearningEvent(wonOutcome, PRED, CTX)]; // won already counted
    const { toCreate, duplicatesPrevented } = selectEventsToCreate([wonOutcome, lostOutcome], prior, new Map([[GID, PRED]]), CTX);
    expect(toCreate.map((e) => e.event_key)).toEqual([eventKeyOf(lostOutcome.global_prediction_id)]);
    expect(duplicatesPrevented).toEqual([eventKeyOf(GID)]);
  });

  it("two outcome rows of the SAME prediction identity produce exactly one event (duplicate outcome copy)", () => {
    const dupRow = { ...wonOutcome, id: "o-1-copy", settled_at: "2026-09-10T00:00:00.000Z" };
    const { toCreate, duplicatesPrevented } = selectEventsToCreate([wonOutcome, dupRow], [], new Map(), CTX);
    expect(toCreate).toHaveLength(1);
    expect(duplicatesPrevented).toHaveLength(1);
  });

  it("a fresh pool creates every eligible event exactly once", () => {
    const { toCreate, duplicatesPrevented } = selectEventsToCreate([wonOutcome, lostOutcome], [], new Map(), CTX);
    expect(toCreate).toHaveLength(2);
    expect(duplicatesPrevented).toHaveLength(0);
  });
});

describe("D — calibration actually calculates, gated by the sample floor", () => {
  it("Brier / log loss / reliability are computed from real probabilities", () => {
    const e1 = { outcome: "won", predicted_probability: 0.8 };
    const e2 = { outcome: "lost", predicted_probability: 0.8 };
    const m = metricsOf([e1, e2]);
    expect(m.n).toBe(2);
    expect(m.brier).toBe(0.34); // ((0.8-1)^2 + (0.8-0)^2)/2
    expect(m.logloss).toBeCloseTo(0.9163, 3);
    expect(m.hit_rate_pct).toBe(50);
  });

  it("a candidate calibration below the floor is observed but NOT promoted", () => {
    const s = calibrationStatusOf(17, MIN_CALIBRATION_SAMPLE);
    expect(s.status).toContain("INSUFFICIENT EVIDENCE");
    expect(s.status).toContain("NOT PROMOTED");
    expect(calibrationStatusOf(150, MIN_CALIBRATION_SAMPLE).status).toContain("RECALIBRATION REVIEW");
  });
});

describe("E — challenger evaluation is chronological, never a random mix", () => {
  it("older events train, newer events validate — zero future leakage", () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      outcome: i % 2 ? "lost" : "won",
      predicted_probability: 0.7,
      kickoff: new Date(Date.UTC(2026, 8, i + 1)).toISOString(),
    }));
    const { ordered, train, oos, boundary } = chronologicalSplit(events);
    expect(train).toHaveLength(7);
    expect(oos).toHaveLength(3);
    expect(new Date(train[train.length - 1].kickoff).getTime()).toBeLessThanOrEqual(new Date(boundary).getTime());
    const maxTrain = Math.max(...train.map((e) => Date.parse(e.kickoff)));
    const minOos = Math.min(...oos.map((e) => Date.parse(e.kickoff)));
    expect(maxTrain).toBeLessThanOrEqual(minOos);
    expect(ordered[0].kickoff).toBe(events[0].kickoff);
  });
});

describe("F/G — the promotion gate protects the Champion", () => {
  it("rejects promotion on insufficient OOS evidence", () => {
    const g = promotionGateDecision({
      championOos: { n: 6, brier: 0.23, logloss: 0.66, ece_pp: 17.8 },
      challengerOos: { n: 6, brier: 0.21, logloss: 0.62, ece_pp: 12 },
    });
    expect(g.decision).toContain("INSUFFICIENT EVIDENCE");
    expect(g.changelogDecision).toBe("NOT_PROMOTED");
    expect(g.nextChampion).toBe(CHAMPION_DEFAULT);
  });

  it("promotes the Challenger ONLY when OOS evidence genuinely passes", () => {
    const pass = promotionGateDecision({
      championOos: { n: MIN_OOS_PROMOTION + 5, brier: 0.25, logloss: 0.68, ece_pp: 8 },
      challengerOos: { n: MIN_OOS_PROMOTION + 5, brier: 0.2, logloss: 0.6, ece_pp: 6 },
    });
    expect(pass.changelogDecision).toBe("PROMOTED");
    expect(pass.nextChampion).toBe(CHALLENGER_DEFAULT);
  });

  it("retains the Champion on worse OOS metrics", () => {
    const g = promotionGateDecision({
      championOos: { n: 60, brier: 0.2, logloss: 0.6, ece_pp: 6 },
      challengerOos: { n: 60, brier: 0.24, logloss: 0.66, ece_pp: 7 },
    });
    expect(g.changelogDecision).toBe("NOT_PROMOTED");
    expect(g.nextChampion).toBe(CHAMPION_DEFAULT);
  });

  it("retains the Champion on unacceptable calibration degradation even with better Brier", () => {
    const g = promotionGateDecision({
      championOos: { n: 60, brier: 0.25, logloss: 0.68, ece_pp: 5 },
      challengerOos: { n: 60, brier: 0.2, logloss: 0.6, ece_pp: 20 },
    });
    expect(g.changelogDecision).toBe("NOT_PROMOTED");
    expect(g.reason).toContain("calibration degradation");
  });
});

describe("H — the active model resolves from the registry, with an honest fallback", () => {
  it("resolves a promoted champion from the registry row", () => {
    const r = resolveActiveModel([{ champion_version: "RX-2.1", challenger_version: "RX-2.0", promotion_status: "PROMOTED" }]);
    expect(r.champion_version).toBe("RX-2.1");
    expect(r.source).toBe("registry");
  });

  it("falls back to the current champion when no registry row exists", () => {
    const r = resolveActiveModel([], "RX-2.0");
    expect(r.champion_version).toBe("RX-2.0");
    expect(r.source).toBe("none");
  });
});

describe("I — the original prediction is immutable", () => {
  it("building a learning event never mutates the outcome or prediction", () => {
    const o = Object.freeze({ ...wonOutcome });
    const p = Object.freeze({ ...PRED });
    const evt = buildLearningEvent(o, p, CTX); // strict mode: any mutation throws
    expect(evt.predicted_probability).toBe(0.75);
    expect(o.predicted_probability).toBe(0.75);
    expect(p.model_version).toBe("RX-2.0");
  });
});

describe("J — VOID/PUSH/CANCELLED never become win/loss training observations", () => {
  it("excludes every non win/loss settlement with an explicit reason", () => {
    for (const settlement of ["void", "push", "cancelled", "pending", "postponed", ""]) {
      const c = classifyOutcome({ settlement, predicted_probability: 0.7 });
      expect(c.eligible).toBe(false);
      expect(c.reason).toBeTruthy();
    }
    expect(classifyOutcome(wonOutcome).eligible).toBe(true);
  });

  it("excludes outcomes with no usable predicted probability", () => {
    expect(classifyOutcome({ settlement: "won", predicted_probability: 0 }).eligible).toBe(false);
    expect(classifyOutcome({ settlement: "won", predicted_probability: 1.4 }).eligible).toBe(false);
    expect(classifyOutcome({ settlement: "lost", predicted_probability: 0.5 }).eligible).toBe(true);
  });
});

describe("feature evidence — sample-gated verdicts, never forced", () => {
  it("labels small segments INSUFFICIENT SAMPLE and measures real gaps", () => {
    const evts = [
      ...Array.from({ length: 6 }, () => ({ source_section: "kala", market_key: "1", league: "Premier League", model_version: "RX-2.0", predicted_probability: 0.7, confidence: 75, market_odds: 1.9, edge_pct: 3, data_quality: "HIGH", agreement: 0.9, outcome: "won" })),
      ...Array.from({ length: 3 }, () => ({ source_section: "runo", market_key: "O2.5", league: "La Liga", model_version: "RX-2.0", predicted_probability: 0.7, confidence: 75, market_odds: 0, edge_pct: 0, data_quality: "MEDIUM", agreement: 0.8, outcome: "lost" })),
    ];
    const rows = segmentEvidence(evts);
    const kalaRow = rows.find((r) => r.dim === "section" && r.value === "kala");
    expect(kalaRow.sample).toBe(6);
    expect(kalaRow.actual_pct).toBe(100);
    expect(kalaRow.verdict).toBe("UNDERCONFIDENT"); // predicted 70%, observed 100%
    const runoRow = rows.find((r) => r.dim === "section" && r.value === "runo");
    expect(runoRow.verdict).toBe("INSUFFICIENT SAMPLE"); // 3 samples — never forced
  });
});

describe("drift — alarms arm only at sufficient history", () => {
  it("reports BASELINE BUILDING under the arming floor", () => {
    const d = driftVerdictOf([{ outcome: "won", predicted_probability: 0.7 }]);
    expect(d.verdict).toContain("BASELINE BUILDING");
  });

  it("monitors once history is sufficient", () => {
    const evts = Array.from({ length: 60 }, (_, i) => ({ outcome: i % 3 ? "won" : "lost", predicted_probability: 0.7 }));
    expect(driftVerdictOf(evts).verdict).toContain("MONITORED");
  });
});