import React from "react";
import { HeartPulse } from "lucide-react";
import { SectionCard, Stat } from "@/components/kala/Bits";
import { kalaAnalytics, groupBy, sampleLabel, agreementLabel } from "@/lib/kala";

// MODEL HEALTH — honest self-measurement of the production model, with drift
// detection and sample-size protection. Health warnings are shown, not hidden.
export default function ModelHealthSection({ preds, board }) {
  const a = kalaAnalytics(preds);
  const graded = (preds || []).filter((r) => ["won", "lost"].includes(r.status));
  const sorted = [...graded].sort((x, y) => new Date(y.settled_at || 0) - new Date(x.settled_at || 0));
  const recent = sorted.slice(0, 30);
  const overallRate = a.winRate;
  const recentRate = recent.length
    ? Math.round((recent.filter((r) => r.status === "won").length / recent.length) * 1000) / 10
    : null;
  const drift = recentRate != null && overallRate != null ? Math.round((recentRate - overallRate) * 10) / 10 : null;
  const avgAgreement = (preds || []).length
    ? Math.round(((preds || []).reduce((s, r) => s + (r.agreement || 0), 0) / preds.length) * 100)
    : null;
  const pricedRatio = (preds || []).length
    ? Math.round((preds.filter((r) => (r.market_odds || 0) > 1).length / preds.length) * 100)
    : null;

  const warning =
    a.graded >= 30 && ((drift != null && drift <= -15) || (a.calErr != null && Math.abs(a.calErr) > 10));

  return (
    <SectionCard
      title="MODEL HEALTH"
      icon={<HeartPulse className="w-4 h-4 text-primary" />}
      sub={`Production model: KALA-MASTER-1.0 · core ensemble RX-2.0. ${a.graded ? a.sample : "No settled predictions yet — health cannot be judged from zero data."}`}
    >
      {warning && (
        <p className="text-[11px] font-bold text-amber-300 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2">
          ⚠ MODEL HEALTH WARNING — recent win rate or calibration error has deteriorated vs the long-term record. Treat current picks with extra caution; no automatic model change happens without sufficient sample.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="SETTLED SAMPLE" value={a.graded} hint={a.graded ? a.sample : ""} />
        <Stat label="CALIBRATION ERROR" value={a.calErr != null ? `${a.calErr > 0 ? "+" : ""}${a.calErr}pp` : "—"} hint="avg recorded prob − outcome" />
        <Stat label="BRIER / LOG LOSS" value={a.brier != null ? `${a.brier} / ${a.logloss}` : "—"} />
        <Stat label="RECENT (30) WIN RATE" value={recentRate != null ? `${recentRate}%` : "—"} hint={overallRate != null ? `long-term ${overallRate}%` : ""} />
        <Stat label="DRIFT" value={drift != null ? `${drift > 0 ? "+" : ""}${drift}pp` : "—"} hint="recent vs long-term" tone={drift != null && drift <= -15 ? "text-rose-300" : ""} />
        <Stat label="AVG MODEL AGREEMENT" value={avgAgreement != null ? `${avgAgreement}% · ${agreementLabel((avgAgreement || 0) / 100)}` : "—"} />
        <Stat label="DATA COMPLETENESS" value={pricedRatio != null ? `${pricedRatio}% priced` : "—"} hint="share carrying a real bookmaker price" />
        <Stat label="EDGE REALIZATION" value={a.avgEdge != null ? `${a.avgEdge}pp avg` : "—"} hint="recorded edge on settled priced picks" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">LEAGUE-SPECIFIC PERFORMANCE</p>
          <div className="rounded-2xl border border-border/50 overflow-hidden">
            {groupBy(preds, (r) => r.league).length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2">No settled data yet.</p>
            ) : (
              groupBy(preds, (r) => r.league).map((g) => (
                <div key={g.key} className="flex items-center justify-between gap-2 text-[11px] px-3 py-1.5 border-b border-border/30 last:border-0">
                  <span className="min-w-0 truncate">{g.key}</span>
                  <span className="shrink-0"><b>{g.winRate}%</b> <span className="text-muted-foreground">· {g.settled}</span></span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">MARKET-SPECIFIC PERFORMANCE</p>
          <div className="rounded-2xl border border-border/50 overflow-hidden">
            {groupBy(preds, (r) => r.market_label).length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2">No settled data yet.</p>
            ) : (
              groupBy(preds, (r) => r.market_label).map((g) => (
                <div key={g.key} className="flex items-center justify-between gap-2 text-[11px] px-3 py-1.5 border-b border-border/30 last:border-0">
                  <span className="min-w-0 truncate">{g.key}</span>
                  <span className="shrink-0"><b>{g.winRate}%</b> <span className="text-muted-foreground">· {g.settled}</span></span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-secondary/40 border border-border/50 p-3 space-y-1">
        <p className="text-[11px] font-extrabold">CHALLENGER MODELS</p>
        <p className="text-[10px] text-muted-foreground">
          Champion: <b className="text-primary">KALA-MASTER-1.0</b> (core RX-2.0). No challenger is running right now — a challenger is promoted only after outperforming the champion on a sufficient out-of-sample sample, never automatically from a small one.
        </p>
        <p className="text-[10px] text-muted-foreground">
          WALK-FORWARD: the engine records every prediction before kickoff and grades it later — that is the out-of-sample discipline; the learned calibration and model weights use only settled, pre-recorded history.
        </p>
        {(board?.report?.unavailableData || []).map((d, i) => (
          <p key={i} className="text-[10px] text-muted-foreground">• Not connected: {d}</p>
        ))}
      </div>
    </SectionCard>
  );
}