import React from "react";
import { Hammer } from "lucide-react";
import PickCard from "@/components/kala/PickCard";
import { EmptyState, SectionCard } from "@/components/kala/Bits";

// BIG HAMMER — real 3.00+ prices only, STRONG+ master score, high model
// agreement, HIGH data quality. Never manufactured: 8 is a target, not a quota.
export default function BigHammerSection({ picks, results }) {
  const list = (picks || []).slice(0, 8).sort((a, b) => b.masterScore - a.masterScore);
  return (
    <SectionCard
      title="BIG HAMMER · 3.00+ ONLY"
      icon={<Hammer className="w-4 h-4 text-primary" />}
      sub="Individual high-price selections from the multi-model ensemble — real bookmaker price 3.00+, STRONG+ KALA score, high model agreement, HIGH data quality. The bar never drops."
    >
      {list.length === 0 ? (
        <EmptyState>
          NO QUALIFYING BIG HAMMER PICKS — a 3.00+ price alone never qualifies, and the engine does not manufacture selections.
        </EmptyState>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.map((p) => (
            <PickCard key={`${p.fixtureId}|${p.marketKey}`} pick={p} result={results[`${p.fixtureId}|${p.marketKey}`]} />
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Target TOP 8 — if only {list.length || 0} qualify, only {list.length || 0} show. Odds floor 3.00 is a hard rule.
      </p>
    </SectionCard>
  );
}