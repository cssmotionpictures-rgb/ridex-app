import React from "react";
import { Layers } from "lucide-react";
import { SectionCard, EmptyState, Stat } from "@/components/kala/Bits";
import { buildAcca } from "@/lib/winRaba";

// RUN O ACCUMULATOR — optional. Individual picks stay primary; giant
// accumulators are never encouraged by default. Every combined number is
// labeled and honest — never called guaranteed.
const SIZES = [2, 3, 5, 8];

export default function AccaRunOSection({ top8 }) {
  const [size, setSize] = React.useState(3);
  const legs = React.useMemo(() => (top8 || []).slice(0, size), [top8, size]);
  const acca = React.useMemo(() => (legs.length ? buildAcca("runo", legs) : null), [legs]);
  if (!top8?.length) {
    return (
      <SectionCard title="RUN O ACCUMULATOR" icon={<Layers className="w-4 h-4 text-primary" />} sub="Optional — individual picks remain primary.">
        <EmptyState>No qualified RUN O picks to build an accumulator from.</EmptyState>
      </SectionCard>
    );
  }
  const evPct =
    acca && acca.oddsBasis === "real" && acca.combinedProbability
      ? Math.round((acca.combinedProbability * acca.combinedOdds - 1) * 1000) / 10
      : null;
  const weakest = legs.reduce((a, b) => ((b.prob || 0) < (a.prob || 0) ? b : a), legs[0]);
  const riskiest = legs.reduce((a, b) => ((b.uncertainty || 0) > (a.uncertainty || 0) ? b : a), legs[0]);
  const corrRisk = acca?.correlated ? "MEDIUM" : "LOW";

  return (
    <SectionCard
      title="RUN O ACCUMULATOR"
      icon={<Layers className="w-4 h-4 text-primary" />}
      sub="Optional paper-mode combination of the RUN O board — individual picks remain the primary product. Never guaranteed."
      right={
        <div className="flex gap-1.5">
          {SIZES.filter((s) => s <= (top8 || []).length).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                size === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {s} LEGS
            </button>
          ))}
        </div>
      }
    >
      {acca && legs.length ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="COMBINED ODDS" value={acca.combinedOdds} hint={acca.oddsBasis === "real" ? "real prices" : "model fair odds — labeled, never a bookmaker price"} />
            <Stat label="EST. COMBINED PROBABILITY" value={`${Math.round(acca.combinedProbability * 1000) / 10}%`} hint="independent-legs estimate — an approximation" />
            <Stat label="CORRELATION RISK" value={corrRisk} tone={corrRisk === "LOW" ? "text-emerald-300" : "text-amber-300"} hint={acca.correlationNote || "no shared teams among the legs"} />
            <Stat label="EXPECTED VALUE" value={evPct != null ? `${evPct > 0 ? "+" : ""}${evPct}%` : "—"} hint="measurable only when every leg carries a real price" />
          </div>
          <div className="rounded-2xl border border-border/60 bg-secondary/40 p-3 space-y-1">
            {legs.map((p, i) => (
              <p key={`${p.fixtureId}-${p.marketKey}`} className="text-[11px] text-muted-foreground truncate">
                LEG {i + 1}: {p.home} vs {p.away} — {p.marketLabel} @ {(p.marketOdds || 0) > 1 ? p.marketOdds.toFixed(2) : "model"} · prob {Math.round((p.prob || 0) * 100)}%
              </p>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            WEAKEST LEG: {weakest.home} vs {weakest.away} ({Math.round((weakest.prob || 0) * 100)}%) ·
            HIGHEST-RISK LEG: {riskiest.home} vs {riskiest.away} (uncertainty {Math.round((riskiest.uncertainty || 0) * 100)}%) ·
            PAPER STAKE ₦{acca.paperStake.toLocaleString()} → ₦{acca.potentialReturn.toLocaleString()} hypothetical.
            Import this ticket into KALA → CASHOUT INTEL for full cashout analysis.
          </p>
        </>
      ) : (
        <EmptyState>Not enough qualified RUN O picks for this accumulator size.</EmptyState>
      )}
    </SectionCard>
  );
}