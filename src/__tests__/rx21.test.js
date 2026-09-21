import { describe, it, expect } from "vitest";
import {
  injuryImpactOf, injuryDeltaOf, challengerEnsemble, challengerCandidate,
  challengerKey, challengerKeyV2, latestByBaseKey, championChallengerComparison,
  promoteLineupSnapshot, teamNameMatches,
} from "../lib/ensemble/rx21Core";

const W = { strength: 0.1, poisson: 0.13, market: 0.16 };

describe("cross-provider team-name equivalence (openfootball board names vs API-Football injury/lineup names)", () => {
  it("matches the same club across providers", () => {
    expect(teamNameMatches("Sporting Clube de Braga", "Braga")).toBe(true);
    expect(teamNameMatches("CF Estrela da Amadora", "Estrela Amadora")).toBe(true);
    expect(teamNameMatches("Derby County", "Derby")).toBe(true);
    expect(teamNameMatches("Paris Saint-Germain", "Paris Saint Germain")).toBe(true);
    expect(teamNameMatches("AS Roma", "Roma")).toBe(true);
    expect(teamNameMatches("Bodø/Glimt", "Bodo/Glimt")).toBe(true); // accent folding
  });

  it("never matches two different clubs", () => {
    expect(teamNameMatches("Sporting CP", "Sporting Clube de Braga")).toBe(false);
    expect(teamNameMatches("Real Madrid", "Real Sociedad")).toBe(false);
    expect(teamNameMatches("Manchester United", "Manchester City")).toBe(false);
    expect(teamNameMatches("Inter Miami", "Inter Milan")).toBe(false);
    expect(teamNameMatches("Atletico Madrid", "Real Madrid")).toBe(false);
  });

  it("rejects empty names", () => {
    expect(teamNameMatches("", "Braga")).toBe(false);
    expect(teamNameMatches("", "")).toBe(false);
  });
});

describe("injury intelligence", () => {
  it("treats missing data as UNKNOWN, never zero", () => {
    expect(injuryImpactOf(null)).toBe(null);
    expect(injuryImpactOf(undefined)).toBe(null);
    expect(injuryDeltaOf(null, 0.5)).toBe(null);
    expect(injuryDeltaOf(0.2, null)).toBe(null);
  });

  it("counts confirmed absences and doubt separately, capped at 1", () => {
    const r = injuryImpactOf([
      { player: { type: "Missing Fixture" } },
      { player: { type: "Missing Fixture" } },
      { player: { type: "Missing Fixture" } },
      { player: { type: "Questionable" } },
    ]);
    expect(r.out).toBe(3);
    expect(r.doubtful).toBe(1);
    expect(r.impact).toBeCloseTo(0.15 * 3 + 0.05, 5);
    const many = injuryImpactOf(Array.from({ length: 20 }, () => ({ player: { type: "Missing Fixture" } })));
    expect(many.impact).toBe(1);
  });

  it("delta favors the less-affected side", () => {
    expect(injuryDeltaOf(0.1, 0.5)).toBeGreaterThan(0); // away worse → favors home
    expect(injuryDeltaOf(0.5, 0.1)).toBeLessThan(0);
    expect(injuryDeltaOf(0.3, 0.3)).toBe(0);
  });
});

describe("challenger ensemble", () => {
  it("rejects invalid votes and an all-invalid candidate", () => {
    expect(challengerEnsemble({ a: NaN, b: Infinity }, null, W)).toBe(null);
    expect(challengerEnsemble({}, null, W)).toBe(null);
    expect(challengerEnsemble(null, null, W)).toBe(null);
  });

  it("blends the injury vote toward the champion votes without dominating", () => {
    const perModel = { strength: 0.6, poisson: 0.62 };
    const base = challengerEnsemble(perModel, null, W);
    const inj = challengerEnsemble(perModel, 0.75, W);
    expect(inj.prob).toBeGreaterThan(base.prob);
    expect(inj.prob).toBeLessThan(0.76); // 0.22 weight — it nudges, never dominates
    expect(inj.perModel.injury).toBe(0.75);
  });

  it("reports lower agreement when the injury vote dissents strongly", () => {
    const perModel = { strength: 0.9, poisson: 0.9 };
    const agree = challengerEnsemble(perModel, 0.91, W);
    const dissent = challengerEnsemble(perModel, 0.2, W);
    expect(dissent.agreement).toBeLessThan(agree.agreement);
  });
});

describe("challenger candidate (RX-2.1)", () => {
  const base = {
    marketKey: "1",
    ensemble: 0.62,
    calibrated: 0.62,
    perModel: { strength: 0.6, poisson: 0.64 },
    agreement: 0.9,
    uncertainty: 0.3,
    dq: "HIGH",
    master: 84,
    flags: [],
    priced: true,
    price: 1.9,
    implied: 1 / 1.9,
    marginImplied: 0.5,
    edgePct: 9.5,
    minAdjEdge: 1.5,
  };

  it("a positive injury delta boosts the home-win probability", () => {
    const x = challengerCandidate(base, { injuryDelta: 0.5, lineupStatus: "", minutesToKickoff: 300 }, W, null);
    expect(x).not.toBe(null);
    expect(x.injuryVote).toBeGreaterThan(base.ensemble);
    expect(x.calibrated).toBeGreaterThan(base.calibrated);
    expect(x.ablation.B_injuries).not.toBe(null);
    expect(x.ablation.A_rx20_models_recomputed).not.toBe(null);
  });

  it("an away-win candidate falls when the away side is more weakened", () => {
    const x = challengerCandidate(
      { ...base, marketKey: "2" },
      { injuryDelta: 0.5, lineupStatus: "", minutesToKickoff: 300 },
      W,
      null
    );
    expect(x.calibrated).toBeLessThan(0.62 + 0.001);
  });

  it("the injury voter never votes outside Home/Away Win", () => {
    const x = challengerCandidate(
      { ...base, marketKey: "X" },
      { injuryDelta: 0.5, lineupStatus: "", minutesToKickoff: 300 },
      W,
      null
    );
    expect(x.injuryVote).toBe(null);
    expect(x.perModel.injury).toBeUndefined();
  });

  it("missing injury data never becomes zero (no vote, honest disclosure)", () => {
    const x = challengerCandidate(base, { injuryDelta: null, lineupStatus: "", minutesToKickoff: 300 }, W, null);
    expect(x.injuryVote).toBe(null);
    expect(x.ablation.B_injuries).toBe(null);
  });

  it("confirmed lineups reduce uncertainty but never move point estimates", () => {
    const a = challengerCandidate(base, { injuryDelta: null, lineupStatus: "", minutesToKickoff: 300 }, W, null);
    const b = challengerCandidate(base, { injuryDelta: null, lineupStatus: "confirmed", minutesToKickoff: 30 }, W, null);
    expect(b.calibrated).toBeCloseTo(a.calibrated, 10);
    expect(b.uncertainty).toBeCloseTo(a.uncertainty - 0.06, 10);
    expect(b.master).toBeGreaterThanOrEqual(a.master);
  });

  it("flags an unconfirmed lineup close to kickoff", () => {
    const x = challengerCandidate(base, { injuryDelta: null, lineupStatus: "no_lineup", minutesToKickoff: 40 }, W, null);
    expect(x.flags.some((f) => f.id === "lineup_unknown_close")).toBe(true);
    const far = challengerCandidate(base, { injuryDelta: null, lineupStatus: "no_lineup", minutesToKickoff: 400 }, W, null);
    expect(far.flags.some((f) => f.id === "lineup_unknown_close")).toBe(false);
  });

  it("rejects numeric corruption (NaN/Infinity probability)", () => {
    expect(challengerCandidate({ ...base, perModel: { strength: NaN, poisson: NaN } }, {}, W, null)).toBe(null);
  });

  it("keeps the hard edge floor for priced candidates", () => {
    const x = challengerCandidate(
      {
        ...base,
        perModel: { strength: 0.75, poisson: 0.75 },
        ensemble: 0.75,
        calibrated: 0.75,
        price: 3.2,
        implied: 1 / 3.2,
        marginImplied: 0.74,
        edgePct: 1,
        minAdjEdge: 4,
        agreement: 0.99,
      },
      { injuryDelta: null, lineupStatus: "", minutesToKickoff: 300 },
      W,
      null
    );
    expect(x.qualifies).toBe(false);
    expect(x.rejectReason).toMatch(/edge/i);
  });
});

describe("immutable challenger keys + champion/challenger promotion", () => {
  it("v1 and v2 snapshots are distinct immutable keys", () => {
    expect(challengerKey("fx", "1")).toBe("fx|1|RX-2.1");
    expect(challengerKeyV2("fx", "1")).toBe("fx|1|RX-2.1:v2");
    expect(challengerKey("fx", "1")).not.toBe(challengerKeyV2("fx", "1"));
  });

  it("latestByBaseKey prefers the newest version and dedupes", () => {
    const rows = [
      { observation_key: "fx|1|RX-2.1", status: "open" },
      { observation_key: "fx|1|RX-2.1:v2", status: "won" },
      { observation_key: "fx|X|RX-2.1", status: "lost" },
      { observation_key: "fx|X", status: "lost" }, // champion row — base key without suffix
    ];
    const latest = latestByBaseKey(rows);
    expect(latest.get("fx|1").observation_key).toBe("fx|1|RX-2.1:v2");
    expect(latest.get("fx|X").observation_key).toBe("fx|X|RX-2.1");
  });

  it("promotion requires 100+ common settled rows AND a 5%+ Brier improvement", () => {
    const r20 = [];
    const r21 = [];
    for (let i = 0; i < 30; i++) {
      r20.push({ observation_key: `fx${i}|1`, calibrated_probability: 0.7, status: "won" });
      r21.push({ observation_key: `fx${i}|1|RX-2.1`, calibrated_probability: 0.9, status: "won" });
    }
    const cmp = championChallengerComparison(r20, r21);
    expect(cmp.n).toBe(30);
    expect(cmp.brier21).toBeLessThan(cmp.brier20);
    expect(cmp.verdict).toMatch(/INSUFFICIENT/i);
    expect(championChallengerComparison([], []).n).toBe(0);
  });

  it("a lineup confirmation creates a NEW snapshot — the original is never rewritten", () => {
    const row = {
      fixture_id: "fx",
      market_key: "1",
      observation_key: "fx|1|RX-2.1",
      uncertainty: 0.4,
      kala_score: 80,
      calibrated_probability: 0.7,
      agreement: 0.9,
      data_quality: "HIGH",
      market_odds: 0,
      flags_json: JSON.stringify([{ id: "lineup_unknown_close", severity: "WARN" }]),
      snapshot_json: "{}",
      reject_reason: "",
    };
    const v2 = promoteLineupSnapshot(row, { status: "confirmed" });
    expect(v2.observation_key).toBe("fx|1|RX-2.1:v2");
    expect(row.observation_key).toBe("fx|1|RX-2.1"); // original untouched
    expect(v2.uncertainty).toBeCloseTo(0.34, 10);
    expect(v2.calibrated_probability ?? row.calibrated_probability).toBe(0.7); // probability unchanged
    const snap = JSON.parse(v2.snapshot_json);
    expect(snap.rx21_lineup_confirmation.supersedes).toBe("fx|1|RX-2.1");
    expect(JSON.parse(v2.flags_json).some((f) => f.id === "lineup_unknown_close")).toBe(false);
  });
});