import React from "react";
import { Loader2, TrendingDown, TrendingUp, Minus, Ambulance, Users } from "lucide-react";
import { fetchFixtureContext } from "@/providers/injuries/apiFootballInjuries";
import { fetchOddsMovement } from "@/lib/oddsHistory";
import { parseMarketRequest } from "@/lib/oddsMath";

// MATCH CONTEXT — lazy-loaded inside a leg's detail popup: provider-verified
// injuries, probable/confirmed lineups, real odds movement (STEAM/DRIFT from
// actual snapshot history only) and the data-freshness stamps. Everything is
// labeled with its provider; when a feed is unavailable it says so — the
// engine never infers an injury or invents a movement.

const INJ_COLOR = {
  OUT: "text-red-400",
  SUSPENDED: "text-red-400",
  DOUBTFUL: "text-amber-400",
  QUESTIONABLE: "text-amber-400",
  AVAILABLE: "text-emerald-400",
};

function fmtAgo(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function LegMatchContext({ leg }) {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    let live = true;
    setData(null);
    (async () => {
      const ctxPromise = fetchFixtureContext({
        date: leg.date,
        home: leg.home,
        away: leg.away,
        league: leg.league,
      }).catch((e) => ({ error: String(e?.message || e) }));

      // odds movement only for legs with a real provider event id
      const parsed = parseMarketRequest(leg.marketLabel);
      let mvPromise = Promise.resolve(null);
      if (leg.realOdds?.eventId && parsed && !parsed.unsupported) {
        const wantSel =
          parsed.market === "h2h"
            ? parsed.side
            : parsed.market === "totals"
            ? `${parsed.side === "o" ? "Over" : "Under"} ${parsed.point}`
            : parsed.side === "Y"
            ? "Yes"
            : "No";
        mvPromise = fetchOddsMovement([leg.realOdds.eventId])
          .then((h) => (h || []).find((m) => m.market === parsed.market && m.selection === wantSel) || null)
          .catch(() => null);
      }

      const [context, movement] = await Promise.all([ctxPromise, mvPromise]);
      if (live) setData({ context, movement });
    })();
    return () => {
      live = false;
    };
  }, [leg.date, leg.home, leg.away, leg.league, leg.marketLabel, leg.realOdds?.eventId]);

  if (!data) {
    return (
      <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground">Fetching provider injuries, lineups and odds history…</p>
      </div>
    );
  }

  const ctx = data.context || {};
  const inj = ctx.injuries || {};
  const lu = ctx.lineups || {};
  const mv = data.movement;

  return (
    <div className="space-y-2">
      {/* ODDS MOVEMENT — only from real snapshot history (2+ quotes) */}
      {mv && mv.label !== "NO HISTORY" ? (
        <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Odds movement — real snapshot history</p>
            <span
              className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                mv.label === "STEAM" ? "bg-emerald-500/15 text-emerald-400" : mv.label === "DRIFT" ? "bg-red-500/15 text-red-400" : "bg-secondary text-muted-foreground"
              }`}
            >
              {mv.label === "STEAM" ? <TrendingDown className="w-2.5 h-2.5" /> : mv.label === "DRIFT" ? <TrendingUp className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
              {mv.label}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {mv.opening_odds?.toFixed(2)} → <span className="text-foreground font-semibold">{mv.current_odds?.toFixed(2)}</span> · movement{" "}
            <span className={mv.movement_percentage < 0 ? "text-emerald-400" : mv.movement_percentage > 0 ? "text-red-400" : ""}>
              {mv.movement_percentage > 0 ? "+" : ""}{mv.movement_percentage}%
            </span>{" "}
            · {mv.books_moving} of {mv.books_tracked} bookmakers moved · {mv.snapshots} snapshots over {(mv.period_ms / 3600000).toFixed(1)}h
          </p>
          <p className="text-[9px] text-muted-foreground/70">
            Opening {mv.opening_odds?.toFixed(2)} · highest {mv.highest_odds?.toFixed(2)} · lowest {mv.lowest_odds?.toFixed(2)} — STEAM/DRIFT only labelled from real history (5%+), never from a single price.
          </p>
        </div>
      ) : null}

      {/* INJURIES — provider-confirmed records only */}
      <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 space-y-1.5">
        <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1.5">
          <Ambulance className="w-3 h-3" /> Injuries — provider-confirmed only
        </p>
        {inj.available ? (
          inj.list?.length ? (
            <div className="space-y-1 max-h-32 overflow-y-auto noir-scrollbar">
              {inj.list.map((i, idx) => (
                <p key={idx} className="text-[10px] leading-relaxed">
                  <span className={`font-bold ${INJ_COLOR[i.status] || ""}`}>{i.status}</span> · {i.player}{" "}
                  <span className="text-muted-foreground">({i.team}) — {i.reason || "reason not stated"} · source: {i.source}</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">No injuries reported by the provider feed for this fixture.</p>
          )
        ) : (
          <p className="text-[10px] text-muted-foreground">INJURY DATA: UNAVAILABLE — {inj.reason || "no injury feed"}</p>
        )}
      </div>

      {/* LINEUPS — probable vs confirmed, never conflated */}
      <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 space-y-1">
        <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1.5">
          <Users className="w-3 h-3" /> Lineups — status: {lu.status === "CONFIRMED" ? "CONFIRMED" : lu.status === "PROBABLE" ? "PROBABLE / UNKNOWN" : "UNKNOWN"}
        </p>
        {lu.home || lu.away ? (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">
              {lu.home?.team}: {lu.home?.formation || "—"} · {lu.home?.xi?.length || 0} starters named
            </p>
            <p className="text-[10px] text-muted-foreground">
              {lu.away?.team}: {lu.away?.formation || "—"} · {lu.away?.xi?.length || 0} starters named
            </p>
            <p className="text-[9px] text-muted-foreground/70">
              {lu.status === "CONFIRMED"
                ? "Official lineups published (within 2h of kickoff) — confirmed."
                : "Lineups not yet officially published — treated as PROBABLE, never claimed confirmed."}
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">LINEUP DATA: UNAVAILABLE — {lu.reason || "no lineup feed"}</p>
        )}
      </div>

      {/* DATA FRESHNESS stamps */}
      <div className="rounded-xl border border-border/40 bg-black/20 px-3 py-2 space-y-0.5">
        <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Data freshness</p>
        <p className="text-[9px] text-muted-foreground">FOOTBALL DATA UPDATED: {fmtAgo(ctx.updatedAt)}</p>
        <p className="text-[9px] text-muted-foreground">ODDS UPDATED: {leg.realOdds?.timestamp ? fmtAgo(leg.realOdds.timestamp) : "no real price on this leg"}</p>
        <p className="text-[9px] text-muted-foreground">INJURY DATA UPDATED: {inj.updatedAt ? fmtAgo(inj.updatedAt) : "—"}</p>
        <p className="text-[9px] text-muted-foreground">LINEUP UPDATED: {lu.updatedAt ? fmtAgo(lu.updatedAt) : "—"}</p>
      </div>
    </div>
  );
}