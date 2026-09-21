// IDEMPOTENCY GATE SAFETY TESTS — the duplication repair contract.
// Covers the observation recorder gate, the RX-2.1 challenger gate, the
// lineup-confirmation gate, the global ingestion gate, the outcome gate,
// the throttle/pause rule (failed dedup read → ZERO writes), the cleanup
// planner's exact-duplicate-only rule, and cleanup idempotency.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const mkEntity = () => ({ rows: [], failRead: false, createdLog: [], updateLog: [] });
  const store = {
    KalaModelObservation: mkEntity(),
    GlobalPredictionLedger: mkEntity(),
    GlobalOutcomeLedger: mkEntity(),
    WinRabaSelection: mkEntity(),
    BankuPickResult: mkEntity(),
  };
  return { store };
});

vi.mock("@/api/base44Client", () => {
  const { store } = h;
  const matches = (row, q) =>
    Object.entries(q).every(([field, cond]) => {
      if (cond && typeof cond === "object" && cond.$in) return cond.$in.includes(row[field]);
      if (cond && typeof cond === "object" && cond.$gte !== undefined) return String(row[field] || "") >= cond.$gte;
      return row[field] === cond;
    });
  const api = {};
  for (const [name, e] of Object.entries(store)) {
    api[name] = {
      filter: async (q) => {
        if (e.failRead) throw new Error("429 Too Many Requests");
        return (e.rows || []).filter((r) => matches(r, q || {}));
      },
      bulkCreate: async (rows) => {
        e.createdLog.push(...rows);
        for (const r of rows) {
          e.rows.push({ created_date: new Date().toISOString(), ...r, id: r.id || `${name}-${e.rows.length + 1}-${Math.random().toString(36).slice(2, 8)}` });
        }
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

vi.mock("@/lib/ensemble/enrichment", () => ({
  injuriesByDate: vi.fn(async () => []),
  injuryIntel: () => ({ status: "unavailable", delta: 0, homeImpact: null, awayImpact: null }),
  lineupFor: vi.fn(async () => null),
}));
vi.mock("@/lib/ensemble/xg", () => ({
  fixtureXgIntel: vi.fn(async () => ({ status: "unavailable" })),
  XG_MAX_FIXTURES_PER_SCAN: 0,
  XG_KICKOFF_WINDOW_H: 48,
}));

import { recordObservations } from "@/lib/ensemble/observations";
import { recordChallengerObservations, captureLineupConfirmations } from "@/lib/ensemble/rx21";
import { challengerKey } from "@/lib/ensemble/rx21Core";
import { syncGlobalEngine } from "@/lib/globalLearning/ledger";
import { planLedgerCleanup, buildAuditRecords } from "@/lib/globalLearning/dedupeCleanup";
import { dedupeById } from "@/lib/idempotency";
import { lineupFor } from "@/lib/ensemble/enrichment";

const FUTURE = new Date(Date.now() + 2 * 86400000).toISOString();
const RECENT = FUTURE.slice(0, 10);

const boardOf = (n, over = {}) => ({
  observations: Array.from({ length: n }, (_, i) => ({
    fixtureId: over.fixtureId || `of-en.1-${RECENT}-fx${i}`,
    home: "Liverpool",
    away: "Fulham",
    league: "Premier League",
    leagueCode: "en.1",
    kickoff: FUTURE,
    lagosDateKey: RECENT,
    session: "morning",
    evidence: "Form 6+5",
    c: { marketKey: "1", marketLabel: "Liverpool Win", calibrated: 0.7, ensemble: 0.68, displayConf: 70, master: 80, qualifies: true },
  })),
});

const kalaRow = (over = {}) => ({
  id: "k1",
  observation_key: `of-en.1-${RECENT}-liverpool-fulham|1`,
  fixture_id: `of-en.1-${RECENT}-liverpool-fulham`,
  model_version: "RX-2.0",
  home: "Liverpool",
  away: "Fulham",
  league: "Premier League",
  league_code: "en.1",
  kickoff: FUTURE,
  lagos_date_key: RECENT,
  session: "morning",
  market_key: "1",
  market_label: "Liverpool Win",
  calibrated_probability: 0.72,
  ensemble_probability: 0.7,
  confidence: 72,
  kala_score: 82,
  grade: "strong",
  qualified: true,
  market_odds: 1.9,
  bookmaker: "Bet365",
  market_probability: 0.53,
  fair_odds: 1.4,
  edge_pct: 19,
  status: "open",
  recorded_at: "2026-09-10T01:00:00Z",
  ...over,
});

const bankuRow = (over = {}) => ({
  id: "b1",
  slip: "monster",
  date_key: RECENT,
  home: "Athletics",
  away: "Blue Jays",
  market_key: "1",
  market_label: "Athletics Win",
  probability: 0.8,
  fair_odds: 1.25,
  status: "win",
  actual_home: 6,
  actual_away: 5,
  result_source: "ESPN verified feed (espn-proxy)",
  settled_at: "2026-09-09T22:00:00Z",
  ...over,
});

beforeEach(() => {
  for (const e of Object.values(h.store)) {
    e.rows = [];
    e.failRead = false;
    e.createdLog = [];
    e.updateLog = [];
  }
  vi.clearAllMocks();
});

describe("gate 1 — observation recorder (RX-2.0)", () => {
  it("records the same board twice → the second run creates zero rows", async () => {
    const r1 = await recordObservations(boardOf(2));
    expect(r1.status).toBe("ok");
    expect(r1.recorded).toBe(2);
    const r2 = await recordObservations(boardOf(2));
    expect(r2.status).toBe("ok");
    expect(r2.recorded).toBe(0);
    expect(h.store.KalaModelObservation.rows.length).toBe(2);
  });

  it("pauses with ZERO writes when the duplicate-check read fails", async () => {
    h.store.KalaModelObservation.failRead = true;
    const res = await recordObservations(boardOf(2));
    expect(res.status).toBe("paused");
    expect(res.reason).toMatch(/WRITE PAUSED — DUPLICATE CHECK COULD NOT BE VERIFIED/);
    expect(h.store.KalaModelObservation.rows.length).toBe(0);
    expect(h.store.KalaModelObservation.createdLog.length).toBe(0);
  });

  it("never records after kickoff (kickoff lock preserved)", async () => {
    const board = boardOf(1);
    board.observations[0].kickoff = new Date(Date.now() - 3600000).toISOString();
    const res = await recordObservations(board);
    expect(res.recorded).toBe(0);
    expect(h.store.KalaModelObservation.rows.length).toBe(0);
  });
});

describe("gate 1 — RX-2.1 challenger recorder", () => {
  it("pauses with ZERO writes when the duplicate-check read fails", async () => {
    h.store.KalaModelObservation.failRead = true;
    const res = await recordChallengerObservations(boardOf(2), null);
    expect(res.status).toBe("paused");
    expect(h.store.KalaModelObservation.rows.length).toBe(0);
    expect(h.store.KalaModelObservation.createdLog.length).toBe(0);
  });

  it("skips candidates whose challenger identity already exists", async () => {
    const fx = `of-en.1-${RECENT}-fx0`;
    h.store.KalaModelObservation.rows.push({
      id: "existing-challenger",
      observation_key: challengerKey(fx, "1"),
      model_version: "RX-2.1",
      status: "open",
    });
    const res = await recordChallengerObservations(boardOf(1, { fixtureId: fx }), null);
    expect(res.status).toBe("ok");
    expect(res.recorded).toBe(0);
    expect(h.store.KalaModelObservation.createdLog.length).toBe(0);
  });
});

describe("gate 1 — lineup confirmation (:v2 snapshots)", () => {
  const openChallenger = () => ({
    id: "c1",
    observation_key: challengerKey(`of-en.1-${RECENT}-fx0`, "1"),
    fixture_id: `of-en.1-${RECENT}-fx0`,
    home: "Liverpool",
    away: "Fulham",
    kickoff: new Date(Date.now() + 3600000).toISOString(),
    lineup_status: "no_lineup",
    lagos_date_key: RECENT,
    market_key: "1",
    market_label: "Liverpool Win",
    model_version: "RX-2.1",
    status: "open",
  });

  it("creates a :v2 snapshot once and never twice", async () => {
    h.store.KalaModelObservation.rows.push(openChallenger());
    lineupFor.mockResolvedValue({ status: "confirmed" });
    const r1 = await captureLineupConfirmations({});
    expect(r1.rows).toBe(1);
    const r2 = await captureLineupConfirmations({});
    expect(r2.rows).toBe(0);
    expect(h.store.KalaModelObservation.createdLog.length).toBe(1);
  });

  it("pauses :v2 creation when the open-row read fails", async () => {
    h.store.KalaModelObservation.failRead = true;
    const res = await captureLineupConfirmations({});
    expect(res.status).toBe("paused");
    expect(h.store.KalaModelObservation.createdLog.length).toBe(0);
  });
});

describe("gate 2 — global ingestion", () => {
  it("ingests each prediction exactly once across repeated syncs", async () => {
    h.store.KalaModelObservation.rows.push(
      kalaRow(),
      kalaRow({ id: "k2", observation_key: `of-en.1-${RECENT}-liverpool-fulham|O2.5`, market_key: "O2.5", market_label: "Over 2.5" })
    );
    h.store.BankuPickResult.rows.push(bankuRow());
    const r1 = await syncGlobalEngine();
    expect(r1.status).toBe("ok");
    expect(r1.created).toBe(3);
    const r2 = await syncGlobalEngine();
    expect(r2.created).toBe(0);
    expect(r2.skippedExisting).toBe(3);
    expect(h.store.GlobalPredictionLedger.rows.length).toBe(3);
  });

  it("a refreshed price, confidence or display name never creates a duplicate", async () => {
    h.store.KalaModelObservation.rows.push(kalaRow());
    await syncGlobalEngine();
    Object.assign(h.store.KalaModelObservation.rows[0], {
      market_odds: 1.85, // price drift
      confidence: 75, // confidence refresh
      market_label: "Liverpool To Win", // display wording change
    });
    const r = await syncGlobalEngine();
    expect(r.created).toBe(0);
    expect(h.store.GlobalPredictionLedger.rows.length).toBe(1);
  });

  it("keeps RX-2.0 and RX-2.1 as separate records (champion/challenger)", async () => {
    h.store.KalaModelObservation.rows.push(
      kalaRow(),
      kalaRow({ id: "k21", model_version: "RX-2.1", observation_key: `of-en.1-${RECENT}-liverpool-fulham|1|RX-2.1` })
    );
    const r = await syncGlobalEngine();
    expect(r.created).toBe(2);
    expect(h.store.GlobalPredictionLedger.rows.length).toBe(2);
  });

  it("keeps separate fixture ids as separate predictions (same teams)", async () => {
    h.store.KalaModelObservation.rows.push(
      kalaRow(),
      kalaRow({
        id: "k3",
        fixture_id: `of-en.1-${RECENT}-liverpool-fulham-x`,
        observation_key: `of-en.1-${RECENT}-liverpool-fulham-x|1`,
      })
    );
    const r = await syncGlobalEngine();
    expect(r.created).toBe(2);
  });

  it("pauses ALL writes when the ledger duplicate check fails", async () => {
    h.store.KalaModelObservation.rows.push(kalaRow());
    h.store.GlobalPredictionLedger.failRead = true;
    const r = await syncGlobalEngine();
    expect(r.status).toBe("paused");
    expect(r.created).toBe(0);
    expect(r.updated).toBe(0);
    expect(h.store.GlobalPredictionLedger.rows.length).toBe(0);
  });

  it("pauses a section whose source read fails — nothing is written from an unverified pool", async () => {
    h.store.KalaModelObservation.failRead = true;
    h.store.BankuPickResult.rows.push(bankuRow());
    const r = await syncGlobalEngine();
    expect(r.pausedSections).toContain("kala");
    expect(h.store.GlobalPredictionLedger.rows.filter((x) => x.source_section === "kala").length).toBe(0);
    expect(r.created).toBe(1);
  });

  it("mirrors settlement onto the canonical row and creates the outcome exactly once", async () => {
    h.store.KalaModelObservation.rows.push(kalaRow());
    await syncGlobalEngine(); // ingested open
    Object.assign(h.store.KalaModelObservation.rows[0], {
      status: "won",
      actual_home: 2,
      actual_away: 1,
      result_source: "openfootball verified result",
      settled_at: "2026-09-12T17:00:00Z",
    });
    const r = await syncGlobalEngine();
    expect(r.updated).toBe(1);
    expect(r.outcomes).toBe(1);
    expect(h.store.GlobalPredictionLedger.rows[0].status).toBe("won");
    const r2 = await syncGlobalEngine();
    expect(r2.outcomes).toBe(0);
    expect(h.store.GlobalOutcomeLedger.rows.length).toBe(1);
  });

  it("pauses outcome writes when the outcome duplicate check fails", async () => {
    h.store.BankuPickResult.rows.push(bankuRow());
    h.store.GlobalOutcomeLedger.failRead = true;
    const r = await syncGlobalEngine();
    expect(r.outcomesPaused).toBe(true);
    expect(r.outcomes).toBe(0);
    expect(h.store.GlobalOutcomeLedger.rows.length).toBe(0);
  });
});

describe("gate 3 — presentation-layer dedup", () => {
  it("collapses repeated record ids but never distinct records with the same display text", () => {
    const a = { id: "r1", home: "A", away: "B" };
    const b = { id: "r2", home: "A", away: "B" };
    expect(dedupeById([a, a, b])).toEqual([a, b]);
  });
});

describe("cleanup planner — exact proven duplicates only", () => {
  const settledRow = (id, created, over = {}) => ({
    id,
    global_prediction_id: "monster|monster-v1|espn-1|1|v1",
    source_row_id: "src-1",
    status: "won",
    actual_home: 2,
    actual_away: 1,
    settled_at: "2026-09-09T22:00:00Z",
    created_date: created,
    ...over,
  });

  it("keeps the earliest SETTLED copy and removes exact settled duplicates", () => {
    const rows = [
      settledRow("a", "2026-09-09T10:00:00Z"),
      settledRow("b", "2026-09-09T11:00:00Z"),
      settledRow("c", "2026-09-09T12:00:00Z"),
    ];
    const plan = planLedgerCleanup(rows, { phase: "settled" });
    expect(plan.keepRowIds).toEqual(["a"]);
    expect(plan.removals.map((r) => r.id)).toEqual(["b", "c"]);
    expect(plan.removals[0].keptRowId).toBe("a");
  });

  it("removes stale unsettled copies of an already-settled identity (settlement lives on the canonical row)", () => {
    const rows = [
      settledRow("open1", "2026-09-09T09:00:00Z", { status: "open", actual_home: 0, actual_away: 0, settled_at: "" }),
      settledRow("a", "2026-09-09T10:00:00Z"),
      settledRow("b", "2026-09-09T11:00:00Z"),
    ];
    const plan = planLedgerCleanup(rows, { phase: "settled" });
    expect(plan.keepRowIds).toEqual(["a"]);
    expect(plan.removals.map((r) => r.id).sort()).toEqual(["b", "open1"]);
  });

  it("retains EVERY copy — never removes — when settled copies disagree on the graded outcome", () => {
    const rows = [
      settledRow("a", "2026-09-09T10:00:00Z"),
      settledRow("b", "2026-09-09T11:00:00Z", { status: "lost", actual_home: 1, actual_away: 2 }),
    ];
    const plan = planLedgerCleanup(rows, { phase: "settled" });
    expect(plan.removals.length).toBe(0);
    expect(plan.reviews.length).toBe(1);
    expect(plan.keepRowIds.sort()).toEqual(["a", "b"]);
  });

  it("keeps champion and challenger identities separate (RX-2.0 / RX-2.1)", () => {
    const rows = [
      settledRow("a", "2026-09-09T10:00:00Z", { global_prediction_id: "kala|RX-2.0|f1|1|v1" }),
      settledRow("b", "2026-09-09T10:00:00Z", { global_prediction_id: "kala|RX-2.1|f1|1|v1" }),
    ];
    const plan = planLedgerCleanup(rows, { phase: "settled" });
    expect(plan.removals.length).toBe(0);
    expect(plan.keepRowIds.sort()).toEqual(["a", "b"]);
  });

  it("keeps separate fixtures with the same teams", () => {
    const rows = [
      settledRow("a", "2026-09-09T10:00:00Z", { global_prediction_id: "monster|monster-v1|espn-1|1|v1" }),
      settledRow("b", "2026-09-09T10:00:00Z", { global_prediction_id: "monster|monster-v1|espn-2|1|v1" }),
    ];
    const plan = planLedgerCleanup(rows, { phase: "settled" });
    expect(plan.removals.length).toBe(0);
    expect(plan.keepRowIds.length).toBe(2);
  });

  it("open phase keeps one row per distinct source record and removes only same-source copies", () => {
    const openRow = (id, created, over = {}) => ({
      id,
      global_prediction_id: "kala|RX-2.0|f1|1|v1",
      status: "open",
      created_date: created,
      ...over,
    });
    const rows = [
      openRow("a", "2026-09-09T10:00:00Z", { source_row_id: "s1" }),
      openRow("b", "2026-09-09T11:00:00Z", { source_row_id: "s1" }),
      openRow("c", "2026-09-09T12:00:00Z", { source_row_id: "s2" }),
    ];
    const plan = planLedgerCleanup(rows, { phase: "open" });
    expect(plan.keepRowIds.sort()).toEqual(["a", "c"]);
    expect(plan.removals.map((r) => r.id)).toEqual(["b"]);
  });

  it("open phase flags unattributed copies for review instead of removing them", () => {
    const rows = [
      { id: "a", global_prediction_id: "kala|RX-2.0|f1|1|v1", status: "open", source_row_id: "", created_date: "2026-09-09T10:00:00Z" },
      { id: "b", global_prediction_id: "kala|RX-2.0|f1|1|v1", status: "open", source_row_id: "", created_date: "2026-09-09T11:00:00Z" },
    ];
    const plan = planLedgerCleanup(rows, { phase: "open" });
    expect(plan.removals.length).toBe(0);
    expect(plan.reviews.length).toBe(1);
  });

  it("outcome phase removes exact duplicate outcomes and reviews conflicting ones", () => {
    const oc = (id, created, over = {}) => ({
      id,
      global_prediction_id: "monster|monster-v1|espn-1|1|v1",
      settlement: "won",
      actual_result: "won",
      final_home: 2,
      final_away: 1,
      settled_at: "2026-09-09T22:00:00Z",
      created_date: created,
      ...over,
    });
    const exact = planLedgerCleanup(
      [oc("a", "2026-09-09T10:00:00Z"), oc("b", "2026-09-09T11:00:00Z"), oc("c", "2026-09-09T12:00:00Z")],
      { phase: "outcome" }
    );
    expect(exact.removals.map((r) => r.id)).toEqual(["b", "c"]);
    expect(exact.keepRowIds).toEqual(["a"]);
    const conflict = planLedgerCleanup(
      [oc("a", "2026-09-09T10:00:00Z"), oc("b", "2026-09-09T11:00:00Z", { settlement: "won", actual_result: "won", final_home: 2, final_away: 0, settled_at: "2026-09-10T00:32:19Z" })],
      { phase: "outcome" }
    );
    expect(conflict.removals.length).toBe(0);
    expect(conflict.reviews.length).toBe(1);
  });

  it("never touches rows without a stable identity", () => {
    const rows = [{ id: "x", status: "won", created_date: "2026-09-09T10:00:00Z" }];
    const plan = planLedgerCleanup(rows, { phase: "settled" });
    expect(plan.rowsWithoutStableIdentity).toEqual(["x"]);
    expect(plan.removals.length).toBe(0);
  });

  it("is idempotent — running the plan on a cleaned ledger produces zero changes", () => {
    const rows = [settledRow("a", "2026-09-09T10:00:00Z"), settledRow("b", "2026-09-09T11:00:00Z")];
    const p1 = planLedgerCleanup(rows, { phase: "settled" });
    const remaining = rows.filter((r) => !p1.removals.some((x) => x.id === r.id));
    const p2 = planLedgerCleanup(remaining, { phase: "settled" });
    expect(p2.removals.length).toBe(0);
    expect(p2.keepRowIds).toEqual(["a"]);
  });

  it("produces a complete audit trail with one record per identity action", () => {
    const rows = [settledRow("a", "2026-09-09T10:00:00Z"), settledRow("b", "2026-09-09T11:00:00Z")];
    const plan = planLedgerCleanup(rows, { phase: "settled" });
    const audit = buildAuditRecords(plan, { runId: "run-1", phase: "settled", operator: "test" });
    expect(audit).toEqual([
      expect.objectContaining({
        run_id: "run-1",
        phase: "settled",
        stable_identity: "monster|monster-v1|espn-1|1|v1",
        action: "exact_duplicate_removed",
        kept_row_id: "a",
        removed_row_ids: "b",
        removed_count: 1,
      }),
    ]);
  });
});