import React from "react";
import { Bell, Loader2, TrendingUp, TrendingDown, Gem } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { pollTennisOddsAlerts, POLL_MINUTES, SHIFT_PCT, VALUE_EV_PCT } from "@/lib/tennisOddsAlerts";

// US OPEN LIVE ODDS RADAR — auto-checks the real US Open bookmaker feed every
// 10 minutes while the tennis slips are open and notifies the user the
// moment a real price shifts significantly (≥10%) or the model spots +EV
// value vs a real price. In-app toast + a persistent alert feed; nothing is
// ever invented — alerts come only from real quoted prices.

export default function TennisOddsAlerts() {
  const { toast } = useToast();
  const [state, setState] = React.useState(null);

  const run = React.useCallback(async (announce = false) => {
    setState((s) => ({ ...s, busy: true }));
    try {
      const res = await pollTennisOddsAlerts();
      setState({ busy: false, ...res });
      if (announce && res.alerts.length > 0) {
        const n = res.alerts[0];
        toast(
          n.type === "value"
            ? {
                title: `US Open value spot — ${n.player}`,
                description: `Model ${Math.round(n.prob * 100)}% vs real ${n.price.toFixed(2)} · EV +${n.evPct}% · ${n.match}`,
              }
            : {
                title: `US Open odds ${n.dir} — ${n.player}`,
                description: `${n.from.toFixed(2)} → ${n.to.toFixed(2)} (${n.shiftPct > 0 ? "+" : ""}${n.shiftPct}%) · ${n.match}`,
              }
        );
      }
    } catch {
      setState((s) => ({ ...s, busy: false }));
    }
  }, []);

  React.useEffect(() => {
    run(false); // first visit arms the baseline silently — no toast spam
    const t = setInterval(() => run(true), POLL_MINUTES * 60000);
    return () => clearInterval(t);
  }, [run]);

  const alerts = state?.all || [];
  const feedLive = (state?.feedSize || 0) > 0;

  return (
    <div className="rounded-2xl overflow-hidden border border-primary/30 scene-tennis">
      <div className="p-3 flex items-center gap-2 relative">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <Bell className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold flex items-center gap-1.5 flex-wrap">
            US OPEN ODDS RADAR
            {state?.busy ? (
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
            ) : (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  feedLive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {feedLive ? "MONITORING" : "AWAITING FEED"}
              </span>
            )}
          </p>
          <p className="text-[10px] text-muted-foreground leading-snug">
            ≥{SHIFT_PCT}% real price shifts · model +EV ≥ {VALUE_EV_PCT}% · auto-checks every {POLL_MINUTES} min
            {state?.checkedAt ? ` · last check ${new Date(state.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
        </div>
        {alerts.length > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground shrink-0">{alerts.length}</span>
        )}
      </div>

      <div className="bg-card/70 backdrop-blur divide-y divide-border/30">
        {!feedLive && !state?.busy ? (
          <p className="px-4 py-3 text-[11px] text-muted-foreground leading-relaxed">
            No live US Open bookmaker prices in the feed right now{state && state.modelReady ? "" : " — the radar keeps watching and arms the model comparison once the tennis scan lands"}. Alerts fire the moment real prices move; nothing is ever invented from a paused feed.
          </p>
        ) : alerts.length === 0 ? (
          <p className="px-4 py-3 text-[11px] text-muted-foreground leading-relaxed">
            {state?.busy
              ? "Checking the live odds feed…"
              : `No significant shifts or value spots yet — every covered US Open price is being watched and you'll be notified the moment one moves ≥${SHIFT_PCT}% or shows +${VALUE_EV_PCT}% EV.`}
          </p>
        ) : (
          alerts.slice(0, 8).map((a) => (
            <div key={a.id} className="px-3 py-2 flex items-start gap-2">
              {a.type === "value" ? (
                <Gem className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              ) : a.dir === "steam" ? (
                <TrendingDown className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <TrendingUp className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold truncate">
                  {a.type === "value" ? (
                    <>VALUE — {a.player} @ {a.price.toFixed(2)} · model {Math.round(a.prob * 100)}% · <span className="text-emerald-400">EV +{a.evPct}%</span></>
                  ) : (
                    <>
                      {a.dir === "steam" ? "STEAM" : "DRIFT"} — {a.player} {a.from.toFixed(2)} →{" "}
                      <span className={a.dir === "steam" ? "text-amber-400" : "text-sky-400"}>{a.to.toFixed(2)}</span>{" "}
                      ({a.shiftPct > 0 ? "+" : ""}{a.shiftPct}%)
                    </>
                  )}
                </p>
                <p className="text-[9px] text-muted-foreground truncate">
                  {a.match} · {a.bookmaker ? `${a.bookmaker} · ` : ""}real price feed · {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="px-3 py-2 text-[9px] text-muted-foreground/70 bg-black/30 leading-relaxed">
        Only REAL bookmaker prices are watched — never modelled prices. EV% is the engine's model estimate vs the real quoted price, not a guarantee. Shift alerts fire once per distinct move.
      </p>
    </div>
  );
}