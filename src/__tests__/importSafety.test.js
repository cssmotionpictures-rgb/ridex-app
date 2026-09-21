// SPORTYBET IMPORT SAFETY — regression lock for the strict fail-safe read gate.
// REQUIRED INVARIANT: NO SUCCESSFUL WRITE MAY OCCUR WHEN A REQUIRED
// DEDUP/MATCH READ HAS FAILED. READ FAILURE → IMPORT PAUSED / BLOCKED →
// RETRY — a throttled, timed-out or malformed read is never treated as an
// empty dataset.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/base44Client", () => {
  const base44 = { entities: {}, functions: { invoke: vi.fn(async () => ({ data: {} })) } };
  return { base44 };
});

import { base44 } from "@/api/base44Client";
import { runSportyBetImport } from "@/lib/globalLearning/sportybetImport";

const RETRY = { retries: 1, baseDelayMs: 2 };
const err429 = () => {
  const e = new Error("429: App entity read traffic volume limit exceeded. Retry after 26 seconds.");
  e.status = 429;
  return e;
};
const errTimeout = () => new Error("Network request timed out");

// In-memory entity store with write logging.
function makeStore(seed = []) {
  const state = { rows: seed.map((r) => ({ ...r })), calls: { create: 0, bulkCreate: 0, bulkUpdate: 0 } };
  const entity = {
    // Query-aware filter — equality on every query key (the duplicate-batch
    // check relies on import_hash actually being matched).
    filter: vi.fn(async (q = {}) => state.rows.filter((r) => Object.entries(q).every(([k, v]) => r[k] === v))),
    create: vi.fn(async (rec) => {
      state.calls.create++;
      const row = { id: `id-${state.calls.create}`, ...rec };
      state.rows.push(row);
      return row;
    }),
    bulkCreate: vi.fn(async (recs) => {
      state.calls.bulkCreate++;
      (recs || []).forEach((rec) => state.rows.push({ id: `id-${state.rows.length}`, ...rec }));
      return recs || [];
    }),
    bulkUpdate: vi.fn(async (updates) => {
      state.calls.bulkUpdate++;
      (updates || []).forEach((u) => {
        const r = state.rows.find((x) => x.id === u.id);
        if (r) Object.assign(r, u);
      });
      return updates || [];
    }),
  };
  return { state, entity };
}

const LEDGER_ROW = () => ({
  id: "p1",
  global_prediction_id: "kala|RX-2.0|f1|O2.5|v1",
  fixture_id: "f1",
  home: "Arsenal FC",
  away: "Chelsea FC",
  league: "Premier League",
  league_code: "",
  kickoff: "2026-09-05T15:00:00Z",
  lagos_date_key: "2026-09-05",
  market_key: "O2.5",
  market_label: "Over 2.5",
  model_version: "RX-2.0",
  source_section: "kala",
  probability: 0.7,
  confidence: 82,
  fair_odds: 1.43,
  market_odds: 0,
  bookmaker: "",
  status: "open",
  prediction_version: 1,
  recorded_at: "2026-09-01T10:00:00Z",
  agreement: 0.9,
  data_quality: "HIGH",
});

let stores = {};
const bind = (name, seed = []) => {
  stores[name] = makeStore(seed);
  base44.entities[name] = stores[name].entity;
};
const resetStores = () => {
  stores = {};
  bind("ResultImportBatch");
  bind("GlobalPredictionLedger", [LEDGER_ROW()]);
  bind("GlobalOutcomeLedger");
  bind("ExternalHistoricalResult");
  bind("SportyBetTicket");
  bind("GlobalLearningInsight");
};
const totalWrites = () =>
  Object.values(stores).reduce((s, x) => s + x.state.calls.create + x.state.calls.bulkCreate + x.state.calls.bulkUpdate, 0);

const TICKET = [
  "Ticket ID: 900113",
  "Date: 05/09/2026 15:04",
  "Stake: 100",
  "Total Odds: 1.85",
  "Number of Bets: 1",
  "Game ID: 4811201",
  "Arsenal FC vs Chelsea FC",
  "Kickoff: 05/09/2026 16:00",
  "FT Score: 3-1",
  "Pick: Over 2.5",
  "Odds: 1.85",
  "Market: Over/Under",
  "Outcome: WON",
].join("\n");

// Same Ticket ID as TICKET but a different game — the ticket record must not
// duplicate; its (unmatched) leg is still retained as external evidence.
const TICKET_DUP = [
  "Ticket ID: 900113",
  "Date: 05/09/2026 16:04",
  "Stake: 100",
  "Total Odds: 1.85",
  "Number of Bets: 1",
  "Game ID: 9990001",
  "Torino FC vs Bologna FC",
  "Kickoff: 05/09/2026 16:00",
  "FT Score: 1-0",
  "Pick: Over 2.5",
  "Odds: 1.85",
  "Market: Over/Under",
  "Outcome: WON",
].join("\n");

// Different text, same ticket + same leg as TICKET_DUP — the leg identity
// already exists, so the leg must be refused, never double-counted.
const TICKET_DUP2 = TICKET_DUP.replace("Date: 05/09/2026 16:04", "Date: 05/09/2026 17:04");

const run = (text, extra = {}) => runSportyBetImport(text, { retry: RETRY, ...extra });

beforeEach(resetStores);

describe("SportyBet import safety — normal + duplicate behavior", () => {
  it("1. normal successful import: parses, matches, settles and records everything exactly once", async () => {
    const res = await run(TICKET);
    expect(res.paused).toBeFalsy();
    expect(res.duplicate).toBe(false);
    expect(res.state).toBe("COMPLETED");
    expect(res.counts.legsParsed).toBe(1);
    expect(res.counts.rideXMatched).toBe(1);
    expect(res.counts.wins).toBe(1);
    const ledger = stores.GlobalPredictionLedger.state.rows.find((r) => r.id === "p1");
    expect(ledger.status).toBe("won");
    expect(ledger.verification).toBe("user_supplied");
    expect([ledger.actual_home, ledger.actual_away]).toEqual([3, 1]);
    expect(stores.GlobalOutcomeLedger.state.rows).toHaveLength(1);
    expect(stores.GlobalOutcomeLedger.state.rows[0].settlement).toBe("won");
    expect(stores.SportyBetTicket.state.rows).toHaveLength(1);
    expect(stores.SportyBetTicket.state.rows[0].ticket_key).toBe("sportybet|900113");
    expect(stores.ResultImportBatch.state.rows).toHaveLength(1);
    expect(stores.ResultImportBatch.state.rows[0].parsed_count).toBe(1);
    expect(stores.ResultImportBatch.state.rows[0].high_matches).toBe(1);
    expect(stores.ExternalHistoricalResult.state.rows).toHaveLength(0); // matched leg never duplicated as external
  });

  it("2. duplicate ticket: the same Ticket ID never creates a second ticket record", async () => {
    const first = await run(TICKET);
    expect(first.state).toBe("COMPLETED");
    const second = await run(TICKET_DUP);
    expect(second.state).toBe("COMPLETED");
    expect(stores.SportyBetTicket.state.rows).toHaveLength(1); // one ticket record only
    expect(second.counts.duplicatesRejected).toBeGreaterThanOrEqual(1);
    expect(stores.ExternalHistoricalResult.state.rows).toHaveLength(1); // the new leg is still retained once
  });

  it("3. duplicate batch: the same text pasted twice is refused with zero new records", async () => {
    await run(TICKET);
    const writesBefore = totalWrites();
    const again = await run(TICKET);
    expect(again.duplicate).toBe(true);
    expect(again.batch).toBeTruthy();
    expect(totalWrites()).toBe(writesBefore); // nothing written by the refusal
    expect(stores.SportyBetTicket.state.rows).toHaveLength(1);
    expect(stores.ResultImportBatch.state.rows).toHaveLength(1);
  });

  it("4. duplicate leg: a re-pasted leg is refused, never double-counted", async () => {
    await run(TICKET_DUP);
    expect(stores.ExternalHistoricalResult.state.rows).toHaveLength(1);
    const again = await run(TICKET_DUP2);
    expect(again.duplicate).toBe(false);
    expect(again.state).toBe("COMPLETED");
    expect(stores.ExternalHistoricalResult.state.rows).toHaveLength(1); // still exactly one leg record
    expect(again.detail.some((d) => /ALREADY IMPORTED/.test(d.outcome))).toBe(true);
  });
});

describe("SportyBet import safety — read failure pauses with ZERO writes", () => {
  const failEntity = (name, impl) => {
    stores[name].entity.filter.mockImplementation(impl);
  };

  it("5. 429 during the ticket dedup read pauses with the duplicate-check message", async () => {
    failEntity("SportyBetTicket", () => Promise.reject(err429()));
    const res = await run(TICKET);
    expect(res.paused).toBe(true);
    expect(res.customerMessage).toContain("DUPLICATE CHECK COULD NOT BE VERIFIED");
    expect(res.customerMessage).toContain("No records were changed");
    expect(totalWrites()).toBe(0);
  });

  it("6. 429 during the leg dedup read pauses and writes nothing", async () => {
    failEntity("ExternalHistoricalResult", () => Promise.reject(err429()));
    const res = await run(TICKET);
    expect(res.paused).toBe(true);
    expect(res.customerMessage).toContain("DUPLICATE CHECK COULD NOT BE VERIFIED");
    expect(totalWrites()).toBe(0);
  });

  it("7. 429 during the Global Ledger read pauses and writes nothing", async () => {
    failEntity("GlobalPredictionLedger", () => Promise.reject(err429()));
    const res = await run(TICKET);
    expect(res.paused).toBe(true);
    expect(res.state).toBe("THROTTLED");
    expect(res.customerMessage).toContain("Import temporarily paused");
    expect(totalWrites()).toBe(0);
  });

  it("8. timeout during matching pauses and writes nothing", async () => {
    failEntity("GlobalPredictionLedger", () => Promise.reject(errTimeout()));
    const res = await run(TICKET);
    expect(res.paused).toBe(true);
    expect(res.state).toBe("BLOCKED");
    expect(totalWrites()).toBe(0);
  });

  it("9. malformed read response pauses instead of treating it as an empty pool", async () => {
    failEntity("GlobalPredictionLedger", async () => null);
    const res = await run(TICKET);
    expect(res.paused).toBe(true);
    expect(res.state).toBe("BLOCKED");
    expect(totalWrites()).toBe(0);
  });

  it("10. retry after throttle recovery completes the import and surfaces RETRYING", async () => {
    const filter = stores.GlobalPredictionLedger.entity.filter;
    filter.mockImplementationOnce(() => Promise.reject(err429())); // first attempt fails…
    const states = [];
    const res = await run(TICKET, { onProgress: (s) => states.push(s) });
    expect(res.paused).toBeFalsy();
    expect(res.state).toBe("COMPLETED");
    expect(states).toContain("RETRYING");
    expect(stores.SportyBetTicket.state.rows).toHaveLength(1);
  });

  it("11. a paused import retries cleanly once reads recover", async () => {
    failEntity("GlobalPredictionLedger", () => Promise.reject(err429()));
    const pausedRes = await run(TICKET, { retry: { retries: 0 } });
    expect(pausedRes.paused).toBe(true);
    expect(totalWrites()).toBe(0);
    resetStores(); // healthy reads again
    const res = await run(TICKET);
    expect(res.state).toBe("COMPLETED");
    expect(stores.SportyBetTicket.state.rows).toHaveLength(1);
    expect(stores.ResultImportBatch.state.rows).toHaveLength(1);
  });

  it("12. the same ticket pasted again after a successful import is ALREADY IMPORTED", async () => {
    await run(TICKET);
    const res = await run(TICKET);
    expect(res.duplicate).toBe(true);
    expect(stores.ResultImportBatch.state.rows).toHaveLength(1);
    expect(stores.SportyBetTicket.state.rows).toHaveLength(1);
    expect(stores.GlobalOutcomeLedger.state.rows).toHaveLength(1);
  });

  it("13. concurrent duplicate import attempts — exactly one import runs", async () => {
    const [a, b] = await Promise.all([run(TICKET), run(TICKET)]);
    const paused = [a, b].filter((r) => r.paused && r.concurrent);
    const done = [a, b].filter((r) => r.state === "COMPLETED");
    expect(paused).toHaveLength(1);
    expect(done).toHaveLength(1);
    expect(stores.ResultImportBatch.state.rows).toHaveLength(1);
    expect(stores.SportyBetTicket.state.rows).toHaveLength(1);
  });

  it("14. INVARIANT: no failure mode ever allows a write when a prerequisite read failed", async () => {
    const modes = [
      ["429 ticket dedup", () => failEntity("SportyBetTicket", () => Promise.reject(err429()))],
      ["429 leg dedup", () => failEntity("ExternalHistoricalResult", () => Promise.reject(err429()))],
      ["429 ledger", () => failEntity("GlobalPredictionLedger", () => Promise.reject(err429()))],
      ["timeout", () => failEntity("GlobalPredictionLedger", () => Promise.reject(errTimeout()))],
      ["malformed", () => failEntity("GlobalPredictionLedger", async () => null)],
    ];
    for (const [name, apply] of modes) {
      resetStores();
      apply();
      const res = await run(TICKET, { retry: { retries: 0 } });
      expect(res.paused, `${name} must pause the import`).toBe(true);
      expect(totalWrites(), `${name} must produce zero writes`).toBe(0);
    }
  });
});