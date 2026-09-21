import React from "react";
import { BarChart3 } from "lucide-react";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { monsterAnalytics, MONSTER_MIN_SAMPLE } from "@/lib/monsterBoardLedger";

// MONSTER PERFORMANCE — customer-facing. No percentage is shown before the
// settled sample earns it: INSUFFICIENT SAMPLE instead of a fake statistic.
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
                {r.settled >= MONSTER_MIN_SAMPLE ? `${r.winRate}% WIN` : "INSUFFICIENT SAMPLE"}
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

export default function MonsterPerformance({ rows, loading, throttled }) {
  const list = rows || [];
  const a = React.useMemo(() => monsterAnalytics(list), [list]);

  if (!list.length && throttled) {
    return (
      <SectionCard title="MONSTER PERFORMANCE" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
        <EmptyState>Temporarily unavailable — retrying.</EmptyState>
      </SectionCard>
    );
  }
  if (loading && !list.length) {
    return (
      <SectionCard title="MONSTER PERFORMANCE" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
        <p className="text-xs text-muted-foreground">Loading MONSTER results…</p>
      </SectionCard>
    );
  }
  if (!list.length) {
    return (
      <SectionCard title="MONSTER PERFORMANCE" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
        <EmptyState>No MONSTER selections recorded yet — the first daily drop creates the record.</EmptyState>
      </SectionCard>
    );
  }

  const earned = a.graded >= MONSTER_MIN_SAMPLE;
  const roi =
    earned && a.paper?.roiPct != null ? `${a.paper.roiPct > 0 ? "+" : ""}${a.paper.roiPct}%` : "INSUFFICIENT SAMPLE";

  return (
    <SectionCard
      title="MONSTER PERFORMANCE"
      icon={<BarChart3 className="w-4 h-4 text-primary" />}
      sub="Results settled from verified real scores only — no percentage is shown before the sample earns it."
    >
      {throttled && list.length > 0 && (
        <p className="text-[10px] text-amber-400 font-semibold">Refreshing…</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="SELECTIONS" value={list.length} hint={`${list.filter((r) => r.status === "open").length} awaiting results`} />
        <Stat label="SETTLED" value={a.graded} />
        <Stat label="WINS" value={a.won} />
        <Stat label="LOSSES" value={a.graded - a.won} />
        <Stat
          label="WIN RATE"
          value={earned ? `${a.winRate}%` : "INSUFFICIENT SAMPLE"}
          hint={earned ? "from verified results" : `unlocks at ${MONSTER_MIN_SAMPLE} settled selections`}
        />
        <Stat label="AVG ODDS" value={a.avgOdds ?? "—"} hint="where a real price existed" />
        <Stat label="AVG SCORE" value={a.avgScore ?? "—"} />
        <Stat label="PAPER RETURN" value={roi} hint={`${a.paper?.pricedPicks ?? 0} priced settled selections`} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <GroupTable title="BY MARKET" rows={a.groups.market} />
        <GroupTable title="BY ODDS RANGE" rows={a.groups.odds} />
        <GroupTable title="BY COMPETITION" rows={a.groups.competition} />
        <GroupTable title="BY TIER" rows={a.groups.tier} />
      </div>

      <p className="text-[10px] text-muted-foreground">
        Every figure comes from recorded selections graded against verified final scores. Nothing is manufactured.
      </p>
    </SectionCard>
  );
}