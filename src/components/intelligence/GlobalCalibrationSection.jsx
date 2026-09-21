import React from "react";
import { Gauge } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/kala/Bits";
import { calibrationBuckets, groupBy, isGraded } from "@/lib/globalLearning/analysis";

const r1 = (x) => (x == null ? "—" : x);

function BucketTable({ title, rows }) {
  return (
    <div>
      <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">{title}</p>
      <div className="rounded-2xl border border-border/50 overflow-x-auto">
        <div className="grid grid-cols-6 gap-1 px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60 min-w-[480px]">
          <span>BUCKET</span><span>N</span><span>PREDICTED</span><span>ACTUAL</span><span>GAP</span><span>BRIER</span>
        </div>
        {rows.map((b) => (
          <div key={b.bucket} className="grid grid-cols-6 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30 min-w-[480px]">
            <span className="font-bold">{b.bucket}</span>
            <span>{b.n}</span>
            <span>{r1(b.expected)}%</span>
            <span>{r1(b.actual)}%</span>
            <span className={b.gap != null && Math.abs(b.gap) >= 8 ? "text-amber-300 font-bold" : ""}>{b.gap != null ? `${b.gap > 0 ? "+" : ""}${b.gap}pp` : "—"}</span>
            <span>{r1(b.brier)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GlobalCalibrationSection({ rows }) {
  const all = rows || [];
  const graded = all.filter((r) => isGraded(r.status));
  if (!graded.length) {
    return (
      <SectionCard title="GLOBAL CALIBRATION" icon={<Gauge className="w-4 h-4 text-primary" />} sub="Predicted probability vs observed frequency across the entire ecosystem.">
        <EmptyState>No graded predictions yet — calibration cannot be claimed from zero data.</EmptyState>
      </SectionCard>
    );
  }
  const buckets = calibrationBuckets(all);
  const byInjury = Object.entries(groupBy(graded, (r) => (r.injury_status ? `injury ${r.injury_status}` : null)));
  const byLineup = Object.entries(groupBy(graded, (r) => (r.lineup_status ? `lineup ${r.lineup_status}` : null)));

  return (
    <SectionCard
      title="GLOBAL CALIBRATION — PREDICTED VS OBSERVED, EVERYWHERE"
      icon={<Gauge className="w-4 h-4 text-primary" />}
      sub="'RIDE X says 80–89% but these win only 72%' is exactly the kind of learning evidence this table produces — per bucket, per injury state, per lineup state, across every section."
    >
      <BucketTable title="ALL PREDICTIONS (graded)" rows={buckets} />
      {byInjury.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-2">
          {byInjury.map(([k, list]) => {
            const b = calibrationBuckets(list).filter((x) => x.n > 0);
            const avgExp = list.length ? Math.round((list.reduce((s, r) => s + (r.probability || 0), 0) / list.length) * 1000) / 10 : null;
            const avgAct = Math.round((list.filter((r) => r.status === "won").length / list.length) * 1000) / 10;
            return (
              <div key={k} className="rounded-2xl bg-secondary/40 border border-border/50 p-3">
                <p className="text-[11px] font-extrabold capitalize">{k}</p>
                <p className="text-[10px] text-muted-foreground">{list.length} graded · predicted {avgExp}% vs observed {avgAct}% · gap {Math.round((avgAct - avgExp) * 10) / 10}pp</p>
              </div>
            );
          })}
        </div>
      )}
      {byLineup.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-2">
          {byLineup.map(([k, list]) => {
            const avgExp = list.length ? Math.round((list.reduce((s, r) => s + (r.probability || 0), 0) / list.length) * 1000) / 10 : null;
            const avgAct = Math.round((list.filter((r) => r.status === "won").length / list.length) * 1000) / 10;
            return (
              <div key={k} className="rounded-2xl bg-secondary/40 border border-border/50 p-3">
                <p className="text-[11px] font-extrabold capitalize">{k}</p>
                <p className="text-[10px] text-muted-foreground">{list.length} graded · predicted {avgExp}% vs observed {avgAct}% · gap {Math.round((avgAct - avgExp) * 10) / 10}pp</p>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Buckets with fewer than 20 settled rows are directional only — the learning queue requires a real sample before any pattern becomes a hypothesis.
      </p>
    </SectionCard>
  );
}