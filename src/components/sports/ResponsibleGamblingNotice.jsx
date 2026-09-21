import React from "react";
import { ShieldAlert } from "lucide-react";

// Responsible-gambling notice (master spec §93.1) — visible in every
// prediction area, never hidden in settings. Model probability is a
// likelihood estimate, never betting safety; PASS is a core outcome; never
// chase losses. No guaranteed-win language anywhere in the app.
export default function ResponsibleGamblingNotice() {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-xs font-bold text-amber-400 tracking-wide">PREDICTIONS ARE ESTIMATES, NOT GUARANTEES</p>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Predictions are statistical estimates, not guarantees. Betting involves financial risk and you can lose money —
        never stake more than you can afford to lose, and never increase your stake to chase or recover losses.
      </p>
      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
        Confidence and quality scores describe data and model quality — not betting safety. An 85% model probability
        is a likelihood estimate, never an "85% safe bet". When the evidence is insufficient, the engine says PASS
        instead of predicting. Recent results never guarantee future results.
      </p>
    </div>
  );
}