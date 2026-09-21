// LEARNING QUEUE — pattern candidates become GlobalLearningInsight rows:
// the permanent learning memory of the RIDE X prediction ecosystem. Upserts
// are idempotent per insight_key (the same pattern found again refreshes its
// evidence, never duplicates). One result NEVER changes production: every
// insight starts NEW and moves through backtest → walk-forward → challenger →
// OOS validation before anything is promoted.
import { base44 } from "@/api/base44Client";
import { patternCandidates } from "./analysis";
import { canonicalizeRows } from "./canonicalProjection";
import { GLOBAL_MODEL_VERSION, LEARNING_VERSION, marketFamilyOf } from "./globalId";

export function evidenceLevelOf(n) {
  if (n >= 100) return 3; // meaningful forward evidence
  if (n >= 30) return 2; // early forward evidence
  return 1; // backtest-grade only
}

function insightKeyOf(c) {
  return `${c.scope}|${c.dim}:${String(c.value).toLowerCase().replace(/[^a-z0-9+.≥< -]+/g, " ").replace(/\s+/g, "_")}`;
}

export async function refreshInsights(allGlobalRows) {
  // Learning evidence is computed from CANONICAL prediction identities only —
  // duplicate ledger copies can never inflate a pattern's sample size.
  const candidates = patternCandidates(canonicalizeRows(allGlobalRows));
  // STRICT READ — a throttled read must never look like "no existing
  // insights" (that is how duplicate insight rows are created); it throws
  // and the caller surfaces the pause instead of continuing.
  const existing = await base44.entities.GlobalLearningInsight.filter({}, "-updated_at", 200);
  const byKey = new Map((existing || []).map((r) => [r.insight_key, r]));
  const now = new Date().toISOString();
  const creates = [];
  const updates = [];
  candidates.forEach((c) => {
    const key = insightKeyOf(c);
    const payload = {
      insight: c.insight,
      sample_size: c.sample,
      expected_pct: c.expected,
      actual_pct: c.actual,
      effect_pp: c.gap,
      source_sections: c.sections.join(","),
      market: c.market || "",
      odds_range: c.oddsRange || c.odds_range || "",
      evidence_level: evidenceLevelOf(c.sample),
      hypothesis: c.hypothesis,
      recommended_action: "backtest on strictly-prior rows → walk-forward test → challenger → OOS promotion gate",
      validation_status: "not_tested",
      affected_models: c.sections.join(","),
      updated_at: now,
    };
    const cur = byKey.get(key);
    if (cur) updates.push({ id: cur.id, ...payload });
    else
      creates.push({
        insight_key: key,
        subject: `${c.dim}:${c.value}`,
        scope: c.scope,
        status: "NEW",
        model_version: GLOBAL_MODEL_VERSION,
        first_seen_at: now,
        learning_version: LEARNING_VERSION,
        ...payload,
      });
  });
  if (creates.length) await base44.entities.GlobalLearningInsight.bulkCreate(creates);
  if (updates.length) await base44.entities.GlobalLearningInsight.bulkUpdate(updates);
  return { created: creates.length, updated: updates.length, candidates: candidates.length };
}

// The human-readable "WHAT RIDE X LEARNED" report — only actual evidence is
// reported; "what changed" stays empty until a hypothesis has passed the full
// validation chain and been promoted through the changelog.
export function learnedReport(insights, totals) {
  const sorted = [...(insights || [])].sort((a, b) => (b.evidence_level || 0) - (a.evidence_level || 0) || (b.sample_size || 0) - (a.sample_size || 0));
  return {
    totals,
    findings: sorted.map((i) => ({
      text: i.insight,
      scope: i.scope,
      status: i.status,
      sample: i.sample_size,
      evidence: i.evidence_level,
      expected: i.expected_pct,
      actual: i.actual_pct,
      hypothesis: i.hypothesis,
    })),
    whatChanged: (insights || []).filter((i) => ["IMPLEMENTED", "VALIDATED"].includes(i.status)).map((i) => i.insight),
    noChangesNote:
      "No production model has been changed. Every finding below is a hypothesis awaiting backtest, walk-forward and out-of-sample validation — one result, or even many, never self-modify the engine.",
  };
}