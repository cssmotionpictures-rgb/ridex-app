import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";

// Daily bankroll growth line chart for the 7-day rollover (4 games/day).
// Reads the same localStorage state as RolloverProgress and updates instantly
// via the ridex-rollover-change event. Purely client-side (no credits needed).
// Solid line = realized bankroll after each day; horizontal reference lines =
// the next capital milestones. All values are clamped to the visible domain so
// the exponential curve never breaks the chart scale.

const ODDS = 2.0;
const GAMES_PER_DAY = 4;
const KEY = "ridex_rollover_v1";
const TIERS = [100, 500, 1000, 5000, 10000, 25000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000];

function fmt(n) {
  if (n >= 1000000) return `₦${(n / 1000000).toFixed(n % 1000000 ? 1 : 0)}m`;
  if (n >= 1000) return `₦${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}

export default function BankrollChart() {
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

  if (!start) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        Set a starting bankroll in the rollover tracker to see your daily bankroll growth chart.
      </div>
    );
  }

  const winsSoFar = results.filter((r) => r === "W").length;
  const current = start * Math.pow(ODDS, winsSoFar);

  // Milestone reference lines: next 4 tiers above the current bankroll.
  const tiersAhead = TIERS.filter((t) => t > current);
  const shownTiers = tiersAhead.slice(0, 4);
  const yMaxRaw = shownTiers.length ? shownTiers[shownTiers.length - 1] : (TIERS.find((t) => t > current) || current * 2);
  const yMax = Math.max(yMaxRaw * 1.15, current * 1.05, start * 1.05);
  const cap = (v) => Math.min(Math.round(v), Math.round(yMax));

  // Per-day realized bankroll (clamped to the visible domain).
  const data = Array.from({ length: 7 }).map((_, d) => {
    const winsThrough = results.slice(0, (d + 1) * GAMES_PER_DAY).filter((r) => r === "W").length;
    return { day: `D${d + 1}`, bankroll: cap(start * Math.pow(ODDS, winsThrough)) };
  });

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center"><TrendingUp className="w-4 h-4" /></div>
        <div>
          <p className="text-sm font-semibold">Bankroll Growth vs Milestones</p>
          <p className="text-[10px] text-muted-foreground">Realized daily bankroll · lines = capital milestones you're climbing toward</p>
        </div>
      </div>

      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={48} tickFormatter={fmt} domain={[0, Math.round(yMax)]} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(v) => [fmt(v || 0), "Bankroll"]}
            />
            {shownTiers.map((t) => (
              <ReferenceLine key={t} y={t} stroke="hsl(var(--primary))" strokeOpacity={0.45} strokeDasharray="2 4"
                label={{ value: fmt(t), position: "right", fontSize: 9, fill: "hsl(var(--primary))" }} />
            ))}
            <Line type="monotone" dataKey="bankroll" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(var(--primary))" }} name="Bankroll" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-muted-foreground/70 mt-1">
        Currently {fmt(current)} ({winsSoFar} wins) · next milestone {fmt(shownTiers[0] || yMaxRaw)} · a full 28-win run would reach {fmt(start * Math.pow(ODDS, 28))}.
      </p>
    </div>
  );
}