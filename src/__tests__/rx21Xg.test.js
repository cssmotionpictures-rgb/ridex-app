import { describe, it, expect } from "vitest";
import {
  xgVoteOf, xgAblationOf, expectedGoalsTotalOf, challengerCandidate,
} from "@/lib/ensemble/rx21Core";
import { matchXgTeam, xgSeasonOf, XG_LEAGUE_SLUGS } from "@/lib/ensemble/xg";

// xG ENRICHMENT RESEARCH — the expected-goals layer is recorded as a RESEARCH
// ABLATION ONLY: the challenger's own recorded probability never moves from
// it. A real xG voter reaches production only through out-of-sample promotion.

const W = { strength: 0.1, poisson: 0.13, market: 0.16 };
const XG = {
  status: "matched",
  home: { xgFor: 2.1, xgAgainst: 0.9 },
  away: { xgFor: 1.4, xgAgainst: 1.3 },
};

describe("matchXgTeam — cross-source team matching on the xG feed", () => {
  const teams = [
    { name: "Manchester United", xgFor: 1.8, xgAgainst: 1.1, matches: 5 },
    { name: "Liverpool", xgFor: 2.1, xgAgainst: 0.9, matches: 5 },
    { name: "Atletico Madrid", xgFor: 1.5, xgAgainst: 0.8, matches: 5 },
    { name: "Athletic Club", xgFor: 1.2, xgAgainst: 1.0, matches: 5 },
  ];
  it("matches the same club across naming variants", () => {
    expect(matchXgTeam(teams, "Manchester United")?.name).toBe("Manchester United");
    expect(matchXgTeam(teams, "Atletico Madrid")?.name).toBe("Atletico Madrid");
  });
  it("rejects ambiguous matches — a name is never force-fit", () => {
    const amb = [
      { name: "Sporting", xgFor: 1, xgAgainst: 1, matches: 5 },
      { name: "Sporting Braga", xgFor: 1, xgAgainst: 1, matches: 5 },
    ];
    expect(matchXgTeam(amb, "Sporting")).toBe(null);
  });
  it("returns null on no match or no list — never a guess", () => {
    expect(matchXgTeam(teams, "Chelsea")).toBe(null);
    expect(matchXgTeam(null, "Liverpool")).toBe(null);
  });
});

describe("xgSeasonOf — European season year mapping", () => {
  it("maps autumn kickoffs to the starting year and spring kickoffs to the previous year", () => {
    expect(xgSeasonOf("2026-09-12T18:00:00Z")).toBe(2026);
    expect(xgSeasonOf("2027-02-13T18:00:00Z")).toBe(2026);
  });
  it("covers the board's league codes", () => {
    expect(XG_LEAGUE_SLUGS["en.1"]).toBe("EPL");
    expect(XG_LEAGUE_SLUGS["es.1"]).toBe("La_Liga");
    expect(XG_LEAGUE_SLUGS["de.1"]).toBe("Bundesliga");
  });
});

describe("xgVoteOf — a transparent vote only where an honest shift exists", () => {
  it("votes over/under symmetrically from the expected-goals total vs the line", () => {
    const over = xgVoteOf("O2.5", XG); // expTotal 3.5 > 2.5
    const under = xgVoteOf("U2.5", XG);
    expect(over).toBeGreaterThan(0.5);
    expect(under).toBeLessThan(0.5);
    expect(over).toBeCloseTo(1 - under, 10);
  });
  it("votes BTTS from both attacks", () => {
    expect(xgVoteOf("BTTS_Y", XG)).toBeGreaterThan(0.5); // 3.5 total > 2.4 baseline
    expect(xgVoteOf("BTTS_N", XG)).toBeLessThan(0.5);
    expect(xgVoteOf("BTTS_Y", XG)).toBeCloseTo(1 - xgVoteOf("BTTS_N", XG), 10);
  });
  it("votes home/away from the attack-vs-opposing-defense edge", () => {
    expect(xgVoteOf("1", XG)).toBeGreaterThan(0.5); // home edge positive
    expect(xgVoteOf("2", XG)).toBeLessThan(0.5);
    expect(xgVoteOf("1", XG)).toBeCloseTo(1 - xgVoteOf("2", XG), 10);
  });
  it("never invents a vote for draws, double chance or missing data", () => {
    expect(xgVoteOf("X", XG)).toBe(null);
    expect(xgVoteOf("1X", XG)).toBe(null);
    expect(xgVoteOf("1", { status: "unavailable" })).toBe(null);
    expect(xgVoteOf("1", null)).toBe(null);
    expect(xgVoteOf("1", { status: "matched", home: { xgFor: 1.9 }, away: { xgFor: 1.7 } })).toBe(null); // no xg-against data
  });
  it("caps the shift at the honest maximum", () => {
    const extreme = xgVoteOf("O2.5", {
      status: "matched",
      home: { xgFor: 4, xgAgainst: 0.5 },
      away: { xgFor: 4, xgAgainst: 0.5 },
    });
    expect(extreme).toBeLessThanOrEqual(0.62); // 0.5 + RX21_XG_MAX_SHIFT
  });
});

describe("expectedGoalsTotalOf", () => {
  it("sums both attacks when both sides are verified", () => {
    expect(expectedGoalsTotalOf(XG)).toBeCloseTo(3.5, 5);
    expect(expectedGoalsTotalOf(null)).toBe(null);
  });
});

describe("xG ablation — research only, the recorded challenger probability never moves", () => {
  const base = {
    marketKey: "O2.5",
    ensemble: 0.58,
    calibrated: 0.58,
    perModel: { strength: 0.55, poisson: 0.6 },
    agreement: 0.85,
    uncertainty: 0.25,
    dq: "HIGH",
    master: 81,
    flags: [],
    priced: false,
    price: 0,
  };
  const enrich = { injuryDelta: null, lineupStatus: "", minutesToKickoff: 300, xg: XG };

  it("records the xG research vote as an ablation without touching the recorded probability", () => {
    const withXg = challengerCandidate(base, enrich, W, null);
    const withoutXg = challengerCandidate(base, { ...enrich, xg: null }, W, null);
    expect(withXg.calibrated).toBeCloseTo(withoutXg.calibrated, 10); // recorded probability unchanged
    expect(withXg.perModel.xg).toBeUndefined(); // never a recorded voter
    expect(withXg.ablation.E_xg).not.toBe(null);
    expect(withXg.ablation.E_xg).not.toBeCloseTo(withXg.ablation.D_rx21, 5); // genuinely different research estimate
    expect(withXg.ablation.xg.status).toBe("matched");
    expect(withXg.ablation.xg.expTotal).toBeCloseTo(3.5, 5);
  });

  it("an xG total below the line lowers the research estimate for an Over pick", () => {
    const lowXg = {
      status: "matched",
      home: { xgFor: 0.9, xgAgainst: 1.3 },
      away: { xgFor: 0.8, xgAgainst: 1.1 },
    };
    const x = challengerCandidate(base, { ...enrich, xg: lowXg }, W, null);
    expect(x.ablation.E_xg).toBeLessThan(x.ablation.D_rx21);
  });

  it("unmatched or unavailable xG records honestly instead of guessing", () => {
    const un = challengerCandidate(base, { ...enrich, xg: { status: "unmatched" } }, W, null);
    expect(un.ablation.E_xg).toBe(null);
    expect(un.ablation.xg.status).toBe("unmatched");
  });

  it("xgAblationOf returns null when no honest vote exists for the market", () => {
    expect(xgAblationOf({ ...base, marketKey: "X" }, XG, W, null)).toBe(null);
  });
});