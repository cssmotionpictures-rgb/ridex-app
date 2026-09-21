import React from "react";

// One automatic ticket arrangement — legs, combined price, win probability
// and correlation warnings. Combined odds use REAL prices only when every leg
// carries one; otherwise they are labeled exact model fair odds.
export default function PasteArrangement({ arrangement }) {
  const a = arrangement;
  if (!a?.legs?.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
        <p className="text-[11px] font-black text-[#8a99ad] tracking-wide">{a.label}</p>
        <p className="text-[10px] text-white/40 mt-0.5">
          {a.note} Not enough qualifying selections for this structure right now — that is an honest outcome, never a forced ticket.
        </p>
      </div>
    );
  }
  const allReal = a.oddsBasis === "real";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-black text-white tracking-wide">{a.label}</p>
          <p className="text-[9px] text-white/40 mt-0.5">{a.note}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-black text-[#00e676] leading-none">{a.combinedOdds.toFixed(2)}</p>
          <p className="text-[8px] text-white/40 mt-1">{allReal ? "COMBINED REAL PRICE" : "MODEL FAIR ODDS"}</p>
        </div>
      </div>
      <div className="space-y-1">
        {a.legs.map((l, i) => (
          <div key={`${l.fixtureId}|${l.marketKey}`} className="flex items-center gap-2 text-[10px]">
            <span className="text-white/30 font-bold shrink-0">{i + 1}.</span>
            <span className="truncate min-w-0 flex-1">{l.home} vs {l.away}</span>
            <span className="text-[#00b0ff] font-bold shrink-0">{l.marketLabel}</span>
            <span className="text-white/40 shrink-0">{(l.marketOdds || 0) > 1 ? l.marketOdds.toFixed(2) : `${Math.round((l.prob || 0) * 100)}%`}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
        <span className="text-[9px] text-white/50">
          MODEL WIN PROBABILITY: <b className="text-white">{(a.combinedProb * 100).toFixed(1)}%</b> — an estimate, never a guarantee
        </span>
        {(a.warnings || []).map((w) => (
          <span key={w} className="text-[9px] text-amber-300/90 inline-flex items-center gap-1">⚠ {w}</span>
        ))}
      </div>
    </div>
  );
}