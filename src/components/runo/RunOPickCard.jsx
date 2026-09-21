import React from "react";
import { ChevronDown, ChevronUp, Copy, Check, Lock } from "lucide-react";
import { agreementLabel, riskOf } from "@/lib/kala";
import { tierOf, whyRunO, riskFlagsOf } from "@/lib/runO";
import { ResultBadge } from "@/components/kala/Bits";

// One RUN O selection card — every number comes from the RX-2.0 ensemble's
// real calculations. HIGHEST CONFIDENCE language only, never a guarantee.
const TIER_STYLES = {
  "RUN O ULTRA ELITE": "bg-amber-400/20 text-amber-200 border-amber-400/50",
  "RUN O ELITE": "bg-amber-400/10 text-amber-200 border-amber-400/30",
  "RUN O STRONG": "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  "RUN O QUALIFIED": "bg-sky-400/10 text-sky-300 border-sky-400/30",
};

function Cell({ label, value, tone = "" }) {
  return (
    <div className="rounded-xl bg-secondary/60 px-1 py-1.5 min-w-0 text-center">
      <p className="text-[9px] text-muted-foreground truncate">{label}</p>
      <p className={`text-sm font-bold truncate ${tone}`}>{value}</p>
    </div>
  );
}

export default function RunOPickCard({ pick, rank, correlation, enrichment, result }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const score = pick.masterScore ?? pick.score ?? 0;
  const tier = tierOf(score);
  const en = enrichment || {};
  const priced = (pick.marketOdds || 0) > 1;
  const kickoffPassed = pick.kickoff && new Date(pick.kickoff).getTime() < Date.now();
  const injury = en.injuryStatus === "matched"
    ? `CONFIRMED ABSENCES — ${en.absHome || 0}+${en.absAway || 0}`
    : "INJURY DATA UNKNOWN";
  const lineup = en.lineupStatus === "confirmed" ? "LINEUP CONFIRMED" : "LINEUP UNCONFIRMED";
  const corrTone = { LOW: "text-emerald-300", MEDIUM: "text-amber-300", HIGH: "text-rose-300" }[correlation] || "";

  const copyLeg = async () => {
    try {
      await navigator.clipboard.writeText(
        `${pick.home} vs ${pick.away} — ${pick.marketLabel} @ ${priced ? pick.marketOdds.toFixed(2) : "model-only"}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — silent */ }
  };

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4 space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground truncate">
            RUN O #{rank} · {pick.league} · {pick.kickoffLabel} LAGOS · DAY {pick.dayIndex || "—"}
          </p>
          <p className="text-sm font-bold truncate">{pick.home} vs {pick.away}</p>
          <p className="text-xs text-primary font-semibold truncate">SELECTION: {pick.marketLabel}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-extrabold leading-none gold-text">{Math.round(score)}</p>
          <p className="text-[9px] text-muted-foreground">RUN O SCORE</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Cell label="VERIFIED ODDS" value={priced ? pick.marketOdds.toFixed(2) : "MODEL ONLY"} />
        <Cell label="CONFIDENCE ESTIMATE" value={`${Math.round((pick.prob || 0) * 100)}%`} />
        <Cell label="MARKET VIEW" value={priced ? `${Math.round((pick.marketProbability || 0) * 100)}%` : "—"} />
        <Cell label="FAIR ODDS" value={pick.fairOdds ? pick.fairOdds.toFixed(2) : "—"} />
        <Cell
          label="EDGE"
          value={priced ? `${(pick.edgePct || 0) > 0 ? "+" : ""}${pick.edgePct}pp` : "—"}
          tone={priced && (pick.edgePct || 0) > 0 ? "text-emerald-300" : ""}
        />
        <Cell label="CONFIDENCE" value={`${Math.round(pick.confidence || 0)}%`} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${TIER_STYLES[tier] || ""}`}>
          {tier}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
          DATA QUALITY: {pick.qualityLabel || pick.quality || "—"}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
          CONSENSUS: {agreementLabel(pick.agreement)} · RISK {riskOf(pick.uncertainty ?? 0)}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border border-border ${corrTone}`}>
          CORRELATION RISK: {correlation || "LOW"}
        </span>
        {kickoffPassed && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-amber-300 inline-flex items-center gap-1">
            <Lock className="w-3 h-3" /> LOCKED
          </span>
        )}
        {result && <ResultBadge status={result} />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-border px-3 py-1.5 text-[11px] font-bold inline-flex items-center"
        >
          {open ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          WHY RUN O SELECTED IT
        </button>
        <button
          type="button"
          onClick={copyLeg}
          className="rounded-full border border-border px-3 py-1.5 text-[11px] font-bold inline-flex items-center"
        >
          {copied ? <Check className="w-3 h-3 mr-1 text-emerald-300" /> : <Copy className="w-3 h-3 mr-1" />}
          {copied ? "COPIED" : "COPY FOR CASHOUT INTEL"}
        </button>
      </div>

      {open && (
        <div className="rounded-2xl bg-secondary/50 border border-border/50 p-3.5 space-y-3">
          <div>
            <p className="text-[11px] font-extrabold text-primary mb-1">WHY RUN O SELECTED IT — EVIDENCE ONLY</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {whyRunO(pick).map((r, i) => <li key={i}>• {r}</li>)}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-extrabold text-rose-300 mb-1">RISK FLAGS</p>
            {riskFlagsOf(pick).length ? (
              <ul className="text-xs text-muted-foreground space-y-1">
                {riskFlagsOf(pick).map((f, i) => <li key={i}>• {f}</li>)}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No risk flags recorded on this selection.</p>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            INJURY: {injury} · LINEUP: {lineup} — missing information is always disclosed, never invented.
          </p>
        </div>
      )}
    </div>
  );
}