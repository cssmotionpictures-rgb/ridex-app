import React from "react";

const StatCard = ({ label, value, hint }) => (
  <div className="rounded-2xl border border-border/60 bg-card/70 p-3.5">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-xl font-extrabold tabular-nums">{value}</p>
    {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
  </div>
);

const Breakdown = ({ title, rows }) => {
  const entries = Object.entries(rows || {}).sort((a, b) => (b[1].wonRate ?? -1) - (a[1].wonRate ?? -1));
  if (!entries.length) return null;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-xs">
            <span className="truncate">{k}</span>
            <span className="tabular-nums text-muted-foreground">
              {v.wonRate != null ? `${v.wonRate}% won` : "—"} · {v.settled} settled
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// WIN RABA ACCA LAB — individual selections are tracked SEPARATELY from
// accumulator hit rates: a failed acca does not mean every underlying
// prediction was bad.
export default function AccaLab({ stats }) {
  if (!stats) return null;
  const i = stats.individual || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Individual win rate" value={i.winRate != null ? `${i.winRate}%` : "—"} hint={`${i.won ?? 0} won of ${i.settled ?? 0} graded · ${i.voided ?? 0} void`} />
        <StatCard label="Accumulator hit rate" value={stats.accaHitRate != null ? `${stats.accaHitRate}%` : "—"} hint="All acca levels settled" />
        <StatCard label="☀️ Morning win rate" value={stats.morning?.winRate != null ? `${stats.morning.winRate}%` : "—"} hint={`${stats.morning?.settled ?? 0} settled`} />
        <StatCard label="🌙 Evening win rate" value={stats.evening?.winRate != null ? `${stats.evening.winRate}%` : "—"} hint={`${stats.evening?.settled ?? 0} settled`} />
        <StatCard label="Average odds" value={stats.avgOdds != null ? stats.avgOdds : "—"} hint="Real priced picks only" />
        <StatCard label="Average confidence" value={stats.avgConfidence != null ? `${stats.avgConfidence}%` : "—"} />
        <StatCard label="Average edge" value={stats.avgEdge != null ? `${stats.avgEdge > 0 ? "+" : ""}${stats.avgEdge} pts` : "—"} hint="Model vs bookmaker" />
        <StatCard
          label="Paper ROI"
          value={stats.paper?.roiPct != null ? `${stats.paper.roiPct > 0 ? "+" : ""}${stats.paper.roiPct}%` : "—"}
          hint={`₦${(stats.paper?.profit || 0).toLocaleString()} on ₦${(stats.paper?.staked || 0).toLocaleString()} staked`}
        />
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wide mb-1">Accumulator performance by level</p>
        {Object.entries(stats.accaByLevel || {}).map(([lv, v]) => (
          <div key={lv} className="flex items-center justify-between text-xs">
            <span className="capitalize">{lv === "rollover5" ? "5-day rollover" : lv}</span>
            <span className="tabular-nums text-muted-foreground">
              {v.hitRate != null ? `${v.hitRate}% hit` : "—"} · {v.settled} settled
            </span>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Breakdown title="By market" rows={stats.byMarket} />
        <Breakdown title="By league" rows={stats.byLeague} />
        <Breakdown title="By confidence" rows={stats.byConfidence} />
        <Breakdown title="By odds range" rows={stats.byOddsRange} />
      </div>

      <p className="text-[11px] text-muted-foreground px-1">
        Market weights learn from settled history only after a meaningful sample ({30}+ settled picks per market) — never overfit to a tiny sample. Model version: {stats.modelVersion}.
      </p>
    </div>
  );
}