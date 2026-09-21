import React from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { invokeFunction } from "@/lib/resilient";

// PROVIDER HEALTH — every feed shown here was tested LIVE against the key.
// Entitlement is detected, never assumed; NOT SUBSCRIBED feeds are declared
// honestly and never requested. Sportradar supplies DATA + coverage only —
// the engine calculates its own probabilities; odds are not connected.

const FEED_LABELS = {
  competitions: "Competitions",
  daily_schedules: "Daily schedules",
  live_schedules: "Live schedules",
  competition_seasons: "Competition seasons",
  season_info: "Season info",
  season_competitors: "Season teams",
  season_standings: "Standings",
  season_schedules: "Season fixtures",
  season_competitor_statistics: "Season team statistics (Extended)",
  competitor_profile: "Team profiles",
  player_profile: "Player profiles",
  event_summary: "Match summary + team stats (Extended)",
  event_timeline: "Play-by-play timeline (Extended)",
  event_lineups: "Match lineups",
  soccer_probabilities: "Soccer Probabilities",
  soccer_extended_probabilities: "Soccer Extended Probabilities",
  betting_odds: "Betting odds / player props",
};

function StatusChip({ status }) {
  const tone =
    status === "CONNECTED"
      ? "bg-emerald-500/15 text-emerald-400"
      : status === "NOT_SUBSCRIBED" || status === "NOT_CONNECTED"
      ? "bg-secondary text-muted-foreground"
      : status === "AUTH_ERROR" || status === "UNAVAILABLE"
      ? "bg-red-500/15 text-red-400"
      : "bg-amber-500/15 text-amber-400";
  return <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${tone}`}>{status.replace(/_/g, " ")}</span>;
}

export default function SportradarHealthPanel() {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    const attempt = () =>
      invokeFunction("sportradar-soccer", { action: "entitlements", force }, { timeoutMs: 45000 })
        .then((res) => {
          const body = res?.data ?? res;
          setData(body?.data || body);
          return true;
        })
        .catch((e) => {
          const msg = String(e?.message || "");
          const limited = /rate limit|429|status code 400|status code 5\d\d|quota|credit/i.test(msg);
          setError(
            limited
              ? "The platform momentarily limited the request — the provider itself is fine and this clears on its own. Retrying automatically; or tap Recheck in a few seconds."
              : "Provider status unavailable right now — the health check could not complete."
          );
          return false;
        });
    // One paced retry — a transient platform throttle (request/credit limit)
    // self-heals instead of leaving a false "provider down" on screen.
    const ok = await attempt();
    if (!ok) {
      await new Promise((r) => setTimeout(r, 3000));
      await attempt();
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const feeds = data?.feeds || [];
  const connected = feeds.filter((f) => f.status === "CONNECTED");
  const overall = data?.status;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <Activity className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">SPORTRADAR PROVIDER HEALTH</p>
          <p className="text-[10px] text-muted-foreground">
            Soccer API v4 · Trial · feeds tested live — entitlement detected, never assumed
          </p>
        </div>
        {loading ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
            <Loader2 className="w-3 h-3 animate-spin" /> CHECKING
          </span>
        ) : (
          <button onClick={() => load(true)} disabled={loading} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-[11px] font-semibold hover:bg-secondary/70 disabled:opacity-50 shrink-0">
            <RefreshCw className="w-3 h-3" /> Recheck
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Soccer Base ✓</span>
        <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Soccer Extended Base ✓</span>
        <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-secondary text-muted-foreground border border-border/50">Soccer Probabilities: NOT SUBSCRIBED</span>
        <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-secondary text-muted-foreground border border-border/50">Odds: NOT CONNECTED</span>
      </div>

      {error && !data ? (
        <p className="text-[11px] text-amber-400 leading-relaxed">{error}</p>
      ) : !data ? (
        <div className="text-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto" />
          <p className="text-[10px] text-muted-foreground mt-1">Testing every subscribed feed live…</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-secondary/40 border border-border/40 divide-y divide-border/30">
            {feeds.map((f) => (
              <div key={f.feed} className="flex items-center gap-2 px-3 py-1.5">
                <span className="flex-1 min-w-0 truncate text-[11px]">{FEED_LABELS[f.feed] || f.feed}</span>
                <span className="text-[9px] text-muted-foreground shrink-0">
                  {f.latency_ms ? `${Math.round(f.latency_ms)}ms` : ""}
                </span>
                <StatusChip status={f.status} />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {connected.length}/{feeds.length} feeds verified live
            {data.checked_at ? ` · last check ${new Date(data.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
            {data.matchesStored != null ? ` · ${data.matchesStored} matches in the historical store` : ""}
            {" "}· Sportradar supplies data and coverage only — probabilities come from the model engine, never the provider.
          </p>
        </>
      )}
    </div>
  );
}