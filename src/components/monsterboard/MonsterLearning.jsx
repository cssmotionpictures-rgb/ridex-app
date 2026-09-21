import React from "react";
import { Lightbulb } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/kala/Bits";

// WHAT MONSTER IS LEARNING — customer-facing, simple and honest. The
// technical learning mechanism stays internal and is never exposed.
export default function MonsterLearning({ insights, loading, throttled }) {
  const list = insights || [];
  return (
    <SectionCard
      title="WHAT MONSTER IS LEARNING"
      icon={<Lightbulb className="w-4 h-4 text-primary" />}
      sub="The RIDE X Intelligent Engine improves MONSTER from real results."
    >
      {!list.length && throttled ? (
        <p className="text-xs text-amber-400">Temporarily unavailable — retrying.</p>
      ) : loading && !list.length ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : list.length ? (
        <div className="space-y-2">
          {list.slice(0, 5).map((i) => (
            <div key={i.id || i.insight_key} className="rounded-2xl border border-border/60 bg-secondary/40 p-3">
              <p className="text-xs font-semibold">{i.insight}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>
          MONSTER performance is being evaluated. More results are needed before meaningful trends can be reported.
        </EmptyState>
      )}
      {throttled && list.length > 0 && (
        <p className="text-[10px] text-amber-400 font-semibold mt-1">Refreshing…</p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Every finished selection is checked against its real result. Improvements are made only from extensive real
        evidence — never from a single win or loss.
      </p>
    </SectionCard>
  );
}