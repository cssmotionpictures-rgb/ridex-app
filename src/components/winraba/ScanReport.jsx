import React from "react";
import { ScanLine } from "lucide-react";

// RIDE X MASTER MORNING SCAN — the honest daily report: what was scanned,
// how many candidates were REJECTED by the quality gate, and what qualified.
// "No qualifying pick" is a feature, not a failure — the engine earns the
// right to show every pick.
export default function ScanReport({ report }) {
  if (!report) return null;
  const g = report.grades || {};
  const items = [
    ["Fixtures scanned", report.fixturesScanned ?? 0],
    ["Analyzed by the ensemble", report.fixturesAnalyzed ?? 0],
    ["Markets scanned", report.marketsScanned ?? 0],
    ["Rejected by the quality gate", report.rejected ?? 0],
    ["Qualifying", report.qualifying ?? 0],
  ];
  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ScanLine className="w-4 h-4 text-primary" />
        <p className="text-xs font-extrabold tracking-wide">RIDE X MASTER MORNING SCAN · {report.modelVersion}</p>
        <span className="ml-auto text-[10px] text-muted-foreground">{report.leaguesScanned} leagues</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-secondary/60 px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">{label}</p>
            <p className="text-base font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
        {g["ULTRA ELITE"] > 0 && (
          <span className="rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/40 px-2.5 py-1">
            🔥 ULTRA ELITE {g["ULTRA ELITE"]}
          </span>
        )}
        {g.ELITE > 0 && (
          <span className="rounded-full bg-yellow-400/15 text-yellow-300 border border-yellow-400/40 px-2.5 py-1">
            ⭐ ELITE {g.ELITE}
          </span>
        )}
        {g.STRONG > 0 && (
          <span className="rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/40 px-2.5 py-1">
            🟢 STRONG {g.STRONG}
          </span>
        )}
        {g.QUALIFYING > 0 && (
          <span className="rounded-full bg-sky-400/15 text-sky-300 border border-sky-400/40 px-2.5 py-1">
            🟦 QUALIFYING {g.QUALIFYING}
          </span>
        )}
        {report.bigHammer > 0 && (
          <span className="rounded-full bg-primary/15 text-primary border border-primary/40 px-2.5 py-1">
            🔨 BIG HAMMER {report.bigHammer}
          </span>
        )}
      </div>
      {report.unavailableData?.length > 0 && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Data honesty — structurally unavailable today (never guessed): {report.unavailableData.join(" · ")}.
          A prediction uses only information available at the moment it was recorded.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Grades are calibrated model estimates under stated assumptions — they are never implied to be guaranteed wins.
      </p>
    </div>
  );
}