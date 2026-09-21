import React from "react";
import { LineChart } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// SUCCESS RATE OVER TIME — every qualified pick the engine suggested per day:
// how many actually HIT (graded against the real final scores) versus the
// total games suggested. Hits stack green, misses red, still-pending amber;
// the gold line is the day's real hit rate on the right axis. All numbers
// come from the settled ledger — never self-reported, never manufactured.

const DOT = { r: 2.5, strokeWidth: 0 };

function RateTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-[10px] space-y-0.5 shadow-xl">
      <p className="font-bold text-foreground">{d.date}</p>
      <p className="text-muted-foreground">{d.suggested} game{suggested1(d.suggested)} suggested</p>
      <p className="text-emerald-400 font-semibold">{d.hits} hit</p>
      {d.misses > 0 && <p className="text-red-400">{d.misses} missed</p>}
      {d.pending > 0 && <p className="text-amber-400">{d.pending} awaiting result</p>}
      {d.rate != null && (
        <p className="text-primary font-bold">{d.rate}% hit rate ({d.hits}/{d.decided})</p>
      )}
    </div>
  );
}
const suggested1 = (n) => (n === 1 ? "" : "s");

const finalize = (byKey) =>
  Object.values(byKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      decided: d.hits + d.misses,
      rate: d.hits + d.misses > 0 ? Math.round((d.hits / (d.hits + d.misses)) * 100) : null,
    }));

// Monday-start week bucket a date falls into — weekly roll-up key.
const weekStart = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d)) return null;
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
};
const fmtDay = (d) => d.toLocaleDateString([], { month: "short", day: "numeric" });

export default function EngineSuccessRateChart({ rows }) {
  const [mode, setMode] = React.useState("daily"); // daily | weekly

  const { daily, weekly } = React.useMemo(() => {
    const byDate = {};
    const byWeek = {};
    for (const r of rows || []) {
      const k = r.date || "—";
      if (!byDate[k]) byDate[k] = { date: k, hits: 0, misses: 0, pending: 0, suggested: 0 };
      const d = byDate[k];
      d.suggested++;
      if (r.status === "win") d.hits++;
      else if (r.status === "loss") d.misses++;
      else d.pending++;

      const ws = weekStart(k);
      if (ws) {
        const wk = ws.toISOString().slice(0, 10);
        if (!byWeek[wk]) {
          const end = new Date(ws);
          end.setDate(end.getDate() + 6);
          byWeek[wk] = { date: `${fmtDay(ws)} – ${fmtDay(end)}`, hits: 0, misses: 0, pending: 0, suggested: 0 };
        }
        const w = byWeek[wk];
        w.suggested++;
        if (r.status === "win") w.hits++;
        else if (r.status === "loss") w.misses++;
        else w.pending++;
      }
    }
    return { daily: finalize(byDate), weekly: finalize(byWeek) };
  }, [rows]);

  const data = mode === "weekly" ? weekly : daily;

  if (!data.length) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <LineChart className="w-4 h-4 text-primary shrink-0" />
        <p className="font-bold text-sm">SUCCESS RATE OVER TIME — HITS vs TOTAL SUGGESTED</p>
        <div className="flex rounded-full border border-border/60 overflow-hidden text-[9px] font-bold">
          {["daily", "weekly"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 uppercase tracking-wide ${
                mode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {data.reduce((s, d) => s + d.hits, 0)} hits · {data.reduce((s, d) => s + d.suggested, 0)} suggested
        </span>
      </div>
      <div className="h-56 -ml-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              yAxisId="counts"
              allowDecimals={false}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
              width={30}
            />
            <Tooltip content={<RateTooltip />} />
            <Bar dataKey="hits" yAxisId="counts" stackId="a" fill="#34d399" radius={[0, 0, 0, 0]} />
            <Bar dataKey="misses" yAxisId="counts" stackId="a" fill="#f87171" />
            <Bar dataKey="pending" yAxisId="counts" stackId="a" fill="hsl(var(--secondary))" />
            <Line
              yAxisId="rate"
              dataKey="rate"
              stroke="#f7c948"
              strokeWidth={2}
              dot={DOT}
              activeDot={{ r: 4, fill: "#f7c948" }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-400 inline-block" /> hit</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-red-400 inline-block" /> missed</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-secondary inline-block" /> awaiting result</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f7c948] inline-block" /> {mode} hit rate</span>
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        Every pick graded against the real final score — the gold line is the engine's true measured
        hit rate per {mode === "weekly" ? "week" : "day"}, not a model estimate.
      </p>
    </div>
  );
}