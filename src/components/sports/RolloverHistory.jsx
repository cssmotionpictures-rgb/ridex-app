import React from "react";
import { History, Trophy, TrendingDown, Target, Percent, Wallet } from "lucide-react";

// Betting-cycle history — logs every completed rollover run (won-through or
// lost) so the user can see overall success rate and net profit over time.
// Reads the same localStorage state as RolloverProgress and updates instantly.
// Purely client-side (no credits needed).

const KEY = "ridex_rollover_v1";

function fmt(n) {
  if (n >= 1000000) return `₦${(n / 1000000).toFixed(n % 1000000 ? 1 : 0)}m`;
  if (n >= 1000) return `₦${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}
function dateStr(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}

export default function RolloverHistory() {
  const [state, setState] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  });

  React.useEffect(() => {
    const read = () => { try { setState(JSON.parse(localStorage.getItem(KEY)) || {}); } catch {} };
    const onStorage = (e) => { if (e.key === KEY) read(); };
    const onChange = () => read();
    window.addEventListener("storage", onStorage);
    window.addEventListener("ridex-rollover-change", onChange);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("ridex-rollover-change", onChange); };
  }, []);

  const start = Number(state.start) || 0;
  const results = Array.isArray(state.results) ? state.results : [];
  const history = Array.isArray(state.history) ? state.history : [];

  const openWins = results.filter((r) => r === "W").length;
  const openRunActive = results.length > 0;
  const completed = history.filter((h) => h.endedBy === "complete").length;
  const lost = history.filter((h) => h.endedBy === "L").length;
  const finishedRuns = history.length;
  const totalRuns = finishedRuns + (openRunActive ? 1 : 0);
  const successRate = finishedRuns ? Math.round((completed / finishedRuns) * 100) : 0;
  const totalWins = history.reduce((s, h) => s + (h.wins || 0), 0) + openWins;
  const totalLosses = lost;
  // Realized net profit across finished runs: completed -> (final - start), lost -> -start.
  const netProfit = history.reduce((s, h) => s + (h.endedBy === "complete" ? (h.final - start) : -start), 0);
  const bestRun = history.slice().sort((a, b) => (b.final || 0) - (a.final || 0))[0];

  if (!start && !history.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        Set a starting bankroll and play a cycle — finished runs (won through or lost) will be logged here so you can track your success rate and net profit over time.
      </div>
    );
  }

  const stats = [
    { label: "Runs played", value: totalRuns, icon: History, tone: "default" },
    { label: "Completed", value: completed, icon: Trophy, tone: "emerald" },
    { label: "Lost", value: lost, icon: TrendingDown, tone: "red" },
    { label: "Success rate", value: `${successRate}%`, icon: Percent, tone: "primary" },
    { label: "Total W / L", value: `${totalWins} / ${totalLosses}`, icon: Target, tone: "default" },
    { label: "Net profit", value: fmt(netProfit), icon: Wallet, tone: netProfit >= 0 ? "emerald" : "red" },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 bg-secondary/40 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center"><History className="w-3.5 h-3.5" /></div>
        <div>
          <p className="text-sm font-semibold">Betting Cycle History</p>
          <p className="text-[10px] text-muted-foreground">Finished runs only · success rate & net profit over time</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3">
        {stats.map((s) => {
          const Icon = s.icon;
          const tone = s.tone === "emerald" ? "text-emerald-400" : s.tone === "red" ? "text-red-400" : s.tone === "primary" ? "text-primary" : "text-foreground";
          return (
            <div key={s.label} className="rounded-xl bg-secondary/40 px-2.5 py-2 text-center">
              <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${tone}`} />
              <p className={`text-sm font-bold ${tone}`}>{s.value}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            </div>
          );
        })}
      </div>

      {openRunActive && (
        <div className="px-4 py-2 border-t border-border/40 flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">Open run</span>
          <span className="text-muted-foreground">{openWins} wins · bankroll {fmt(start * Math.pow(2, openWins))}</span>
        </div>
      )}

      {finishedRuns === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">No finished runs yet — a run finishes when you lose a game (lost) or clear all 28 games (completed).</p>
      ) : (
        <div className="border-t border-border/40 max-h-56 overflow-y-auto noir-scrollbar">
          {history.map((h, i) => {
            const won = h.endedBy === "complete";
            const runNo = history.length - i;
            const profit = won ? (h.final - start) : -start;
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 text-sm">
                <span className="text-[10px] text-muted-foreground w-12 shrink-0">Run {runNo}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${won ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                  {won ? "COMPLETED" : "LOST"}
                </span>
                <span className="text-xs font-semibold">{h.wins || 0}W</span>
                <span className="text-xs text-muted-foreground">peak {fmt(h.final || 0)}</span>
                <span className={`text-xs font-semibold ml-auto ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{profit >= 0 ? "+" : ""}{fmt(profit)}</span>
                <span className="text-[10px] text-muted-foreground/70 hidden sm:block w-28 text-right shrink-0">{dateStr(h.endedAt)}</span>
              </div>
            );
          })}
        </div>
      )}

      {bestRun && (
        <div className="px-4 py-2 border-t border-border/40 text-[10px] text-muted-foreground">
          Best run: <span className="text-primary font-semibold">{bestRun.wins}W · {fmt(bestRun.final || 0)}</span> {bestRun.endedBy === "complete" ? "(completed)" : "(lost)"} · stake {fmt(start)}
        </div>
      )}
      <p className="text-[9px] text-muted-foreground/60 px-4 py-2">For fun only — not betting advice. Net profit = (completed run peak − stake) for wins, −stake for losses.</p>
    </div>
  );
}