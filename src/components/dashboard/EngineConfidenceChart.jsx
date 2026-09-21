import React from "react";
import { Loader2, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { base44 } from "@/api/base44Client";

// ENGINE CONFIDENCE — the engine's current open picks ranked by model
// probability, so the games the engine feels MOST certain about sit at the
// top. Real model outputs from the pick ledger, never invented numbers.

const barColor = (prob) => (prob >= 90 ? "hsl(42 96% 58%)" : prob >= 80 ? "hsl(168 70% 45%)" : "hsl(210 90% 62%)");
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || "");

export default function EngineConfidenceChart() {
  const [picks, setPicks] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    base44.entities.EnginePick.filter({ status: "open" }, "-probability", 15)
      .then((rows) => live && setPicks(rows || []))
      .catch(() => {
        if (live) {
          setFailed(true);
          setPicks([]);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const data = React.useMemo(
    () =>
      (picks || []).map((p) => ({
        name: clip(`${p.home_team} v ${p.away_team}`, 22),
        market: p.market_label || "",
        kickoff: p.kickoff,
        prob: Math.round((Number(p.probability) || 0) * 1000) / 10,
      })),
    [picks]
  );

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">ENGINE CONFIDENCE</p>
          <p className="text-[10px] text-muted-foreground">
            Which games the model engine feels most certain about — open picks ranked by calibrated probability.
          </p>
        </div>
      </div>

      {picks === null ? (
        <div className="py-8 flex flex-col items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-[11px] text-muted-foreground">Loading engine picks…</p>
        </div>
      ) : !data.length ? (
        <div className="py-6 text-center">
          <p className="text-xs font-bold text-amber-400">NO OPEN PICKS RIGHT NOW</p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
            {failed
              ? "The pick ledger could not be reached — try again in a moment."
              : "The engine publishes picks only when model confidence clears every scrutiny bar. None are open right now."}
          </p>
        </div>
      ) : (
        <>
          <div style={{ height: Math.min(420, 44 + data.length * 26) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 8% 17%)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(240 6% 62%)" }} unit="%" />
                <YAxis type="category" dataKey="name" width={116} tick={{ fontSize: 10, fill: "hsl(40 30% 96%)" }} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "hsl(240 8% 14% / 0.4)" }}
                  contentStyle={{ background: "hsl(240 12% 8%)", border: "1px solid hsl(240 8% 17%)", borderRadius: 12, fontSize: 11 }}
                  labelStyle={{ color: "hsl(40 30% 96%)" }}
                  formatter={(value, _name, item) => [
                    `${value}% · ${item?.payload?.market || ""}`,
                    "Model confidence",
                  ]}
                  labelFormatter={() => ""}
                />
                <Bar dataKey="prob" radius={[0, 6, 6, 0]} barSize={16}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={barColor(d.prob)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
            Top {data.length} open picks · probabilities are calibrated model estimates, never guarantees · picks lock at kickoff.
          </p>
        </>
      )}
    </div>
  );
}