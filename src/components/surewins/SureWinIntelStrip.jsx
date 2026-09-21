import React from "react";

// Compact intelligence strip — champion/challenger, model health, regime,
// board funnel. Every figure comes from the learning cycle's own records.
export default function SureWinIntelStrip({ intel }) {
  const cells = [
    ["CHAMPION", intel.champion || "—"],
    ["CHALLENGER", intel.challenger || "—"],
    ["MODEL HEALTH", intel.healthShort || "—"],
    ["REGIME", intel.regime?.status || "—"],
    ["CANDIDATES SEEN", String(intel.stats?.seen ?? 0)],
    ["ON THE BOARD", String(intel.stats?.onBoard ?? 0)],
  ];
  return (
    <div className="mglass rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {cells.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-black/25 px-2 py-2 text-center">
            <p className="text-[8px] text-muted-foreground font-bold leading-tight">{k}</p>
            <p className="text-[11px] font-extrabold mtext-green truncate" title={v}>{v}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {intel.healthVerdict} · {intel.regime?.note}
      </p>
      {intel.stats?.rejectionReasons?.length > 0 && (
        <div className="space-y-1 border-t border-white/5 pt-2">
          <p className="text-[9px] font-bold text-muted-foreground">WHY THE REST WERE REJECTED (honest counts)</p>
          {intel.stats.rejectionReasons.slice(0, 4).map((r) => (
            <p key={r.label} className="text-[10px] text-muted-foreground leading-snug">
              · {r.count} × {r.label}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}