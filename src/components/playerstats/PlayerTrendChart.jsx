import React from "react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

// xG-VS-GOALS TREND CHARTS — raw public data only: what the player actually
// scored each match versus the quality of chances created for them, plus the
// season running totals. No model outputs, no predictions.

const TOOLTIP_STYLE = {
  background: "hsl(240 12% 8%)",
  border: "1px solid hsl(240 8% 17%)",
  borderRadius: 12,
  fontSize: 11,
};

export default function PlayerTrendChart({ matches }) {
  let cumGoals = 0;
  let cumXG = 0;
  const data = matches.map((m, i) => {
    cumGoals += m.goals;
    cumXG = Math.round((cumXG + m.xG) * 100) / 100;
    return {
      idx: i + 1,
      date: String(m.date || "").slice(0, 10),
      xG: m.xG,
      goals: m.goals,
      cumGoals,
      cumXG,
    };
  });

  if (data.length < 2) {
    return <p className="text-xs text-muted-foreground py-6 text-center">Not enough matches recorded yet for a trend chart.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Per match — goals vs expected goals</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="hsl(240 8% 17%)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="idx" tick={{ fill: "hsl(240 6% 62%)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(240 6% 62%)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "hsl(40 30% 96%)" }} labelFormatter={(i) => `Match ${i}`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="xG" name="Expected goals (xG)" fill="#f7c948" radius={[3, 3, 0, 0]} />
              <Bar dataKey="goals" name="Goals" fill="#34d399" radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Season running total</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="hsl(240 8% 17%)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="idx" tick={{ fill: "hsl(240 6% 62%)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(240 6% 62%)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "hsl(40 30% 96%)" }} labelFormatter={(i) => `After match ${i}`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="cumXG" name="Total expected goals" stroke="#f7c948" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cumGoals" name="Total goals" stroke="#34d399" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}