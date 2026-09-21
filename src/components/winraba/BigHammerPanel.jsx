import React from "react";
import { Hammer } from "lucide-react";
import PickRow from "@/components/winraba/PickRow";

// BIG HAMMER — individual REAL-PRICE 3.00+ selections that passed the
// ensemble's STRICTER gates (master score STRONG+, high model agreement,
// HIGH data quality). The 3.00 bar never drops to produce picks, and a
// 3.00+ price alone never qualifies — it needs consensus + calibration +
// market edge. These are individual picks, never forced into accumulators.
export default function BigHammerPanel({ picks, results }) {
  return (
    <div className="rounded-3xl border border-primary/30 bg-primary/5 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold flex items-center gap-2">
            <Hammer className="w-4 h-4 text-primary" /> BIG HAMMER · 3.00+ ONLY
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Individual high-price selections from the multi-model ensemble — real bookmaker price 3.00+,
            STRONG+ master score, high model agreement and HIGH data quality. The bar never drops.
          </p>
        </div>
        {picks.length > 0 && (
          <span className="shrink-0 text-[10px] font-bold rounded-full bg-primary/15 text-primary px-3 py-1.5">
            {picks.length} QUALIFYING
          </span>
        )}
      </div>
      {picks.length ? (
        <div className="grid md:grid-cols-2 gap-3">
          {picks.map((p) => (
            <PickRow key={`${p.fixtureId}-${p.marketKey}`} pick={p} result={results?.[p.fixtureId]} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-4 text-center">
          NO QUALIFYING BIG HAMMER PICKS — a 3.00+ price alone never qualifies. The engine
          does not lower the bar just to produce high-odds picks.
        </p>
      )}
    </div>
  );
}