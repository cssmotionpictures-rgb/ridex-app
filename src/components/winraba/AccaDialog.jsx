import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Sigma } from "lucide-react";
import { buildAcca, WR_PAPER_STAKE } from "@/lib/winRaba";

const SIZE_OPTIONS = {
  morning: [2, 3, 4, 5],
  evening: [2, 3, 4, 5],
  fullday: [3, 4, 5],
  rollover5: [5, 6, 7, 8, 9, 10],
};
const DEFAULT_SIZE = { morning: 3, evening: 3, fullday: 5, rollover5: 10 };
const TITLE = {
  morning: "☀️ MORNING ACCA",
  evening: "🌙 EVENING ACCA",
  fullday: "FULL DAY ACCA",
  rollover5: "⭐ 5-DAY ROLLOVER ACCA",
};

// Accumulator confirm dialog — the strongest ranked selections, the size the
// user chooses, full risk disclosure and PAPER MODE (₦ stake, hypothetical
// return). Nothing is ever placed as a real bet.
export default function AccaDialog({ open, onOpenChange, level, dateKey, candidates, onConfirm, busy }) {
  const opts = SIZE_OPTIONS[level] || SIZE_OPTIONS.morning;
  const [size, setSize] = React.useState(DEFAULT_SIZE[level] || 3);
  const [stake, setStake] = React.useState(WR_PAPER_STAKE);

  React.useEffect(() => {
    if (open) {
      setSize(DEFAULT_SIZE[level] || 3);
      setStake(WR_PAPER_STAKE);
    }
  }, [open, level]);

  const maxAvail = Math.max(1, candidates.length);
  const effSize = Math.min(size, maxAvail);
  const legs = candidates.slice(0, effSize);
  const acca = buildAcca(level, legs, Number(stake) || 0);
  const sizeChoices = [...new Set([...opts.filter((s) => s <= maxAvail), maxAvail])]
    .filter((s) => s <= maxAvail)
    .sort((a, b) => a - b);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sigma className="w-5 h-5 text-primary" /> {TITLE[level] || "ACCUMULATOR"}
          </DialogTitle>
          <DialogDescription>
            {dateKey ? `${dateKey} · ` : ""}Strongest qualifying selections, ranked by the engine. You choose how aggressively to combine.
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">NO QUALIFYING RIDE X PICKS.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Selections</p>
              <div className="flex flex-wrap gap-1.5">
                {sizeChoices.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold border transition-colors ${
                      effSize === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {acca.legs.map((l, i) => (
                <div key={l.fixtureId} className="flex items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{i + 1}. {l.home} vs {l.away}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {l.kickoffLabel} Lagos · {l.marketLabel} · {l.confidence}% confidence
                    </p>
                  </div>
                  <p className="text-xs font-bold tabular-nums shrink-0">
                    {l.marketOdds > 1 ? l.marketOdds.toFixed(2) : "model"}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
              <p className="text-xs font-extrabold tracking-wide">ACCUMULATOR</p>
              <div className="text-xs space-y-1 text-muted-foreground">
                <p>Selections: <span className="text-foreground font-semibold">{acca.legsCount}</span></p>
                <p>
                  Combined odds: <span className="text-foreground font-semibold">{acca.combinedOdds.toFixed(2)}</span>
                  <span className="text-[10px]"> ({acca.oddsBasis === "real" ? "real bookmaker prices" : "model fair odds — clearly an estimate"})</span>
                </p>
                <p>Model-estimated combined probability: <span className="text-foreground font-semibold">{Math.round(acca.combinedProbability * 100)}%</span></p>
                <p>Risk: <span className={`font-bold ${acca.riskLevel === "LOW" ? "text-emerald-400" : acca.riskLevel === "MEDIUM" ? "text-amber-300" : "text-rose-400"}`}>{acca.riskLevel}</span></p>
              </div>
              <div className="flex gap-2 items-center text-xs">
                <label className="text-muted-foreground">Paper stake ₦</label>
                <input
                  type="number"
                  min={0}
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="w-24 rounded-lg bg-secondary px-2 py-1 tabular-nums outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="ml-auto text-right">
                  <p className="text-muted-foreground text-[10px]">Potential paper return</p>
                  <p className="font-bold text-primary tabular-nums">₦{acca.potentialReturn.toLocaleString()}</p>
                </div>
              </div>
              {acca.correlated && (
                <p className="text-[11px] text-amber-300 flex items-start gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {acca.correlationNote}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground border-t border-border/60 pt-2">
                Every selection must win for a traditional accumulator to pay. This is a prediction system, not a guarantee — PAPER MODE records it for tracking, no real bet is placed.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            className="rounded-full font-bold w-full"
            disabled={busy || candidates.length === 0}
            onClick={() => onConfirm(acca)}
          >
            {busy ? "Recording…" : "Record paper acca"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}