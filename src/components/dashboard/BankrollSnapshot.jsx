import React from "react";
import { Link } from "react-router-dom";
import { Wallet, TrendingUp } from "lucide-react";

// Bankroll snapshot — the dashboard's at-a-glance view of the rollover
// strategy: current bankroll vs the initial starting stake. Reads the same
// localStorage state as the rollover tracker and updates instantly via the
// ridex-rollover-change event. Purely client-side (no credits needed).

const ODDS = 2.0;
const GAMES_PER_DAY = 4;
const KEY = "ridex_rollover_v1";

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function fmt(n) {
  if (n >= 1000000) return `₦${(n / 1000000).toFixed(n % 1000000 ? 1 : 0)}m`;
  if (n >= 1000) return `₦${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}

export default function BankrollSnapshot() {
  const [state, setState] = React.useState(load);

  React.useEffect(() => {
    const read = () => setState(load());
    const onStorage = (e) => { if (e.key === KEY) read(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("ridex-rollover-change", read);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("ridex-rollover-change", read); };
  }, []);

  const start = Number(state.start) || 0;
  const results = Array.isArray(state.results) ? state.results : [];
  const history = Array.isArray(state.history) ? state.history : [];
  const wins = results.filter((r) => r === "W").length;
  const losses = history.filter((h) => h.endedBy === "L").length;
  const current = start * Math.pow(ODDS, wins);
  const growthPct = start > 0 ? Math.round(((current - start) / start) * 100) : 0;
  const multiple = start > 0 ? current / start : 1;
  const day = Math.min(Math.floor(results.length / GAMES_PER_DAY) + 1, 7);

  if (!start) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0"><Wallet className="w-4 h-4" /></div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Bankroll snapshot</p>
          <p className="text-[11px] text-muted-foreground">Set a starting bankroll in the rollover tracker below to see live progress vs your initial stake.</p>
        </div>
      </div>
    );
  }

  // Bars are scaled against the current bankroll so the initial stake stays
  // visible even when the rollover has multiplied many times over.
  const startBarW = Math.max(3, Math.min(100, (start / current) * 100));

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center"><Wallet className="w-4 h-4" /></div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Bankroll Snapshot</p>
          <p className="text-[10px] text-muted-foreground">Current bankroll vs initial stake · live from the rollover tracker</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${growthPct > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
          {growthPct > 0 ? `+${growthPct}%` : `${growthPct}%`}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Current bankroll</p>
          <p className="text-3xl font-heading font-extrabold text-primary leading-none">{fmt(current)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Initial</p>
          <p className="text-lg font-bold leading-none">{fmt(start)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground w-10 shrink-0">START</span>
          <div className="flex-1 h-2.5 rounded-full bg-black/40 border border-border/40 overflow-hidden">
            <div className="h-full bg-muted-foreground/50" style={{ width: `${startBarW}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-primary w-10 shrink-0 font-bold">NOW</span>
          <div className="flex-1 h-2.5 rounded-full bg-black/40 border border-border/40 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary/70 to-primary" style={{ width: "100%" }} />
          </div>
        </div>
      </div>

      {/* 15% withdrawal vs 85% reinvested split — the daily cash-out strategy */}
      <div className="mt-3 rounded-xl bg-secondary/50 border border-border/40 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[9px]">
          <span className="uppercase tracking-[0.15em] text-muted-foreground font-semibold">Daily cash-out split (from day 3)</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-black/40 border border-border/40">
          <div className="h-full bg-emerald-500 flex items-center justify-center" style={{ width: "15%" }}>
            <span className="text-[8px] font-extrabold text-black/70">15</span>
          </div>
          <div className="h-full bg-primary flex items-center justify-center" style={{ width: "85%" }}>
            <span className="text-[8px] font-extrabold text-primary-foreground">85</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] font-semibold">
          <span className="text-emerald-400">Withdraw 15% · {fmt(current * 0.15)}</span>
          <span className="text-primary">Reinvest 85% · {fmt(current * 0.85)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 text-foreground font-semibold"><TrendingUp className="w-3 h-3 text-primary" /> ×{multiple % 1 ? multiple.toFixed(1) : multiple} of stake</span>
        <span>· day {day}/7</span>
        <span>· {wins} win{wins !== 1 ? "s" : ""} this run</span>
        <span>· {losses} bust{losses !== 1 ? "s" : ""} all-time</span>
      </div>

      <Link to="/sports" className="mt-2.5 inline-block text-[11px] text-primary font-semibold hover:underline">
        View today's engine picks →
      </Link>
    </div>
  );
}