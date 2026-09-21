import React from "react";
import { CheckCircle2, XCircle, Ban, RefreshCw, ChevronDown, ShieldAlert } from "lucide-react";

const RESULT = {
  won: { icon: CheckCircle2, cls: "text-emerald-400", label: "WON" },
  lost: { icon: XCircle, cls: "text-rose-400", label: "LOST" },
  void: { icon: Ban, cls: "text-muted-foreground", label: "VOID" },
  cancelled: { icon: Ban, cls: "text-muted-foreground", label: "CANCELLED" },
  superseded: { icon: RefreshCw, cls: "text-sky-400", label: "UPDATED" },
};

const GRADE_CLS = {
  "ULTRA ELITE": "bg-amber-400/15 text-amber-300 border-amber-400/40",
  ELITE: "bg-yellow-400/15 text-yellow-300 border-yellow-400/40",
  STRONG: "bg-emerald-400/15 text-emerald-300 border-emerald-400/40",
  QUALIFYING: "bg-sky-400/15 text-sky-300 border-sky-400/40",
  WATCH: "bg-secondary text-muted-foreground border-border",
};

// One WIN RABA selection — every field the spec demands on one row: match,
// kickoff (Lagos), market, pick, real odds, calibrated probability, market
// probability, edge, master score, grade, and a non-black-box explanation of
// why the model likes it and what could make it fail.
export default function PickRow({ pick, result }) {
  const r = result ? RESULT[result] : null;
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{pick.home} vs {pick.away}</p>
          <p className="text-[11px] text-muted-foreground truncate">{pick.league}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-primary tabular-nums">{pick.kickoffLabel}</p>
          <p className="text-[10px] text-muted-foreground">Lagos time</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-primary/15 text-primary text-xs font-bold px-2.5 py-1">
          {pick.marketLabel}
        </span>
        {pick.grade && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${GRADE_CLS[pick.grade] || GRADE_CLS.WATCH}`}>
            {pick.grade}
          </span>
        )}
        {pick.masterScore != null && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold tabular-nums">
            MASTER {pick.masterScore}
          </span>
        )}
        {pick.marketOdds > 1 ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] tabular-nums">
            {pick.marketOdds.toFixed(2)} · {pick.bookmaker}
          </span>
        ) : (
          <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            MODEL ONLY — no live bookmaker price
          </span>
        )}
        {r && (
          <span className={`inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold ${r.cls}`}>
            <r.icon className="w-3 h-3" /> {r.label}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl bg-secondary/60 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Confidence</p>
          <p className="text-sm font-bold tabular-nums">{pick.confidence}%</p>
        </div>
        <div className="rounded-xl bg-secondary/60 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Model prob</p>
          <p className="text-sm font-bold tabular-nums">{Math.round(pick.prob * 100)}%</p>
        </div>
        <div className="rounded-xl bg-secondary/60 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Market prob</p>
          <p className="text-sm font-bold tabular-nums">
            {pick.marketProbability > 0 ? `${Math.round(pick.marketProbability * 100)}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-secondary/60 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Edge</p>
          <p className={`text-sm font-bold tabular-nums ${pick.edgePct > 0 ? "text-emerald-400" : pick.marketOdds > 1 ? "text-rose-400" : ""}`}>
            {pick.marketOdds > 1 ? `${pick.edgePct > 0 ? "+" : ""}${pick.edgePct.toFixed(1)} pts` : "—"}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {pick.dataQuality}
        {pick.agreement != null ? ` · models ${Math.round(pick.agreement * 100)}% in agreement` : ""}
      </p>

      {pick.explanation && (
        <div className="rounded-xl border border-border/60">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold text-primary"
          >
            WHY THIS PICK
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="px-3 pb-3 space-y-2 text-[11px] leading-relaxed">
              <p className="text-foreground/90">{pick.explanation.why}</p>
              <p className="text-muted-foreground">{pick.explanation.market}</p>
              <p className="text-muted-foreground">{pick.explanation.support}</p>
              {pick.failureModes?.length > 0 && (
                <div className="rounded-lg bg-secondary/50 p-2 space-y-1">
                  <p className="flex items-center gap-1 font-bold text-amber-300">
                    <ShieldAlert className="w-3 h-3" /> WHAT COULD MAKE IT FAIL
                  </p>
                  {pick.failureModes.map((f, i) => (
                    <p key={i} className="text-muted-foreground">• {f}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}