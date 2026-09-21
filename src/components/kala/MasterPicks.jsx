import React from "react";
import PickCard from "@/components/kala/PickCard";
import { EmptyState, SectionCard } from "@/components/kala/Bits";

// MASTER PICKS — the strongest current selections, filtered by the user's
// KALA settings (confidence, odds range, edge). Nothing is forced in.
export default function MasterPicks({ picks, results, settings, basket, onToggleBasket, tracked, onToggleTrack }) {
  const minConf = settings?.min_confidence ?? 80;
  const minOdds = settings?.min_odds ?? 1.01;
  const maxOdds = settings?.max_odds ?? 100;
  const minEdge = settings?.min_edge_pct ?? 0;
  const n = settings?.daily_picks ?? 3;

  const filtered = picks
    .filter((p) => p.confidence >= minConf)
    .filter((p) => {
      const o = (p.marketOdds || 0) > 1 ? p.marketOdds : 0;
      return o === 0 || (o >= minOdds && o <= maxOdds); // model-only picks pass the odds filter (no real price to filter)
    })
    .filter((p) => (p.marketOdds || 0) <= 1 || (p.edgePct || 0) >= minEdge)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, n));

  return (
    <SectionCard
      title="MASTER PICKS"
      sub={`Top ${filtered.length} by KALA MASTER SCORE, filtered by your settings (confidence ≥ ${minConf}%${minEdge ? `, edge ≥ ${minEdge}pp` : ""}).`}
    >
      {filtered.length === 0 ? (
        <EmptyState>
          NO QUALIFYING PICKS — the engine does not lower its threshold to fill the board.
        </EmptyState>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {filtered.map((p) => (
            <PickCard
              key={`${p.fixtureId}|${p.marketKey}`}
              pick={p}
              result={results[`${p.fixtureId}|${p.marketKey}`]}
              inBasket={basket.includes(`${p.fixtureId}|${p.marketKey}`)}
              onToggleBasket={onToggleBasket}
              tracked={tracked.includes(p.fixtureId)}
              onToggleTrack={onToggleTrack}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}