import React from "react";
import { Scale } from "lucide-react";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import {
  marketObservations,
  disagreementStats,
  tennisCalibrationTrack,
} from "@/lib/globalLearning/marketModel";

// MODEL vs MARKET — the model-vs-market observation dashboard. Only REAL
// captured bookmaker prices create observations here (model fair odds are
// never shown or counted as prices), every metric is sample-gated with
// honest labels, and nothing in this view claims predictive edge from a
// tiny sample.
const dash = (v) => (v == null ? "—" : String(v));

const bandTone = (band) =>
  ({
    "CLOSE AGREEMENT": "text-emerald-300",
    "MODERATE DISAGREEMENT": "text-sky-300",
    "HIGH DISAGREEMENT": "text-amber-300",
    "EXTREME DISAGREEMENT": "text-rose-300",
  })[band] || "text-muted-foreground";

const EvidenceChip = ({ label }) => (
  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-border bg-secondary text-muted-foreground whitespace-nowrap">
    {label}
  </span>
);

const BreakdownTable = ({ title, keyLabel, rows }) => (
  <div>
    <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">{title}</p>
    <div className="rounded-2xl border border-border/50 overflow-hidden">
      <div className="grid grid-cols-7 gap-1 px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60">
        <span className="col-span-2">{keyLabel}</span>
        <span>N</span>
        <span>SETTLED</span>
        <span>AVG Δpp</span>
        <span>WIN %</span>
        <span>STATE</span>
      </div>
      {rows.length === 0 && <div className="px-3 py-2 text-[11px] text-muted-foreground">No observations yet.</div>}
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-7 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30 items-center">
          <span className="col-span-2 truncate">{r.key}</span>
          <span>{r.n}</span>
          <span>{r.settled}</span>
          <span>{dash(r.avgDiff)}</span>
          <span>{dash(r.winRate)}</span>
          <EvidenceChip label={r.evidence} />
        </div>
      ))}
    </div>
  </div>
);

export default function ModelVsMarketSection({ rows }) {
  const obs = React.useMemo(() => marketObservations(rows || []), [rows]);
  const stats = React.useMemo(() => disagreementStats(obs), [obs]);
  const tennis = React.useMemo(() => tennisCalibrationTrack(obs), [obs]);

  if (!obs.length) {
    return (
      <SectionCard
        title="MODEL vs MARKET"
        icon={<Scale className="w-4 h-4 text-primary" />}
        sub="RIDE X probability estimates measured against real captured bookmaker prices — model fair odds are never counted as prices."
      >
        <EmptyState>
          No predictions with verified bookmaker prices are on record yet. Model fair odds are estimates and never shown or
          stored as bookmaker prices — only real captured prices create observations here.
        </EmptyState>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="MODEL vs MARKET"
      icon={<Scale className="w-4 h-4 text-primary" />}
      sub="RIDE X probability estimates measured against real captured bookmaker prices — observation and evidence only. Disagreement is never auto-rejected or auto-accepted; it accumulates as learning evidence."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="PRICED PREDICTIONS" value={stats.total} hint={`${stats.settled} settled`} />
        <Stat label="AGREEMENT RATE" value={stats.agreementRate == null ? "—" : `${stats.agreementRate}%`} hint="share in CLOSE AGREEMENT" />
        <Stat label="AVG DISAGREEMENT" value={stats.avgDiff == null ? "—" : `${stats.avgDiff > 0 ? "+" : ""}${stats.avgDiff}pp`} hint="model − market implied" />
        <Stat label="LARGEST DISAGREEMENT" value={stats.largestDiff == null ? "—" : `${stats.largestDiff}pp`} hint="absolute, any observation" tone="text-amber-300" />
      </div>

      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">RESULTS BY DISAGREEMENT BAND</p>
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <div className="grid grid-cols-9 gap-1 px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60">
            <span className="col-span-2">BAND</span><span>N</span><span>SETTLED</span><span>MODEL %</span><span>MARKET %</span><span>WIN %</span><span>BRIER</span><span>STATE</span>
          </div>
          {stats.byBand.map((b) => (
            <div key={b.band} className="grid grid-cols-9 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30 items-center">
              <span className={`col-span-2 font-extrabold ${bandTone(b.band)}`}>{b.band}</span>
              <span>{b.n}</span>
              <span>{b.settled}</span>
              <span>{dash(b.avgModelProb)}</span>
              <span>{dash(b.avgMarketProb)}</span>
              <span>{dash(b.winRate)}</span>
              <span>{dash(b.brier)}</span>
              <EvidenceChip label={b.evidence} />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          ROI and CLV are shown only inside a band with a sufficient settled sample. A band is never presented as proof of
          predictive edge — every band needs the full validation chain before anything changes.
        </p>
      </div>

      <BreakdownTable title="BY SPORT" keyLabel="SPORT" rows={stats.bySport} />
      <BreakdownTable title="BY MARKET" keyLabel="MARKET FAMILY" rows={stats.byMarketFamily} />
      <BreakdownTable title="BY PREDICTION SECTION" keyLabel="SECTION" rows={stats.bySection} />

      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">TENNIS CALIBRATION TRACK — {tennis.settled} SETTLED</p>
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <div className="grid grid-cols-8 gap-1 px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60">
            <span>MODEL BAND</span><span>N</span><span>EXPECTED</span><span>ACTUAL</span><span>CAL ERR</span><span>BRIER</span><span>LOG LOSS</span><span>STATE</span>
          </div>
          {tennis.byBand.map((b) => (
            <div key={b.band} className="grid grid-cols-8 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30 items-center">
              <span>{b.band}</span>
              <span>{b.n}</span>
              <span>{dash(b.expected)}</span>
              <span>{dash(b.actual)}</span>
              <span>{dash(b.calErr)}</span>
              <span>{dash(b.brier)}</span>
              <span>{dash(b.logloss)}</span>
              <EvidenceChip label={b.evidence} />
            </div>
          ))}
        </div>
        <ul className="text-[10px] text-muted-foreground mt-1 space-y-0.5 list-disc pl-4">
          {tennis.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Model probability, model fair odds, confidence and model version stay permanently separate from bookmaker price,
        source and implied probability. Missing, mismatched or invalid prices are flagged, never manufactured — and closing
        prices are only used when genuinely captured.
      </p>
    </SectionCard>
  );
}