import React from "react";
import { ListChecks } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/kala/Bits";

const STATUS_STYLE = {
  NEW: "bg-sky-400/10 text-sky-300 border-sky-400/30",
  UNDER_TEST: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  SUPPORTED: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  REJECTED: "bg-rose-400/10 text-rose-300 border-rose-400/30",
  VALIDATED: "bg-primary/15 text-primary border-primary/40",
  IMPLEMENTED: "bg-emerald-500/15 text-emerald-200 border-emerald-400/50",
  ROLLED_BACK: "bg-secondary text-muted-foreground border-border",
};

export default function QueueSection({ insights }) {
  const list = [...(insights || [])].sort(
    (a, b) => (b.evidence_level || 0) - (a.evidence_level || 0) || (b.sample_size || 0) - (a.sample_size || 0)
  );
  const byStatus = list.reduce((m, i) => ({ ...m, [i.status]: (m[i.status] || 0) + 1 }), {});

  return (
    <SectionCard
      title="RIDE X LEARNING QUEUE"
      icon={<ListChecks className="w-4 h-4 text-primary" />}
      sub="Every potentially useful lesson, with its evidence level and its position in the validation chain. One result never promotes anything — findings move NEW → backtest → walk-forward → challenger → OOS gate, and most never reach production."
    >
      {list.length === 0 ? (
        <EmptyState>The learning queue is empty — no pattern has reached the minimum evidence bar (20+ settled observations with a material calibration gap). Nothing is manufactured to fill it.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(byStatus).map(([s, n]) => (
              <span key={s} className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLE[s] || STATUS_STYLE.NEW}`}>
                {s}: {n}
              </span>
            ))}
          </div>
          <div className="space-y-2">
            {list.map((i) => (
              <div key={i.id} className="rounded-2xl border border-border/50 bg-card/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-bold min-w-0">{i.insight}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${STATUS_STYLE[i.status] || STATUS_STYLE.NEW}`}>
                    {i.status}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Scope {i.scope} · {i.sample_size} observations · predicted {i.expected_pct}% vs observed {i.actual_pct}% · gap {i.effect_pp}pp · evidence level {i.evidence_level}
                  {i.market ? ` · market ${i.market}` : ""}{i.odds_range ? ` · odds ${i.odds_range}` : ""} · sections {i.source_sections}
                </p>
                {i.hypothesis && <p className="text-[10px] text-primary mt-1">HYPOTHESIS: {i.hypothesis}</p>}
                <p className="text-[10px] text-muted-foreground mt-0.5">Next: {i.recommended_action || "backtest → walk-forward → challenger → OOS promotion gate"}</p>
                <p className="text-[10px] text-muted-foreground">
                  Validation: {i.validation_status || "not_tested"} · first seen {i.first_seen_at ? new Date(i.first_seen_at).toLocaleDateString() : "—"} · updated {i.updated_at ? new Date(i.updated_at).toLocaleString() : "—"}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}