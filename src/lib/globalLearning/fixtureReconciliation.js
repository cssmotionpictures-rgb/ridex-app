import { base44 } from "@/api/base44Client";
import {
  ATHLETICS_SERIES_FIXTURES,
  FIXTURE_MISMATCH_STATEMENT,
  snapshotOfReconciliation,
  revalidateReconciliationState,
  planFixtureReconciliation,
  verifyReconciliationState,
} from "./fixtureIdentity";

// FIXTURE ID RECONCILIATION — TASK 47126. The Athletics dispute is a
// FIXTURE-ID COLLISION, not a score dispute: 6–5 (7 Sept, espn-401816851) and
// 2–0 (9 Sept, espn-401816866) are BOTH CORRECT results of DIFFERENT games.
// The chain mirrors the Task-63842 safety architecture exactly:
// READ → REVALIDATE → IMMUTABLE RECONCILIATION AUDIT → CORRECT ASSOCIATIONS →
// REGRADE (settlement engine) → CONFIRM → VERIFY. Any read failure or state
// drift aborts with ZERO writes; any correction failure stops the chain and
// marks the record FAILED so a retry resumes idempotently. Learning is
// protected by design: this is a data-quality correction — no insight, no
// weight change, no calibration touch; the learning engine simply receives
// the correctly associated outcomes afterwards.
export const RECONCILIATION_ID = "reconciliation|espn-401816851|espn-401816866";

// STRICT SNAPSHOT READ — reads BOTH colliding fixtures' prediction rows and
// every linked outcome row. Any failure throws (the caller aborts; a
// throttled read is NEVER treated as "no rows").
export async function readReconciliationSnapshot(client, fixtures = ATHLETICS_SERIES_FIXTURES) {
  const preds = [];
  for (const f of fixtures) {
    const rows = await client.entities.GlobalPredictionLedger.filter({ fixture_id: f.fixtureId }, "created_date", 1000);
    if (!Array.isArray(rows)) throw new Error(`malformed prediction read for ${f.fixtureId}`);
    preds.push(...rows);
  }
  const gids = [...new Set(preds.map((r) => r.global_prediction_id).filter(Boolean))];
  const outcomes = [];
  for (const g of gids) {
    const rows = await client.entities.GlobalOutcomeLedger.filter({ global_prediction_id: g }, "created_date", 100);
    if (!Array.isArray(rows)) throw new Error("malformed outcome read");
    outcomes.push(...rows);
  }
  return snapshotOfReconciliation(fixtures, preds, outcomes);
}

// EXECUTE the admin-confirmed reconciliation. Everything that can go wrong
// BEFORE the first mutation aborts with zero writes; after the first mutation
// a failure stops the chain and marks the record FAILED (a retry re-plans
// from the CURRENT state — already-corrected rows need no correction, so the
// retry is naturally idempotent and never duplicates the audit record).
export async function executeFixtureReconciliation({
  armedSnapshot,
  performedBy = "admin",
  client = base44,
  fixtures = ATHLETICS_SERIES_FIXTURES,
}) {
  // 1 — RE-READ the current state of both fixtures (strict; zero writes on failure)
  let current;
  try {
    current = await readReconciliationSnapshot(client, fixtures);
  } catch {
    return { aborted: true, code: "PAUSED", message: "RECONCILIATION PAUSED — CURRENT FIXTURE STATE COULD NOT BE VERIFIED." };
  }

  // 2 — REVALIDATE against the armed state
  const val = revalidateReconciliationState(armedSnapshot, current);
  if (!val.ok) {
    return {
      aborted: true,
      code: "STOPPED",
      message: "RECONCILIATION STOPPED — THE FIXTURE STATE CHANGED. REFRESH AND REVIEW AGAIN.",
      detail: val.reason,
    };
  }

  // 3 — IDEMPOTENCY: one reconciliation record per fixture pair, forever
  let record = null;
  try {
    const recs = await client.entities.FixtureReconciliationRecord.filter({ reconciliation_id: RECONCILIATION_ID }, "created_date", 5);
    record = (Array.isArray(recs) ? recs : []).find((r) => r.reconciliation_id === RECONCILIATION_ID) || null;
  } catch {
    return { aborted: true, code: "PAUSED", message: "RECONCILIATION PAUSED — CURRENT FIXTURE STATE COULD NOT BE VERIFIED." };
  }
  if (record?.status === "CONFIRMED") {
    return {
      alreadyReconciled: true,
      message: "ALREADY RECONCILED — this fixture pair already carries a confirmed reconciliation. ZERO writes were made.",
      record,
    };
  }

  // 4 — PLAN (pure; the settlement engine decides every grade, never manual)
  const plan = planFixtureReconciliation({ snapshot: current, fixtures });
  if (plan.error) {
    return { aborted: true, code: "STOPPED", message: `RECONCILIATION STOPPED — ${plan.error} Nothing was changed.` };
  }

  const now = new Date().toISOString();
  const predCorrections = plan.corrections.filter((c) => c.entity === "GlobalPredictionLedger");
  const outcomeCorrections = plan.corrections.filter((c) => c.entity === "GlobalOutcomeLedger");
  const conflictGroupId = predCorrections[0]?.gid || outcomeCorrections[0]?.gid || "";

  const baseFields = {
    reconciliation_id: RECONCILIATION_ID,
    original_conflict_group_id: conflictGroupId,
    reason: "FIXTURE_ID_MISMATCH",
    statement: FIXTURE_MISMATCH_STATEMENT,
    old_fixture_association: plan.corrections.map((c) => c.oldFixtureAssociation).join(" | ") || "no incorrect association remained",
    new_fixture_association: plan.corrections.map((c) => c.newFixtureAssociation).join(" | ") || "all rows already carry their own fixture's verified result",
    corrections_json: JSON.stringify(plan.corrections),
    affected_prediction_ids: predCorrections.map((c) => c.rowId).join(","),
    affected_outcome_ids: outcomeCorrections.map((c) => c.rowId).join(","),
    evidence_sources: fixtures.map((f) => f.evidence).join(" · "),
    verified_scores_json: JSON.stringify(
      fixtures.map((f) => ({ fixtureId: f.fixtureId, gameDate: f.gameDate, kickoff: f.kickoff, score: f.score, evidence: f.evidence }))
    ),
    provider_event_ids: fixtures.map((f) => f.providerEventId).join(", "),
  };

  // 5 — IMMUTABLE RECONCILIATION AUDIT FIRST (before ANY ledger mutation)
  try {
    if (!record) {
      record = await client.entities.FixtureReconciliationRecord.create({
        ...baseFields,
        performed_by: performedBy,
        status: "PENDING",
        resolution_version: 1,
      });
    } else {
      await client.entities.FixtureReconciliationRecord.update(record.id, {
        ...baseFields,
        performed_by: performedBy,
        status: "PENDING",
      });
    }
  } catch {
    return {
      aborted: true,
      code: "PAUSED",
      message: "RECONCILIATION PAUSED — THE RECONCILIATION AUDIT RECORD COULD NOT BE CREATED. No ledger row was touched.",
    };
  }

  const fail = async (step, e) => {
    try {
      await client.entities.FixtureReconciliationRecord.update(record.id, {
        status: "FAILED",
        execution_note: `failed at ${step}: ${String(e?.message || e)}`,
      });
    } catch { /* best-effort status mark — the audit-first record itself is the trail */ }
    return {
      failed: true,
      step,
      error: String(e?.message || e),
      message: "RECONCILIATION FAILED — NO PARTIAL RECONCILIATION WAS ACCEPTED. The audit-first record makes a retry safe and idempotent.",
    };
  };

  // 6 — APPLY THE CORRECTIONS (each regrade is engine-calculated by the plan)
  try {
    for (const c of predCorrections) {
      await client.entities.GlobalPredictionLedger.update(c.rowId, {
        ...c.patch,
        result_source: `fixture identity reconciliation — the recorded score belonged to ${c.foreignFixtureId}; result corrected to this fixture's verified score (${c.newFixtureAssociation}) · original association preserved in reconciliation record ${RECONCILIATION_ID}`,
        settled_at: now,
      });
    }
    for (const c of outcomeCorrections) {
      await client.entities.GlobalOutcomeLedger.update(c.rowId, {
        ...c.patch,
        result_source: `fixture identity reconciliation — result corrected to this fixture's verified score · original association preserved in reconciliation record ${RECONCILIATION_ID}`,
        settled_at: now,
      });
    }
  } catch (e) {
    return fail("association correction", e);
  }

  // 7 — CONFIRM THE RECONCILIATION RECORD
  try {
    await client.entities.FixtureReconciliationRecord.update(record.id, {
      status: "CONFIRMED",
      performed_at: now,
      performed_by: performedBy,
      execution_note: `completed: ${predCorrections.length} prediction row(s) and ${outcomeCorrections.length} outcome row(s) regraded under their own fixtures`,
    });
    record = { ...record, status: "CONFIRMED", performed_at: now };
  } catch (e) {
    return fail("reconciliation record confirmation", e);
  }

  // 8 — POST-RECONCILIATION VERIFICATION (honest: a failed re-read is reported, never guessed)
  let verification = null;
  try {
    const afterPreds = [];
    for (const f of fixtures) {
      afterPreds.push(...(await client.entities.GlobalPredictionLedger.filter({ fixture_id: f.fixtureId }, "created_date", 1000)));
    }
    const gids = [...new Set(afterPreds.map((r) => r.global_prediction_id).filter(Boolean))];
    const afterOutcomes = [];
    for (const g of gids) {
      afterOutcomes.push(...(await client.entities.GlobalOutcomeLedger.filter({ global_prediction_id: g }, "created_date", 100)));
    }
    verification = verifyReconciliationState({ afterPreds, afterOutcomes, plan, record, fixtures });
    await client.entities.FixtureReconciliationRecord.update(record.id, {
      verification_json: JSON.stringify(verification.checks),
    });
  } catch {
    verification = {
      allPassed: null,
      note: "post-reconciliation re-read failed — the reconciliation is confirmed but the final state could not be re-verified",
    };
  }

  return {
    complete: true,
    correctedPredictions: predCorrections.length,
    correctedOutcomes: outcomeCorrections.length,
    untouchedRows: plan.untouched,
    verification,
    record,
  };
}