import React from "react";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import { SectionCard, EmptyState } from "@/components/kala/Bits";
import { lagosTodayKey } from "@/lib/lagosTime";

// RUN O 30-DAY TREND CHARTS (customer-facing) — interactive win-rate trend and
// selection volume over the last 7/30 days, to help identify performance
// patterns. Customer language only. Honesty rules: a day's win rate is drawn
// only from its own settled selections, the settled count is always shown in
// the tooltip, and days without settled results never invent a rate.

const MODES = [
  ["both", "WIN RATE + VOLUME"],
  ["winrate", "WIN RATE"],
  ["volume", "VOLUME"],
];
const RANGES = [
  [30, "30 DAYS"],
  [7, "7 DAYS"],
];
const DAY = 86400000;

// Lagos is UTC+1 year-round — a Lagos date key converts to an exact instant.
const lagosInstant = (dateKey) => new Date(`${dateKey}T00:00:00+01:00`).getTime();
// The Lagos date key of an instant built from Lagos midnights (+1h keeps the
// UTC formatting inside the same Lagos day).
const lagosKeyOf = (instant) => new Date(instant + 3600000).toISOString().slice(0, 10);

export default function TrendCharts({ rows, loading }) {
  const [mode, setMode] = React.useState("both");
  const [range, setRange] = React.useState(30);

  const data = React.useMemo(() => {
    const today = lagosTodayKey();
    const start = lagosInstant(today) - (range - 1) * DAY;
    const byDay = {};
    (rows || []).forEach((r) => {
      const d = r?.lagos_date_key;
      if (!d) return;
      const t = lagosInstant(d);
      if (!(t >= start && t <= start + (range - 1) * DAY)) return;
      const cell = byDay[d] || (byDay[d] = { selections: 0, settled: 0, won: 0 });
      cell.selections++;
      if (["won", "lost"].includes(r.status)) {
        cell.settled++;
        if (r.status === "won") cell.won++;
      }
    });
    const days = [];
    for (let i = 0; i < range; i++) {
      const key = lagosKeyOf(start + i * DAY);
      const c = byDay[key] || { selections: 0, settled: 0, won: 0 };
      days.push({
        DAY: key.slice(5),
        FULL: key,
        SELECTIONS: c.selections,
        SETTLED: c.settled,
        WON: c.won,
        WIN_RATE: c.settled ? Math.round((c.won / c.settled) * 100) : null,
      });
    }
    return days;
  }, [rows, range]);

  const hasAny = data.some((d) => d.SELECTIONS > 0);
  const hasSettled = data.some((d) => d.SETTLED > 0);

  const tooltipStyle = {
    background: "hsl(240 12% 8%)",
    border: "1px solid hsl(240 8% 17%)",
    borderRadius: 12,
    fontSize: 11,
  };
  const labelOf = (l, pts) => {
    const p = pts?.[0]?.payload;
    return `${p?.FULL || l} · ${p?.SETTLED ?? 0} settled`;
  };

  return (
    <SectionCard
      title="PERFORMANCE PATTERNS — LAST 30 DAYS"
      icon={<TrendingUp className="w-4 h-4 text-primary" />}
      sub="Interactive win-rate trend and selection volume, day by day, to help you spot performance patterns"
    >
      <div className="flex flex-wrap gap-1.5">
        {MODES.map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors ${
              mode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 w-px bg-border/70 hidden sm:block" />
        {RANGES.map(([r, label]) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors ${
              range === r ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !rows ? (
        <p className="text-xs text-muted-foreground">Loading RUN O history…</p>
      ) : !hasAny ? (
        <EmptyState>No selections recorded in this period yet — run a scan and the trend builds as selections settle.</EmptyState>
      ) : (
        <>
          {mode !== "volume" && (
            <div>
              <p className="text-[11px] font-extrabold text-muted-foreground mb-1">
                DAILY WIN RATE {hasSettled ? "" : "— APPEARS AS RESULTS SETTLE"}
              </p>
              {hasSettled ? (
                <div className="h-44 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    {mode === "both" ? (
                      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <XAxis dataKey="DAY" tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} interval="preserveStartEnd" />
                        <YAxis yAxisId="vol" allowDecimals={false} tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} />
                        <YAxis yAxisId="rate" domain={[0, 100]} orientation="right" tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} />
                        <Tooltip contentStyle={tooltipStyle} labelFormatter={labelOf} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar yAxisId="vol" dataKey="SELECTIONS" name="SELECTIONS" fill="hsl(42 96% 58% / 0.45)" radius={[4, 4, 0, 0]} />
                        <Line yAxisId="rate" type="monotone" dataKey="WIN_RATE" name="WIN RATE %" stroke="hsl(42 96% 58%)" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(42 96% 58%)" }} connectNulls={false} />
                      </ComposedChart>
                    ) : (
                      <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <XAxis dataKey="DAY" tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} interval="preserveStartEnd" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          labelFormatter={labelOf}
                          formatter={(v) => [v == null ? "—" : `${v}%`, "WIN RATE"]}
                        />
                        <Line type="monotone" dataKey="WIN_RATE" stroke="hsl(42 96% 58%)" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(42 96% 58%)" }} connectNulls={false} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  No finished selections in this period yet — the win-rate line appears the day results start settling.
                </p>
              )}
            </div>
          )}

          {mode !== "winrate" && (
            <div>
              <p className="text-[11px] font-extrabold text-muted-foreground mb-1">DAILY SELECTION VOLUME</p>
              <div className="h-36 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <XAxis dataKey="DAY" tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={labelOf} formatter={(v) => [v, "SELECTIONS"]} />
                    <Bar dataKey="SELECTIONS" fill="hsl(42 96% 58%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            A day's win rate comes only from that day's finished selections — tap any point for the settled count behind it.
            Days with few finished selections move more than a mature sample; volume bars show exactly how much
            evidence stands behind each day.
          </p>
        </>
      )}
    </SectionCard>
  );
}