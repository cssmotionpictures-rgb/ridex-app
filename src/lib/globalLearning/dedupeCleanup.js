// PROVEN-DUPLICATE CLEANUP PLANNING — pure decision logic for the authorized
// ledger cleanup. This module DECIDES, never executes: the runner performs
// only what a plan marks EXACT DUPLICATE, and every ambiguous group is
// retained for review. No model logic, settlement rule or probability is
// ever touched — this is a data-integrity repair only.
//
// Identity rules (from the duplicate audit, spec §5-§8):
//  - the deterministic global_prediction_id IS the identity; display text is
//    never a key
//  - RX-2.0 and RX-2.1 rows carry DIFFERENT global ids — never duplicates
//  - different fixture ids are different predictions, whatever the team names
//  - the earliest-created row is canonical — immutable history wins
//  - a settled/outcome copy that DISAGREES on the graded settlement is never
//    removed, whatever the copy count — it goes to REVIEW
//  - an open copy that cannot be attributed to a source record (no
//    source_row_id) is never auto-removed — it goes to REVIEW
import { dedupeById } from "@/lib/idempotency";

const SETTLED_STATUSES = new Set(["won", "lost", "void", "push", "cancelled"]);

const earliestOf = (group) =>
  group.reduce((a, b) => {
    const ca = String(a.created_date || "");
    const cb = String(b.created_date || "");
    return cb < ca ? b : ca < cb ? a : String(a.id || "") <= String(b.id || "") ? a : b;
  });

// Settlement signature of a global prediction row — copies must match the
// canonical row's graded outcome exactly to count as exact duplicates.
export function settlementSignatureOf(r) {
  return `${r.status}|${r.actual_home ?? ""}|${r.actual_away ?? ""}|${r.settled_at || ""}`;
}

// Outcome signature of a GlobalOutcomeLedger row.
export function outcomeSignatureOf(r) {
  return `${r.settlement}|${r.actual_result ?? ""}|${r.final_home ?? ""}|${r.final_away ?? ""}|${r.settled_at || ""}`;
}

// Plan the cleanup of one ledger bucket.
//   phase "settled"  — GlobalPredictionLedger settled rows: one canonical row
//                      per identity; exact copies removed; disagreeing copies
//                      retained for review
//   phase "open"     — GlobalPredictionLedger open rows: one row per DISTINCT
//                      source record; same-source re-ingestions removed;
//                      unattributed copies retained for review
//   phase "outcome"  — GlobalOutcomeLedger rows: one canonical outcome per
//                      settled prediction; exact copies removed; disagreeing
//                      copies retained for review
// Rows without a stable identity are never touched and are reported.
export function planLedgerCleanup(rows, { phase = "settled" } = {}) {
  const byGid = new Map();
  const noIdentity = [];
  for (const r of dedupeById(rows)) {
    const gid = r.global_prediction_id;
    if (!gid) {
      noIdentity.push(r.id || "");
      continue;
    }
    if (!byGid.has(gid)) byGid.set(gid, []);
    byGid.get(gid).push(r);
  }

  const keep = [];
  const removals = [];
  const reviews = [];

  for (const [gid, group] of byGid) {
    if (group.length === 1) {
      keep.push(group[0]);
      continue;
    }

    if (phase === "open") {
      // Group by SOURCE RECORD: each distinct source row is a genuine
      // observation of its own; copies of the SAME source row are exact
      // re-ingestions.
      const bySrc = new Map();
      for (const r of group) {
        const s = String(r.source_row_id || "");
        if (!bySrc.has(s)) bySrc.set(s, []);
        bySrc.get(s).push(r);
      }
      for (const [src, copies] of bySrc) {
        const canon = earliestOf(copies);
        keep.push(canon);
        if (src === "") {
          if (copies.length > 1) {
            reviews.push({
              identity: gid,
              reason: "copies without a source link cannot be tied to a source record — review required",
              rowIds: copies.map((r) => r.id),
            });
          }
          continue;
        }
        for (const r of copies) {
          if (r.id === canon.id) continue;
          removals.push({
            id: r.id,
            identity: gid,
            keptRowId: canon.id,
            reason: "exact re-ingestion of the same source record (open prediction)",
          });
        }
      }
      continue;
    }

    const sigOf = phase === "outcome" ? outcomeSignatureOf : settlementSignatureOf;
    // Canonical = the earliest copy carrying the identity's VERIFIED
    // settlement. Stale unsettled copies of an already-settled identity are
    // exact re-ingestions whose settlement was mirrored only onto the
    // canonical row — they are removed, never re-settled. (Outcome rows carry
    // their settlement in `settlement`, prediction rows in `status`.)
    const settledStatusOf = (r) => (phase === "outcome" ? r.settlement : r.status);
    const settledCopies = group.filter((r) => SETTLED_STATUSES.has(settledStatusOf(r)));
    const sigs = new Set(settledCopies.map(sigOf));
    if (settledCopies.length && sigs.size > 1) {
      // Real settlement conflict — every copy is retained, flagged for review.
      keep.push(...group);
      reviews.push({
        identity: gid,
        reason: "copies disagree on the graded settlement — review required, never auto-removed",
        rowIds: group.map((r) => r.id),
      });
      continue;
    }
    const canon = settledCopies.length ? earliestOf(settledCopies) : earliestOf(group);
    keep.push(canon);
    for (const r of group) {
      if (r.id === canon.id) continue;
      removals.push({
        id: r.id,
        identity: gid,
        keptRowId: canon.id,
        reason: SETTLED_STATUSES.has(settledStatusOf(r))
          ? phase === "outcome"
            ? "exact duplicate outcome of the same settled prediction"
            : "exact re-ingestion of the same settled prediction identity"
          : "stale unsettled copy of an already-settled prediction identity (the settlement lives on the canonical row)",
      });
    }
  }

  return {
    phase,
    keepRowIds: keep.map((r) => r.id),
    removals,
    reviews,
    rowsWithoutStableIdentity: noIdentity,
  };
}

// Audit-trail records for a cleanup plan — one row per identity action. The
// platform has no soft-delete, so this trail is the reversible record of
// exactly what was removed and what was retained for review.
export function buildAuditRecords(plan, { runId, phase, operator }) {
  const records = [];
  const byIdentity = new Map();
  for (const r of plan.removals) {
    if (!byIdentity.has(r.identity)) byIdentity.set(r.identity, { keptRowId: r.keptRowId, ids: [], reason: r.reason });
    byIdentity.get(r.identity).ids.push(r.id);
  }
  for (const [identity, g] of byIdentity) {
    records.push({
      run_id: runId,
      phase,
      stable_identity: identity,
      action: "exact_duplicate_removed",
      kept_row_id: g.keptRowId,
      removed_row_ids: g.ids.join(","),
      removed_count: g.ids.length,
      reason: g.reason,
      operator,
      executed_at: new Date().toISOString(),
    });
  }
  for (const rv of plan.reviews) {
    records.push({
      run_id: runId,
      phase,
      stable_identity: rv.identity,
      action: "review_retained",
      kept_row_id: "",
      removed_row_ids: rv.rowIds.join(","),
      removed_count: 0,
      reason: rv.reason,
      operator,
      executed_at: new Date().toISOString(),
    });
  }
  return records;
}