import React from "react";
import { Sun, Moon } from "lucide-react";
import PickCard from "@/components/kala/PickCard";
import { EmptyState, SectionCard } from "@/components/kala/Bits";

// MORNING / EVENING SCAN — one session's qualifying picks ranked by KALA
// MASTER SCORE. Default Top 3, optional Top 5. Nothing is forced in.
export default function ScanSection({ session, picks, results }) {
  const [topN, setTopN] = React.useState(3);
  const morning = session === "morning";
  const list = (picks || [])
    .filter((p) => p.session === session)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
  const total = (picks || []).filter((p) => p.session === session).length;

  return (
    <SectionCard
      title={morning ? "☀️ MORNING SCAN" : "🌙 EVENING SCAN"}
      icon={morning ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-sky-300" />}
      sub={`${morning ? "00:00–16:59" : "17:00–23:59"} Africa/Lagos · worldwide fixture scan · ${total} qualifying in the 5-day window`}
      right={
        <div className="flex gap-1.5">
          {[3, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTopN(n)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold border transition-colors ${
                topN === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
              }`}
            >
              TOP {n}
            </button>
          ))}
        </div>
      }
    >
      {list.length === 0 ? (
        <EmptyState>
          NO QUALIFYING {morning ? "MORNING" : "EVENING"} PICKS — that is a valid model decision, not an error.
        </EmptyState>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.map((p) => (
            <PickCard key={`${p.fixtureId}|${p.marketKey}`} pick={p} result={results[`${p.fixtureId}|${p.marketKey}`]} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}