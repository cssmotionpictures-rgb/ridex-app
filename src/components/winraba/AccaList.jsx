import React from "react";
import { CheckCircle2, XCircle, Ban, Loader2 } from "lucide-react";

const ACCA_STATUS = {
  open: { label: "OPEN", cls: "text-amber-300", icon: Loader2 },
  won: { label: "WON", cls: "text-emerald-400", icon: CheckCircle2 },
  lost: { label: "LOST", cls: "text-rose-400", icon: XCircle },
  void: { label: "VOID", cls: "text-muted-foreground", icon: Ban },
};
const LEVEL_LABEL = { morning: "☀️ Morning Acca", evening: "🌙 Evening Acca", fullday: "Full Day Acca", rollover5: "⭐ 5-Day Rollover" };

// My ACCAs — every recorded WIN RABA accumulator with its permanent leg
// snapshot and its own settled result (tracked separately from the
// individual selections).
export default function AccaList({ accas, loading, throttled }) {
  const [openId, setOpenId] = React.useState(null);
  if (!accas.length) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        {throttled
          ? "Temporarily unavailable — retrying."
          : loading
          ? "Loading…"
          : "No accumulators recorded yet — build one from the 5-day board."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {throttled && <p className="text-[11px] text-amber-400 font-semibold">Refreshing…</p>}
      {accas.map((a) => {
        const st = ACCA_STATUS[a.status] || ACCA_STATUS.open;
        const legs = (() => { try { return JSON.parse(a.legs_json || "[]"); } catch { return []; } })();
        const isOpen = openId === a.id;
        return (
          <div key={a.id} className="rounded-2xl border border-border/60 bg-card/70 p-4">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 text-left"
              onClick={() => setOpenId(isOpen ? null : a.id)}
            >
              <div className="min-w-0">
                <p className="text-sm font-bold">{LEVEL_LABEL[a.level] || a.level}</p>
                <p className="text-[11px] text-muted-foreground">
                  {a.date_key} · {a.legs_count} selections · odds {Number(a.combined_odds || 0).toFixed(2)} · stake ₦{(a.paper_stake || 0).toLocaleString()}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold ${st.cls}`}>
                <st.icon className={`w-3 h-3 ${a.status === "open" ? "animate-spin" : ""}`} /> {st.label}
              </span>
            </button>
            {isOpen && (
              <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                {legs.map((l, i) => (
                  <div key={`${l.fixtureId}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                    <p className="truncate">
                      {i + 1}. {l.home} vs {l.away} — <span className="text-primary font-semibold">{l.market}</span>
                    </p>
                    <p className="shrink-0 text-muted-foreground tabular-nums">
                      {l.kickoffLabel || ""} Lagos · {l.odds > 1 ? l.odds.toFixed(2) : "model"} · {l.confidence}%
                    </p>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground pt-1">
                  Model-estimated combined probability: {Math.round((a.combined_probability || 0) * 100)}% · potential paper return ₦{(a.potential_return || 0).toLocaleString()}
                  {a.correlation_note ? ` · ${a.correlation_note}` : ""}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}