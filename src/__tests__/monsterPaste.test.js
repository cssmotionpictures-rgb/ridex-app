import { describe, it, expect } from "vitest";
import {
  parseBettingPaste,
  normalizeTeam,
  teamMatchScore,
  matchGames,
} from "@/lib/monsterPaste/parser";
import { buildArrangements } from "@/lib/monsterPaste/arrangements";
import { pasteIdOf } from "@/lib/monsterPaste/pasteFlow";
import { importHash } from "@/lib/globalLearning/globalId";

const pick = (over = {}) => ({
  fixtureId: over.fixtureId || "of-x-1",
  home: over.home || "Arsenal",
  away: over.away || "Chelsea",
  league: over.league || "Premier League",
  leagueCode: over.leagueCode || "en.1",
  marketKey: over.marketKey || "1",
  marketLabel: over.marketLabel || "Home",
  prob: over.prob ?? 0.7,
  marketOdds: over.marketOdds ?? 0,
  edgePct: over.edgePct ?? 0,
  adjEdgePct: over.adjEdgePct ?? 0,
  uncertainty: over.uncertainty ?? 0.1,
  masterScore: over.masterScore ?? 85,
  qualityLabel: over.qualityLabel || "HIGH",
  ...over,
});

describe("MONSTER paste parser", () => {
  it("parses vs / v / dash / x separated games with leading and trailing kickoff times", () => {
    const out = parseBettingPaste(
      "19:30 Arsenal vs Chelsea\nBarcelona v Real Madrid\nInter - Milan\nBayern x Dortmund\nLiverpool vs Everton 20:45"
    );
    expect(out.stats.gamesDetected).toBe(5);
    expect(out.games[0]).toMatchObject({ home: "Arsenal", away: "Chelsea", time: "19:30" });
    expect(out.games[1]).toMatchObject({ home: "Barcelona", away: "Real Madrid" });
    expect(out.games[2]).toMatchObject({ home: "Inter", away: "Milan" });
    expect(out.games[3]).toMatchObject({ home: "Bayern", away: "Dortmund" });
    expect(out.games[4].away).toBe("Liverpool vs Everton".split(" vs ")[1] && "Everton");
  });

  it("parses 1X2, over/under and BTTS prices and attaches them to the nearest preceding game", () => {
    const out = parseBettingPaste("Arsenal vs Chelsea\nHome 1.85 Draw 3.60 Away 4.20\nMan City vs Liverpool\n1 1.90 X 3.40 2 4.10\nOver 2.5 1.90\nBTTS Yes 1.75");
    expect(out.stats.gamesDetected).toBe(2);
    expect(out.stats.marketsDetected).toBe(8); // 3+3 1X2 prices + over + BTTS
    const [g1, g2] = out.games;
    expect(g1.odds[0]).toMatchObject({ market: "1X2", home: 1.85, draw: 3.6, away: 4.2 });
    expect(g2.odds[0]).toMatchObject({ market: "1X2", home: 1.9 });
    expect(g2.odds.find((o) => o.side === "over")).toMatchObject({ line: "2.5", price: 1.9 });
    expect(g2.odds.find((o) => o.market === "BTTS YES")).toMatchObject({ price: 1.75 });
  });

  it("removes duplicate and reversed-duplicate games, keeps unparseable lines visible, never fails the batch", () => {
    const out = parseBettingPaste(
      "Arsenal vs Chelsea\nArsenal vs Chelsea\nChelsea vs Arsenal\nMan City vs Liverpool\nsome random junk line\n10:00 kickoff note"
    );
    expect(out.stats.gamesDetected).toBe(2); // Arsenal-Chelsea kept once, Man City-Liverpool
    expect(out.stats.duplicatesRemoved).toBe(2);
    expect(out.stats.unparseableLines.length).toBeGreaterThan(0);
  });

  it("never turns a partial odds fragment into a fabricated price", () => {
    const out = parseBettingPaste("Arsenal vs Chelsea\nHome 1.85 Draw 3.60");
    expect(out.stats.marketsDetected).toBe(0); // all three 1X2 prices required
  });
});

describe("MONSTER paste fixture matcher", () => {
  it("normalizes aliases, accents and club suffixes", () => {
    expect(normalizeTeam("Man City")).toBe("manchester city");
    expect(normalizeTeam("FC Köln")).toBe("koln");
    expect(teamMatchScore("Man City", "Manchester City")).toBe(2);
    expect(teamMatchScore("Spurs", "Tottenham Hotspur")).toBe(2);
    expect(teamMatchScore("Bayern", "FC Bayern München")).toBe(1);
    expect(teamMatchScore("Bayern", "Chelsea")).toBe(0);
  });

  it("matches a pasted game only when BOTH teams resolve to the same verified fixture", () => {
    const fixtures = [
      { fixtureId: "f1", home: "Arsenal", away: "Chelsea" },
      { fixtureId: "f2", home: "Manchester City", away: "Liverpool FC" },
    ];
    const { matched, notFound } = matchGames(
      [
        { home: "Arsenal", away: "Chelsea" },
        { home: "Man City", away: "Liverpool" },
        { home: "Real Madrid", away: "Barcelona" },
      ],
      fixtures
    );
    expect(matched).toHaveLength(2);
    expect(matched[0]).toMatchObject({ fixtureId: "f1" });
    expect(matched[1]).toMatchObject({ fixtureId: "f2" });
    expect(notFound).toHaveLength(1);
    expect(notFound[0].reason).toContain("INSUFFICIENT DATA");
  });

  it("sends ambiguous team matches to review instead of guessing", () => {
    const fixtures = [
      { fixtureId: "f1", home: "Real Madrid", away: "Barcelona" },
      { fixtureId: "f2", home: "Real Madrid", away: "Atlético Madrid" },
    ];
    const { review, matched } = matchGames([{ home: "Real Madrid", away: "Barcelona" }], fixtures);
    // both fixtures score equally on the "Real Madrid" side? Barcelona matches only f1 → unique best
    expect(matched).toHaveLength(1);
    // genuinely ambiguous: same normalized fixture twice under different ids
    const fixtures2 = [
      { fixtureId: "fa", home: "Inter", away: "Milan" },
      { fixtureId: "fb", home: "Inter", away: "Milan" },
    ];
    const r2 = matchGames([{ home: "Inter", away: "Milan" }], fixtures2);
    expect(r2.review).toHaveLength(1);
    expect(r2.matched).toHaveLength(0);
  });
});

describe("MONSTER paste arrangements", () => {
  const correlation = {};

  it("builds every structure ONLY from qualified picks with distinct teams", () => {
    const picks = [
      pick({ fixtureId: "f1", home: "Arsenal", away: "Chelsea", marketOdds: 1.85, edgePct: 5, adjEdgePct: 4 }),
      pick({ fixtureId: "f2", home: "Man City", away: "Liverpool", marketOdds: 3.4, edgePct: 2, adjEdgePct: 1, marketKey: "2", marketLabel: "Away" }),
      pick({ fixtureId: "f3", home: "Arsenal", away: "Everton", marketKey: "O2.5", marketLabel: "Over 2.5" }), // shares Arsenal — excluded from combos
      pick({ fixtureId: "f4", home: "Bayern", away: "Dortmund", marketOdds: 1.6, edgePct: 3, adjEdgePct: 2, leagueCode: "de.1" }),
    ];
    const arr = buildArrangements(picks, correlation);
    expect(arr.singles.legs).toHaveLength(4);
    expect(arr.safer.legs.length).toBeLessThanOrEqual(3);
    expect(arr.balanced.legs.length).toBeLessThanOrEqual(5);
    // every multi-leg structure is team-distinct
    for (const a of [arr.safer, arr.balanced, arr.acca3, arr.acca4, arr.value, arr.highRisk]) {
      const teams = a.legs.flatMap((l) => [l.home, l.away]);
      expect(new Set(teams).size).toBe(teams.length);
    }
    expect(arr.value.legs[0].fixtureId).toBe("f1"); // ranked by adjusted edge
    expect(arr.highRisk.legs.map((l) => l.fixtureId)).toEqual(["f2"]);
    expect(arr.acca3.legs).toHaveLength(3);
  });

  it("combined odds use real prices only when every leg carries one", () => {
    const priced = [pick({ fixtureId: "a", marketOdds: 2 }), pick({ fixtureId: "b", home: "X", away: "Y", marketOdds: 2 })];
    const mixed = [pick({ fixtureId: "a", marketOdds: 2 }), pick({ fixtureId: "b", home: "X", away: "Y", marketOdds: 0, prob: 0.5 })];
    expect(buildArrangements(priced, correlation).acca3.oddsBasis).toBe("real");
    expect(buildArrangements(priced, correlation).acca3.combinedOdds).toBe(4);
    expect(buildArrangements(mixed, correlation).acca3.oddsBasis).toBe("model");
  });

  it("flags same-competition correlation and returns honest empty structures", () => {
    const same = [
      pick({ fixtureId: "a", leagueCode: "en.1" }),
      pick({ fixtureId: "b", home: "X", away: "Y", leagueCode: "en.1" }),
      pick({ fixtureId: "c", home: "P", away: "Q", leagueCode: "en.1" }),
    ];
    const arr = buildArrangements(same, correlation);
    expect(arr.acca3.warnings.some((w) => w.includes("correlated"))).toBe(true);
    const none = buildArrangements([], correlation);
    expect(none.safer.legs).toEqual([]);
    expect(none.singles.legs).toEqual([]);
  });
});

describe("MONSTER paste identity + audit hash", () => {
  it("paste ids are deterministic and idempotent per fixture+market", () => {
    expect(pasteIdOf("of-x", "1", 1)).toBe("paste|of-x|1|v1");
    expect(pasteIdOf("of-x", "1", 1)).toBe(pasteIdOf("of-x", "1", 1));
    expect(pasteIdOf("of-x", "1", 2)).not.toBe(pasteIdOf("of-x", "1", 1));
  });

  it("the same paste text resolves to the same import hash (duplicate detection)", () => {
    const a = "Arsenal vs Chelsea\n\nMan City vs Liverpool";
    const b = "man city vs liverpool\narsenal vs chelsea ";
    expect(importHash(a)).toBe(importHash(b));
    expect(importHash(a)).not.toBe(importHash("Barcelona vs Real Madrid"));
  });
});