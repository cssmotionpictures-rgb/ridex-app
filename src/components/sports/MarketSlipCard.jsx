import React from "react";
import LegRow from "@/components/sports/LegRow";
import SlipSceneHeader from "@/components/sports/SlipSceneHeader";

// One sized market slip (CHOP EBA / SUGAR / DRINK 7UP) — legs from the
// verified-form market pool, combined accumulator odds, honest all-legs-win
// probability. CHOP EBA legs carry the game's second verified pick (padding
// + corner feed) on top of the main market — two picks per game.

export default function MarketSlipCard({ name, legs, note, size, target }) {
  if (!legs?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-4 text-center">
        <p className="text-xs font-bold text-amber-400">{name} — NO QUALIFIED GAMES AT THIS SIZE</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {note || "Fewer verified games cleared the scrutiny bars than this size asks for — the engine never pads with guesses."}
        </p>
      </div>
    );
  }

  let combined = 1, winProb = 1;
  for (const l of legs) {
    combined *= l.odds;
    winProb *= l.prob * (l.companion?.prob || 1) * (l.companion2?.prob || 1) * (l.corners?.prob || 1);
  }

  const shortfall = size && legs.length < size;
  const oddsLabel = combined >= 1000 ? Math.round(combined).toLocaleString() : combined.toFixed(2);

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3.5 space-y-2.5">
      <SlipSceneHeader
        scene="football"
        kicker="RIDE X MARKET SLIP · VERIFIED FORM ONLY"
        title={`${name} — ${legs.length}${shortfall ? ` OF ${size}` : ""} LEGS`}
        badges={[`${oddsLabel} MODEL EST.`, "H2H SCRUTINIZED"]}
      />

      {target ? (
        <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2.5 space-y-1.5">
          <div className="h-2.5 rounded-full bg-black/40 border border-border/40 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${Math.max(3, Math.min(100, (Math.log(combined) / Math.log(target)) * 100))}%` }} />
          </div>
          <p className={`text-[10px] ${combined >= target ? "text-emerald-400 font-semibold" : "text-amber-400"}`}>
            {combined >= target
              ? "1,000,000 ODDS TARGET REACHED — this batch is full."
              : `${oddsLabel} combined odds — two picks per game multiply every leg toward the 1,000,000 target.`}
          </p>
        </div>
      ) : null}

      {shortfall ? (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Only {legs.length} verified game{legs.length === 1 ? "" : "s"} cleared every scrutiny bar (90%+ confidence,
          form on both sides, H2H checked) this week — never padded with guesses. The batch refills automatically as
          new games enter the 7-day window.
        </p>
      ) : null}

      <div className="rounded-xl bg-black/30 border border-border/40 divide-y divide-border/30 max-h-40 overflow-y-auto no-scrollbar">
        {legs.map((l, i) => (
          <LegRow
            key={`${l.home}-${l.away}-${i}`}
            leg={l}
            index={i}
            odds={l.odds}
            meta={
              `${l.date ? `${l.date} · ` : ""}${l.league} · ${l.marketLabel} ${Math.round(l.prob * 100)}%` +
              (l.companion ? ` · + ${l.companion.label} ${Math.round(l.companion.prob * 100)}%` : "") +
              (l.companion2 ? ` · + ${l.companion2.label} ${Math.round(l.companion2.prob * 100)}%` : "") +
              (l.corners ? ` · + ${l.corners.label} (verified feed)` : "")
            }
          />
        ))}
      </div>
      <p className="text-[9px] text-muted-foreground/70 text-center">Tap any leg to open its full prediction — the pick, its padding and the verified deep analysis.</p>

      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
        Honest odds: chance ALL {legs.length} legs win ≈{" "}
        <span className="text-amber-400 font-semibold">
          {(winProb * 100) >= 0.01 ? `${(winProb * 100).toFixed(2)}%` : `1 in ${Math.max(1, Math.round(1 / Math.max(winProb, 1e-12))).toLocaleString()}`}
        </span>
        . Every leg comes from verified season data with head-to-head scrutiny — model probabilities, never guarantees.
      </p>
    </div>
  );
}