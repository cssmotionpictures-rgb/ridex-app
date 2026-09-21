import React from "react";
import { ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LegMatchContext from "@/components/sports/LegMatchContext";
import MatchPoster from "@/components/sports/MatchPoster";
import { teamColors } from "@/lib/teamStyle";

// One slip leg row — TAP IT to open the full prediction detail: the main
// pick, every padding pick, the verified corner line and the complete deep
// analysis (verified form on both sides, head-to-head, scoring rates) behind
// the pick. Works for every slip (SPECIAL ODDS, CHOP EBA, SUGAR, DRINK 7UP).

function PickBlock({ tag, label, prob, highlight }) {
  return (
    <div className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${highlight ? "border-primary/40 bg-primary/10" : "border-border/50 bg-secondary/30"}`}>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{tag}</p>
        <p className={`font-semibold truncate text-[11px] ${highlight ? "text-primary" : ""}`}>{label}</p>
      </div>
      <p className={`font-heading font-extrabold shrink-0 ${highlight ? "text-primary text-lg" : "text-sm"}`}>{Math.round((Number(prob) || 0) * 100)}%</p>
    </div>
  );
}

export default function LegRow({ leg, index, odds, meta }) {
  const [open, setOpen] = React.useState(false);
  const prob = Number(leg.prob ?? leg.probability) || 0;
  const reasons = (Array.isArray(leg.reasons) ? leg.reasons : []).filter(Boolean);
  const rowOdds = Number(odds ?? leg.odds ?? leg.fairOdds) || 1;
  const [homeC] = teamColors(leg.home || "");
  const [awayC] = teamColors(leg.away || "");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-secondary/40 transition-colors"
      >
        <span className="w-4 h-4 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0 text-[9px]">{index + 1}</span>
        <span
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ background: `linear-gradient(180deg, ${homeC} 0%, ${homeC} 45%, ${awayC} 55%, ${awayC} 100%)` }}
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{leg.home} vs {leg.away}</p>
          <p className="text-[9px] text-muted-foreground truncate">{meta}</p>
        </div>
        <span className="font-bold text-primary shrink-0">{rowOdds >= 100 ? Math.round(rowOdds).toLocaleString() : rowOdds.toFixed(2)}</span>
        <ChevronRight className="w-3 h-3 text-muted-foreground/70 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl max-w-[92vw]">
          <DialogHeader className="text-left">
            <DialogTitle className="text-sm pr-6 leading-snug">{leg.home} vs {leg.away}</DialogTitle>
            <DialogDescription className="text-[10px]">{[leg.date, leg.league].filter(Boolean).join(" · ")}</DialogDescription>
          </DialogHeader>
          <MatchPoster home={leg.home} away={leg.away} league={leg.league} date={leg.date} live={leg.live} />
          <div className="space-y-2">
            {leg.marketLabel && <PickBlock tag="Main pick — model confidence" label={leg.marketLabel} prob={prob} highlight />}
            {leg.companion && <PickBlock tag="Padding pick (verified)" label={leg.companion.label} prob={leg.companion.prob} />}
            {leg.companion2 && <PickBlock tag="2nd padding pick (verified)" label={leg.companion2.label} prob={leg.companion2.prob} />}
            {leg.corners && <PickBlock tag="Corner line — verified corner feed" label={leg.corners.label} prob={leg.corners.prob} />}
            {leg.h2h && (
              <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 text-[11px]">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Head-to-head — meetings on record</p>
                <p className="font-semibold">{leg.h2h}</p>
              </div>
            )}
            {leg.realOdds && !leg.realOdds.status ? (
              <div className="rounded-xl border border-primary/50 bg-primary/10 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] uppercase tracking-wider font-bold text-primary">Real bookmaker odds</p>
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">VERIFIED FEED</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground truncate">
                    {leg.realOdds.bookmaker} · {leg.realOdds.timestamp ? new Date(leg.realOdds.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                  <p className="font-heading font-extrabold text-primary text-lg leading-none">{leg.realOdds.price.toFixed(2)}</p>
                </div>
                <p className="text-[9px] text-muted-foreground leading-relaxed">
                  Bookmaker implied {Math.round((leg.realOdds.implied || 0) * 100)}% · model fair odds {leg.realOdds.fair} · edge {leg.realOdds.edgePct >= 0 ? "+" : ""}{leg.realOdds.edgePct} pts · EV {leg.realOdds.evPct >= 0 ? "+" : ""}{leg.realOdds.evPct}%
                  {leg.realOdds.books ? ` · best of ${leg.realOdds.books} books (never averaged)` : ""}
                </p>
              </div>
            ) : leg.realOdds?.status ? (
              <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 space-y-0.5">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Bookmaker odds unavailable</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{leg.realOdds.reason}</p>
              </div>
            ) : null}
            <LegMatchContext leg={leg} />
            {reasons.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 space-y-1.5 max-h-52 overflow-y-auto noir-scrollbar">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Deep analysis — why this game qualified</p>
                {reasons.map((r, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground leading-relaxed">• {r}</p>
                ))}
              </div>
            )}
            <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
              Only games with verified form on both sides, head-to-head scrutiny and cleared scrutiny bars enter the slips — never a guess. Percentages are model estimates, not calibrated facts — never guarantees.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}