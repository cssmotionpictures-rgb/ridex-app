import React from "react";
import { Layers, Scissors } from "lucide-react";
import { buildAcca } from "@/lib/winRaba";
import PickCard from "@/components/kala/PickCard";
import { EmptyState, SectionCard, Stat, RiskBadge } from "@/components/kala/Bits";

const POOLS = [
  { key: "morning", label: "MORNING ACCA", max: 3 },
  { key: "evening", label: "EVENING ACCA", max: 3 },
  { key: "fullday", label: "FULL DAY ACCA", max: 5 },
  { key: "rollover5", label: "5-DAY ROLLOVER", max: 10 },
];

// ACCUMULATOR LAB — KALA first identifies the best individual selections,
// then this layer decides how many can reasonably be combined. Individual
// pick quality ≠ accumulator safety — the weakest leg is always highlighted.
export default function AccaLabSection({ board, settings, results }) {
  const [pool, setPool] = React.useState("fullday");
  const [legCount, setLegCount] = React.useState(3);
  const def = POOLS.find((p) => p.key === pool);

  const candidates = React.useMemo(() => {
    if (!board) return [];
    if (pool === "rollover5") return board.days.flatMap((d) => d.all).sort((a, b) => b.score - a.score);
    if (pool === "fullday") return board.days.flatMap((d) => d.all).sort((a, b) => b.score - a.score);
    return board.days.flatMap((d) => d[pool]).sort((a, b) => b.score - a.score);
  }, [board, pool]);

  React.useEffect(() => {
    setLegCount((c) => Math.min(c, def.max));
  }, [def.max]);

  const [removed, setRemoved] = React.useState([]); // fixture|market keys removed via REMOVE WEAKEST LEG
  const pool2 = candidates.filter((p) => !removed.includes(`${p.fixtureId}|${p.marketKey}`));
  const acca = pool2.length
    ? buildAcca(pool, pool2.slice(0, legCount), settings?.paper_stake ?? 1000)
    : null;
  const weakest = acca && acca.legs.length
    ? acca.legs.reduce((a, b) => (b.prob < a.prob ? b : a))
    : null;

  const removeWeakest = () => {
    if (!weakest) return;
    setRemoved((r) => [...r, `${weakest.fixtureId}|${weakest.marketKey}`]);
  };

  return (
    <SectionCard
      title="ACCUMULATOR LAB"
      icon={<Layers className="w-4 h-4 text-primary" />}
      sub="Correlation, fragility and weakest-leg analysis on the engine's qualifying picks. Analysis layer only — recorded accas live in WIN RABA's own ledger."
    >
      <div className="flex flex-wrap gap-1.5">
        {POOLS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => { setPool(p.key); setRemoved([]); }}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold border transition-colors ${
              pool === p.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
            }`}
          >
            {p.label} · MAX {p.max}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Legs:</span>
        {[2, 3, 4, 5, 8].filter((n) => n <= def.max).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLegCount(n)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold border transition-colors ${
              legCount === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
            }`}
          >
            {n} LEG
          </button>
        ))}
        {removed.length > 0 && (
          <button type="button" className="text-[11px] text-primary underline" onClick={() => setRemoved([])}>
            reset removed legs
          </button>
        )}
      </div>

      {!acca || !acca.legs.length ? (
        <EmptyState>NOT ENOUGH QUALIFYING PICKS TO BUILD THIS ACCUMULATOR — slots are never padded.</EmptyState>
      ) : (
        <>
          <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="LEGS" value={acca.legsCount} />
              <Stat label="COMBINED ODDS" value={acca.combinedOdds.toFixed(2)} hint={acca.oddsBasis === "real" ? "real bookmaker prices" : "model fair odds — labeled estimate"} />
              <Stat label="JOINT PROBABILITY" value={acca.combinedProbability ? `${Math.round(acca.combinedProbability * 100)}%` : "—"} hint="approximation — assumes independence" />
              <Stat label="PAPER RETURN" value={`₦${(acca.potentialReturn || 0).toLocaleString()}`} hint={`stake ₦${acca.paperStake.toLocaleString()} · PAPER MODE`} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RiskBadge risk={acca.riskLevel} />
              {acca.correlated && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300 font-bold">
                  HIGH CORRELATION WARNING — {acca.correlationNote}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">ONE LEG FAILS = ACCUMULATOR FAILS</span>
              {weakest && acca.legs.length > 2 && (
                <button
                  type="button"
                  onClick={removeWeakest}
                  className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-primary border border-primary/40 rounded-full px-3 py-1"
                >
                  <Scissors className="w-3 h-3" /> REMOVE WEAKEST LEG
                </button>
              )}
            </div>
            {weakest && (
              <p className="text-[11px] text-muted-foreground">
                WEAKEST LEG: {weakest.home} vs {weakest.away} — {weakest.marketLabel} ({Math.round(weakest.prob * 100)}%) ·
                STRONGEST: {acca.legs.reduce((a, b) => (b.prob > a.prob ? b : a)).marketLabel} ({Math.round(Math.max(...acca.legs.map((l) => l.prob)) * 100)}%)
              </p>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {acca.legs.map((p) => (
              <div key={`${p.fixtureId}|${p.marketKey}`} className={p === weakest ? "rounded-3xl ring-1 ring-rose-400/50" : ""}>
                <PickCard pick={p} result={results[`${p.fixtureId}|${p.marketKey}`]} compact />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            INDIVIDUAL PICK QUALITY ≠ ACCUMULATOR SAFETY. KALA is a prediction-intelligence system — it never places real bets.
          </p>
        </>
      )}
    </SectionCard>
  );
}