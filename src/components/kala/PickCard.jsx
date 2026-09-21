import React from "react";
import { Eye, Plus, Check, Star, Lock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GradeBadge, RiskBadge, DqBadge, ResultBadge } from "@/components/kala/Bits";
import { agreementLabel, riskOf } from "@/lib/kala";

// One KALA pick card — every number comes from the ensemble engine's real
// calculations (board pick shape from buildWinRabaBoard / RX-2.0).
export default function PickCard({
  pick, result, inBasket, onToggleBasket, tracked, onToggleTrack, compact,
}) {
  const [open, setOpen] = React.useState(false);
  const kickoffPassed = pick.kickoff && new Date(pick.kickoff).getTime() < Date.now();
  const agreement = agreementLabel(pick.agreement);
  const risk = riskOf(pick.uncertainty ?? 0);
  const priced = (pick.marketOdds || 0) > 1;

  return (
    <div className={`rounded-3xl border p-4 space-y-3 min-w-0 ${
      inBasket ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground truncate">
            {pick.league} · DAY {pick.dayIndex || "—"} · {pick.kickoffLabel} Lagos
          </p>
          <p className="text-sm font-bold truncate">{pick.home} vs {pick.away}</p>
          <p className="text-xs text-primary font-semibold truncate">{pick.marketLabel}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-extrabold leading-none gold-text">{Math.round(pick.masterScore ?? pick.score ?? 0)}</p>
          <p className="text-[9px] text-muted-foreground">KALA SCORE</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-secondary/60 px-1 py-1.5 min-w-0">
          <p className="text-[9px] text-muted-foreground">KALA PROB</p>
          <p className="text-sm font-bold">{Math.round((pick.prob || 0) * 100)}%</p>
        </div>
        <div className="rounded-xl bg-secondary/60 px-1 py-1.5 min-w-0">
          <p className="text-[9px] text-muted-foreground">ODDS</p>
          <p className="text-sm font-bold">
            {priced ? pick.marketOdds.toFixed(2) : "MODEL"}
          </p>
        </div>
        <div className="rounded-xl bg-secondary/60 px-1 py-1.5 min-w-0">
          <p className="text-[9px] text-muted-foreground">EDGE</p>
          <p className={`text-sm font-bold ${pick.edgePct > 0 ? "text-emerald-300" : "text-muted-foreground"}`}>
            {priced ? `${pick.edgePct > 0 ? "+" : ""}${pick.edgePct}pp` : "—"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <GradeBadge grade={pick.grade} />
        <RiskBadge risk={risk} />
        {!priced && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
            MODEL ONLY — NO REAL PRICE
          </span>
        )}
        {kickoffPassed && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-amber-300 inline-flex items-center gap-1">
            <Lock className="w-3 h-3" /> LOCKED
          </span>
        )}
        {result && <ResultBadge status={result} />}
      </div>

      {!compact && (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="rounded-full h-7 px-3 text-[11px]" onClick={() => setOpen((v) => !v)}>
              <Eye className="w-3 h-3 mr-1" /> VIEW ANALYSIS
            </Button>
            {onToggleBasket && (
              <Button size="sm" variant={inBasket ? "default" : "outline"} className="rounded-full h-7 px-3 text-[11px]" onClick={() => onToggleBasket(pick)}>
                {inBasket ? <Check className="w-3 h-3 mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                {inBasket ? "IN ACCA" : "ADD TO ACCA"}
              </Button>
            )}
            {onToggleTrack && (
              <Button size="sm" variant={tracked ? "default" : "outline"} className="rounded-full h-7 px-3 text-[11px]" onClick={() => onToggleTrack(pick)}>
                <Star className={`w-3 h-3 mr-1 ${tracked ? "fill-current" : ""}`} /> {tracked ? "TRACKED" : "TRACK"}
              </Button>
            )}
          </div>

          {open && (
            <div className="rounded-2xl bg-secondary/50 border border-border/50 p-3.5 space-y-3">
              <div>
                <p className="text-[11px] font-extrabold text-primary mb-1">WHY KALA LIKES IT</p>
                <p className="text-xs text-muted-foreground">{pick.explanation?.why}</p>
                <p className="text-xs text-muted-foreground mt-1.5">{pick.explanation?.market}</p>
                <p className="text-xs text-muted-foreground mt-1.5">{pick.explanation?.support}</p>
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-rose-300 mb-1">RISKS</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {(pick.failureModes || []).map((f, i) => <li key={i}>• {f}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">
                  MODEL AGREEMENT: {agreement} · {pick.voting || 0} independent models · {pick.dataQuality}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(pick.perModel || {}).map(([k, p]) => (
                    <div key={k} className="flex items-center justify-between text-[10px] rounded-lg bg-background/50 px-2 py-1">
                      <span className="text-muted-foreground truncate">{k}</span>
                      <span className="font-bold">{Math.round(p * 100)}%</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-muted-foreground">
                  <span>FAIR ODDS {pick.fairOdds ? pick.fairOdds.toFixed(2) : "—"} (estimate, never a bookmaker price)</span>
                  {priced && <span className="inline-flex items-center gap-0.5"><TrendingUp className="w-3 h-3" /> EV {pick.evPct > 0 ? "+" : ""}{pick.evPct}%</span>}
                  {pick.pinnacle > 1.01 && <span>PINNACLE {pick.pinnacle.toFixed(2)}</span>}
                </div>
                <div className="mt-2"><DqBadge dq={pick.qualityLabel} /></div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}