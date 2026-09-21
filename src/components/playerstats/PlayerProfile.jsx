import React from "react";
import { ArrowLeft, Loader2, Activity } from "lucide-react";
import { Stat } from "@/components/kala/Bits";
import PlayerTrendChart from "./PlayerTrendChart";
import { getPlayerXgHistory } from "@/lib/understatPlayers";

// PLAYER PROFILE — the athlete's full season view: headline season metrics,
// per-90 rates, the goals-vs-expected-goals trend charts, and the recent match
// log. Every number is real recorded data; the per-match feed is loaded live
// and an honest notice shows if it is unavailable.

const POS_LABEL = { F: "Forward", M: "Midfielder", D: "Defender", G: "Goalkeeper" };

export default function PlayerProfile({ player, season, onBack }) {
  const [history, setHistory] = React.useState(null);
  const [historyError, setHistoryError] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setHistoryError("");
    setLoading(true);
    (async () => {
      try {
        if (!player?.id) throw new Error("no id");
        const r = await getPlayerXgHistory(player.id);
        if (!cancelled) setHistory(r.matches);
      } catch {
        if (!cancelled) setHistoryError("Per-match history is unavailable right now — season totals below are still accurate.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [player?.id]);

  const mins = player?.minutes || 0;
  const per90 = (v) => (mins ? Math.round((v / mins) * 90 * 100) / 100 : 0);
  const diff = Math.round(((player?.goals || 0) - (player?.xG || 0)) * 10) / 10;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Back to leaderboard
      </button>

      <div className="rounded-3xl border border-border/60 bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold truncate">{player?.name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {player?.team} · {POS_LABEL[player?.position] || "Player"} · Season {season}/{String(season + 1).slice(2)}
            </p>
          </div>
          <span className={`shrink-0 inline-flex px-2 py-1 rounded-full border text-[10px] font-extrabold ${
            diff >= 0.5 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
            : diff <= -0.5 ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
            : "border-border/60 bg-secondary text-muted-foreground"
          }`}>
            {diff > 0 ? "+" : ""}{diff} goals vs expected
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="GOALS" value={player?.goals ?? 0} hint={`${per90(player?.goals || 0)} per 90`} />
        <Stat label="EXPECTED GOALS (xG)" value={(player?.xG || 0).toFixed(2)} hint={`${per90(player?.xG || 0)} per 90`} tone="text-primary" />
        <Stat label="ASSISTS" value={player?.assists ?? 0} hint={`${per90(player?.assists || 0)} per 90`} />
        <Stat label="EXPECTED ASSISTS (xA)" value={(player?.xA || 0).toFixed(2)} hint={`${per90(player?.xA || 0)} per 90`} tone="text-accent" />
        <Stat label="SHOTS" value={player?.shots ?? 0} />
        <Stat label="KEY PASSES" value={player?.keyPasses ?? 0} />
        <Stat label="MINUTES" value={mins} hint="played this season" />
        <Stat label="xG PER SHOT" value={player?.shots ? (player.xG / player.shots).toFixed(2) : "—"} hint="chance quality" />
      </div>

      <div className="rounded-3xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <p className="text-sm font-extrabold flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-primary" /> GOALS VS EXPECTED — MATCH BY MATCH
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading per-match history…
          </div>
        ) : historyError ? (
          <p className="text-xs text-amber-300 py-4">{historyError}</p>
        ) : (
          <>
            <PlayerTrendChart matches={history} />
            <div className="mt-4 rounded-2xl border border-border/50 bg-secondary/30 divide-y divide-border/30">
              {history.slice(-10).reverse().map((m, i) => (
                <div key={i} className="px-3 py-2 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-[70px] shrink-0">{String(m.date).slice(0, 10)}</span>
                  <span className="text-[11px] flex-1 min-w-0 truncate">
                    {m.home} <span className="font-extrabold text-foreground">{m.homeGoals}–{m.awayGoals}</span> {m.away}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{m.minutes}'</span>
                  <span className="flex gap-1.5 shrink-0 tabular-nums text-[10px] font-extrabold">
                    <span title="Goals">G {m.goals}</span>
                    <span className="text-primary" title="Expected goals">xG {m.xG.toFixed(2)}</span>
                    <span className="text-accent" title="Expected assists">xA {m.xA.toFixed(2)}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Expected goals (xG) measures the quality of chances — raw shot data, not a prediction of future performance.
            </p>
          </>
        )}
      </div>
    </div>
  );
}