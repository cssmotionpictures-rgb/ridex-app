import React from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { TrendingUp } from "lucide-react";
import { getLedger, settleLedger } from "@/lib/pickLedger";

// BANKROLL PROGRESSION — built from the REAL win/loss ledger, not a plan:
// every settled engine pick is staked at 1 unit at its model fair odds
// (1 / probability). A win banks odds-1 units, a loss drops the stake, and
// the running total is the performance trend over time. Open picks are
// settled against real final scores on mount so the line is always current.

export default function BankrollProgressionChart() {
  const [rows, setRows] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try { await settleLedger(); } catch {}
      if (alive) setRows(getLedger());
    })();
    return () => { alive = false; };
  }, []);

  if (!rows) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        Settling your football picks against real results…
      </div>
    );
  }

  const settled = rows
    .filter((r) => r.status === "win" || r.status === "loss")
    .sort((a, b) => new Date(a.settledAt || a.date || 0) - new Date(b.settledAt || b.date || 0));

  if (!settled.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        No settled picks yet — your bankroll progression appears here as soon as matches finish and the engine grades its first wins and losses.
      </div>
    );
  }

  let bank = 0;
  const data = settled.map((r) => {
    const odds = Math.max(1.01, 1 / Math.max(0.01, r.probability || 0.5));
    bank += r.status === "win" ? odds - 1 : -1;
    return {
      label: r.date,
      match: `${r.home || "?"} v ${r.away || "?"} — ${r.marketLabel || ""}`,
      result: r.status,
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
        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center"><TrendingUp className="w-4 h-4" /></div>
        <div>
          <p className="text-sm font-semibold">Bankroll Progression — Winning vs Losing Picks</p>
          <p className="text-[10px] text-muted-foreground">
            1 unit per pick at model odds · running total over time · {wins}W / {losses}L
          </p>
        </div>
      </div>

      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="bankfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} minTickGap={18} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={44} unit="u" />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(v, n, p) => [`${v > 0 ? "+" : ""}${v} units (${p?.payload?.result})`, "Bankroll"]}
              labelFormatter={(_, p) => p?.[0]?.payload?.match || ""}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} strokeDasharray="2 4" />
            <Area type="monotone" dataKey="bankroll" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#bankfill)" name="Bankroll" dot={{ r: 2.5, fill: "hsl(var(--primary))" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-muted-foreground/70 mt-1">
        Net {bank > 0 ? "+" : ""}{bank.toFixed(2)} units · {hitRate}% hit rate · {roiPerPick}% ROI per pick · graded against real final scores, never self-reported.
      </p>
    </div>
  );
}