import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// RELIABILITY CURVE (admin-only) — predicted probability vs observed win rate.
// The dashed gold line is PERFECT CALIBRATION (observed == predicted); the
// solid line is KALA's actually observed performance. A solid line BELOW the
// dashed one at a band = overconfidence, exposed immediately. Only bands with
// settled data are drawn — no curve is invented from zero rows.
export default function ReliabilityCurve({ bands }) {
  const data = (bands || [])
    .filter((b) => b.n > 0)
    .map((b) => ({
      band: `${b.band} (n=${b.n})`,
      perfect: b.predictedPct,
      observed: b.observedPct,
      ciLo: b.ciLoPct,
      ciHi: b.ciHiPct,
    }));
  return (
    <div className="rounded-2xl bg-secondary/40 border border-border/50 p-3">
      <p className="text-[11px] font-extrabold mb-1">RELIABILITY CURVE — PREDICTED vs OBSERVED</p>
      {data.length === 0 ? (
        <p className="text-[11px] text-muted-foreground py-4 text-center">
          No settled observations yet — the curve appears only when real outcomes exist. Never drawn from zero data.
        </p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="band" tick={{ fill: "#94a3b8", fontSize: 9 }} stroke="rgba(255,255,255,0.15)" />
              <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 9 }} stroke="rgba(255,255,255,0.15)" />
              <Tooltip
                contentStyle={{ background: "#161b26", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 11 }}
                formatter={(v, name) => [`${v}%`, name === "perfect" ? "Perfect calibration" : "KALA observed"]}
              />
              <Legend
                wrapperStyle={{ fontSize: 10 }}
                formatter={(v) => (v === "perfect" ? "Perfect calibration" : "KALA observed")}
              />
              <Line type="monotone" dataKey="perfect" stroke="#f7c948" strokeDasharray="5 4" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="observed" stroke="#5ed1da" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground mt-1">
        The solid line sitting below the dashed line means the engine is OVERCONFIDENT in that band — exposed, not averaged away.
      </p>
    </div>
  );
}