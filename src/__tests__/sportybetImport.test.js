// Regression tests — SPORTYBET FULL-BATCH HISTORICAL IMPORT (pure parser,
// market normalization, canonical settlement, dedup; the DB orchestration is
// exercised live in the Result Import UI).
import { describe, it, expect } from "vitest";
import {
  detectSportyBetText,
  parseSportyBetBatch,
  ticketTalliesOf,
} from "@/lib/globalLearning/sportybetParser";
import {
  normalizeSportyBetMarket,
  normalizeOutcomeText,
  settleSportyBetPick,
  oddsBandOf,
} from "@/lib/globalLearning/sportybetMarkets";

const BATCH = `
Match Tracker
Ticket ID: 477926
09/09/2026 10:12
Multiple
Stake: 100.00
Total odds: 33150.98
Number of Bets: 1
Game ID: 15285
12/09 13:30
FC Groningen v FC Twente
FT Score: 2:2
Pick: Over 2.5
Odds: 1.50
Market: Goals Over/Under
Outcome: WIN
Game ID: 12438
12/09 15:00
Huachipato v Colo-Colo
FT Score: 0:0
Pick: Over 2.5
Odds: 1.53
Market: Goals Over/Under
Outcome: LOSS
Game ID: 15627
SC Heerenveen v Alkmaar
FT Score: 2:3
Pick: Over 1.5
Odds: 1.58
Market: Goals Over/Under
Game ID: 21014
13/09 20:00
Sunderland v Arsenal
Pick: Away
Odds: 1.52
Market: 1X2
Outcome: PENDING
Delete Ticket
Contact Support
Ticket ID: 477926
09/09/2026 10:12
Multiple
Stake: 100.00
Total odds: 33150.98
Number of Bets: 1
Game ID: 15285
12/09 13:30
FC Groningen v FC Twente
FT Score: 2:2
Pick: Over 2.5
Odds: 1.50
Market: Goals Over/Under
Outcome: WIN
Ticket ID: 341037
Game ID: 18068
Getafe v Celta Vigo
FT Score: 1:1
Pick: Under 3.5
Odds: 1.13
Market: Goals Over/Under
Outcome: WIN
`;

describe("SportyBet detection", () => {
  it("detects SportyBet ticket structure", () => {
    expect(detectSportyBetText(BATCH)).toBe(true);
  });
  it("does not fire on a small generic result list", () => {
    expect(detectSportyBetText("Arsenal 2-1 Chelsea Over 2.5 @1.90 WON\nBayern 3-0 Werder Home Win @1.45")).toBe(false);
  });
});

describe("SportyBet batch parsing", () => {
  const parsed = parseSportyBetBatch(BATCH);

  it("detects tickets and dedupes the duplicated ticket copy", () => {
    expect(parsed.ticketsDetected).toBe(3);
    expect(parsed.uniqueTickets.length).toBe(2);
    expect(parsed.duplicateTicketCopies).toBe(1);
  });

  it("parses every leg — UI fragments never become observations", () => {
    expect(parsed.ignoredFragments).toBeGreaterThanOrEqual(3);
    const legs = parsed.legs;
    expect(legs.length).toBe(5); // 4 legs from ticket 1 + 1 from ticket 341037; duplicated Groningen leg merged
    expect(parsed.duplicateLegs).toBe(1);
    const groningen = legs.find((l) => l.home.includes("Groningen"));
    expect(groningen.ticketIds.length).toBe(1); // same ticket — one observation
  });

  it("parses leg fields incl. score, odds and market", () => {
    const leg = parsed.legs.find((l) => l.gameId === "15285");
    expect(leg.home).toBe("FC Groningen");
    expect(leg.away).toBe("FC Twente");
    expect(leg.ftScore).toEqual([2, 2]);
    expect(leg.odds).toBe(1.5);
    expect(leg.pick).toBe("Over 2.5");
    expect(leg.kickoffDate).toBe("2026-09-12");
  });

  it("keeps a missing-Outcome leg as valid parsed evidence", () => {
    const leg = parsed.legs.find((l) => l.gameId === "15627");
    expect(leg).toBeTruthy();
    expect(leg.ftScore).toEqual([2, 3]);
    expect(leg.outcome).toBe("");
  });

  it("keeps a no-score leg as pending evidence", () => {
    const leg = parsed.legs.find((l) => l.gameId === "21014");
    expect(leg).toBeTruthy();
    expect(leg.ftScore).toBe(null);
    expect(leg.pick).toBe("Away");
  });
});

describe("canonical settlement from FT score", () => {
  const settle = (market, pick, h, a) => settleSportyBetPick(normalizeSportyBetMarket(market, pick), h, a);

  it("over/under half lines", () => {
    expect(settle("Goals Over/Under", "Over 2.5", 2, 2)).toBe("won");
    expect(settle("Goals Over/Under", "Over 2.5", 0, 0)).toBe("lost");
    expect(settle("Goals Over/Under", "Under 3.5", 0, 0)).toBe("won");
    expect(settle("Goals Over/Under", "Under 3.5", 4, 1)).toBe("lost");
  });

  it("asian totals — whole lines push at the exact number", () => {
    expect(settle("Goals Over/Under", "Over 2", 1, 1)).toBe("push");
    expect(settle("Goals Over/Under", "Over 3", 2, 0)).toBe("lost");
    expect(settle("Goals Over/Under", "Over 3", 2, 2)).toBe("won");
    expect(settle("Goals Over/Under", "Under 2", 1, 0)).toBe("won");
  });

  it("1X2 and double chance", () => {
    expect(settle("1X2", "Home", 1, 1)).toBe("lost");
    expect(settle("1X2", "Away", 0, 2)).toBe("won");
    expect(settle("Double Chance", "Home or Draw", 2, 1)).toBe("won");
    expect(settle("Double Chance", "Home or Draw", 0, 2)).toBe("lost");
    expect(settle("Double Chance", "Home/Away", 1, 1)).toBe("lost");
  });

  it("draw no bet — a draw is a push", () => {
    expect(settle("Draw No Bet", "Home", 1, 1)).toBe("push");
    expect(settle("Draw No Bet", "Away", 1, 2)).toBe("won");
    expect(settle("Asian Handicap", "Home 0", 2, 2)).toBe("push");
  });

  it("asian handicap margins", () => {
    expect(settle("Asian Handicap", "Home -1.5", 2, 0)).toBe("won");
    expect(settle("Asian Handicap", "Home -1.5", 1, 0)).toBe("lost");
    expect(settle("Asian Handicap", "Home -1", 1, 0)).toBe("push");
    expect(settle("Asian Handicap", "Away +1", 1, 0)).toBe("push");
    expect(settle("Asian Handicap", "Away +2", 1, 0)).toBe("won");
    expect(settle("Asian Handicap", "Away +2", 2, 0)).toBe("push");
  });

  it("team goals", () => {
    expect(settle("Team Goals", "Home Over 0.5", 2, 0)).toBe("won");
    expect(settle("Team Goals", "Home Over 0.5", 0, 3)).toBe("lost");
    expect(settle("Team Goals", "Away Under 1.5", 0, 1)).toBe("won");
  });

  it("btts", () => {
    expect(settle("Both Teams to Score", "Yes", 1, 1)).toBe("won");
    expect(settle("Both Teams to Score", "Yes", 2, 0)).toBe("lost");
    expect(settle("Both Teams to Score", "No", 0, 2)).toBe("won");
  });

  it("combined markets", () => {
    expect(settle("Home/Away & Over 2.5", "Home & Over 2.5", 3, 1)).toBe("won");
    expect(settle("Home/Away & Over 2.5", "Home & Over 2.5", 1, 0)).toBe("lost");
    expect(settle("Special", "Away or Over 2.5", 1, 1)).toBe("lost");
    expect(settle("Special", "Away or Over 2.5", 3, 3)).toBe("won");
  });

  it("markets an FT score can never grade stay honestly unsettled", () => {
    expect(settle("Corners Over/Under", "Over 8.5", 2, 1)).toBe(null);
    expect(settle("Early Goals", "Goal in 1st 10min", 2, 1)).toBe(null);
    expect(settle("Home Team to Win Either Half", "Home", 2, 0)).toBe(null);
    expect(settle("Goals Over/Under", "Over 2.25", 2, 1)).toBe(null); // quarter line
    expect(settle("Asian Handicap", "Home -1.75", 2, 0)).toBe(null); // quarter line
    expect(settle("Asian Handicap", "-1.5", 2, 0)).toBe(null); // side not stated
  });
});

describe("outcome normalization + conflict material", () => {
  it("normalizes SportyBet outcome wording", () => {
    expect(normalizeOutcomeText("WIN")).toBe("won");
    expect(normalizeOutcomeText("Loss")).toBe("lost");
    expect(normalizeOutcomeText("Pending")).toBe("pending");
    expect(normalizeOutcomeText("Under 3")).toBe(""); // not an outcome — ignored, no false conflict
  });

  it("flags a supplied outcome that contradicts the score", () => {
    // Over 3 with FT 2:0 canonically loses — a ticket printing WIN conflicts
    const norm = normalizeSportyBetMarket("Goals Over/Under", "Over 3");
    const computed = settleSportyBetPick(norm, 2, 0);
    expect(computed).toBe("lost");
    expect(normalizeOutcomeText("WIN")).toBe("won");
    expect(computed).not.toBe(normalizeOutcomeText("WIN"));
  });
});

describe("ticket-level tallies — leg quality separate from ticket result", () => {
  it("tallies settled legs per ticket with correct field names", () => {
    const tallies = ticketTalliesOf([
      { ticketId: "900111", bucket: "settled", status: "won" },
      { ticketId: "900111", bucket: "settled", status: "won" },
      { ticketId: "900111", bucket: "settled", status: "lost" },
      { ticketId: "900111", bucket: "settled", status: "push" },
      { ticketId: "900111", bucket: "pending", status: "pending" },
      { ticketId: "900111", bucket: "conflict", status: "conflict" },
      { ticketId: "900111", bucket: "suppliedOnly", status: "won" },
      { ticketId: "900112", bucket: "settled", status: "won" },
      { ticketId: "900112", bucket: "settled", status: "won" },
    ]);
    const a = tallies.get("900111");
    expect(a.wins).toBe(2);
    expect(a.losses).toBe(1);
    expect(a.pushes).toBe(1);
    expect(a.pending).toBe(1);
    expect(a.unresolved).toBe(2); // conflict + supplied-only legs stay unsettled
    expect(a.legs).toBe(7);
    const b = tallies.get("900112");
    expect(b.wins).toBe(2);
    expect(b.losses).toBe(0);
  });
});

describe("odds bands", () => {
  it("buckets historical odds", () => {
    expect(oddsBandOf(1.08)).toBe("<1.10");
    expect(oddsBandOf(1.53)).toBe("1.50–1.59");
    expect(oddsBandOf(1.65)).toBe("1.60–1.79");
    expect(oddsBandOf(3.4)).toBe("3.00+");
  });
});

describe("no immediate production promotion", () => {
  it("keeps learning as evidence-gated queue material only", () => {
    // The import returns insights for the EXISTING evidence-gated queue; a
    // batch can never promote a model change by itself. Guard: the import
    // result contract exposes counts + learning only — no promotion channel.
    const parsed = parseSportyBetBatch(BATCH);
    expect(parsed.legs.length).toBeGreaterThan(0);
    expect(parsed.legs.every((l) => l.identity && l.identity.startsWith("sb|"))).toBe(true);
    expect(parsed.legs.every((l) => Array.isArray(l.ticketIds))).toBe(true);
  });
});