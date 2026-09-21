import { base44 } from "@/api/base44Client";
import { settleCanonical } from "@/lib/ensemble/markets";

// DISPUTE ROW REVIEW — per-row admin actions on ledger rows whose settlement
// is in dispute (status conflict | unverified). APPROVE confirms the row's
// recorded result as final (the settlement ENGINE computes the grade — never
// a manual win/loss); DISCARD rejects the disputed evidence (status cancelled
// — counts toward nothing, evidence preserved). Every action RE-READS the row
// first so a stale or already-resolved row is skipped, never double-applied,
// and the audit note is APPENDED to result_source — the original evidence and
// its provenance are never overwritten. The row's linked outcome grades are
// mirrored so the learning layer never counts a half-resolved dispute.

export const DISPUTE_STATUSES = ["conflict", "unverified"];

const gradeOf = (marketKey, home, away) => {
  const grade = settleCanonical(String(marketKey || ""), Number(home), Number(away));
  if (grade === undefined) return { error: `the settlement engine cannot grade market "${marketKey}"` };
  return { status: grade === null ? "push" : grade ? "won" : "lost" };
};

// All ledger rows currently in dispute + their linked outcome rows.
export async function readDisputeRows(client = base44) {
  const rows = await client.entities.GlobalPredictionLedger.filter({ status: { $in: DISPUTE_STATUSES } }, "-created_date", 200);
  if (!Array.isArray(rows)) throw new Error("malformed dispute read");
  const gids = [...new Set(rows.map((r) => r.global_prediction_id).filter(Boolean))];
  const outcomes = [];
  for (const g of gids) {
    const o = await client.entities.GlobalOutcomeLedger.filter({ global_prediction_id: g }, "created_date", 100);
    if (Array.isArray(o)) outcomes.push(...o);
  }
  return { rows, outcomes };
}

async function applyRowAction({ client = base44, row, action, performedBy }) {
  // 1 — RE-READ the row: stale or already-resolved rows are skipped, never double-applied.
  //    A throttled read is retried once after a pause — a busy read window never
  //    leaves a false "failed" impression; a real failure still changes nothing.
  let fresh;
  try {
    fresh = await client.entities.GlobalPredictionLedger.get(row.id);
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      fresh = await client.entities.GlobalPredictionLedger.get(row.id);
    } catch {
      return { paused: true, message: "ROW READ FAILED (read window busy) — nothing was changed. Press the button again." };
    }
  }
  if (!fresh || !DISPUTE_STATUSES.includes(fresh.status)) {
    return { skipped: true, message: "Row is no longer in dispute — nothing to do." };
  }
  const now = new Date().toISOString();
  const who = performedBy || "admin";

  let grade = null;
  if (action === "APPROVE") {
    if (fresh.actual_home == null || fresh.actual_away == null) {
      return { paused: true, message: "Row carries no recorded score — cannot approve. Nothing was changed." };
    }
    grade = gradeOf(fresh.market_key, fresh.actual_home, fresh.actual_away);
    if (grade.error) return { paused: true, message: `${grade.error} — nothing was changed.` };
    // 2 — prediction row: engine-graded status; verification stays honest
    //    (user_supplied — the admin confirmed the recorded evidence, which is
    //    still not a verified-provider result)
    await client.entities.GlobalPredictionLedger.update(fresh.id, {
      status: grade.status,
      verification: "user_supplied",
      result_source: `${fresh.result_source || "no source"} · ADMIN REVIEW APPROVED by ${who} at ${now} — recorded result ${fresh.actual_home}–${fresh.actual_away} accepted as final, engine-graded ${grade.status}`,
      settled_at: fresh.settled_at || now,
    });
  } else {
    // DISCARD — the disputed evidence is rejected: cancelled counts toward nothing
    await client.entities.GlobalPredictionLedger.update(fresh.id, {
      status: "cancelled",
      verification: fresh.verification === "conflict" ? "user_supplied" : fresh.verification || "user_supplied",
      result_source: `${fresh.result_source || "no source"} · ADMIN REVIEW DISCARDED by ${who} at ${now} — disputed evidence rejected, row cancelled, counts toward nothing`,
      settled_at: fresh.settled_at || now,
    });
  }

  // 3 — mirror the linked outcome grades (best-effort; the prediction row is the review surface)
  try {
    const linked = await client.entities.GlobalOutcomeLedger.filter({ global_prediction_id: fresh.global_prediction_id }, "created_date", 100);
    for (const o of linked || []) {
      if (action === "DISCARD") {
        await client.entities.GlobalOutcomeLedger.update(o.id, {
          settlement: "cancelled",
          actual_result: "cancelled",
          verification_source: o.verification_source === "conflict" ? "user_supplied" : o.verification_source || "user_supplied",
          result_source: `${o.result_source || ""} · ADMIN REVIEW DISCARDED by ${who} at ${now} — linked dispute rejected, grade cancelled`,
        });
      } else {
        await client.entities.GlobalOutcomeLedger.update(o.id, {
          settlement: grade.status,
          actual_result: grade.status,
          final_home: fresh.actual_home,
          final_away: fresh.actual_away,
          verification_source: "user_supplied",
          result_source: `${o.result_source || ""} · ADMIN REVIEW APPROVED by ${who} at ${now} — linked dispute resolved to the approved result`,
        });
      }
    }
  } catch { /* outcome mirror is best-effort — the audit note on the prediction row is the trail */ }

  return { done: true, action, rowId: fresh.id, status: action === "APPROVE" ? grade.status : "cancelled" };
}

export const approveDisputeRow = (args) => applyRowAction({ ...args, action: "APPROVE" });
export const discardDisputeRow = (args) => applyRowAction({ ...args, action: "DISCARD" });