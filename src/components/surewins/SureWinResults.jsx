import React from "react";

// SURE WIN RESULTS — settled board history, computed from immutable snapshots
// joined to the authoritative settlements. Losses are never hidden and the
// small-sample caveat is mandatory until real evidence accumulates.
export default function SureWinResults({ results }) {
  if (!results) return null;
  const graded = results.graded > 0;
  const cells = [
    ["SETTLED PICKS", String(results.settled)],
    ["WINS", String(results.wins)],
    ["LOSSES", String(results.losses)],
    ["VOID/CANCELLED", String(results.voids)],
    ["WIN RATE", graded ? `${results.winRatePct.toFixed(1)}%` : "—"],
    ["AVG PREDICTED", graded ? `${results.avgProbPct.toFixed(1)}%` : "—"],
    ["AVG QUALITY", graded ? `${Math.round(results.avgQuality * 100)}/100` : "—"],
    ["BRIER", graded ? results.brier.toFixed(3) : "—"],
  ];
  return (
    <div className="mglass rounded-2xl p-4 space-y-3">
      <p className="text-xs font-extrabold">SURE WIN RESULTS — settled board history (never rewritten, losses never hidden)</p>
      <div className="grid grid-cols-4 gap-2">
        {cells.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-black/25 px-2 py-2 text-center">
            <p className="text-[8px] text-muted-foreground font-bold leading-tight">{k}</p>
            <p className="text-[11px] font-extrabold mtext-cyan">{v}</p>
          </div>
        ))}
      </div>
      {results.limited && (
        <p className="text-[10px] text-amber-300 font-semibold">
          Performance history is based on a limited number of settled picks — no statistical claim is made from a small sample.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground leading-snug">
        {results.pending > 0
          ? `${results.pending} published pick(s) awaiting verified settlement — they appear here only once the authoritative result is graded.`
          : "Every published pick on record is reflected above."}
      </p>
    </div>
  );
}