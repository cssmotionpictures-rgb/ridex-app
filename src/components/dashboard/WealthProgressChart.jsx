import React, { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { TIERS } from "@/lib/businessBlueprints";
import { TrendingUp, Target } from "lucide-react";

function nairaToNum(s) { return Number(String(s).replace(/[₦,\s]/g, "")) || 0; }
function fmt(n) { return "₦" + n.toLocaleString(); }

const TARGET = 1_000_000_000;

export default function WealthProgressChart() {
  const tiers = TIERS.map((t, i) => ({ idx: i, label: t.capital, value: nairaToNum(t.capital) }));
  const [current, setCurrent] = useState(() => {
    const saved = Number(localStorage.getItem("ridex_wealth_tier") || 0);
    return Number.isFinite(saved) && saved >= 0 && saved < tiers.length ? saved : 0;
  });

  const pick = (i) => { setCurrent(i); try { localStorage.setItem("ridex_wealth_tier", String(i)); } catch {} };
  const cur = tiers[current];
  const progress = Math.min(100, (cur.value / TARGET) * 100);

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary mb-1 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Wealth Lab Progress</p>
          <h3 className="text-lg font-extrabold">From ₦200k to ₦1bn — 11 tiers</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Pick your current capital to see how far you've climbed.</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-primary">{progress.toFixed(progress < 1 ? 2 : 0)}%</p>
          <p className="text-[11px] text-muted-foreground">of ₦1bn target</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 rounded-full bg-secondary/60 overflow-hidden mb-1">
        <div className="h-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${Math.max(2, progress)}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground mb-4 flex items-center gap-1.5">
        <Target className="w-3 h-3" /> You are here: <span className="text-primary font-semibold">{cur.label}</span> → target ₦1,000,000,000
      </p>

      <div className="h-52 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={tiers} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(i) => `T${i + 1}`} axisLine={false} tickLine={false} />
            <YAxis hide scale="log" domain={[100000, TARGET]} />
            <Tooltip
              cursor={{ fill: "hsl(var(--primary) / 0.08)" }}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
              formatter={(v) => [fmt(v), "Capital tier"]}
              labelFormatter={(i) => tiers[i]?.label || ""}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} onClick={(d) => pick(d.idx)} cursor="pointer">
              {tiers.map((t) => (
                <Cell key={t.idx} fill={t.idx === current ? "hsl(var(--primary))" : t.idx < current ? "hsl(var(--primary) / 0.45)" : "hsl(var(--muted) / 0.5)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tier quick-select */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-3">
        {tiers.map((t, i) => (
          <button
            key={t.idx}
            onClick={() => pick(i)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${i === current ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/40 text-muted-foreground border-border/50"}`}
            title={t.label}
          >
            T{i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}