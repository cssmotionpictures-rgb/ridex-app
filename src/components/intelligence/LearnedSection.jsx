import React from "react";
import { BookOpenCheck } from "lucide-react";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { learnedReport } from "@/lib/globalLearning/insights";
import { summaryOf } from "@/lib/globalLearning/analysis";

const EVIDENCE_LABEL = {
  0: "LEVEL 0 — no evidence",
  1: "LEVEL 1 — backtest grade",
  2: "LEVEL 2 — early forward evidence",
  3: "LEVEL 3 — meaningful forward evidence",
  4: "LEVEL 4 — strong OOS evidence",
  5: "LEVEL 5 — mature validated evidence",
};

export default function LearnedSection({ insights, rows }) {
  const totals = summaryOf(rows || []);
  const report = learnedReport(insights, totals);

  return (
    <SectionCard
      title="WHAT RIDE X LEARNED"
      icon={<BookOpenCheck className="w-4 h-4 text-primary" />}
      sub="Every finding below is real evidence from settled predictions across ALL sections — and every one is a HYPOTHESIS until it survives backtest, walk-forward and out-of-sample validation."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="SETTLED EVIDENCE" value={totals.settled} hint={`${totals.won}W / ${totals.lost}L across every section`} />
        <Stat label="ACTIVE FINDINGS" value={report.findings.length} hint="patterns with sufficient sample + material gap" />
        <Stat label="VALIDATED" value={insights.filter((i) => i.status === "VALIDATED").length} hint="passed the full validation chain" />
        <Stat label="PRODUCTION CHANGES" value={report.whatChanged.length} hint="implemented — always via the changelog" tone={report.whatChanged.length ? "text-emerald-300" : ""} />
      </div>

      {report.whatChanged.length > 0 ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-3">
          <p className="text-[11px] font-extrabold text-emerald-300">WHAT CHANGED</p>
          {report.whatChanged.map((c, i) => (
            <p key={i} className="text-[10px] text-muted-foreground">• {c}</p>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-secondary/40 p-3">
          <p className="text-[11px] font-extrabold">WHAT CHANGED</p>
          <p className="text-[10px] text-muted-foreground">Nothing — no hypothesis has passed the promotion gate yet. That is the correct state, not a failure.</p>
        </div>
      )}

      {report.findings.length === 0 ? (
        <EmptyState>No recurring pattern has enough settled evidence yet (each finding needs 20+ graded predictions with a material calibration gap). The engine keeps collecting — it does not invent lessons.</EmptyState>
      ) : (
        <div className="space-y-2">
          {report.findings.map((f, i) => (
            <div key={i} className="rounded-2xl border border-border/50 bg-secondary/30 p-3">
              <p className="text-[11px] font-bold">"{f.text}"</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Evidence: {f.sample} observations · {EVIDENCE_LABEL[f.evidence] || EVIDENCE_LABEL[0]} · scope {f.scope} · status {f.status}
              </p>
              <p className="text-[10px] text-primary mt-1">HYPOTHESIS: {f.hypothesis}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Production status: NOT PROMOTED — awaiting backtest → walk-forward → OOS validation.</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">{report.noChangesNote}</p>
    </SectionCard>
  );
}