import React from "react";
import { ComposedChart, Line, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { TrendingUp } from "lucide-react";
import { getLedger, settleLedger } from "@/lib/pickLedger";
import { getBatches, settleSlipLedger } from "@/lib/slipLedger";

// WEEKLY BANKROLL PROGRESSION (admin) — ALL winning and losing picks: the
// board pick ledger PLUS every settled 50-leg slip-batch leg (CHOP EBA,
// SPECIAL ODDS, basketball & the other sports). Aggregated per calendar week
// (Monday start): bars show each week's net units from winning vs losing
// picks (green up / red down), and the gold trend line is the running
// bankroll week over week. 1 unit per pick at model fair odds; graded
// against real final scores, never self-reported.

export default function BankrollWeeklyChart() {
  const [rows, setRows] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try { await Promise.all([settleLedger(), settleSlipLedger()]); } catch {}
      if (alive) {
        setRows([
          ...getLedger().map((r) => ({ date: r.date || (r.settledAt || "").slice(0, 10), status: r.status, probability: r.probability })),
          ...getBatches().flatMap((b) => b.legs).map((l) => ({ date: l.date, status: l.status, probability: l.probability })),
        ]);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!rows) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        Settling every pick and slip leg against real results…
      </div>
    );
  }

  const settled = rows
    .filter((r) => r.status === "win" || r.status === "loss")
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  if (!settled.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        No settled picks yet — the weekly bankroll trend appears here as soon as matches finish and the engine grades its first wins and losses from the board and every slip batch.
      </div>
    );
  }

  // Group settled picks by ISO week (Monday start)
  const weeks = new Map();
  for (const r of settled) {
    const d = new Date(`${r.date || r.settledAt?.slice(0, 10) || "1970-01-01"}T12:00:00Z`);
    const ws = new Date(d);
    ws.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = ws.toISOString().slice(0, 10);
    const w = weeks.get(key) || { key, wins: 0, losses: 0, net: 0 };
    const odds = Math.max(1.01, 1 / Math.max(0.01, r.probability || 0.5));
    if (r.status === "win") { w.wins++; w.net += odds - 1; } else { w.losses++; w.net -= 1; }
    weeks.set(key, w);
  }

  let bank = 0;
  const data = [...weeks.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((w) => {
      bank += w.net;
      return {
        ...w,
        label: new Date(`${w.key}T12:00:00Z`).toLocaleDateString([], { month: "short", day: "numeric" }),
        weeklyNet: Math.round(w.net * 100) / 100,
        bankroll: Math.round(bank * 100) / 100,
      };
    });

  const wins = settled.filter((r) => r.status === "win").length;
  const losses = settled.length - wins;
  const hitRate = Math.round((wins / settled.length) * 100);
  const roiPerPick = ((bank / settled.length) * 100).toFixed(0);

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          <TrendingUp className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Weekly Bankroll Progression — All Winning & Losing Picks</p>
          <p className="text-[10px] text-muted-foreground">
            {data.length} weeks tracked · board picks + every slip-batch leg · 1 unit per pick at model odds · {wins}W / {losses}L
          </p>
        </div>
      </div>

      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} minTickGap={18} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={44} unit="u" />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(v, n, p) => {
                const d = p?.payload || {};
                return n === "Bankroll"
                  ? [`${v > 0 ? "+" : ""}${v} units (running total)`, n]
                  : [`${v > 0 ? "+" : ""}${v} units · ${d.wins || 0}W / ${d.losses || 0}L`, "This week"];
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} strokeDasharray="2 4" />
            <Bar dataKey="weeklyNet" name="This week" radius={[3, 3, 0, 0]} maxBarSize={26}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.weeklyNet >= 0 ? "#10b981" : "#ef4444"} fillOpacity={0.75} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="bankroll" name="Bankroll" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(var(--primary))" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-muted-foreground/70 mt-1">
        Net {bank > 0 ? "+" : ""}{bank.toFixed(2)} units · {hitRate}% hit rate · {roiPerPick}% ROI per pick · graded against real final scores, never self-reported.
      </p>
    </div>
  );
}