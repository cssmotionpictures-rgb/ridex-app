import { base44 } from "@/api/base44Client";
import {
  snapshotOfConflict,
  revalidateConflictState,
  planConflictResolution,
  verifyResolvedState,
} from "./conflictResolutionCore";

// MANUAL CONFLICT RESOLUTION — the Athletics vs Toronto Blue Jays settlement
// conflict (espn-401816866). The engine NEVER guesses which evidence is
// correct: the admin confirms one option after review, and only the second
// press of a two-step confirm executes it. The execution chain is
// READ → REVALIDATE → IMMUTABLE RESOLUTION AUDIT → CANONICAL UPDATE →
// REGRADE (settlement engine) → ARCHIVE VERIFIED DUPLICATES → CONFIRM →
// VERIFY. Any revalidation drift or failed read aborts with ZERO writes; any
// mutation failure stops the chain and marks the record FAILED so a retry
// resumes idempotently (one resolution record per conflict group, forever).
export const CONFLICT_FIXTURE = {
  fixtureId: "espn-401816866",
  gid: "monster|monster-v1|espn-401816866|1|v1",
  home: "Athletics",
  away: "Toronto Blue Jays",
  league: "MLB",
  market: "1 — Athletics to Win",
  disputedDate: "9 Sept 2026",
  verifiedScore: { home: 2, away: 0 },
  userImportedScore: { home: 6, away: 5 },
  // KEY FINDING: the user-imported 6–5 score is attached to espn-401816851 —
  // the PREVIOUS day's Athletics game — not to the disputed fixture
  // espn-401816866, whose ESPN-verified result is 2–0. A fixture/result
  // association error in the import, kept in REVIEW — never auto-corrected.
  importSourceFixtureId: "espn-401816851",
  importSourceDate: "8 Sept 2026",
};

export const RESOLUTION_CHOICES = {
  espn: {
    key: "espn",
    resolutionType: "CONFIRM_PROVIDER_RESULT",
    label: "CONFIRM ESPN 2–0",
    short: "ESPN 2–0",
    home: 2,
    away: 0,
    verification: "verified_provider",
    source: "ESPN verified feed (espn-proxy · MLB)",
    confirmLine: "Athletics 2–0 Toronto Blue Jays",
    note: "Recommended — the verified-provider result for THIS fixture (9 Sept 2026). The 6–5 score on record matches the previous day's Athletics game (espn-401816851, 8 Sept 2026).",
  },
  user: {
    key: "user",
    resolutionType: "CONFIRM_USER_RESULT",
    label: "CONFIRM USER 6–5",
    short: "USER 6–5",
    home: 6,
    away: 5,
    verification: "user_supplied",
    source: "user result import",
    confirmLine: "Athletics 6–5 Toronto Blue Jays",
    note: "Overrides the verified-provider result — only if the admin confirms the import was correct for THIS fixture.",
  },
  void: {
    key: "void",
    resolutionType: "VOID_RESULT",
    label: "VOID DISPUTE",
    short: "VOID",
    home: null,
    away: null,
    verification: "conflict",
    source: "no reliable result — voided by admin",
    confirmLine: "NO RELIABLE RESULT — the dispute is voided (neither evidence is confirmed)",
    note: "The conflicting result cannot currently be established as authoritative — no WIN, no LOSS, no PUSH; both evidence records are preserved.",
  },
};

// STRICT SNAPSHOT READ — any failure throws (the caller aborts; a throttled
// read is NEVER treated as "no rows").
export async function readConflictSnapshot(client, fixture = CONFLICT_FIXTURE) {
  const preds = await client.entities.GlobalPredictionLedger.filter({ fixture_id: fixture.fixtureId }, "created_date", 1000);
  if (!Array.isArray(preds)) throw new Error("malformed prediction read");
  const outcomes = await client.entities.GlobalOutcomeLedger.filter({ global_prediction_id: fixture.gid }, "created_date", 100);
  if (!Array.isArray(outcomes)) throw new Error("malformed outcome read");
  return snapshotOfConflict(fixture, preds, outcomes);
}

// IDEMPOTENT ARCHIVE — audits FIRST, then removal. Already-audited rows are
// skipped, so a retry after a partial failure never duplicates audit records
// and never archives the same row twice.
async function archiveIdempotent(client, entityName, rowIds, meta) {
  if (!rowIds.length) return 0;
  const existing = await client.entities.LedgerCleanupAudit.filter({ run_id: meta.runId }, "created_date", 1000);
  const audited = new Set();
  for (const a of Array.isArray(existing) ? existing : []) {
    if (a.phase !== meta.phase) continue;
    String(a.removed_row_ids || "").split(",").filter(Boolean).forEach((id) => audited.add(id));
  }
  const todo = rowIds.filter((id) => !audited.has(id));
  if (!todo.length) return 0;
  await client.entities.LedgerCleanupAudit.bulkCreate(
    todo.map((id) => ({
      run_id: meta.runId,
      phase: meta.phase,
      stable_identity: meta.identity,
      action: "exact_duplicate_removed",
      kept_row_id: meta.keptRowId || "",
      removed_row_ids: id,
      removed_count: 1,
      reason: meta.reason,
      operator: "manual conflict resolution via Integrity Dashboard",
      executed_at: new Date().toISOString(),
    }))
  );
  const del = await client.entities[entityName].deleteMany({ id: { $in: todo } });
  if (del?.success !== true) {
    throw new Error("archive removal failed — the audit trail was written; a retry will not duplicate it");
  }
  return todo.length;
}

// EXECUTE the admin's confirmed resolution. Everything that can go wrong
// BEFORE the first mutation aborts with zero writes; after the first
// mutation a failure stops the chain and marks the record FAILED (retry is
// safe and idempotent). Learning is protected by design: this chain writes
// settlements and archives only — no insight is created and no weight changes.
export async function executeConflictResolution({
  choiceKey,
  armedSnapshot,
  confirmedBy = "admin",
  client = base44,
  fixture = CONFLICT_FIXTURE,
}) {
  const choice = RESOLUTION_CHOICES[choiceKey];
  if (!choice) return { aborted: true, code: "STOPPED", message: "UNKNOWN RESOLUTION CHOICE — nothing was changed." };
  const resolutionId = `resolution|${fixture.fixtureId}|${fixture.gid}`;
  const runId = `conflict-resolution|${fixture.fixtureId}|${fixture.gid}`;

  // 1 — RE-READ the current REVIEW group (strict: any failure aborts, zero writes)
  let current;
  try {
    current = await readConflictSnapshot(client, fixture);
  } catch {
    return { aborted: true, code: "PAUSED", message: "RESOLUTION PAUSED — CURRENT CONFLICT COULD NOT BE VERIFIED." };
  }

  // 2 — REVALIDATE against the state the admin reviewed when arming
  const val = revalidateConflictState(armedSnapshot, current);
  if (!val.ok) {
    return {
      aborted: true,
      code: "STOPPED",
      message: "RESOLUTION STOPPED — THE CONFLICT CHANGED. REFRESH AND REVIEW AGAIN.",
      detail: val.reason,
    };
  }

  // 3 — IDEMPOTENCY: one resolution record per conflict group, forever
  let record = null;
  try {
    const recs = await client.entities.ConflictResolutionRecord.filter({ resolution_id: resolutionId }, "created_date", 5);
    record = (Array.isArray(recs) ? recs : []).find((r) => r.resolution_id === resolutionId) || null;
  } catch {
    return { aborted: true, code: "PAUSED", message: "RESOLUTION PAUSED — CURRENT CONFLICT COULD NOT BE VERIFIED." };
  }
  if (record?.status === "CONFIRMED") {
    return record.resolution_type === choice.resolutionType
      ? {
          alreadyResolved: true,
          message: "ALREADY RESOLVED — this conflict group already carries exactly this confirmed resolution. ZERO writes were made.",
          resolution: record,
        }
      : {
          aborted: true,
          code: "STOPPED",
          message: "ALREADY RESOLVED WITH DIFFERENT EVIDENCE — a confirmed resolution exists for this conflict group. Review required; nothing was changed.",
          resolution: record,
        };
  }

  // 4 — PLAN (pure; the settlement engine — never a manual WIN/LOSS/PUSH)
  const plan = planConflictResolution({ choice, snapshot: current });
  if (plan.error) {
    return { aborted: true, code: "STOPPED", message: `RESOLUTION STOPPED — ${plan.error} Nothing was changed.` };
  }

  const now = new Date().toISOString();
  const baseFields = {
    resolution_id: resolutionId,
    conflict_group_id: fixture.gid,
    fixture_id: fixture.fixtureId,
    fixture: `${fixture.home} vs ${fixture.away}`,
    previous_status: "REVIEW",
    resolution_type: choice.resolutionType,
    confirmed_home_score: plan.home,
    confirmed_away_score: plan.away,
    reason: `${choice.source} · confirmed by ${confirmedBy}`,
    source_evidence_json: JSON.stringify(plan.evidence),
    affected_prediction_ids: plan.canonicalId,
    affected_outcome_ids: plan.canonicalOutcomeId || "",
  };

  // 5 — IMMUTABLE RESOLUTION AUDIT FIRST (before ANY ledger mutation)
  try {
    if (!record) {
      record = await client.entities.ConflictResolutionRecord.create({
        ...baseFields,
        confirmed_by: confirmedBy,
        status: "PENDING",
        resolution_version: 1,
      });
    } else {
      await client.entities.ConflictResolutionRecord.update(record.id, {
        ...baseFields,
        confirmed_by: confirmedBy,
        status: "PENDING",
      });
    }
  } catch {
    return {
      aborted: true,
      code: "PAUSED",
      message: "RESOLUTION PAUSED — THE RESOLUTION AUDIT RECORD COULD NOT BE CREATED. No ledger row was touched.",
    };
  }

  const fail = async (step, e) => {
    try {
      await client.entities.ConflictResolutionRecord.update(record.id, {
        status: "FAILED",
        execution_note: `failed at ${step}: ${String(e?.message || e)}`,
      });
    } catch { /* best-effort status mark — the audit-first record itself is the trail */ }
    return {
      failed: true,
      step,
      error: String(e?.message || e),
      message: "RESOLUTION FAILED — NO PARTIAL RESOLUTION WAS ACCEPTED. The audit-first record makes a retry safe and idempotent.",
    };
  };

  // 6 — UPDATE THE CANONICAL PREDICTION with the confirmed result
  try {
    await client.entities.GlobalPredictionLedger.update(plan.canonicalId, {
      status: plan.status,
      actual_home: plan.home,
      actual_away: plan.away,
      verification: choice.verification,
      result_source: `${choice.source} · manual conflict resolution confirmed by ${confirmedBy} (${now}) — conflicting evidence preserved in resolution record`,
      settled_at: now,
    });
  } catch (e) {
    return fail("canonical prediction update", e);
  }

  // 7 — REGRADE THE CANONICAL OUTCOME with the settlement engine's grade
  if (plan.canonicalOutcomeId) {
    try {
      await client.entities.GlobalOutcomeLedger.update(plan.canonicalOutcomeId, {
        settlement: plan.status,
        actual_result: plan.status,
        final_home: plan.home,
        final_away: plan.away,
        verification_source: choice.verification,
        result_source: `${choice.source} · manual conflict resolution (${now})`,
        settled_at: now,
      });
    } catch (e) {
      return fail("canonical outcome regrade", e);
    }
  }

  // 8 — ARCHIVE ONLY VERIFIED DUPLICATE COPIES of this exact conflict group
  // (audit-first, idempotent — never the canonical row, never evidence, never
  // unrelated fixtures, never different model versions)
  let archivedPredictions = 0;
  let archivedOutcomes = 0;
  try {
    archivedPredictions = await archiveIdempotent(client, "GlobalPredictionLedger", plan.duplicatePredictionIds, {
      phase: "settled",
      runId,
      identity: fixture.gid,
      keptRowId: plan.canonicalId,
      reason: `exact duplicate of the reconciled identity after ${choice.resolutionType}`,
    });
  } catch (e) {
    return fail("duplicate prediction archive", e);
  }
  try {
    archivedOutcomes = await archiveIdempotent(client, "GlobalOutcomeLedger", plan.duplicateOutcomeIds, {
      phase: "outcome",
      runId,
      identity: fixture.gid,
      keptRowId: plan.canonicalOutcomeId || "",
      reason: `exact duplicate outcome after ${choice.resolutionType}`,
    });
  } catch (e) {
    return fail("duplicate outcome archive", e);
  }

  // 9 — CONFIRM THE RESOLUTION RECORD
  const archivedIds = [...plan.duplicatePredictionIds, ...plan.duplicateOutcomeIds].join(",");
  try {
    await client.entities.ConflictResolutionRecord.update(record.id, {
      status: "CONFIRMED",
      confirmed_at: now,
      confirmed_by: confirmedBy,
      archived_duplicate_ids: archivedIds,
      execution_note: `completed: settlement ${plan.status} calculated by the settlement engine`,
    });
    record = { ...record, status: "CONFIRMED", confirmed_at: now, archived_duplicate_ids: archivedIds };
  } catch (e) {
    return fail("resolution record confirmation", e);
  }

  // 10 — POST-RESOLUTION VERIFICATION (honest: a failed re-read is reported,
  // never guessed)
  let verification = null;
  try {
    const afterPreds = await client.entities.GlobalPredictionLedger.filter({ fixture_id: fixture.fixtureId }, "created_date", 1000);
    const afterOutcomes = await client.entities.GlobalOutcomeLedger.filter({ global_prediction_id: fixture.gid }, "created_date", 100);
    const audits = await client.entities.LedgerCleanupAudit.filter({ run_id: runId }, "created_date", 1000);
    verification = verifyResolvedState({ afterPreds, afterOutcomes, audits, plan, record });
    await client.entities.ConflictResolutionRecord.update(record.id, {
      verification_json: JSON.stringify(verification.checks),
    });
  } catch {
    verification = {
      allPassed: null,
      note: "post-resolution re-read failed — the resolution is confirmed but the final state could not be re-verified",
    };
  }

  return {
    complete: true,
    resolutionType: choice.resolutionType,
    confirmed: choice.short,
    status: plan.status,
    home: plan.home,
    away: plan.away,
    keptPredictionId: plan.canonicalId,
    archivedPredictions,
    archivedOutcomes,
    verification,
    resolution: record,
  };
}