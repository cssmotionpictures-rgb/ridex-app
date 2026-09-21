import React from "react";
import { RiskBadge, ResultBadge } from "@/components/kala/Bits";
import { tierOfMonster, riskOfMonster, shortExplanation } from "@/lib/monsterBoard";

// The customer-facing MONSTER selection card — match, competition, kickoff,
// selection, odds, confidence, risk and a short understandable explanation.
// Nothing about the internal engine is ever shown.
const TIER_STYLES = {
  "MONSTER ELITE": "bg-amber-400/15 text-amber-300 border-amber-400/40",
  "MONSTER STRONG": "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  "MONSTER WATCH": "bg-secondary text-muted-foreground border-border",
};

export default function MonsterPickCard({ pick, rank, correlation, result, watch = false }) {
  const p = pick;
  const score = p.masterScore ?? p.score ?? 0;
  const tier = watch ? "MONSTER WATCH" : tierOfMonster(score);
  const priced = (p.marketOdds || 0) > 1;
  const conf = p.confidence ?? Math.round((p.prob || 0) * 100);
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4 space-y-2.5 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-extrabold truncate min-w-0">
          {rank ? `#${rank} · ` : ""}{p.home} vs {p.away}
        </p>
        <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${TIER_STYLES[tier]}`}>
          {tier}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
        <span className="truncate">{p.league} · KICKOFF {p.kickoffLabel} LAGOS</span>
        {result && <ResultBadge status={result} />}
      </p>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-primary truncate">{p.marketLabel}</p>
          <p className="text-[10px] text-muted-foreground">SELECTION · {conf}% CONFIDENCE</p>
        </div>
        <div className="text-right shrink-0">
          {priced ? (
            <>
              <p className="text-lg font-extrabold leading-tight">{p.marketOdds.toFixed(2)}</p>
              <p className="text-[9px] text-muted-foreground">REAL PRICE{p.bookmaker ? ` · ${p.bookmaker}` : ""}</p>
            </>
          ) : (
            <>
              <p className="text-lg font-extrabold leading-tight text-muted-foreground">—</p>
              <p className="text-[9px] text-muted-foreground">NO REAL PRICE AVAILABLE</p>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <RiskBadge risk={riskOfMonster(p)} />
        {correlation && correlation !== "LOW" && <RiskBadge risk={`${correlation} CORRELATION`} />}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{shortExplanation(p)}</p>
    </div>
  );
}