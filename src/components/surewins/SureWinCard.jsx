import React from "react";
import { AlertTriangle } from "lucide-react";
import { sportOf } from "@/lib/globalLearning/sureWinBoard";

const TIER_TONE = {
  ELITE_PICK: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  STRONG_PICK: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  LEAN: "bg-amber-500/15 text-amber-300 border-amber-500/40",
};

const lagos = (iso) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// One ranked board card — every reason shown is generated from stored
// evidence by the selection engine, never invented here.
export default function SureWinCard({ pick }) {
  const c = pick.candidate;
  return (
    <div className="mglass rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-muted-foreground">#{pick.rank} · {sportOf(c)} · {c.league}</p>
          <h3 className="font-heading font-extrabold text-sm truncate">{c.home} vs {c.away}</h3>
          <p className="text-[10px] text-muted-foreground">{lagos(c.kickoff)} WAT · {c.market_label}</p>
        </div>
        <span className={`shrink-0 border rounded-full px-2 py-0.5 text-[9px] font-extrabold ${TIER_TONE[pick.recommendationStatus] || ""}`}>
          {pick.recommendationStatus.replace("_", " ")}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["CALIBRATED", `${Math.round(pick.calibrated * 100)}%`],
          ["QUALITY", `${Math.round(pick.quality * 100)}`],
          ["CONFIDENCE", c.confidence ? `${Math.round(c.confidence)}/100` : `${Math.round((pick.agreement ?? 1) * 100)}%`],
          ["DATA HEALTH", `${pick.health.score}/100`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-black/25 py-1.5">
            <p className="text-[8px] text-muted-foreground font-bold">{k}</p>
            <p className="text-xs font-extrabold mtext-cyan">{v}</p>
          </div>
        ))}
      </div>
      <details className="group">
        <summary className="text-[10px] font-bold mtext-cyan cursor-pointer select-none">WHY THIS PICK QUALIFIED ▾</summary>
        <ul className="mt-1.5 space-y-1">
          {(pick.reasons || []).map((r, i) => (
            <li key={i} className="text-[10px] text-muted-foreground leading-snug">· {r}</li>
          ))}
        </ul>
        {!!pick.health?.notes?.length && (
          <p className="mt-1 text-[9px] text-muted-foreground leading-snug">Data notes: {pick.health.notes.join(" · ")}</p>
        )}
      </details>
      {pick.correlation?.risk === "HIGH" && (
        <p className="flex items-start gap-1.5 text-[10px] text-amber-300 font-semibold">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {pick.correlation.note}
        </p>
      )}
      <p className="text-[9px] text-muted-foreground border-t border-white/5 pt-2">
        recorded {lagos(c.recorded_at)} WAT · model {c.model_version || "RX-2.0"} · {c.source} · probability is never certainty
      </p>
    </div>
  );
}