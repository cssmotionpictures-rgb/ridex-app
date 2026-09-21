import { describe, it, expect } from "vitest";
import {
  CONFLICT_CLASSIFICATION,
  ATHLETICS_SERIES_FIXTURES,
  FIXTURE_MISMATCH_STATEMENT,
  sameFixtureIdentity,
  classifyFixtureDispute,
  mapResultToKnownFixture,
  knownSeriesScoreNote,
  snapshotOfReconciliation,
  revalidateReconciliationState,
  planFixtureReconciliation,
  verifyReconciliationState,
} from "@/lib/globalLearning/fixtureIdentity";
import {
  RECONCILIATION_ID,
  readReconciliationSnapshot,
  executeFixtureReconciliation,
} from "@/lib/globalLearning/fixtureReconciliation";
import { classifySettledReimport } from "@/lib/globalLearning/conflictResolutionCore";
import { matchParsedRow } from "@/lib/globalLearning/matcher";

// FIXTURE ID RECONCILIATION — REGRESSION TESTS (TASK 47126). All mutation
// tests run against a SYNTHETIC REPLICA of the real two-fixture collision
// through a fake client that records every write. THE REAL LEDGER IS NEVER
// TOUCHED BY THESE TESTS.

const G851 = "monster|monster-v1|espn-401816851|1|v1";
const G866 = "monster|monster-v1|espn-401816866|1|v1";
const [FX851, FX866] = ATHLETICS_SERIES_FIXTURES;

const mkPred = (id, over = {}) => ({
  id,
  global_prediction_id: G866,
  fixture_id: FX866.fixtureId,
  home: "Athletics",
  away: "Toronto Blue Jays",
  market_key: "1",
  status: "open",
  verification: "",
  actual_home: null,
  actual_away: null,
  result_source: "",
  settled_at: "",
  kickoff: FX866.kickoff,
  created_date: "2026-09-09T21:35:00Z",
  ...over,
});

// Synthetic replica of the real collision:
//   851: 1 row correctly settled 6–5 (verified)
//   866: 2 rows correctly settled 2–0, 1 row MIS-SETTLED 6–5 (user import),
//        1 open duplicate copy; 1 correct + 1 mis-settled outcome row.
function replica() {
  const preds = [
    mkPred("a1", { global_prediction_id: G851, fixture_id: FX851.fixtureId, kickoff: FX851.kickoff, status: "won", verification: "verified_provider", actual_home: 6, actual_away: 5, result_source: "ESPN verified feed (espn-proxy)", settled_at: "2026-09-09T11:05:46Z" }),
    mkPred("p_ok1", { status: "won", verification: "verified_provider", actual_home: 2, actual_away: 0, result_source: "ESPN verified feed (espn-proxy · MLB)", settled_at: "2026-09-10T00:32:19Z" }),
    mkPred("p_ok2", { status: "won", verification: "verified_provider", actual_home: 2, actual_away: 0, result_source: "ESPN verified feed (espn-proxy · MLB)", settled_at: "2026-09-10T00:32:19Z" }),
    mkPred("p_bad", { status: "won", verification: "user_supplied", actual_home: 6, actual_away: 5, result_source: "user result import", settled_at: "2026-09-09T21:36:00Z" }),
    mkPred("p_open", { status: "open" }),
  ];
  const outcomes = [
    { id: "o_ok", global_prediction_id: G866, settlement: "won", final_home: 2, final_away: 0, verification_source: "verified_provider", result_source: "ESPN verified feed", settled_at: "2026-09-10T00:32:19Z", created_date: "2026-09-10T00:32:19Z" },
    { id: "o_bad", global_prediction_id: G866, settlement: "won", final_home: 6, final_away: 5, verification_source: "user_supplied", result_source: "user result import", settled_at: "2026-09-09T21:36:00Z", created_date: "2026-09-09T21:36:00Z" },
  ];
  return { preds, outcomes };
}

function makeClient({ preds, outcomes, failReads = false }) {
  const writes = { updates: [], deletes: [], audits: [], records: [] };
  const records = [];
  const wrapRead = async (rows) => {
    if (failReads) throw new Error("read throttled (429)");
    return rows.map((r) => ({ ...r }));
  };
  const client = {
    entities: {
      GlobalPredictionLedger: {
        filter: (q) => wrapRead(preds.filter((r) => !q?.fixture_id || r.fixture_id === q.fixture_id)),
        update: async (id, patch) => {
          writes.updates.push({ id, patch });
          Object.assign(preds.find((r) => r.id === id), patch);
        },
        deleteMany: async () => ({ success: true }),
      },
      GlobalOutcomeLedger: {
        filter: (q) => wrapRead(outcomes.filter((o) => !q?.global_prediction_id || o.global_prediction_id === q.global_prediction_id)),
        update: async (id, patch) => {
          writes.updates.push({ id, patch });
          Object.assign(outcomes.find((o) => o.id === id), patch);
        },
        deleteMany: async () => ({ success: true }),
      },
      FixtureReconciliationRecord: {
        filter: () => wrapRead(records),
        create: async (r) => {
          const rec = { ...r, id: `rec-${records.length + 1}` };
          records.push(rec);
          writes.records.push(rec);
          return rec;
        },
        update: async (id, patch) => {
          const rec = records.find((r) => r.id === id);
          if (rec) Object.assign(rec, patch);
        },
      },
    },
  };
  return { client, writes, records };
}

describe("TEST 1 — same teams + different dates + different provider IDs → TWO FIXTURES", () => {
  it("classifies the collision as FIXTURE_ID_MISMATCH and never merges the games", () => {
    expect(classifyFixtureDispute({ fixtureA: { ...FX851 }, fixtureB: { ...FX866 } })).toBe(CONFLICT_CLASSIFICATION.FIXTURE_ID_MISMATCH);
    // teams alone are NEVER sufficient identity
    expect(sameFixtureIdentity(
      { home: "Athletics", away: "Toronto Blue Jays" },
      { home: "Athletics", away: "Toronto Blue Jays" }
    )).toBe(false);
    // provider event ID has the highest priority
    expect(sameFixtureIdentity(
      { providerEventId: "espn-401816866", sport: "baseball", home: "A", away: "B", kickoff: "2026-09-09T01:40Z" },
      { providerEventId: "espn-401816866", sport: "baseball", home: "A", away: "B", kickoff: "2026-09-09T01:40Z" }
    )).toBe(true);
    // a pasted result with NO date that matches BOTH same-team fixtures is ambiguous → review
    const m = matchParsedRow(
      { resolved: true, home: "Athletics", away: "Toronto Blue Jays", score: [6, 5], date: "" },
      replica().preds
    );
    expect(m.status).toBe("POSSIBLE_MATCH");
    expect(m.fixtures.length).toBe(2);
    // with the date present the matcher pins exactly one fixture
    const dated = matchParsedRow(
      { resolved: true, home: "Athletics", away: "Toronto Blue Jays", score: [6, 5], date: FX851.kickoff.slice(0, 10) },
      replica().preds
    );
    expect(dated.status).toBe("EXACT_MATCH");
    expect(dated.rows.every((r) => r.fixture_id === FX851.fixtureId)).toBe(true);
  });
});

describe("TEST 2 — Sep 7 + 6–5 → espn-401816851", () => {
  it("maps the result to the 7 September fixture by score and date", () => {
    const f = mapResultToKnownFixture({ score: [6, 5], date: "2026-09-07" });
    expect(f?.fixtureId).toBe("espn-401816851");
    expect(f?.score).toEqual([6, 5]);
  });
});

describe("TEST 3 — Sep 9 + 2–0 → espn-401816866", () => {
  it("maps the result to the 9 September fixture by score and date", () => {
    const f = mapResultToKnownFixture({ score: [2, 0], date: "2026-09-09" });
    expect(f?.fixtureId).toBe("espn-401816866");
    expect(f?.score).toEqual([2, 0]);
  });
});

describe("TEST 4 — same fixture ID + conflicting score → genuine RESULT_CONFLICT", () => {
  it("keeps the genuine same-fixture dispute classification", () => {
    const c = classifyFixtureDispute({
      fixtureA: { providerEventId: "espn-401816866", gameDate: "2026-09-09" },
      fixtureB: { providerEventId: "espn-401816866", gameDate: "2026-09-09" },
    });
    expect(c).toBe(CONFLICT_CLASSIFICATION.RESULT_CONFLICT);
  });
});

describe("TEST 5 — different fixture ID + different score → NOT a result conflict", () => {
  it("treats different verified games as separate fixtures, never a score dispute", () => {
    const c = classifyFixtureDispute({
      fixtureA: { providerEventId: FX851.providerEventId, gameDate: FX851.gameDate, score: [6, 5] },
      fixtureB: { providerEventId: FX866.providerEventId, gameDate: FX866.gameDate, score: [2, 0] },
    });
    expect(c).toBe(CONFLICT_CLASSIFICATION.FIXTURE_ID_MISMATCH);
  });
});

describe("TEST 6 — re-import Sep 7 6–5 → ALREADY RESOLVED for espn-401816851", () => {
  it("recognizes the settled 6–5 result under its own fixture", () => {
    const rows851 = [{ status: "won", actual_home: 6, actual_away: 5 }];
    const r = classifySettledReimport(rows851, [6, 5]);
    expect(r.review).toBe(false);
    expect(r.outcome).toBe("ALREADY RESOLVED");
  });
});

describe("TEST 7 — re-import Sep 9 2–0 → ALREADY RESOLVED for espn-401816866", () => {
  it("recognizes the settled 2–0 result under its own fixture", () => {
    const rows866 = [{ status: "won", actual_home: 2, actual_away: 0 }];
    const r = classifySettledReimport(rows866, [2, 0]);
    expect(r.review).toBe(false);
    expect(r.outcome).toBe("ALREADY RESOLVED");
  });
});

describe("TEST 8 — wrong score attached to the correct provider fixture ID → REVIEW", () => {
  it("flags 6–5 claimed against espn-401816866 as a FIXTURE_ID_CONFLICT back to review", () => {
    const rows866 = [{ status: "won", actual_home: 2, actual_away: 0 }];
    const clash = classifySettledReimport(rows866, [6, 5]);
    expect(clash.review).toBe(true);
    expect(clash.outcome).toBe("CONFLICT");
    const note = knownSeriesScoreNote({ home: "Athletics", away: "Toronto Blue Jays", score: [6, 5] });
    expect(note).toContain("FIXTURE_ID_CONFLICT");
    expect(note).toContain("espn-401816851");
    // and 2–0 claimed against espn-401816851 is likewise refused
    const rows851 = [{ status: "won", actual_home: 6, actual_away: 5 }];
    const clash2 = classifySettledReimport(rows851, [2, 0]);
    expect(clash2.review).toBe(true);
    const note2 = knownSeriesScoreNote({ home: "Toronto Blue Jays", away: "Athletics", score: [2, 0] });
    expect(note2).toContain("FIXTURE_ID_CONFLICT");
    expect(note2).toContain("espn-401816866");
  });
});

describe("reconciliation plan — only provably mis-associated rows are corrected", () => {
  it("plans exactly the two mis-settled rows and never touches correct/open/851 rows", () => {
    const { preds, outcomes } = replica();
    const snap = snapshotOfReconciliation(ATHLETICS_SERIES_FIXTURES, preds, outcomes);
    const plan = planFixtureReconciliation({ snapshot: snap });
    expect(plan.error).toBeUndefined();
    expect(plan.corrections).toHaveLength(2);
    const ids = plan.corrections.map((c) => c.rowId).sort();
    expect(ids).toEqual(["o_bad", "p_bad"]);
    // engine grades both corrections (market "1": 2–0 home win → won), never manual
    expect(plan.corrections.filter((c) => c.entity === "GlobalPredictionLedger").every((c) => c.patch.status === "won")).toBe(true);
    expect(plan.corrections.every((c) => c.patch.verification === "verified_provider" || c.patch.verification_source === "verified_provider")).toBe(true);
  });
  it("aborts on an unexplained score — never auto-corrected", () => {
    const { preds, outcomes } = replica();
    preds.push(mkPred("p_weird", { status: "won", verification: "user_supplied", actual_home: 9, actual_away: 9, result_source: "user result import", settled_at: "2026-09-09T21:36:00Z" }));
    const snap = snapshotOfReconciliation(ATHLETICS_SERIES_FIXTURES, preds, outcomes);
    const plan = planFixtureReconciliation({ snapshot: snap });
    expect(plan.error).toMatch(/unexplained score/);
  });
});

describe("TEST 9 — read throttle during reconciliation → ZERO writes", () => {
  it("aborts with PAUSED and performs no mutations and no audit record", async () => {
    const { preds, outcomes } = replica();
    const { client, writes, records } = makeClient({ preds, outcomes, failReads: true });
    const armed = snapshotOfReconciliation(ATHLETICS_SERIES_FIXTURES, replica().preds, replica().outcomes);
    const res = await executeFixtureReconciliation({ armedSnapshot: armed, performedBy: "admin@test", client });
    expect(res.aborted).toBe(true);
    expect(res.code).toBe("PAUSED");
    expect(res.message).toContain("COULD NOT BE VERIFIED");
    expect(writes.updates).toHaveLength(0);
    expect(writes.records).toHaveLength(0);
  });
  it("aborts when the fixture state drifted since arming — ZERO writes", async () => {
    const { preds, outcomes } = replica();
    const { client, writes, records } = makeClient({ preds, outcomes });
    const armed = await readReconciliationSnapshot(client);
    preds[1].status = "lost"; // the state changed after arming
    const res = await executeFixtureReconciliation({ armedSnapshot: armed, performedBy: "admin@test", client });
    expect(res.aborted).toBe(true);
    expect(res.code).toBe("STOPPED");
    expect(writes.updates).toHaveLength(0);
    expect(records).toHaveLength(0);
  });
});

describe("TEST 10 — repeat reconciliation → idempotent / ALREADY RECONCILED", () => {
  it("first run corrects the two mis-settled rows; second run makes ZERO writes", async () => {
    const { preds, outcomes } = replica();
    const { client, writes, records } = makeClient({ preds, outcomes });
    const armed1 = await readReconciliationSnapshot(client);
    const first = await executeFixtureReconciliation({ armedSnapshot: armed1, performedBy: "admin@test", client });
    expect(first.complete).toBe(true);
    expect(first.correctedPredictions).toBe(1);
    expect(first.correctedOutcomes).toBe(1);
    // the mis-settled row now carries its own fixture's verified 2–0 result
    const bad = preds.find((r) => r.id === "p_bad");
    expect(bad.actual_home).toBe(2);
    expect(bad.actual_away).toBe(0);
    expect(bad.verification).toBe("verified_provider");
    expect(bad.status).toBe("won"); // engine grade for market "1" at 2–0
    // the 851 evidence is preserved untouched — 6–5 stays under espn-401816851
    const a1 = preds.find((r) => r.id === "a1");
    expect(a1.fixture_id).toBe("espn-401816851");
    expect(a1.actual_home).toBe(6);
    expect(a1.actual_away).toBe(5);
    // correct + open rows untouched
    expect(preds.find((r) => r.id === "p_ok1").actual_home).toBe(2);
    expect(preds.find((r) => r.id === "p_open").status).toBe("open");
    // outcome corrected too
    const ob = outcomes.find((o) => o.id === "o_bad");
    expect(ob.final_home).toBe(2);
    expect(ob.settlement).toBe("won");
    // audit record confirmed with the immutable statement + original association
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("CONFIRMED");
    expect(records[0].reason).toBe("FIXTURE_ID_MISMATCH");
    expect(records[0].statement).toBe(FIXTURE_MISMATCH_STATEMENT);
    const trail = JSON.parse(records[0].corrections_json);
    expect(trail.some((c) => c.oldFixtureAssociation.includes("espn-401816851"))).toBe(true);
    expect(first.verification.allPassed).toBe(true);

    // SECOND EXECUTION — re-armed against the current state
    const updatesAfterFirst = writes.updates.length;
    const armed2 = await readReconciliationSnapshot(client);
    const second = await executeFixtureReconciliation({ armedSnapshot: armed2, performedBy: "admin@test", client });
    expect(second.alreadyReconciled).toBe(true);
    expect(second.message).toContain("ALREADY RECONCILED");
    expect(writes.updates).toHaveLength(updatesAfterFirst); // zero new mutations
    expect(records).toHaveLength(1); // one audit record, never two
  });
});

describe("post-reconciliation verification — the pure checks", () => {
  it("fails when any settled row still carries a foreign score", () => {
    const { preds, outcomes } = replica();
    const snap = snapshotOfReconciliation(ATHLETICS_SERIES_FIXTURES, preds, outcomes);
    const plan = planFixtureReconciliation({ snapshot: snap });
    const record = { corrections_json: JSON.stringify(plan.corrections) };
    const v = verifyReconciliationState({ afterPreds: preds, afterOutcomes: outcomes, plan, record });
    expect(v.allPassed).toBe(false); // p_bad/o_bad still carry 6–5 under 866
    // apply the corrections, then the same verification passes
    for (const c of plan.corrections) {
      const rows = c.entity === "GlobalPredictionLedger" ? preds : outcomes;
      Object.assign(rows.find((r) => r.id === c.rowId), c.patch);
    }
    const v2 = verifyReconciliationState({ afterPreds: preds, afterOutcomes: outcomes, plan, record });
    expect(v2.allPassed).toBe(true);
    expect(v2.checks.some((c) => c.label.includes("both verified results remain"))).toBe(true);
  });
});

describe("the real config is exactly the verified fixture facts", () => {
  it("keeps both provider event ids, dates and verified scores", () => {
    expect(RECONCILIATION_ID).toBe("reconciliation|espn-401816851|espn-401816866");
    expect(FX851.providerEventId).toBe("espn-401816851");
    expect(FX851.gameDate).toBe("2026-09-07");
    expect(FX851.score).toEqual([6, 5]);
    expect(FX866.providerEventId).toBe("espn-401816866");
    expect(FX866.gameDate).toBe("2026-09-09");
    expect(FX866.score).toEqual([2, 0]);
    expect(FX851.kickoff).not.toBe(FX866.kickoff); // different games, different kickoffs
  });
});