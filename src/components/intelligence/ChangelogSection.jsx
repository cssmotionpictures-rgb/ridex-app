import React from "react";
import { History } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/kala/Bits";

const DECISION_STYLE = {
  PROMOTED: "text-emerald-300",
  NOT_PROMOTED: "text-amber-300",
  ROLLED_BACK: "text-rose-300",
  PROPOSED: "text-sky-300",
};

export default function ChangelogSection({ changelog }) {
  const list = changelog || [];
  return (
    <SectionCard
      title="MODEL CHANGELOG — NO SILENT CHANGES"
      icon={<History className="w-4 h-4 text-primary" />}
      sub="Every production model change, with its old version, new version, reason, evidence and rollback version. An empty changelog means nothing has passed the promotion gate — the honest state while evidence accumulates."
    >
      {list.length === 0 ? (
        <EmptyState>No production model changes. Nothing has been promoted — no hypothesis has survived backtest, walk-forward and out-of-sample validation yet. Failed models are never deleted; they roll back to the previous verified champion.</EmptyState>
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border/50 bg-card/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-bold">
                  {c.previous_version} → {c.new_version} <span className="text-muted-foreground">({c.scope})</span>
                </p>
                <span className={`text-[10px] font-extrabold ${DECISION_STYLE[c.decision] || ""}`}>{c.decision}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">CHANGE: {c.change}</p>
              <p className="text-[10px] text-muted-foreground">REASON: {c.reason}</p>
              <p className="text-[10px] text-muted-foreground">
                Evidence: {c.sample_size} OOS observations · Brier {c.brier_before} → {c.brier_after} · log loss {c.logloss_before} → {c.logloss_after} · {c.oos_result || "no OOS result recorded"}
              </p>
              <p className="text-[10px] text-muted-foreground">Rollback version: {c.rollback_version || "—"} · {c.changed_at ? new Date(c.changed_at).toLocaleString() : ""}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}