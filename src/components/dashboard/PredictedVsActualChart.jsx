import React from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { getLedger, settleLedger } from "@/lib/pickLedger";

const BUCKETS = 5; // five 7-day buckets = the last month
const DAYS = BUCKETS * 7;

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// PREDICTED WINS VS ACTUAL OUTCOMES — weekly buckets of the last month's
// settled picks: the model's predicted wins (the sum of its real
// probabilities) side by side with the actual wins graded against the real
// final scores, plus the weekly accuracy line so improvement over time reads
// at a glance. Every point is graded against the real final score — never
// self-reported.
export default function PredictedVsActualChart() {
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
    (r) => (r.status === "win" || r.status === "loss") && r.date && r.date >= ymd(cutoff)
  );

  if (!decided.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary shrink-0" />
          <p className="font-bold text-sm">PREDICTED WINS VS ACTUAL OUTCOMES</p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          Weekly predicted wins side by side with real match outcomes over the last month. Settled picks appear
          here as soon as matches finish — open the prediction board to record picks, then the comparison builds itself.
        </p>
      </div>
    );
  }

  // five 7-day buckets, oldest → newest
  const now = new Date();
  const buckets = [];
  for (let k = BUCKETS - 1; k >= 0; k--) {
    const end = new Date(now);
    end.setDate(end.getDate() - k * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    buckets.push({ startStr: ymd(start), endStr: ymd(end), start, end });
  }

  const data = buckets.map((b) => {
    const list = decided.filter((r) => r.date >= b.startStr && r.date <= b.endStr);
    const picks = list.length;
    const actual = list.filter((r) => r.status === "win").length;
    const predicted = list.reduce((s, r) => s + (r.probability || 0), 0);
    return {
      label: `${b.start.toLocaleDateString("en", { month: "short", day: "numeric" })}–${b.end.getDate()}`,
      picks,
      predicted: picks ? Number(predicted.toFixed(1)) : 0,
      actual,
      accuracy: picks ? Math.round((actual / picks) * 100) : null,
    };
  });

  const totals = decided.reduce(
    (s, r) => ({ picks: s.picks + 1, actual: s.actual + (r.status === "win" ? 1 : 0) }),
    { picks: 0, actual: 0 }
  );
  const accs = data.filter((d) => d.picks > 0).map((d) => d.accuracy);
  const delta = accs.length >= 2 ? accs[accs.length - 1] - accs[accs.length - 2] : null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <BarChart3 className="w-4 h-4 text-primary shrink-0" />
        <p className="font-bold text-sm">PREDICTED WINS VS ACTUAL OUTCOMES</p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Last month · {totals.actual}/{totals.picks} picks won ({Math.round((totals.actual / totals.picks) * 100)}%)
        </span>
      </div>

      {delta != null && (
        <p
          className={`text-[11px] font-semibold flex items-center gap-1.5 ${
            delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"
          }`}
        >
          <TrendingUp className={`w-3.5 h-3.5 ${delta < 0 ? "rotate-180" : ""}`} />
          {delta > 0
            ? `Improving — this week's accuracy is up ${delta} points on the prior week.`
            : delta < 0
            ? `Cooling — this week's accuracy is down ${Math.abs(delta)} points on the prior week.`
            : "Holding steady — same accuracy as the prior week."}
        </p>
      )}

      <div style={{ width: "100%", height: 190 }}>
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 2, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
            <YAxis yAxisId="count" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
            <YAxis yAxisId="acc" orientation="right" domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={32} unit="%" />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 11 }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(v, name, item) => {
                const r = item?.payload || {};
                if (name === "Weekly accuracy") return [`${v}% of ${r.picks} picks`, name];
                return [`${v} of ${r.picks} picks`, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 9 }} />
            <Bar yAxisId="count" dataKey="predicted" name="Predicted wins" fill="hsl(210 90% 62%)" fillOpacity={0.45} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="count" dataKey="actual" name="Actual wins" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Line yAxisId="acc" type="monotone" dataKey="accuracy" name="Weekly accuracy" stroke="hsl(168 70% 45%)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
        Predicted wins sum the model's real probabilities per week; actual wins are graded against the real final
        scores. Weeks with no settled matches stay empty — the engine never fills gaps with invented data.
      </p>
    </div>
  );
}