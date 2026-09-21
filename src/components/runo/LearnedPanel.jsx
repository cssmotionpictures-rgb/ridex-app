import React from "react";
import { Lightbulb } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/kala/Bits";

// HOW RUN O KEEPS IMPROVING — customer-facing. The RIDE X Intelligent Engine
// improves its service from real results; how it does that stays internal.
export default function LearnedPanel({ insights, loading }) {
  const list = insights || [];
  return (
    <SectionCard
      title="HOW RUN O KEEPS IMPROVING"
      icon={<Lightbulb className="w-4 h-4 text-primary" />}
      sub="The RIDE X Intelligent Engine continuously improves its service based on real performance."
    >
      {loading && !list.length ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : list.length ? (
        <div className="space-y-2">
          {list.slice(0, 6).map((i) => (
            <div key={i.id || i.insight_key} className="rounded-2xl border border-border/60 bg-secondary/40 p-3">
              <p className="text-xs font-semibold">{i.insight}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>No improvements yet — RUN O needs settled results first.</EmptyState>
      )}
      <p className="text-[10px] text-muted-foreground">
        Every finished selection is checked against its real result. Improvements are only ever made from extensive
        real evidence — never from a single win or loss.
      </p>
    </SectionCard>
  );
}