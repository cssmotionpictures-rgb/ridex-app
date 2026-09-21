// AUTOMATED REGRESSION TEST — PROMOTION → PREDICTION CONSUMPTION.
// The critical production behavior: a challenger that passes the promotion
// gate must be CONSUMED by future prediction generation, not merely appear in
// the ActiveModel registry. This drives the REAL production chain on pure
// functions and the REAL generation-layer row builders (the same builders
// recordObservations / recordChallengerObservations call in production):
//
//   PROMOTE (promotionGateDecision)
//     → RESOLVE ACTIVE MODEL (resolveActiveModel)
//     → GENERATE (resolveProductionModel at generation time)
//     → RECORD MODEL VERSION (rowOfChallenger / rowOfObservation stamps it)
//     → VERIFY MODEL VERSION (the prediction record itself proves it)
//
// No production state is touched: the gate is evaluated on synthetic OOS
// metrics and the row builders are pure — the production champion is never
// artificially promoted just to make a test pass.
import { describe, it, expect } from "vitest";
import {
  promotionGateDecision, resolveActiveModel,
  MIN_OOS_PROMOTION, CHAMPION_DEFAULT, CHALLENGER_DEFAULT,
} from "@/lib/globalLearning/learningCore";
import { resolveProductionModel } from "@/lib/ensemble/productionModel";
import { rowOfObservation } from "@/lib/ensemble/observations";
import { rowOfChallenger } from "@/lib/ensemble/rx21";
import { RX21_MODEL_VERSION, challengerKey } from "@/lib/ensemble/rx21Core";
import { RX_MODEL_VERSION } from "@/lib/ensemble/engine";

// --- a realistic generation-time entry (what a scan hands the recorders) ---
const ENTRY = {
  fixtureId: "of-en.1-2026-09-12-arsenal-chelsea",
  home: "Arsenal",
  away: "Chelsea",
  league: "Premier League",
  leagueCode: "en.1",
  kickoff: "2026-09-12T19:00:00.000Z",
  lagosDateKey: "2026-09-12",
  session: "evening",
  evidence: "Form 6+5 · H2H 4 meetings · 11 models",
};
const CAND = {
  marketKey: "1",
  marketLabel: "Home Win",
  ensemble: 0.72,
  calibrated: 0.75,
  displayConf: 75,
  master: 84,
  grade: "STRONG",
  agreement: 0.88,
  uncertainty: 0.18,
  dq: "HIGH",
  quality: "HIGH",
  price: 1.9,
  bookmaker: "Bet365",
  implied: 0.526,
  marginImplied: 0.51,
  rawEdgePct: 4.2,
  edgePct: 4.0,
  adjEdgePct: 2.1,
  minAdjEdge: 2,
  evPct: 5.4,
  fairOdds: 1.33,
  priced: true,
  voting: 11,
  qualifies: true,
  calibrationSample: 17,
  flags: [],
  provenance: {},
  snapshot: {},
};
const X21 = {
  qualifies: true,
  rejectReason: "",
  perModel: { form: 0.74 },
  ablation: { a: 0.75 },
  voting: 12,
  injuryVote: 0.71,
  prob: 0.73,
  calibrated: 0.76,
  displayConf: 76,
  master: 85,
  grade: "STRONG",
  agreement: 0.87,
  uncertainty: 0.16,
  rawEdgePct: 4.4,
  edgePct: 4.1,
  adjEdgePct: 2.3,
  evPct: 5.6,
  fairOdds: 1.32,
  flags: [],
};
const ENRICH = {
  injury: { status: "matched", fetchedAt: "2026-09-12T10:00:00.000Z", homeImpact: { out: 2 }, awayImpact: { out: 1 }, delta: 0.04 },
  lineup: { status: "confirmed" },
  xg: { status: "matched", home: { xgFor: 1.8, xgAgainst: 1.1 }, away: { xgFor: 1.2, xgAgainst: 1.5 } },
};
const passingGate = () =>
  promotionGateDecision({
    championOos: { n: MIN_OOS_PROMOTION + 10, brier: 0.25, logloss: 0.68, ece_pp: 8 },
    challengerOos: { n: MIN_OOS_PROMOTION + 10, brier: 0.19, logloss: 0.58, ece_pp: 5 },
  });
const failingGate = () =>
  promotionGateDecision({
    championOos: { n: 6, brier: 0.23, logloss: 0.66, ece_pp: 17.8 },
    challengerOos: { n: 6, brier: 0.21, logloss: 0.62, ece_pp: 12 },
  });

describe("PROMOTION → PREDICTION CONSUMPTION — the full production chain", () => {
  it("a passing gate promotes, the registry flips, and NEW predictions record the promoted model", () => {
    // 1 — PROMOTE: the gate passes on sufficient, better OOS evidence
    const gate = passingGate();
    expect(gate.changelogDecision).toBe("PROMOTED");
    expect(gate.nextChampion).toBe(CHALLENGER_DEFAULT); // "RX-2.1"

    // 2 — RESOLVE ACTIVE MODEL: the promoted registry row resolves
    const registry = resolveActiveModel([
      { registry_key: "active-model", champion_version: gate.nextChampion, challenger_version: CHAMPION_DEFAULT, promotion_status: "PROMOTED — RX-2.1 promoted on chronological OOS evidence" },
    ]);
    expect(registry.champion_version).toBe("RX-2.1");
    expect(registry.source).toBe("registry");

    // 3 — GENERATE: the prediction-generation layer resolves the production model
    const pm = resolveProductionModel({ registry });
    expect(pm.production_version).toBe("RX-2.1");
    expect(pm.promoted).toBe(true);
    expect(pm.registry_match).toBe(true);

    // 4 — RECORD: a NEW prediction is generated under the promoted model and
    //     the prediction record itself carries the promoted model version
    const row = rowOfChallenger({ ...ENTRY, c: CAND }, X21, ENRICH, pm);
    expect(row.model_version).toBe(RX21_MODEL_VERSION); // "RX-2.1"
    expect(row.observation_key).toBe(challengerKey(ENTRY.fixtureId, CAND.marketKey));
    const proof = JSON.parse(row.snapshot_json).activeModel;
    expect(proof.productionVersion).toBe("RX-2.1");
    expect(proof.registryChampion).toBe("RX-2.1");
    expect(proof.promoted).toBe(true);
    // the promoted model's rows are labelled PRODUCTION, not challenger
    expect(row.weights_basis).toContain("PRODUCTION — registry-promoted");

    // 5 — VERIFY: subsequent predictions keep consuming the promoted model
    const pm2 = resolveProductionModel({ registry });
    expect(pm2.production_version).toBe("RX-2.1");
    const row2 = rowOfChallenger({ ...ENTRY, fixtureId: "of-en.1-2026-09-13-liverpool-everton", home: "Liverpool", away: "Everton", c: { ...CAND, marketKey: "O2.5", marketLabel: "Over 2.5" } }, X21, ENRICH, pm2);
    expect(row2.model_version).toBe("RX-2.1");
    expect(JSON.parse(row2.snapshot_json).activeModel.productionVersion).toBe("RX-2.1");
  });

  it("a failing gate BLOCKS consumption — the champion engine keeps generating under RX-2.0", () => {
    // 1 — the gate rejects on insufficient OOS evidence
    const gate = failingGate();
    expect(gate.changelogDecision).toBe("NOT_PROMOTED");
    expect(gate.nextChampion).toBe(CHAMPION_DEFAULT); // "RX-2.0" — champion retained

    // 2-3 — the registry keeps the champion; generation resolves RX-2.0
    const registry = resolveActiveModel([
      { registry_key: "active-model", champion_version: CHAMPION_DEFAULT, challenger_version: CHALLENGER_DEFAULT, promotion_status: gate.decision },
    ]);
    const pm = resolveProductionModel({ registry });
    expect(pm.production_version).toBe("RX-2.0");
    expect(pm.promoted).toBe(false);

    // 4 — new predictions are still generated and recorded under the champion
    const row = rowOfObservation({ ...ENTRY, c: CAND }, pm);
    expect(row.model_version).toBe(RX_MODEL_VERSION); // "RX-2.0"
    const proof = JSON.parse(row.snapshot_json).activeModel;
    expect(proof.productionVersion).toBe("RX-2.0");
    expect(proof.registryChampion).toBe("RX-2.0");
  });

  it("the champion engine never re-labels its own numbers as the promoted model (attribution integrity)", () => {
    // Registry has promoted RX-2.1 — but the RX-2.0 recorder's rows were
    // computed by the RX-2.0 ensemble, so their model_version stays RX-2.0.
    // Re-labelling them RX-2.1 would corrupt the OOS model comparison; the
    // registry resolution is stamped as PROOF instead, never as attribution.
    const registry = resolveActiveModel([{ registry_key: "active-model", champion_version: "RX-2.1", promotion_status: "PROMOTED" }]);
    const pm = resolveProductionModel({ registry });
    expect(pm.promoted).toBe(true);
    const row = rowOfObservation({ ...ENTRY, c: CAND }, pm);
    expect(row.model_version).toBe("RX-2.0"); // honest: these numbers came from RX-2.0 code
    const proof = JSON.parse(row.snapshot_json).activeModel;
    expect(proof.registryChampion).toBe("RX-2.1"); // ...while the registry state is preserved verbatim
    expect(proof.productionVersion).toBe("RX-2.1");
  });

  it("a registry champion this build does not contain is FLAGGED, never silently stamped", () => {
    const pm = resolveProductionModel({
      registry: { champion_version: "RX-9.9", promotion_status: "PROMOTED" },
    });
    expect(pm.production_version).toBe(RX_MODEL_VERSION); // engine continues on its real champion
    expect(pm.registry_match).toBe(false);
    expect(pm.role).toContain("FLAGGED");
    expect(pm.promoted).toBe(false);
  });

  it("an unread registry falls back to the champion engine, labelled honestly", () => {
    const pm = resolveProductionModel({ registry: null });
    expect(pm.production_version).toBe(RX_MODEL_VERSION);
    expect(pm.role).toContain("REGISTRY NOT READ");
    expect(pm.promoted).toBe(false);
    const row = rowOfObservation({ ...ENTRY, c: CAND }, pm);
    expect(JSON.parse(row.snapshot_json).activeModel.productionVersion).toBe("RX-2.0");
  });
});