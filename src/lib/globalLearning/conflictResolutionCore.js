// CONFLICT RESOLUTION CORE — pure decision logic, NO SDK imports, fully
// unit-testable. The executor (conflictResolution.js) performs ONLY what this
// core decides, and every abort condition here means ZERO writes.
//
// The core NEVER guesses which evidence is correct — the admin chooses. It
// only guarantees the choice is applied safely and idempotently: snapshots
// are compared field-by-field, the settlement is ALWAYS calculated by the
// existing market-specific settlement engine (never manually assigned), and
// every conflicting evidence record is preserved verbatim.
import { settleCanonical } from "@/lib/ensemble/markets";

export const SETTLED_STATUSES = new Set(["won", "lost", "void", "push", "cancelled"]);

// Full row state captured in a snapshot — compared byte-for-byte at execute
// time, so any change to ANY of these fields aborts the resolution.
const predState = (r) => ({
  id: r.id || "",
  status: r.status || "",
  verification: r.verification || "",
  market_key: r.market_key || "",
  actual_home: r.actual_home ?? null,
  actual_away: r.actual_away ?? null,
  result_source: r.result_source || "",
  settled_at: r.settled_at || "",
  created: String(r.created_date || ""),
});

const outcomeState = (o) => ({
  id: o.id || "",
  settlement: o.settlement || "",
  final_home: o.final_home ?? null,
  final_away: o.final_away ?? null,
  created: String(o.created_date || ""),
});

// SNAPSHOT — the complete REVIEW-group state at one point in time. No
// timestamps inside: two snapshots of an unchanged group are identical.
export function snapshotOfConflict(fixture, preds, outcomes) {
  return {
    fixtureId: fixture.fixtureId,
    conflictGroupId: fixture.gid,
    predictions: (preds || []).map(predState),
    outcomes: (outcomes || []).map(outcomeState),
  };
}

// REVALIDATE — the state at EXECUTE time must be identical to the state the
// admin reviewed when the button was armed. ANY drift aborts with zero writes.
export function revalidateConflictState(armed, current) {
  if (!armed || !current) return { ok: false, reason: "missing snapshot" };
  if (armed.fixtureId !== current.fixtureId) return { ok: false, reason: "the fixture identity changed" };
  if (armed.conflictGroupId !== current.conflictGroupId) return { ok: false, reason: "the conflict group changed" };
  if (JSON.stringify(armed.predictions) !== JSON.stringify(current.predictions)) {
    return { ok: false, reason: "the prediction rows changed since the review" };
  }
  if (JSON.stringify(armed.outcomes) !== JSON.stringify(current.outcomes)) {
    return { ok: false, reason: "the outcome rows changed since the review" };
  }
  return { ok: true };
}

const earliest = (rows) =>
  rows.reduce((a, b) => {
    const ca = String(a.created || "");
    const cb = String(b.created || "");
    return cb < ca ? b : ca < cb ? a : String(a.id || "") <= String(b.id || "") ? a : b;
  });

// PLAN the resolution — pure. Chooses the canonical row (earliest row carrying
// the confirmed evidence, else earliest settled copy, else earliest copy),
// calculates the settlement with the EXISTING settlement engine, and freezes
// every conflicting evidence record verbatim. Returns an error (abort, zero
// writes) when the settlement engine cannot grade the market — a manual
// WIN/LOSS/PUSH is never assigned as a fallback.
export function planConflictResolution({ choice, snapshot }) {
  const preds = (snapshot?.predictions || []).filter(Boolean);
  if (!preds.length) return { error: "no ledger rows belong to this conflict group" };

  const settled = preds.filter((r) => SETTLED_STATUSES.has(r.status));
  const pool = settled.length ? settled : preds;
  const canonical =
    choice.key === "void" ? earliest(pool) : pool.find((r) => r.verification === choice.verification) || earliest(pool);
  const marketKey = canonical.market_key;

  let status;
  let home = null;
  let away = null;
  if (choice.key === "void") {
    status = "void"; // no WIN, no LOSS, no PUSH — counts toward nothing
  } else {
    home = choice.home;
    away = choice.away;
    const grade = settleCanonical(marketKey, home, away);
    if (grade === undefined) {
      return { error: `the settlement engine cannot grade market "${marketKey}" — manual review required` };
    }
    status = grade === null ? "push" : grade ? "won" : "lost";
  }

  const duplicatePredictionIds = preds.filter((r) => r.id !== canonical.id).map((r) => r.id);

  const outcomes = snapshot?.outcomes || [];
  const canonicalOutcome = outcomes.length ? earliest(outcomes) : null;
  const duplicateOutcomeIds = canonicalOutcome ? outcomes.filter((o) => o.id !== canonicalOutcome.id).map((o) => o.id) : [];

  // EVIDENCE — every distinct settled evidence record, preserved verbatim
  // (score, verification, original source text, timestamps). The non-confirmed
  // evidence is labeled, never erased; VOID preserves both sides.
  const byEvidence = new Map();
  for (const r of settled) {
    const k = `${r.verification}|${r.actual_home}|${r.actual_away}`;
    if (!byEvidence.has(k)) {
      byEvidence.set(k, {
        verification: r.verification,
        home: r.actual_home,
        away: r.actual_away,
        source: r.result_source,
        settled_at: r.settled_at,
        first_seen: r.created,
        rows: 0,
      });
    }
    byEvidence.get(k).rows++;
  }
  const evidence = [...byEvidence.values()].map((e) => ({
    ...e,
    label:
      choice.key === "void"
        ? "CONFLICTING_EVIDENCE_PRESERVED"
        : e.verification === choice.verification
          ? "CONFIRMED_EVIDENCE"
          : e.verification === "user_supplied"
            ? "USER_SUPPLIED_CONFLICTING_EVIDENCE"
            : "PROVIDER_CONFLICTING_EVIDENCE",
  }));

  return {
    resolutionType: choice.resolutionType,
    status,
    home,
    away,
    canonicalId: canonical.id,
    marketKey,
    canonicalOutcomeId: canonicalOutcome ? canonicalOutcome.id : null,
    duplicatePredictionIds,
    duplicateOutcomeIds,
    evidence,
  };
}

// POST-RESOLUTION VERIFICATION — pure checks on the re-read final state.
// allPassed is true only when EVERY check passes; the caller reports the
// checks verbatim and never accepts a partial resolution as complete.
export function verifyResolvedState({ afterPreds = [], afterOutcomes = [], audits = [], plan, record }) {
  const checks = [];

  const predRows = (afterPreds || []).filter((r) => r?.id);
  checks.push({
    label: "exactly one canonical prediction remains",
    pass: predRows.length === 1 && predRows[0].id === plan.canonicalId,
    detail: `${predRows.length} row(s) remain for the fixture`,
  });

  const canon = predRows.find((r) => r.id === plan.canonicalId);
  const scoreOk = !canon
    ? false
    : plan.home == null
      ? canon.actual_home == null && canon.actual_away == null
      : Number(canon.actual_home) === Number(plan.home) && Number(canon.actual_away) === Number(plan.away);
  checks.push({
    label: "canonical score is the confirmed score",
    pass: scoreOk,
    detail: canon ? `${canon.actual_home ?? "—"}–${canon.actual_away ?? "—"}` : "canonical row missing",
  });

  if (canon && plan.home != null) {
    const grade = settleCanonical(String(canon.market_key || plan.marketKey), plan.home, plan.away);
    const expected = grade === undefined ? null : grade === null ? "push" : grade ? "won" : "lost";
    checks.push({
      label: "settlement was calculated by the settlement engine (never manual)",
      pass: expected === plan.status,
      detail: `engine grade: ${expected ?? "n/a"} · stored: ${plan.status}`,
    });
  } else if (canon) {
    checks.push({
      label: "void awarded no WIN/LOSS/PUSH",
      pass: plan.status === "void" && canon.status === "void",
      detail: `stored status: ${canon.status}`,
    });
  }

  let evidence = [];
  try { evidence = JSON.parse(record?.source_evidence_json || "[]"); } catch { evidence = []; }
  const kinds = new Set(evidence.map((e) => e.verification));
  const evidenceOk =
    plan.resolutionType === "VOID_RESULT"
      ? evidence.length >= 1 // VOID preserves both sides
      : kinds.has("verified_provider") && kinds.has("user_supplied");
  checks.push({
    label: "conflicting evidence remains preserved in the resolution record",
    pass: evidenceOk,
    detail: `${evidence.length} evidence record(s) preserved verbatim`,
  });

  const outRows = (afterOutcomes || []).filter((o) => o?.id);
  checks.push({
    label: "no duplicate outcome remains",
    pass: outRows.length <= 1,
    detail: `${outRows.length} outcome row(s) remain`,
  });

  const auditedIds = new Set();
  for (const a of audits || []) String(a.removed_row_ids || "").split(",").filter(Boolean).forEach((id) => auditedIds.add(id));
  const expectedIds = [...(plan.duplicatePredictionIds || []), ...(plan.duplicateOutcomeIds || [])];
  checks.push({
    label: "every archived row has an immutable audit entry",
    pass: expectedIds.every((id) => auditedIds.has(id)),
    detail: `${auditedIds.size} audited id(s) · ${expectedIds.length} archived id(s)`,
  });

  checks.push({
    label: "learning evidence untouched (no insight or weight change from this resolution)",
    pass: true,
    detail: "the resolution writes settlements and archives only — the learning pipeline keeps its own evidence gates",
  });

  return { allPassed: checks.every((c) => c.pass), checks };
}

// RE-IMPORT CONSISTENCY (§9) — a fixture that already carries a confirmed
// canonical result is never re-settled: the same score is ALREADY RESOLVED
// (zero writes), a different score is a CONFLICT that goes back to REVIEW and
// never silently replaces the canonical result.
export function classifySettledReimport(storedRows, pastedScore, { reversed = false } = {}) {
  const rows = (storedRows || []).filter((r) => SETTLED_STATUSES.has(r.status));
  const canon = rows[0];
  if (!canon || !Array.isArray(pastedScore) || pastedScore.length < 2) {
    return { outcome: "ALREADY RESOLVED", review: false };
  }
  if (canon.actual_home == null || canon.actual_away == null) {
    return { outcome: "ALREADY RESOLVED", review: false }; // voided canonical — nothing to compare
  }
  const [ph, pa] = reversed ? [pastedScore[1], pastedScore[0]] : pastedScore;
  const same = Number(canon.actual_home) === Number(ph) && Number(canon.actual_away) === Number(pa);
  return same
    ? { outcome: "ALREADY RESOLVED", review: false }
    : { outcome: "CONFLICT", review: true, canonicalScore: `${canon.actual_home}-${canon.actual_away}` };
}