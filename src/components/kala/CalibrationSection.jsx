import React from "react";
import { Scale } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/kala/Bits";
import { calibrationBuckets, sampleLabel } from "@/lib/kala";

// CALIBRATION — expected vs actual wins per probability bucket, straight from
// the immutable graded ledger. Overconfidence warnings are shown, never hidden.
export default function CalibrationSection({ preds }) {
  const buckets = calibrationBuckets(preds);
  const graded = (preds || []).filter((r) => ["won", "lost"].includes(r.status));
  return (
    <SectionCard
      title="CALIBRATION"
      icon={<Scale className="w-4 h-4 text-primary" />}
      sub={`Expected wins come from the recorded pre-kickoff probabilities; actual wins from real final scores. ${graded.length ? sampleLabel(graded.length) : "No settled predictions yet."}`}
    >
      {buckets.length === 0 ? (
        <EmptyState>NO SETTLED DATA YET — calibration cannot be measured until predictions are graded from real results. Nothing is invented.</EmptyState>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 text-[9px] uppercase tracking-wide text-muted-foreground px-3 pb-1">
            <span>Bucket</span><span>N</span><span>Expected</span><span>Actual</span><span className="text-right">Diff</span>
          </div>
          {buckets.map((b) => (
            <div key={b.label} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center text-[11px] px-3 py-2 rounded-xl bg-secondary/40 border border-border/40">
              <span className="font-bold min-w-0">{b.label} <span className="text-[9px] text-muted-foreground block">{b.sample}</span></span>
              <span>{b.n}</span>
              <span className="text-muted-foreground">{b.expectedRate}%</span>
              <span>{b.actualRate}%</span>
              <span className={`text-right font-extrabold ${b.diffPct < -5 ? "text-amber-300" : b.diffPct > 5 ? "text-sky-300" : "text-emerald-300"}`}>
                {b.diffPct > 0 ? "+" : ""}{b.diffPct}pp
              </span>
            </div>
          ))}
          {buckets.some((b) => b.diffPct < -5 && b.n >= 10) && (
            <p className="text-[11px] text-amber-300">
              ⚠ MODEL OVERCONFIDENCE WARNING — actual wins trail expected wins in at least one bucket. The engine's reliability correction learns from exactly this gap.
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Example read: an 80–89% bucket showing 78% actual vs 84% expected means the model is overconfident there. Buckets under 30 predictions carry {sampleLabel(1)} weight.
          </p>
        </div>
      )}
    </SectionCard>
  );
}