import React from "react";
import { LOAN_GUIDE } from "@/lib/businessBlueprints";
import { Landmark, Sparkles } from "lucide-react";

// Auto-matches Nigerian loan sources to the user's selected capital tier.
// Parses each source's "₦min – ₦max" range, highlights the ones that cover the
// exact amount (BEST MATCH), and lists the rest below so the full guide stays.
function nairaToNum(s) { return Number(String(s).replace(/[₦,\s]/g, "")) || 0; }
function parseRange(r) {
  const parts = String(r).split(/[–-]/).map(nairaToNum);
  return { min: parts[0] || 0, max: parts[1] || parts[0] || 0 };
}

export default function LoanFinder({ amount }) {
  const amt = nairaToNum(amount);
  const all = LOAN_GUIDE.map((s) => ({ ...s, ...parseRange(s.range) }));
  const matched = all.filter((s) => amt >= s.min && amt <= s.max);
  const rest = all.filter((s) => !(amt >= s.min && amt <= s.max));
  const ordered = matched.length ? [...matched, ...rest] : [...all].sort((a, b) => a.min - b.min);

  return (
    <div>
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 mb-4 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-bold text-primary">Auto-matched loans for {amount}</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            {matched.length
              ? `${matched.length} source${matched.length > 1 ? "s" : ""} lend in your exact capital range — marked BEST MATCH below.`
              : "No source covers this exact amount — the closest options are listed first."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4">
        {ordered.map((src) => {
          const isMatch = amt >= src.min && amt <= src.max;
          return (
            <div key={src.source} className={`rounded-2xl border bg-card p-4 sm:p-5 card-lift ${isMatch ? "border-primary/60 ring-1 ring-primary/30" : "border-border/60"}`}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                  <Landmark className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="font-bold text-base">{src.source}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">{src.range}</span>
                    {isMatch && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-bold tracking-wide">BEST MATCH</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{src.how}</p>
                  <p className="text-xs mt-2"><span className="text-muted-foreground">Best for: </span><span className="text-foreground font-medium">{src.best_for}</span></p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}