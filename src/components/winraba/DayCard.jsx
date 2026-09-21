import React from "react";
import PickRow from "@/components/winraba/PickRow";

function Section({ icon, title, picks, emptyLabel, onBuild, results }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-wide">{icon} {title}</p>
        {picks.length > 0 && (
          <button
            type="button"
            onClick={onBuild}
            className="shrink-0 text-[11px] font-bold rounded-full bg-primary/15 text-primary px-3 py-1.5 active:scale-95 transition-transform"
          >
            BUILD {title} ACCA
          </button>
        )}
      </div>
      {picks.length ? (
        picks.map((p) => <PickRow key={p.fixtureId} pick={p} result={results[p.fixtureId]} />)
      ) : (
        <p className="text-xs text-muted-foreground py-3 text-center">{emptyLabel}</p>
      )}
    </div>
  );
}

// One board day — ☀️ MORNING / DAY and 🌙 EVENING sections, each showing only
// the strongest qualifying picks (never padded), plus the full-day acca entry.
export default function DayCard({ day, topN, results, onBuild }) {
  const morning = day.morning.slice(0, topN);
  const evening = day.evening.slice(0, topN);
  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-extrabold tracking-wide">
            DAY {day.dayIndex}{day.dayIndex === 1 ? " — TODAY" : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">{day.label}</p>
        </div>
        {(morning.length > 0 || evening.length > 0) && (
          <button
            type="button"
            onClick={() => onBuild("fullday", day)}
            className="text-[11px] font-bold rounded-full border border-primary/50 text-primary px-3 py-1.5 active:scale-95 transition-transform"
          >
            BUILD FULL DAY ACCA
          </button>
        )}
      </div>
      <Section
        icon="☀️"
        title="MORNING / DAY"
        picks={morning}
        emptyLabel="NO QUALIFYING MORNING PICKS"
        onBuild={() => onBuild("morning", day)}
        results={results}
      />
      <Section
        icon="🌙"
        title="EVENING"
        picks={evening}
        emptyLabel="NO QUALIFYING EVENING PICKS"
        onBuild={() => onBuild("evening", day)}
        results={results}
      />
    </div>
  );
}