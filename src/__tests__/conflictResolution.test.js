import { describe, it, expect } from "vitest";
import {
  snapshotOfConflict,
  revalidateConflictState,
  planConflictResolution,
  verifyResolvedState,
  classifySettledReimport,
} from "@/lib/globalLearning/conflictResolutionCore";
import {
  CONFLICT_FIXTURE,
  RESOLUTION_CHOICES,
  readConflictSnapshot,
  executeConflictResolution,
} from "@/lib/globalLearning/conflictResolution";

// CONFLICT RESOLUTION — REGRESSION TESTS (TASK 63842). All mutation tests run
// against an ISOLATED SYNTHETIC conflict fixture through a fake client that
// records every write. THE REAL ATHLETICS DISPUTE IS NEVER TOUCHED.

const SYN = {
  fixtureId: "espn-synthetic-1",
  gid: "kala|RX-2.0|espn-synthetic-1|1|v1",
  home: "Synthetics",
  away: "Rivals",
  league: "TEST",
  market: "1 — Home to Win",
};

const mkPred = (id, over = {}) => ({
  id,
  global_prediction_id: SYN.gid,
  fixture_id: SYN.fixtureId,
  market_key: "1",
  status: "open",
  verification: "",
  actual_home: null,
  actual_away: null,
  result_source: "",
  settled_at: "",
  created_date: `2026-09-09T1${id.slice(-1)}0:00:00Z`,
  ...over,
});

function makeClient({ preds, outcomes, failReads = false }) {
  const writes = { updates: [], deletes: [], audits: [], records: [] };
  const audits = [];
  const resolutionRecords = [];
  const wrapRead = async (rows) => {
    if (failReads) throw new Error("read throttled (429)");
    return rows.map((r) => ({ ...r }));
  };
  const client = {
    entities: {
      GlobalPredictionLedger: {
        filter: () => wrapRead(preds),
        update: async (id, patch) => {
          writes.updates.push({ id, patch });
          Object.assign(preds.find((r) => r.id === id), patch);
        },
        deleteMany: async (q) => {
          const ids = q?.id?.$in || [];
          ids.forEach((id) => {
            const i = preds.findIndex((r) => r.id === id);
            if (i >= 0) preds.splice(i, 1);
          });
          writes.deletes.push(...ids);
          return { success: true };
        },
      },
      GlobalOutcomeLedger: {
        filter: () => wrapRead(outcomes),
        update: async (id, patch) => {
          writes.updates.push({ id, patch });
          Object.assign(outcomes.find((r) => r.id === id), patch);
        },
        deleteMany: async (q) => {
          const ids = q?.id?.$in || [];
          ids.forEach((id) => {
            const i = outcomes.findIndex((r) => r.id === id);
            if (i >= 0) outcomes.splice(i, 1);
          });
          writes.deletes.push(...ids);
          return { success: true };
        },
      },
      LedgerCleanupAudit: {
        filter: () => wrapRead(audits),
        bulkCreate: async (recs) => {
          audits.push(...recs);
          writes.audits.push(...recs);
          return recs;
        },
      },
      ConflictResolutionRecord: {
        filter: () => wrapRead(resolutionRecords),
        create: async (r) => {
          const rec = { ...r, id: `rec-${resolutionRecords.length + 1}` };
          resolutionRecords.push(rec);
          writes.records.push(rec);
          return rec;
        },
        update: async (id, patch) => {
          const rec = resolutionRecords.find((r) => r.id === id);
          if (rec) Object.assign(rec, patch);
        },
      },
    },
  };
  return { client, writes, audits, resolutionRecords };
}

const dispute = () => ({
  preds: [
    mkPred("p1", { status: "won", verification: "verified_provider", actual_home: 2, actual_away: 0, result_source: "ESPN verified feed", settled_at: "2026-09-09T20:00:00Z" }),
    mkPred("p2", { status: "won", verification: "user_supplied", actual_home: 6, actual_away: 5, result_source: "user result import", settled_at: "2026-09-09T21:00:00Z" }),
    mkPred("p3", { status: "open" }),
  ],
  outcomes: [
    { id: "o1", global_prediction_id: SYN.gid, settlement: "won", final_home: 2, final_away: 0, created_date: "2026-09-09T20:05:00Z" },
    { id: "o2", global_prediction_id: SYN.gid, settlement: "won", final_home: 6, final_away: 5, created_date: "2026-09-09T21:05:00Z" },
  ],
});

describe("revalidation — stale state never executes", () => {
  it("identical snapshots pass and any drift fails", async () => {
    const { preds, outcomes } = dispute();
    const a = snapshotOfConflict(SYN, preds, outcomes);
    const b = snapshotOfConflict(SYN, preds, outcomes);
    expect(revalidateConflictState(a, b).ok).toBe(true);
    preds[0].status = "lost"; // the conflict changed after arming
    const c = snapshotOfConflict(SYN, preds, outcomes);
    expect(revalidateConflictState(a, c).ok).toBe(false);
    expect(revalidateConflictState(null, b).ok).toBe(false);
  });
});

describe("planConflictResolution — the settlement engine decides, never a manual status", () => {
  it("refuses to plan when the settlement engine cannot grade the market", () => {
    const snap = snapshotOfConflict(SYN, [mkPred("p1", { status: "won", verification: "verified_provider", actual_home: 2, actual_away: 0, market_key: "mystery" })], []);
    const plan = planConflictResolution({ choice: RESOLUTION_CHOICES.espn, snapshot: snap });
    expect(plan.error).toMatch(/settlement engine cannot grade/);
  });
});

describe("TEST A — CONFIRM ESPN 2–0", () => {
  it("canonical = 2–0, user evidence preserved, one resolution, engine settlement, duplicates archived, audit complete", async () => {
    const { preds, outcomes } = dispute();
    const { client, writes, resolutionRecords, audits } = makeClient({ preds, outcomes });
    const armed = await readConflictSnapshot(client, SYN);
    const res = await executeConflictResolution({ choiceKey: "espn", armedSnapshot: armed, confirmedBy: "admin@test", client, fixture: SYN });

    expect(res.complete).toBe(true);
    expect(res.status).toBe("won"); // settleCanonical("1", 2, 0) — the engine, never manual
    expect(res.home).toBe(2);
    expect(res.away).toBe(0);
    // one canonical row remains, with the confirmed score
    expect(preds).toHaveLength(1);
    expect(preds[0].id).toBe("p1");
    expect(preds[0].actual_home).toBe(2);
    expect(preds[0].actual_away).toBe(0);
    expect(preds[0].verification).toBe("verified_provider");
    expect(preds[0].status).toBe("won");
    // the user 6–5 evidence is preserved verbatim in the resolution record
    expect(resolutionRecords).toHaveLength(1);
    const rec = resolutionRecords[0];
    expect(rec.status).toBe("CONFIRMED");
    expect(rec.resolution_type).toBe("CONFIRM_PROVIDER_RESULT");
    const ev = JSON.parse(rec.source_evidence_json);
    expect(ev.some((e) => e.verification === "user_supplied" && e.home === 6 && e.away === 5 && e.label === "USER_SUPPLIED_CONFLICTING_EVIDENCE" && e.source === "user result import")).toBe(true);
    // duplicates safely archived with a complete audit trail
    expect(writes.deletes.sort()).toEqual(["o2", "p2", "p3"]);
    expect(audits).toHaveLength(3);
    expect(writes.records).toHaveLength(1); // one resolution — never two
    // post-resolution verification passes every check
    expect(res.verification.allPassed).toBe(true);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].settlement).toBe("won");
    expect(outcomes[0].final_home).toBe(2);
  });
});

describe("TEST B — CONFIRM USER 6–5 (isolated synthetic fixture)", () => {
  it("canonical = 6–5, provider 2–0 preserved, engine settlement, audit complete", async () => {
    const { preds, outcomes } = dispute();
    const { client, writes, resolutionRecords } = makeClient({ preds, outcomes });
    const armed = await readConflictSnapshot(client, SYN);
    const res = await executeConflictResolution({ choiceKey: "user", armedSnapshot: armed, confirmedBy: "admin@test", client, fixture: SYN });

    expect(res.complete).toBe(true);
    expect(res.status).toBe("won"); // settleCanonical("1", 6, 5) — home won by 1
    expect(preds).toHaveLength(1);
    expect(preds[0].id).toBe("p2");
    expect(preds[0].actual_home).toBe(6);
    expect(preds[0].actual_away).toBe(5);
    expect(preds[0].verification).toBe("user_supplied");
    // the ESPN 2–0 evidence is preserved verbatim, never erased
    const ev = JSON.parse(resolutionRecords[0].source_evidence_json);
    expect(ev.some((e) => e.verification === "verified_provider" && e.home === 2 && e.away === 0 && e.label === "PROVIDER_CONFLICTING_EVIDENCE")).toBe(true);
    expect(writes.deletes.sort()).toEqual(["o2", "p1", "p3"]);
    expect(res.verification.allPassed).toBe(true);
  });
});

describe("TEST C — VOID", () => {
  it("awards no WIN/LOSS/PUSH, preserves both evidence records, learning sees an unresolved result", async () => {
    const { preds, outcomes } = dispute();
    const { client, writes, resolutionRecords } = makeClient({ preds, outcomes });
    const armed = await readConflictSnapshot(client, SYN);
    const res = await executeConflictResolution({ choiceKey: "void", armedSnapshot: armed, confirmedBy: "admin@test", client, fixture: SYN });

    expect(res.complete).toBe(true);
    expect(res.status).toBe("void");
    expect(res.home).toBeNull();
    expect(preds).toHaveLength(1);
    expect(preds[0].status).toBe("void");
    expect(preds[0].actual_home).toBeNull();
    expect(outcomes[0].settlement).toBe("void");
    expect(outcomes[0].actual_result).toBe("void");
    // both evidence records preserved
    const ev = JSON.parse(resolutionRecords[0].source_evidence_json);
    expect(ev.some((e) => e.label === "CONFLICTING_EVIDENCE_PRESERVED" && e.home === 2 && e.away === 0)).toBe(true);
    expect(ev.some((e) => e.label === "CONFLICTING_EVIDENCE_PRESERVED" && e.home === 6 && e.away === 5)).toBe(true);
    // learning evidence intact: the outcome keeps its learning_status (pending) — no settled pattern is fed
    expect(outcomes[0].learning_status === undefined || outcomes[0].learning_status === "pending").toBe(true);
    expect(res.verification.allPassed).toBe(true);
  });
});

describe("TEST D — stale browser state", () => {
  it("arm, mutate the conflict, execute → ABORT with zero writes", async () => {
    const { preds, outcomes } = dispute();
    const { client, writes, resolutionRecords, audits } = makeClient({ preds, outcomes });
    const armed = await readConflictSnapshot(client, SYN);
    preds[0].status = "lost"; // the conflict changed after the button was armed
    const res = await executeConflictResolution({ choiceKey: "espn", armedSnapshot: armed, confirmedBy: "admin@test", client, fixture: SYN });

    expect(res.aborted).toBe(true);
    expect(res.code).toBe("STOPPED");
    expect(res.message).toContain("THE CONFLICT CHANGED");
    // ZERO writes
    expect(writes.updates).toHaveLength(0);
    expect(writes.deletes).toHaveLength(0);
    expect(writes.audits).toHaveLength(0);
    expect(resolutionRecords).toHaveLength(0);
  });
});

describe("TEST E — read throttle during execution", () => {
  it("execute with a failing read → ABORT with zero writes", async () => {
    const { preds, outcomes } = dispute();
    const { client, writes, resolutionRecords } = makeClient({ preds, outcomes, failReads: true });
    const armed = snapshotOfConflict(SYN, dispute().preds, dispute().outcomes);
    const res = await executeConflictResolution({ choiceKey: "espn", armedSnapshot: armed, confirmedBy: "admin@test", client, fixture: SYN });

    expect(res.aborted).toBe(true);
    expect(res.code).toBe("PAUSED");
    expect(res.message).toContain("COULD NOT BE VERIFIED");
    expect(writes.updates).toHaveLength(0);
    expect(writes.deletes).toHaveLength(0);
    expect(writes.audits).toHaveLength(0);
    expect(resolutionRecords).toHaveLength(0);
  });
});

describe("TEST F — double execution", () => {
  it("first succeeds, second returns ALREADY RESOLVED with no duplicate mutations", async () => {
    const { preds, outcomes } = dispute();
    const { client, writes, resolutionRecords, audits } = makeClient({ preds, outcomes });
    const armed1 = await readConflictSnapshot(client, SYN);
    const first = await executeConflictResolution({ choiceKey: "espn", armedSnapshot: armed1, confirmedBy: "admin@test", client, fixture: SYN });
    expect(first.complete).toBe(true);

    const updatesAfterFirst = writes.updates.length;
    const deletesAfterFirst = writes.deletes.length;
    const auditsAfterFirst = audits.length;

    // second press: armed against the CURRENT (post-resolution) state
    const armed2 = await readConflictSnapshot(client, SYN);
    const second = await executeConflictResolution({ choiceKey: "espn", armedSnapshot: armed2, confirmedBy: "admin@test", client, fixture: SYN });
    expect(second.alreadyResolved).toBe(true);
    expect(second.message).toContain("ALREADY RESOLVED");
    // no duplicate mutations of any kind
    expect(writes.updates).toHaveLength(updatesAfterFirst);
    expect(writes.deletes).toHaveLength(deletesAfterFirst);
    expect(audits).toHaveLength(auditsAfterFirst);
    expect(resolutionRecords).toHaveLength(1);
  });
});

describe("TEST G/H — re-import consistency after resolution", () => {
  it("the same score is ALREADY RESOLVED — zero new ledger rows", () => {
    const canon = [{ status: "won", actual_home: 2, actual_away: 0 }];
    const same = classifySettledReimport(canon, [2, 0]);
    expect(same.review).toBe(false);
    expect(same.outcome).toBe("ALREADY RESOLVED");
    // reversed orientation of the same score is still the same result
    const reversed = classifySettledReimport(canon, [0, 2], { reversed: true });
    expect(reversed.review).toBe(false);
  });
  it("a different score is a CONFLICT back to REVIEW — the canonical result is never silently replaced", () => {
    const canon = [{ status: "won", actual_home: 2, actual_away: 0 }];
    const diff = classifySettledReimport(canon, [6, 5]);
    expect(diff.review).toBe(true);
    expect(diff.outcome).toBe("CONFLICT");
    expect(diff.canonicalScore).toBe("2-0");
    // a voided canonical result has nothing to compare — already resolved
    const voided = classifySettledReimport([{ status: "void", actual_home: null, actual_away: null }], [2, 0]);
    expect(voided.review).toBe(false);
  });
});

describe("the real Athletics dispute config is never guessed", () => {
  it("keeps the real fixture identity and both evidence scores on record", () => {
    expect(CONFLICT_FIXTURE.fixtureId).toBe("espn-401816866");
    expect(CONFLICT_FIXTURE.verifiedScore).toEqual({ home: 2, away: 0 });
    expect(CONFLICT_FIXTURE.userImportedScore).toEqual({ home: 6, away: 5 });
    expect(Object.keys(RESOLUTION_CHOICES).sort()).toEqual(["espn", "user", "void"]);
    expect(RESOLUTION_CHOICES.espn.resolutionType).toBe("CONFIRM_PROVIDER_RESULT");
    expect(RESOLUTION_CHOICES.user.resolutionType).toBe("CONFIRM_USER_RESULT");
    expect(RESOLUTION_CHOICES.void.resolutionType).toBe("VOID_RESULT");
  });
});