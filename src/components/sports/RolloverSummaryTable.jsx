import React from "react";
import { TrendingUp, Minus, History } from "lucide-react";

// Clean 7-day rollover summary — 4 games/day (2 morning + 2 evening). Reads the
// same localStorage state as RolloverProgress and updates instantly via the
// ridex-rollover-change event. Purely client-side (no credits needed).

const ODDS = 2.0;
const GAMES_PER_DAY = 4;
const KEY = "ridex_rollover_v1";
const TIERS = [
  { label: "₦100", value: 100 }, { label: "₦500", value: 500 },
  { label: "₦1k", value: 1000 }, { label: "₦5k", value: 5000 },
  { label: "₦10k", value: 10000 }, { label: "₦25k", value: 25000 },
  { label: "₦50k", value: 50000 }, { label: "₦100k", value: 100000 },
  { label: "₦200k", value: 200000 }, { label: "₦500k", value: 500000 },
  { label: "₦1m", value: 1000000 }, { label: "₦2m", value: 2000000 },
  { label: "₦5m", value: 5000000 },
];

function fmt(n) {
  if (n >= 1000000) return `₦${(n / 1000000).toFixed(n % 1000000 ? 1 : 0)}m`;
  if (n >= 1000) return `₦${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}

export default function RolloverSummaryTable() {
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

  // Day-by-day bankroll walk (4 games/day).
  let bal = start;
  const rows = Array.from({ length: 7 }).map((_, d) => {
    const before = bal;
    const dayGames = Array.from({ length: GAMES_PER_DAY }).map((_, s) => results[d * GAMES_PER_DAY + s]);
    const winsInDay = dayGames.filter((r) => r === "W").length;
    bal = before * Math.pow(ODDS, winsInDay);
    return { day: d + 1, games: dayGames, winsInDay, before, after: bal };
  });

  const current = bal;
  const totalGrowth = start > 0 ? Math.round(((current - start) / start) * 100) : 0;
  const wins = results.filter((r) => r === "W").length;
  const profit = Math.max(0, current - start);
  const withdraw15 = Math.round(profit * 0.15);
  const nextTier = TIERS.find((t) => t.value > current) || TIERS[TIERS.length - 1];
  const totalWins = history.reduce((s, h) => s + (h.wins || 0), 0) + wins;
  const totalLosses = history.filter((h) => h.endedBy === "L").length;
  const runsPlayed = history.length + (results.length > 0 ? 1 : 0);

  if (!start) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        Set a starting bankroll in the rollover tracker above to see your 7-day summary.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 bg-secondary/40 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center"><TrendingUp className="w-3.5 h-3.5" /></div>
        <div>
          <p className="text-sm font-semibold">7-Day Plan Summary · 4 games/day</p>
          <p className="text-[10px] text-muted-foreground">Current run: {wins} wins · {runsPlayed} run{runsPlayed !== 1 ? "s" : ""} played · {totalWins}W / {totalLosses}L</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-base font-heading font-extrabold text-primary leading-none">{fmt(current)}</p>
          <p className="text-[10px] text-muted-foreground">{totalGrowth >= 0 ? `+${totalGrowth}%` : `${totalGrowth}%`} from {fmt(start)}</p>
        </div>
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/20">
              <th className="text-left font-medium px-3 py-2">Day</th>
              <th className="text-left font-medium px-3 py-2">Games (M1·M2·E1·E2)</th>
              <th className="text-right font-medium px-3 py-2">Bankroll</th>
              <th className="text-right font-medium px-3 py-2">Growth</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const growth = row.before > 0 ? Math.round(((row.after - row.before) / row.before) * 100) : 0;
              return (
                <tr key={row.day} className="border-t border-border/40">
                  <td className="px-3 py-2 font-medium">{row.day}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {row.games.map((g, s) => (
                        <span key={s} className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold border ${
                          g === "W" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" :
                          "bg-secondary text-muted-foreground border-border/40"
                        }`}>{g === "W" ? "W" : <Minus className="w-3 h-3" />}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{fmt(row.after)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${growth > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {row.winsInDay > 0 ? `+${growth}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-border/40 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Start</p>
          <p className="text-sm font-semibold">{fmt(start)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit</p>
          <p className="text-sm font-semibold text-emerald-400">{fmt(profit)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Withdraw 15%</p>
          <p className="text-sm font-semibold text-primary">{fmt(withdraw15)}</p>
        </div>
      </div>

      {history.length > 0 && (
        <div className="px-4 py-2 border-t border-border/40">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1"><History className="w-3 h-3" /> Past runs (kept)</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {history.slice(0, 8).map((h, i) => (
              <span key={i} className="text-[10px]">
                <span className="text-muted-foreground">Run {history.length - i}:</span>{" "}
                <span className="font-semibold">{h.wins}W</span>{" "}
                <span className="text-muted-foreground">→ {fmt(h.final || 0)}</span>{" "}
                <span className={h.endedBy === "L" ? "text-red-400" : "text-emerald-400"}>{h.endedBy === "L" ? "lost" : "done"}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-t border-border/40">
        <p className="text-[10px] text-muted-foreground">Next milestone: <span className="text-primary font-semibold">{nextTier.label}</span> · {fmt(current)} of {fmt(nextTier.value)}</p>
      </div>
      <p className="text-[9px] text-muted-foreground/60 px-4 py-2">For fun only — not betting advice. A lost game ends the run and auto-starts a fresh 7-day roll; history is always kept.</p>
    </div>
  );
}