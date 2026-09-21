import React from "react";
import { Star } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/kala/Bits";
import RunOPickCard from "@/components/runo/RunOPickCard";

// The empty-position placeholder — a missing slot stays visibly empty rather
// than being filled with a weak prediction.
const Placeholder = () => (
  <div className="rounded-3xl border border-dashed border-border/80 bg-secondary/20 p-4 text-center">
    <p className="text-[11px] font-extrabold text-muted-foreground">NO QUALIFIED RUN O PICK</p>
    <p className="text-[10px] text-muted-foreground mt-0.5">
      Position left empty — RUN O never forces a weak selection.
    </p>
  </div>
);

// RUN O TOP 3 + RUN O TOP 8 — the premium boards. Every position is a
// genuinely qualified selection; ranks #1–#8 with explicit empty positions.
export default function TopBoards({ runo, results, enrichment }) {
  const top3 = runo?.top3 || [];
  const top8 = runo?.top8 || [];
  const corr = runo?.correlation || {};
  const keyOf = (p) => `${p.fixtureId}|${p.marketKey}`;
  const card = (p, i) => (
    <RunOPickCard
      key={keyOf(p)}
      pick={p}
      rank={i + 1}
      correlation={corr[keyOf(p)]}
      enrichment={(enrichment || {})[keyOf(p)]}
      result={(results || {})[keyOf(p)]}
    />
  );

  return (
    <div className="space-y-4">
      {/* Sticky compact rank strip — the elite board stays visible while scrolling (mobile) */}
      <div className="sticky top-[7.5rem] lg:static z-30 -mx-1 px-1 py-1.5 bg-background/95 backdrop-blur-sm rounded-2xl border border-border/60">
        <p className="text-[10px] font-extrabold text-primary px-2 pt-1">RUN O TOP 3 — HIGHEST CONFIDENCE</p>
        {top3.length ? (
          top3.map((p, i) => (
            <p key={keyOf(p)} className="text-[10px] text-muted-foreground px-2 truncate">
              #{i + 1} {p.home} vs {p.away} · {p.marketLabel} · SCORE {Math.round(p.masterScore ?? p.score ?? 0)}
            </p>
          ))
        ) : (
          <p className="text-[10px] text-muted-foreground px-2">NO QUALIFIED RUN O PICKS</p>
        )}
      </div>

      <SectionCard
        title="RUN O TOP 3"
        icon={<Star className="w-4 h-4 text-primary" />}
        sub="The three strongest-evidence individual predictions available. If only two qualify, two are shown — never forced."
      >
        {top3.length ? (
          <div className="space-y-3">
            {top3.map(card)}
            {top3.length < 3 && Array.from({ length: 3 - top3.length }).map((_, i) => <Placeholder key={`p3-${i}`} />)}
          </div>
        ) : (
          <EmptyState>NO QUALIFIED RUN O PICKS</EmptyState>
        )}
      </SectionCard>

      <SectionCard
        title="RUN O TOP 8"
        icon={<Star className="w-4 h-4 text-primary" />}
        sub="Ranks #1–#8 — every position is a genuinely qualified, correlation-controlled selection. Empty positions stay empty."
      >
        {top8.length ? (
          <div className="space-y-3">
            {top8.map(card)}
            {top8.length < 8 && Array.from({ length: 8 - top8.length }).map((_, i) => <Placeholder key={`p8-${i}`} />)}
          </div>
        ) : (
          <EmptyState>NO QUALIFIED RUN O PICKS</EmptyState>
        )}
      </SectionCard>
    </div>
  );
}