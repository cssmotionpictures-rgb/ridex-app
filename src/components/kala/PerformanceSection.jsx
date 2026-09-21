import React from "react";
import { BarChart3 } from "lucide-react";
import { SectionCard, Stat } from "@/components/kala/Bits";
import { kalaAnalytics, groupBy, sampleLabel } from "@/lib/kala";

const GroupTable = ({ title, rows }) => (
  <div>
    <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">{title}</p>
    {rows.length === 0 ? (
      <p className="text-xs text-muted-foreground">No settled data yet.</p>
    ) : (
      <div className="rounded-2xl border border-border/50 overflow-hidden">
        {rows.map((g) => (
          <div key={g.key} className="flex items-center justify-between gap-2 text-[11px] px-3 py-1.5 border-b border-border/30 last:border-0">
            <span className="min-w-0 truncate">{g.key}</span>
            <span className="shrink-0 text-muted-foreground">
              <b className="text-foreground">{g.winRate}%</b> · {g.settled} settled
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);

// PERFORMANCE LAB — the engine measured against its own record. Paper staking
// by default; nothing here is presented as guaranteed real profit.
export default function PerformanceSection({ preds, throttled }) {
  const a = kalaAnalytics(preds);
  return (
    <SectionCard
      title="PERFORMANCE LAB"
      icon={<BarChart3 className="w-4 h-4 text-primary" />}
      sub={`Every prediction is permanent and graded from real results. ${a.graded ? a.sample : "No settled predictions yet."}`}
    >
      {throttled && (
        <p className="text-[11px] text-amber-400 font-semibold">
          {(preds || []).length ? "Refreshing…" : "Temporarily unavailable — retrying."}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="TOTAL PREDICTIONS" value={a.graded} hint={a.graded ? a.sample : "awaiting settlement"} />
        <Stat label="WIN RATE" value={a.winRate != null ? `${a.winRate}%` : "—"} hint={`${a.won}W / ${a.graded - a.won}L`} />
        <Stat label="AVG ODDS (PRICED)" value={a.avgOdds ?? "—"} />
        <Stat label="AVG MODEL PROB" value={a.avgProb != null ? `${a.avgProb}%` : "—"} />
        <Stat label="AVG EDGE (PRICED)" value={a.avgEdge != null ? `${a.avgEdge}pp` : "—"} />
        <Stat label="BRIER SCORE" value={a.brier ?? "—"} hint="lower is better" />
        <Stat label="LOG LOSS" value={a.logloss ?? "—"} hint="lower is better" />
        <Stat label="CALIBRATION ERROR" value={a.calErr != null ? `${a.calErr > 0 ? "+" : ""}${a.calErr}pp` : "—"} hint="+ = overconfident" />
        <Stat label="STREAK" value={a.streak ? `${a.streak}W` : "—"} />
        <Stat label="PAPER P/L" value={a.paper.profit !== 0 || a.paper.pricedPicks ? `₦${a.paper.profit.toLocaleString()}` : "—"} hint={`₦1,000/pick · ${a.paper.pricedPicks} priced · PAPER MODE`} tone={a.paper.profit >= 0 ? "text-emerald-300" : "text-rose-300"} />
        <Stat label="PAPER ROI" value={a.paper.roiPct != null ? `${a.paper.roiPct}%` : "—"} hint="paper staking — not real profit" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <GroupTable title="BY LEAGUE" rows={groupBy(preds, (r) => r.league)} />
        <GroupTable title="BY MARKET" rows={groupBy(preds, (r) => r.market_label)} />
        <GroupTable title="BY ODDS RANGE" rows={groupBy(preds, (r) =>
          (r.market_odds || 0) > 1
            ? r.market_odds < 1.5 ? "<1.50" : r.market_odds < 2 ? "1.50–1.99" : r.market_odds < 3 ? "2.00–2.99" : "3.00+"
            : "model only"
        )} />
        <GroupTable title="BY GRADE TIER" rows={groupBy(preds, (r) => String(r.grade || "").toUpperCase().replace(/_/g, " "))} />
        <GroupTable title="BY SESSION" rows={groupBy(preds, (r) => r.session)} />
        <GroupTable title="BY MODEL VERSION" rows={groupBy(preds, (r) => r.model_version)} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        PAPER STAKE: ₦1,000 per selection (default). Sample honesty: {sampleLabel(a.graded)} — percentages from tiny samples prove nothing.
      </p>
    </SectionCard>
  );
}