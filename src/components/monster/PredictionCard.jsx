import React from "react";

// Reusable Monster Engine data card — renders the two-way model view (BOTH
// sides' probabilities + exact model fair odds) for the no-draw sports, or
// the single best verified pick for football. All data is real engine output.

const fair = (p) => (p > 0 && p < 1 ? (1 / p).toFixed(2) : "—");

function PlayerRow({ name, prob, fav }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-[13px] font-bold truncate ${fav ? "text-white" : "text-[#8a99ad]"}`}>{name}</span>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${fav ? "bg-[#00e676]/15 mtext-green" : "bg-white/5 text-white/50"}`}>
          {Math.round((prob || 0) * 100)}%
        </span>
      </div>
      <span className={`text-[13px] font-bold shrink-0 ${fav ? "mtext-green" : "text-white/30"}`}>{fair(prob)}</span>
    </div>
  );
}

export default function PredictionCard({ card }) {
  const versus = card.p1 != null && card.p2 != null;
  return (
    <div className="mglass rounded-xl p-3.5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[10px] font-bold text-[#8a99ad] truncate">{card.title}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {card.live && (
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[8px] font-black animate-pulse whitespace-nowrap">
              ● LIVE{card.liveScore ? ` ${card.liveScore}` : ""}
            </span>
          )}
          <span className="w-2 h-2 rounded-full bg-[#00e676]" />
        </div>
      </div>
      <p className="text-[13px] font-bold text-white truncate mb-2">
        {card.home} <span className="text-[#8a99ad]">vs</span> {card.away}
      </p>
      {versus ? (
        <div className="space-y-1.5 mb-3">
          <PlayerRow name={card.home} prob={card.p1} fav={card.p1 >= card.p2} />
          <PlayerRow name={card.away} prob={card.p2} fav={card.p2 > card.p1} />
        </div>
      ) : card.pickLabel ? (
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="px-2 py-1 rounded-md bg-[#00e676]/15 mtext-green text-[12px] font-bold truncate">{card.pickLabel}</span>
          <span className="mtext-green text-[13px] font-bold shrink-0">
            {fair(card.prob)} · {Math.round((card.prob || 0) * 100)}%
          </span>
        </div>
      ) : null}
      {card.realOdds && (card.realOdds.p1 || card.realOdds.p2) ? (
        <p className="text-[9px] text-white/40 mb-2">
          Real book price — {card.home} {card.realOdds.p1?.price ? card.realOdds.p1.price.toFixed(2) : "—"} ·{" "}
          {card.away} {card.realOdds.p2?.price ? card.realOdds.p2.price.toFixed(2) : "—"}
          {card.realOdds.p1?.bookmaker ? ` (${card.realOdds.p1.bookmaker})` : ""}
        </p>
      ) : null}
      <div className="minsight rounded-lg px-2.5 py-2 mb-2">
        <p className="mtext-cyan text-[10px] font-bold leading-relaxed">
          {card.rates || "Engine metric from verified recent form on both sides"}
        </p>
      </div>
      <p className="text-[9px] text-white/35 leading-relaxed">
        {card.source}
        {card.h2h ? ` · H2H ${card.h2h}` : ""}
        {card.date ? ` · ${card.date}` : ""}
      </p>
    </div>
  );
}