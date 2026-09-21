// ENGINE PREDICTION RECORDING-GATE TESTS — the duplicate-prevention contract.
//   TEST A: READ_SUCCESS + missing prediction → insert exactly once
//   TEST B: READ_SUCCESS + existing prediction → no duplicate
//   TEST C: 429 read → retried via the 429-aware mechanism → no duplicate
//   TEST D: read fails repeatedly → recording stays deferred (READ_FAILED is
//           never READ_EMPTY) → zero writes
//   TEST E: two simultaneous recording calls → exactly ONE row
//   TEST F: same prediction submitted repeatedly → exactly ONE row
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const mkEntity = () => ({
    rows: [],
    createdLog: [],
    updateLog: [],
    failRemaining: 0, // 0 = reads succeed · N = fail N more times · -1 = fail forever
    failMsg: "", // "" = the platform's 429 message
  });
  return { store: { EnginePrediction: mkEntity() } };
});

vi.mock("@/api/base44Client", () => {
  const { store } = h;
  const matches = (row, q) =>
    Object.entries(q || {}).every(([field, cond]) => {
      if (cond && typeof cond === "object" && cond.$gte !== undefined)
        return String(row[field] || "") >= cond.$gte;
      return row[field] === cond;
    });
  const api = {};
  for (const [name, e] of Object.entries(store)) {
    api[name] = {
      filter: async (q) => {
        if (e.failRemaining !== 0) {
          if (e.failRemaining > 0) e.failRemaining--;
          throw new Error(e.failMsg || "429: App entity read traffic volume limit exceeded — retry after 1s");
        }
        return (e.rows || []).filter((r) => matches(r, q));
      },
      bulkCreate: async (rows) => {
        e.createdLog.push(...rows);
        for (const r of rows) e.rows.push({ id: `ep-${e.rows.length + 1}`, ...r });
        return rows;
      },
      bulkUpdate: async (updates) => {
        e.updateLog.push(...updates);
        for (const u of updates) {
          const row = e.rows.find((r) => r.id === u.id);
          if (row) Object.assign(row, u);
        }
        return updates;
      },
    };
  }
  return { base44: { entities: api } };
});

vi.mock("@/lib/ensemble/engine", () => ({ RX_MODEL_VERSION: "RX-2.0" }));
vi.mock("@/lib/winRabaLedger", () => ({ wrSettle: () => null }));
vi.mock("@/lib/ensemble/fixtures", () => ({ findResultByFixture: vi.fn(async () => null) }));
vi.mock("@/lib/ensemble/calibration", () => ({
  calibrators: () => ({}),
  metrics: () => ({}),
}));

import { recordEnginePicks } from "@/lib/ensemble/store";

const FUTURE = new Date(Date.now() + 2 * 86400000).toISOString();
const RECENT = FUTURE.slice(0, 10);
const FX = `of-en.1-${RECENT}-liverpool-fulham`;

const pick = (over = {}) => ({
  fixtureId: FX,
  home: "Liverpool",
  away: "Fulham",
  league: "Premier League",
  leagueCode: "en.1",
  kickoff: FUTURE,
  lagosDateKey: RECENT,
  session: "morning",
  marketKey: "1",
  marketLabel: "Liverpool Win",
  ensemble: 0.7,
  calibrated: 0.72,
  confidence: 72,
  masterScore: 82,
  ...over,
});

const boardOf = (n = 1) => ({
  days: [
    {
      dateKey: RECENT,
      all: Array.from({ length: n }, (_, i) => pick({ fixtureId: `${FX}-${i}`, marketKey: "1" })),
    },
  ],
  bigHammer: [],
});

const seededRow = (over = {}) => ({
  id: "ep-seed",
  fixture_id: FX,
  market_key: "1",
  prediction_key: `${FX}|1`,
  prediction_version: 1,
  status: "open",
  kickoff: FUTURE,
  lagos_date_key: RECENT,
  calibrated_probability: 0.72,
  recorded_at: "2026-09-12T08:00:00Z",
  ...over,
});

beforeEach(() => {
  const e = h.store.EnginePrediction;
  e.rows = [];
  e.createdLog = [];
  e.updateLog = [];
  e.failRemaining = 0;
  e.failMsg = "";
});

describe("TEST A — READ_SUCCESS + confirmed absence inserts exactly once", () => {
  it("inserts a missing prediction once and reports it", async () => {
    const r = await recordEnginePicks(boardOf(1));
    expect(r.status).toBe("ok");
    expect(r.recorded).toBe(1);
    expect(h.store.EnginePrediction.rows.length).toBe(1);
  });
});

describe("TEST B — READ_SUCCESS + existing prediction creates no duplicate", () => {
  it("skips a pick whose prediction_key already exists", async () => {
    const board = boardOf(1);
    const fx = board.days[0].all[0].fixtureId; // the pick's ACTUAL canonical fixture id
    h.store.EnginePrediction.rows.push(seededRow({ fixture_id: fx, prediction_key: `${fx}|1` }));
    const r = await recordEnginePicks(board);
    expect(r.status).toBe("ok");
    expect(r.recorded).toBe(0);
    expect(h.store.EnginePrediction.rows.length).toBe(1);
    expect(h.store.EnginePrediction.createdLog.length).toBe(0);
  });
});

describe("TEST C — 429 read → retry → no duplicate", () => {
  it("recovers through the 429-aware retries, inserts once, then stays at one row", async () => {
    h.store.EnginePrediction.failRemaining = 2; // two 429s, then the read succeeds
    const r = await recordEnginePicks(boardOf(1));
    expect(r.status).toBe("ok");
    expect(r.recorded).toBe(1);
    expect(h.store.EnginePrediction.rows.length).toBe(1);
    const r2 = await recordEnginePicks(boardOf(1));
    expect(r2.recorded).toBe(0);
    expect(h.store.EnginePrediction.rows.length).toBe(1);
  }, 15000);
});

describe("TEST D — repeated read failure keeps recording deferred, zero writes", () => {
  it("pauses with ZERO inserts when the duplicate check cannot be verified (429)", async () => {
    h.store.EnginePrediction.failRemaining = -1; // every read fails, all retries exhausted
    const r = await recordEnginePicks(boardOf(2));
    expect(r.status).toBe("paused");
    expect(r.reason).toMatch(/WRITE PAUSED — DUPLICATE CHECK COULD NOT BE VERIFIED/);
    expect(r.recorded).toBe(0);
    expect(r.superseded).toBe(0);
    expect(h.store.EnginePrediction.rows.length).toBe(0);
    expect(h.store.EnginePrediction.createdLog.length).toBe(0);
    expect(h.store.EnginePrediction.updateLog.length).toBe(0);
  }, 15000);

  it("pauses immediately for non-429 read failures too — READ_FAILED never becomes READ_EMPTY", async () => {
    h.store.EnginePrediction.failRemaining = -1;
    h.store.EnginePrediction.failMsg = "network down";
    const r = await recordEnginePicks(boardOf(1));
    expect(r.status).toBe("paused");
    expect(h.store.EnginePrediction.rows.length).toBe(0);
    expect(h.store.EnginePrediction.createdLog.length).toBe(0);
  });
});

describe("TEST E — two simultaneous recordings insert exactly ONE row", () => {
  it("serializes concurrent calls through the recording lock", async () => {
    const [r1, r2] = await Promise.all([
      recordEnginePicks(boardOf(1)),
      recordEnginePicks(boardOf(1)),
    ]);
    expect(r1.status).toBe("ok");
    expect(r2.status).toBe("ok");
    expect(r1.recorded + r2.recorded).toBe(1);
    expect(h.store.EnginePrediction.rows.length).toBe(1);
  });
});

describe("TEST F — the same prediction submitted repeatedly stays ONE row", () => {
  it("is idempotent across five repeated submissions", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await recordEnginePicks(boardOf(1));
      expect(r.status).toBe("ok");
    }
    expect(h.store.EnginePrediction.rows.length).toBe(1);
  });
});