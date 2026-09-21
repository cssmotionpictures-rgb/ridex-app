import React from "react";
import { ListChecks, TrendingUp } from "lucide-react";
import { SectionCard, EmptyState, Stat } from "@/components/kala/Bits";
import { whyRunO } from "@/lib/runO";

// WHY THESE PICKS — the factual evidence behind every board selection, and
// MARKET EDGE — the verified price intelligence across the board.
export default function WhyThesePicksPanel({ picks }) {
  const list = picks || [];
  return (
    <SectionCard
      title="WHY THESE PICKS"
      icon={<ListChecks className="w-4 h-4 text-primary" />}
      sub="Factual reasons only — every line is supported by the recorded data. Nothing is invented."
    >
      {list.length ? (
        <div className="space-y-2">
          {list.map((p, i) => (
            <div key={`${p.fixtureId}-${p.marketKey}`} className="rounded-2xl border border-border/60 bg-secondary/40 p-3">
              <p className="text-xs font-bold truncate">
                #{i + 1} {p.home} vs {p.away} — {p.marketLabel} · SCORE {Math.round(p.masterScore ?? p.score ?? 0)}
              </p>
              <ul className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                {whyRunO(p).slice(0, 3).map((r, j) => <li key={j}>• {r}</li>)}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>No qualified RUN O picks — there is nothing to justify.</EmptyState>
      )}
    </SectionCard>
  );
}

export function MarketEdgePanel({ picks }) {
  const list = picks || [];
  const priced = list.filter((p) => (p.marketOdds || 0) > 1);
  const avgEdge = priced.length
    ? Math.round((priced.reduce((s, p) => s + (p.edgePct || 0), 0) / priced.length) * 10) / 10
    : null;
  const posEdge = priced.filter((p) => (p.edgePct || 0) > 0).length;
  return (
    <SectionCard
      title="MARKET EDGE"
      icon={<TrendingUp className="w-4 h-4 text-primary" />}
      sub="Verified price intelligence across the RUN O board — model-only picks are labeled, never given fake edges."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="PRICED PICKS" value={`${priced.length}/${list.length}`} />
        <Stat label="AVG EDGE (PRICED)" value={avgEdge != null ? `${avgEdge > 0 ? "+" : ""}${avgEdge}pp` : "—"} />
        <Stat label="POSITIVE-EDGE PICKS" value={posEdge} />
        <Stat label="MODEL-ONLY PICKS" value={list.length - priced.length} hint="no real price — no fake edge is calculated" />
      </div>
      {list.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-secondary/40 p-3 space-y-1">
          {list.map((p) => (
            <p key={`${p.fixtureId}-${p.marketKey}`} className="text-[11px] text-muted-foreground truncate">
              {p.home} vs {p.away} — {p.marketLabel} ·{" "}
              {(p.marketOdds || 0) > 1
                ? `${p.marketOdds.toFixed(2)} (${p.bookmaker || "bookmaker"}) · edge ${(p.edgePct || 0) > 0 ? "+" : ""}${p.edgePct}pp`
                : "MODEL ONLY — no real price carried this market"}
            </p>
          ))}
        </div>
      )}
    </SectionCard>
  );
}