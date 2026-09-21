import React from "react";
import { CalendarDays } from "lucide-react";
import PickCard from "@/components/kala/PickCard";
import { EmptyState, SectionCard } from "@/components/kala/Bits";

// 5-DAY ROLLOVER — the rolling Lagos calendar. Day 1 is today and the window
// advances automatically. Never called guaranteed — statuses come from the
// immutable ledger graded against real results.
export default function RolloverSection({ board, results }) {
  const [topN, setTopN] = React.useState(3);
  const days = board?.days || [];
  return (
    <SectionCard
      title="5-DAY ROLLOVER"
      icon={<CalendarDays className="w-4 h-4 text-primary" />}
      sub={`Window ${board?.windowStart || "—"} → ${board?.dates?.[4] || "—"} (rolls forward daily) · Top 3 default, Top 5 optional.`}
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
      <div className="space-y-4">
        {days.map((d) => (
          <div key={d.dateKey} className="rounded-2xl border border-border/50 bg-secondary/30 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold tracking-wide">
                DAY {d.dayIndex} · <span className="text-primary uppercase">{d.label}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                {d.all.length} qualifying · {d.morning.length} morning / {d.evening.length} evening
              </p>
            </div>
            {d.all.length === 0 ? (
              <EmptyState>NO QUALIFYING PICKS — the slot stays empty.</EmptyState>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {d.all.slice(0, topN).map((p) => (
                  <PickCard key={`${p.fixtureId}|${p.marketKey}`} pick={p} result={results[`${p.fixtureId}|${p.marketKey}`]} />
                ))}
              </div>
            )}
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground px-1">
          ☀️ Morning = 00:00–16:59 Lagos · 🌙 Evening = 17:00–23:59 Lagos. Statuses: PENDING → LIVE → WON / LOST / VOID / CANCELLED, graded from real final scores. The rollover is a prediction system, never a guarantee.
        </p>
      </div>
    </SectionCard>
  );
}