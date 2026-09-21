import React from "react";
import { TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { getLedger, settleLedger } from "@/lib/pickLedger";

// ENGINE ACCURACY TREND — the last 30 days of settled picks from the accuracy
// ledger: how the engine's predicted wins matched the real final scores,
// day by day, plus the rolling cumulative accuracy so any improvement over
// the month is visible at a glance. Every point is graded against the real
// final score (WIN/LOSS) — never self-reported.

const DAYS = 30;

export default function AccuracyTrendChart() {
  const [rows, setRows] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      let list = getLedger();
      try {
        const res = await settleLedger(); // settle finished games first
        list = res.rows || list;
      } catch {}
      if (alive) setRows(list);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (rows === null) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS);
  const decided = rows.filter(
    (r) => (r.status === "win" || r.status === "loss") && r.date && new Date(r.date) >= cutoff
  );

  if (!decided.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary shrink-0" />
          <p className="font-bold text-sm">ENGINE ACCURACY TREND</p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          Predicted wins vs real outcomes over the last {DAYS} days. Settled picks appear here as soon as matches
          finish — open the prediction board to record picks, then the trend builds itself.
        </p>
      </div>
    );
  }

  // Group settled picks per day, oldest → newest.
  const byDay = {};
  decided.forEach((r) => {
    (byDay[r.date] ||= []).push(r);
  });
  const days = Object.keys(byDay).sort();

  let wins = 0, total = 0, expWins = 0;
  const data = days.map((d) => {
    const list = byDay[d];
    const dayWins = list.filter((r) => r.status === "win").length;
    const dayExp = list.reduce((s, r) => s + (r.probability || 0), 0);
    wins += dayWins;
    total += list.length;
    expWins += dayExp;
    return {
      day: new Date(d + "T00:00:00").toLocaleDateString("en-NG", { day: "numeric", month: "short" }),
      picks: list.length,
      predicted: Number(dayExp.toFixed(1)), // expected wins from model probabilities
      actual: dayWins,                      // real wins
      hitRate: Math.round((dayWins / list.length) * 100),
      cumulative: Math.round((wins / total) * 100),
    };
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <TrendingUp className="w-4 h-4 text-primary shrink-0" />
        <p className="font-bold text-sm">ENGINE ACCURACY TREND</p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Last {DAYS} days · {wins}/{total} predicted picks won ({Math.round((wins / total) * 100)}%)
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground">
        The model expected <span className="text-foreground font-semibold">{expWins.toFixed(0)}</span> wins from these
        picks — the real outcomes delivered <span className="text-primary font-semibold">{wins}</span>. The gap between
        the two lines is the engine's calibration drift.
      </p>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 2, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={34} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 11 }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(v, name, item) => {
                const r = item?.payload || {};
                if (name === "Daily hit rate" || name === "Cumulative accuracy") return [`${v}%`, name];
                return [`${v} of ${r.picks} picks`, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 9 }} />
            <Line type="monotone" dataKey="hitRate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2.5 }} name="Daily hit rate" />
            <Line type="monotone" dataKey="cumulative" stroke="hsl(168 70% 45%)" strokeWidth={2.5} dot={false} name="Cumulative accuracy" />
            <Line type="monotone" dataKey="predicted" stroke="hsl(210 90% 62%)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Predicted wins" />
            <Line type="monotone" dataKey="actual" stroke="hsl(20 90% 60%)" strokeWidth={1.5} dot={{ r: 2 }} name="Actual wins" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
        Every point is graded against the real final score (WIN/LOSS) — never self-reported. Empty stretches mean no
        matches settled that day; the engine never fills gaps with invented data.
      </p>
    </div>
  );
}