// MONSTER BOARD — automated tests for the pure software behavior: the
// qualification gate, tiers, the never-forced daily target, correlation
// control, windows (Lagos time) and the research-sample architecture input.
// Synthetic fixtures are used ONLY here (deterministic software tests) and
// never enter real prediction evidence.
import { describe, it, expect } from "vitest";
import {
  buildMonster, monsterGate, tierOfMonster, architectureSimilarity,
  MONSTER_TARGET, MONSTER_BOARD_FLOOR, MONSTER_WATCH_FLOOR,
} from "@/lib/monsterBoard";
import { lagosTodayKey } from "@/lib/lagosTime";

const H = 3600000;
const now = Date.now();

const pick = (i, over = {}) => ({
  fixtureId: `fx-${i}`,
  home: `Home${i}`,
  away: `Away${i}`,
  league: `League ${i % 5}`,
  leagueCode: `lg${i % 5}`,
  kickoff: new Date(now + 5 * H).toISOString(),
  kickoffLabel: "12:00",
  lagosDateKey: "2030-01-01",
  session: "morning",
  marketKey: "1",
  marketLabel: "Home Win",
  masterScore: 85,
  qualityLabel: "HIGH",
  flags: [],
  marketOdds: 1.9,
  bookmaker: "Test Book",
  agreement: 0.85,
  uncertainty: 0.2,
  prob: 0.7,
  confidence: 70,
  edgePct: 3,
  ...over,
});

const boardOf = (all) => ({ days: [{ dateKey: lagosTodayKey(), all }] });
const many = (n, over) => Array.from({ length: n }, (_, i) => pick(i, over));

describe("monster gate", () => {
  it("qualifies strong clean candidates", () => {
    expect(monsterGate(pick(1, { masterScore: 85 })).pass).toBe(true);
  });
  it("sends borderline candidates to WATCH — never the board", () => {
    const g = monsterGate(pick(1, { masterScore: 75 }));
    expect(g.pass).toBe(false);
    expect(g.watch).toBe(true);
  });
  it("rejects weak candidates outright", () => {
    const g = monsterGate(pick(1, { masterScore: 60 }));
    expect(g.pass).toBe(false);
    expect(g.watch).toBe(false);
  });
  it("excludes LOW data quality no matter the score", () => {
    expect(monsterGate(pick(1, { masterScore: 90, qualityLabel: "LOW" })).pass).toBe(false);
  });
  it("excludes blocking red flags", () => {
    expect(monsterGate(pick(1, { masterScore: 90, flags: [{ id: "BLOCK_odds_gone" }] })).pass).toBe(false);
  });
});

describe("monster tiers", () => {
  it("bands the customer-facing tiers", () => {
    expect(tierOfMonster(92)).toBe("MONSTER ELITE");
    expect(tierOfMonster(85)).toBe("MONSTER STRONG");
    expect(tierOfMonster(75)).toBe("MONSTER WATCH");
    expect(tierOfMonster(60)).toBe("NOT QUALIFIED");
  });
});

describe("no forced picks — mandatory", () => {
  it("returns an empty board when nothing qualifies", () => {
    const m = buildMonster(boardOf(many(5, { masterScore: 60 })), { windowKey: "24h" });
    expect(m.board).toHaveLength(0);
    expect(m.qualifiedCount).toBe(0);
    expect(m.rejected).toHaveLength(5);
  });
  it("never puts WATCH selections on the board", () => {
    const m = buildMonster(boardOf(many(3, { masterScore: 75 })), { windowKey: "24h" });
    expect(m.board).toHaveLength(0);
    expect(m.watch).toHaveLength(3);
  });
});

describe("daily target 13 — a ceiling, never a quota", () => {
  it("targets 13", () => {
    expect(MONSTER_TARGET).toBe(13);
  });
  it("caps the board at 13 qualified selections", () => {
    const m = buildMonster(boardOf(many(20)), { windowKey: "24h" });
    expect(m.board).toHaveLength(13);
  });
  it("shows fewer when fewer qualify", () => {
    expect(buildMonster(boardOf(many(7)), { windowKey: "24h" }).board).toHaveLength(7);
    expect(buildMonster(boardOf(many(1)), { windowKey: "24h" }).board).toHaveLength(1);
  });
});

describe("correlation control", () => {
  it("parks a team-sharing selection below the diversified board", () => {
    const all = [
      pick(0, { home: "Shared FC", leagueCode: "lgS", masterScore: 99 }),
      pick(1, { home: "Shared FC", leagueCode: "lgT", masterScore: 98 }),
      ...Array.from({ length: 13 }, (_, i) => pick(i + 2)),
    ];
    const m = buildMonster(boardOf(all), { windowKey: "24h" });
    expect(m.board).toHaveLength(13);
    expect(m.board.some((p) => p.fixtureId === all[1].fixtureId)).toBe(false); // parked
    expect((m.correlation || {})[`${all[0].fixtureId}|${all[0].marketKey}`]).toBe("LOW");
  });
  it("caps one competition at 3 inside the board while filling", () => {
    const same = Array.from({ length: 4 }, (_, i) => pick(i, { leagueCode: "lgX", masterScore: 99 - i }));
    const others = Array.from({ length: 11 }, (_, i) => pick(i + 10, { leagueCode: `lg${i}` }));
    const m = buildMonster(boardOf([...same, ...others]), { windowKey: "24h" });
    expect(m.board.filter((p) => p.leagueCode === "lgX").length).toBe(3);
  });
});

describe("windows (Lagos time)", () => {
  it("includes only the selected board day (date-key window)", () => {
    const a = pick(1, { lagosDateKey: "2030-01-01" });
    const b = pick(2, { lagosDateKey: "2030-01-02" });
    const m = buildMonster(boardOf([a, b]), { windowKey: "2030-01-01" });
    expect(m.board.map((p) => p.fixtureId)).toEqual([a.fixtureId]);
  });
  it("24h window excludes kickoffs beyond it", () => {
    const in24 = pick(1, {});
    const out24 = pick(2, { kickoff: new Date(now + 30 * H).toISOString() });
    const m = buildMonster(boardOf([in24, out24]), { windowKey: "24h" });
    expect(m.poolSize).toBe(1);
    expect(m.board[0].fixtureId).toBe(in24.fixtureId);
  });
  it("session filter narrows the pool", () => {
    const m = buildMonster(boardOf([pick(1, { session: "morning" })]), { windowKey: "24h", session: "evening" });
    expect(m.poolSize).toBe(0);
  });
});

describe("architecture input (research sample)", () => {
  it("scores a priced in-band high-consensus HIGH-quality candidate highest", () => {
    expect(architectureSimilarity(pick(1))).toBe(1);
  });
  it("scores an unpriced candidate lower", () => {
    expect(architectureSimilarity(pick(1, { marketOdds: 0 }))).toBeLessThan(architectureSimilarity(pick(1)));
  });
  it("penalizes prices outside the sample band", () => {
    expect(architectureSimilarity(pick(1, { marketOdds: 1.05 }))).toBeLessThan(1);
  });
  it("never overrides current evidence — score outranks architecture", () => {
    const m = buildMonster(
      boardOf([
        pick(1, { masterScore: 88, marketOdds: 0 }), // strong but unpriced
        pick(2, { masterScore: 82, marketOdds: 1.9 }), // archetypal but weaker
      ]),
      { windowKey: "24h" }
    );
    expect(m.board[0].fixtureId).toBe("fx-1");
  });
});