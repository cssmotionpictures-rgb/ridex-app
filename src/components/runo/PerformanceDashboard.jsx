import React from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  BarChart, Bar, Legend,
} from "recharts";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { runoAnalytics, RUNO_MIN_GROUP_SAMPLE } from "@/lib/runOLedger";

// RUN O PERFORMANCE DASHBOARD — customer-facing: win-rate trends, total
// volume and confidence-score accuracy for recent high-confidence selections.
// Customer language only; no percentages until the settled sample earns them.
function GroupTable({ title, rows }) {
  return (
    <div>
      <p className="text-[11px] font-extrabold text-muted-foreground mb-1">{title}</p>
      {rows?.length ? (
        <div className="rounded-2xl border border-border/60 bg-secondary/40 divide-y divide-border/40">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="text-[11px] truncate min-w-0">{r.key}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {r.settled} settled ·{" "}
                {r.settled >= RUNO_MIN_GROUP_SAMPLE ? `${r.winRate}% WIN` : "INSUFFICIENT SAMPLE"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">NO SETTLED SAMPLE IN THIS GROUP YET</p>
      )}
    </div>
  );
}

const CONF_BANDS = [
  ["BELOW 70%", 0, 70],
  ["70–79%", 70, 80],
  ["80–89%", 80, 90],
  ["90%+", 90, 101],
];

export default function PerformanceDashboard({ rows, loading }) {
  const list = rows || [];
  const a = React.useMemo(() => runoAnalytics(list), [list]);

  const settled = React.useMemo(
    () => list
      .filter((r) => ["won", "lost"].includes(r.status))
      .sort((x, y) => String(x.lagos_date_key || "").localeCompare(String(y.lagos_date_key || "")) || new Date(x.kickoff || 0) - new Date(y.kickoff || 0)),
    [list]
  );

  // WIN-RATE TREND — cumulative win rate in settled order
  const trend = React.useMemo(() => {
    let w = 0;
    return settled.map((r, i) => {
      if (r.status === "won") w += 1;
      return { label: (r.lagos_date_key || "").slice(5), WIN_RATE: Math.round((w / (i + 1)) * 100), n: i + 1 };
    });
  }, [settled]);

  // CONFIDENCE-SCORE ACCURACY — predicted confidence vs observed win rate per band
  const accuracy = React.useMemo(
    () => CONF_BANDS.map(([label, lo, hi]) => {
      const sel = settled.filter((r) => {
        const c = Math.round(r.confidence || 0);
        return c >= lo && c < hi;
      });
      if (sel.length < 3) return null; // tiny bands are not shown — never a fake rate
      const predicted = Math.round(sel.reduce((s, r) => s + (r.confidence || 0), 0) / sel.length);
      const won = sel.filter((r) => r.status === "won").length;
      return { BAND: label, PREDICTED: predicted, ACTUAL: Math.round((won / sel.length) * 100), n: sel.length };
    }).filter(Boolean),
    [settled]
  );

  // TOTAL VOLUME — selections recorded per day (counts, not rates: safe at any sample)
  const volume = React.useMemo(() => {
    const m = {};
    list.forEach((r) => {
      const d = r.lagos_date_key || "—";
      m[d] = (m[d] || 0) + 1;
    });
    return Object.entries(m).sort(([a1], [b1]) => a1.localeCompare(b1)).map(([d, n]) => ({ DAY: d.slice(5), SELECTIONS: n }));
  }, [list]);

  if (loading && !list.length) {
    return (
      <SectionCard title="RUN O PERFORMANCE" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
        <p className="text-xs text-muted-foreground">Loading RUN O results…</p>
      </SectionCard>
    );
  }
  if (!list.length) {
    return (
      <SectionCard title="RUN O PERFORMANCE" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
        <EmptyState>No RUN O selections recorded yet — run a scan.</EmptyState>
      </SectionCard>
    );
  }

  const earned = a.graded >= RUNO_MIN_GROUP_SAMPLE;
  const wr = earned ? `${a.winRate}%` : "INSUFFICIENT SAMPLE";
  const roi = earned && a.paper?.roiPct != null ? `${a.paper.roiPct > 0 ? "+" : ""}${a.paper.roiPct}%` : "INSUFFICIENT SAMPLE";

  return (
    <SectionCard
      title="RUN O PERFORMANCE"
      icon={<BarChart3 className="w-4 h-4 text-primary" />}
      sub="Results settled from verified real scores only · sample grows with every finished selection"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="TOTAL SELECTIONS" value={list.length} hint={`${list.filter((r) => r.status === "open").length} still awaiting results`} />
        <Stat label="SETTLED" value={a.graded} hint={`${a.won} won · ${a.graded - a.won} lost`} />
        <Stat label="WIN RATE" value={wr} hint={earned ? "settled from verified results" : "unlocks at 10 settled selections"} />
        <Stat label="AVG RUN O SCORE" value={a.avgScore ?? "—"} />
        <Stat label="AVG CONFIDENCE" value={a.avgProb != null ? `${a.avgProb}%` : "—"} />
        <Stat label="AVG ODDS" value={a.avgOdds ?? "—"} hint="where a real price existed" />
        <Stat label="PAPER RETURN" value={roi} hint={`${a.paper?.pricedPicks ?? 0} priced settled selections · ₦1,000 paper stake`} />
        <Stat label="WIN STREAK" value={a.streak} />
      </div>

      {/* TOTAL VOLUME — daily selection volume */}
      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-primary" /> SELECTION VOLUME BY DAY
        </p>
        {volume.length > 1 ? (
          <div className="h-36 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volume} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="DAY" tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(240 12% 8%)", border: "1px solid hsl(240 8% 17%)", borderRadius: 12, fontSize: 11 }} />
                <Bar dataKey="SELECTIONS" fill="hsl(42 96% 58%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Volume trend appears once selections span more than one day.</p>
        )}
      </div>

      {earned ? (
        <>
          {/* WIN-RATE TREND */}
          <div>
            <p className="text-[11px] font-extrabold text-muted-foreground mb-1">WIN-RATE TREND (CUMULATIVE)</p>
            <div className="h-40 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(240 12% 8%)", border: "1px solid hsl(240 8% 17%)", borderRadius: 12, fontSize: 11 }}
                    formatter={(v) => [`${v}%`, "WIN RATE"]}
                    labelFormatter={(l, pts) => `after ${pts?.[0]?.payload?.n ?? 0} settled`}
                  />
                  <Line type="monotone" dataKey="WIN_RATE" stroke="hsl(42 96% 58%)" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(42 96% 58%)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CONFIDENCE ACCURACY */}
          <div>
            <p className="text-[11px] font-extrabold text-muted-foreground mb-1">
              CONFIDENCE ACCURACY — PREDICTED VS ACTUAL
            </p>
            {accuracy.length ? (
              <div className="h-44 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={accuracy} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <XAxis dataKey="BAND" tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(240 12% 8%)", border: "1px solid hsl(240 8% 17%)", borderRadius: 12, fontSize: 11 }}
                      formatter={(v, k) => [`${v}%`, k === "PREDICTED" ? "PREDICTED" : "ACTUAL WIN"]}
                      labelFormatter={(l, pts) => `${l} · ${pts?.[0]?.payload?.n ?? 0} settled`}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="PREDICTED" fill="hsl(210 90% 62%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ACTUAL" fill="hsl(168 70% 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Not enough settled selections in any confidence band yet — accuracy appears as results accumulate.</p>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3">
          <p className="text-[11px] font-bold text-amber-300">TRENDS UNLOCK AT {RUNO_MIN_GROUP_SAMPLE} SETTLED SELECTIONS</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Win-rate trends and confidence accuracy are shown only once the settled sample earns them — currently {a.graded} settled.
            No percentage is ever displayed from a tiny sample.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <GroupTable title="BY MARKET" rows={a.groups.market} />
        <GroupTable title="BY ODDS RANGE" rows={a.groups.odds} />
        <GroupTable title="BY COMPETITION" rows={a.groups.competition} />
        <GroupTable title="BY CONFIDENCE TIER" rows={a.groups.tier} />
      </div>

      <p className="text-[10px] text-muted-foreground">
        Every figure comes from real recorded selections graded against verified final scores. Where information was
        unavailable, it stays undisclosed as a number — never invented.
      </p>
    </SectionCard>
  );
}