import React from "react";
import { History } from "lucide-react";
import { SectionCard, EmptyState, ResultBadge } from "@/components/kala/Bits";
import { lagosDayLabel } from "@/lib/lagosTime";

// MONSTER HISTORY — every previous daily board stays on record, grouped by
// Lagos day. History is never overwritten.
export default function MonsterHistory({ rows, todayKey, loading, throttled }) {
  const days = React.useMemo(() => {
    const byDay = {};
    (rows || []).forEach((r) => {
      const k = r.lagos_date_key || "—";
      (byDay[k] ||= []).push(r);
    });
    return Object.entries(byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dKey, list]) => {
        const settled = list.filter((r) => ["won", "lost"].includes(r.status));
        const won = settled.filter((r) => r.status === "won").length;
        return {
          dKey,
          list: [...list].sort((a, b) => (a.rank || 99) - (b.rank || 99)),
          n: list.length,
          open: list.filter((r) => r.status === "open").length,
          won,
          lost: settled.length - won,
          void: list.filter((r) => r.status === "void").length,
          winRate: settled.length >= 3 ? Math.round((won / settled.length) * 100) : null,
        };
      });
  }, [rows]);

  return (
    <SectionCard
      title="MONSTER HISTORY"
      icon={<History className="w-4 h-4 text-primary" />}
      sub="Every previous board stays on record — history is never overwritten."
    >
      {throttled && days.length > 0 && (
        <p className="text-[10px] text-amber-400 font-semibold mb-2">Refreshing…</p>
      )}
      {!days.length && loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : days.length ? (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.dKey} className="rounded-2xl border border-border/60 bg-secondary/40 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold truncate">
                  {String(lagosDayLabel(d.dKey)).toUpperCase()}{d.dKey === todayKey ? " · TODAY" : ""}
                </p>
                <p className="text-[10px] text-muted-foreground shrink-0">
                  {d.n} SELECTIONS · {d.won}W {d.lost}L{d.void ? ` ${d.void}V` : ""}
                  {d.open ? ` · ${d.open} AWAITING` : ""} · {d.winRate != null ? `${d.winRate}% WIN` : "—"}
                </p>
              </div>
              {d.list.map((r) => (
                <p key={r.id} className="text-[11px] text-muted-foreground flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate">{r.home} vs {r.away} — {r.market_label}</span>
                  <ResultBadge status={r.status} />
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>
          {throttled ? "Temporarily unavailable — retrying." : "No recorded MONSTER boards yet."}
        </EmptyState>
      )}
    </SectionCard>
  );
}