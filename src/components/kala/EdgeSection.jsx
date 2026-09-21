import React from "react";
import { TrendingUp } from "lucide-react";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { groupBy } from "@/lib/kala";

// EDGE LAB — where the model sees value the market may have missed, and
// whether positive edges actually realized. Only real bookmaker prices count.
export default function EdgeSection({ picks, preds }) {
  const pricedPicks = (picks || []).filter((p) => (p.marketOdds || 0) > 1);
  const top = [...pricedPicks].sort((a, b) => b.edgePct - a.edgePct).slice(0, 10);

  const graded = (preds || []).filter((r) => ["won", "lost"].includes(r.status) && (r.market_odds || 0) > 1);
  const pos = graded.filter((r) => (r.edge_pct || 0) > 0);
  const neg = graded.filter((r) => (r.edge_pct || 0) <= 0);
  const wr = (list) => (list.length ? Math.round((list.filter((r) => r.status === "won").length / list.length) * 1000) / 10 : null);
  const withClv = (preds || []).filter((r) => (r.closing_odds || 0) > 1);

  return (
    <SectionCard
      title="EDGE LAB"
      icon={<TrendingUp className="w-4 h-4 text-primary" />}
      sub="Edge = KALA probability − market implied probability. Real prices only — model-only picks are never given a fake edge."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="PRICED PICKS ON BOARD" value={pricedPicks.length} />
        <Stat label="POSITIVE EDGE" value={pricedPicks.filter((p) => p.edgePct > 0).length} tone="text-emerald-300" />
        <Stat label="AVG EDGE (RECORDED)" value={
          graded.length ? `${Math.round((graded.reduce((s, r) => s + (r.edge_pct || 0), 0) / graded.length) * 10) / 10}pp` : "—"
        } />
        <Stat label="CLV DATA" value={withClv.length ? `${withClv.length} rows` : "NONE YET"} hint="closing prices captured near kickoff" />
      </div>

      {top.length === 0 ? (
        <EmptyState>No priced picks right now — ODDS UNAVAILABLE from the provider, so the board is model-only.</EmptyState>
      ) : (
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[9px] uppercase tracking-wide text-muted-foreground px-3 py-2 bg-secondary/60">
            <span>Match · Market</span><span>Odds</span><span>Implied</span><span className="text-right">Edge</span>
          </div>
          {top.map((p) => (
            <div key={`${p.fixtureId}|${p.marketKey}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-[11px] px-3 py-2 border-t border-border/40">
              <span className="min-w-0">
                <b className="block truncate">{p.home} vs {p.away}</b>
                <span className="text-muted-foreground truncate block">{p.marketLabel} · {p.bookmaker || "bookmaker"}</span>
              </span>
              <span className="font-bold">{p.marketOdds.toFixed(2)}</span>
              <span className="text-muted-foreground">{Math.round(p.marketProbability * 100)}%</span>
              <span className={`text-right font-extrabold ${p.edgePct > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {p.edgePct > 0 ? "+" : ""}{p.edgePct}pp
              </span>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">EDGE REALIZATION — SETTLED, PRICED PICKS</p>
        {graded.length === 0 ? (
          <p className="text-xs text-muted-foreground">No settled priced picks yet — the engine needs history before it can prove edge.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Stat label="POSITIVE-EDGE WIN RATE" value={wr(pos) != null ? `${wr(pos)}%` : "—"} hint={`${pos.length} settled`} />
            <Stat label="ZERO/NEG-EDGE WIN RATE" value={wr(neg) != null ? `${wr(neg)}%` : "—"} hint={`${neg.length} settled`} />
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {withClv.length === 0
            ? "CLV (closing-line value): no closing prices captured yet — reported as data, never claimed."
            : `CLV: ${withClv.length} predictions carry a closing price for closing-line comparison.`}
        </p>
      </div>
    </SectionCard>
  );
}