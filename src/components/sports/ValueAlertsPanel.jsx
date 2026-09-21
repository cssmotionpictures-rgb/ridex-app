import React from "react";
import { Loader2, BellRing } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { teamColors } from "@/lib/teamStyle";

// 80%+ VALUE ALERTS — the IN-BROWSER value feed (no Slack, no external
// service). Only REAL bookmaker prices that beat the model's 80%+ verified
// confidence enter this panel: model numbers alone never trigger an alert.
// The KALA drop records them automatically whenever the live odds feed
// prices a leg above its true probability.
export default function ValueAlertsPanel() {
  const [busy, setBusy] = React.useState(true);
  const [alerts, setAlerts] = React.useState([]);

  const load = React.useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const rows = await base44.entities.ValueAlert.filter({ date_key: today }, "-created_date", 30);
      setAlerts(rows || []);
    } catch {
      setAlerts([]);
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    let unsub = null;
    try {
      unsub = base44.entities.ValueAlert.subscribe(() => load());
    } catch {}
    return () => { try { unsub && unsub(); } catch {} };
  }, [load]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BellRing className="w-4 h-4 text-primary shrink-0" />
          <p className="font-bold text-sm">80%+ VALUE ALERTS</p>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent shrink-0">IN-BROWSER · REAL PRICES ONLY</span>
      </div>
      {busy ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading today's value opportunities…
        </div>
      ) : alerts.length === 0 ? (
        <p className="text-[11px] text-muted-foreground leading-relaxed py-1">
          No value alerts yet today. An alert fires ONLY when a REAL bookmaker price beats the model's 80%+ verified confidence — model numbers alone never trigger one, so a quiet panel is an honest panel.
        </p>
      ) : (
        <div className="rounded-xl bg-black/30 border border-border/40 divide-y divide-border/30 max-h-56 overflow-y-auto no-scrollbar">
          {alerts.map((a) => {
            const [homeC] = teamColors(a.home || "");
            const [awayC] = teamColors(a.away || "");
            return (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                <span
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ background: `linear-gradient(180deg, ${homeC} 0%, ${homeC} 45%, ${awayC} 55%, ${awayC} 100%)` }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold truncate">{a.home} vs {a.away}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{[a.league, a.market].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] font-bold text-primary leading-tight">{(a.price || 0).toFixed(2)}</p>
                  <p className="text-[9px] text-muted-foreground">{a.bookmaker} · {Math.round(a.prob || 0)}% · +{(a.edge_pct || 0).toFixed(1)} pts</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
        Only legs whose REAL captured price carries a positive edge over the model's 80%+ verified confidence appear here — recorded automatically, in this browser, no external service.
      </p>
    </div>
  );
}