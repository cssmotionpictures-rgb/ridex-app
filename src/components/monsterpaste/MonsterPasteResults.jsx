import React from "react";
import { AlertTriangle, Eye, ShieldCheck } from "lucide-react";
import MonsterPickCard from "@/components/monsterboard/MonsterPickCard";
import PasteArrangement from "./PasteArrangement";

// MONSTER PASTE RESULTS — the automatic output of a paste analysis:
// ranked BEST PICKS (only gate-qualified selections), the honest rejects,
// WATCH (never on a ticket) and the automatic ticket arrangements.
export default function MonsterPasteResults({ result }) {
  const { picks, watch, correlation, rejected, gateRejected, arrangements, stats } = result;
  const hasArrangements = arrangements && Object.values(arrangements).some((a) => a.legs?.length);

  return (
    <div className="space-y-3 pt-1">
      {/* BEST PICKS */}
      <div className="rounded-2xl border border-[#00e676]/25 bg-[#00e676]/[0.04] px-3.5 py-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 mtext-green shrink-0" />
          <p className="text-xs font-black text-white tracking-[0.14em]">MONSTER BEST PICKS</p>
          <span className="text-[9px] text-white/40 ml-auto shrink-0">RANKED BY QUALITY, NOT BY HIGHEST ODDS</span>
        </div>
        {picks.length ? (
          <div className="space-y-2">
            {picks.map((p, i) => (
              <MonsterPickCard
                key={`${p.fixtureId}|${p.marketKey}`}
                pick={p}
                rank={i + 1}
                correlation={correlation[`${p.fixtureId}|${p.marketKey}`]}
              />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[#8a99ad] font-bold py-1">
            NO QUALIFYING PICKS from this paste — none of the matched games met the MONSTER standard right now. That is a valid,
            honest result: the engine never forces a pick to fill a ticket.
          </p>
        )}
      </div>

      {/* ARRANGEMENTS */}
      {hasArrangements && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-3 space-y-2">
          <p className="text-xs font-black text-white tracking-[0.14em]">AUTOMATIC TICKET ARRANGEMENTS</p>
          <p className="text-[9px] text-white/40 -mt-1.5">
            Built only from qualified selections — weak and rejected candidates never enter a ticket. PAPER MODE: RIDE X never places bets.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <PasteArrangement arrangement={arrangements.safer} />
            <PasteArrangement arrangement={arrangements.balanced} />
            <PasteArrangement arrangement={arrangements.value} />
            <PasteArrangement arrangement={arrangements.highRisk} />
            <PasteArrangement arrangement={arrangements.acca3} />
            <PasteArrangement arrangement={arrangements.acca4} />
          </div>
        </div>
      )}

      {/* WATCH — interesting, never on a ticket */}
      {watch.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-3 space-y-2">
          <p className="text-[11px] font-black text-[#8a99ad] tracking-wide inline-flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> MONSTER WATCH — BELOW THE FULL STANDARD, NEVER ON A TICKET
          </p>
          {watch.slice(0, 5).map((p) => (
            <MonsterPickCard key={`w-${p.fixtureId}-${p.marketKey}`} pick={p} watch />
          ))}
        </div>
      )}

      {/* HONEST REJECTS */}
      {(rejected.length > 0 || gateRejected.length > 0) && (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] px-3.5 py-3 space-y-2">
          <p className="text-[11px] font-black text-amber-300 tracking-wide inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> REJECTED — DISCLOSED, NEVER HIDDEN
          </p>
          {rejected.map((r, i) => (
            <div key={`r-${i}`} className="text-[10px] leading-relaxed">
              <b className="text-white">{r.home} vs {r.away}</b>
              <span className="text-white/50"> — {r.reason}</span>
            </div>
          ))}
          {gateRejected.slice(0, 8).map((r, i) => (
            <div key={`g-${i}`} className="text-[10px] leading-relaxed">
              <b className="text-white">{r.home} vs {r.away}</b>
              <span className="text-white/50"> — {r.marketLabel ? `${r.marketLabel}: ` : ""}{r.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* UNPARSEABLE LINES */}
      {stats.unparseableLines.length > 0 && (
        <p className="text-[9px] text-white/35 leading-relaxed px-1">
          {stats.unparseableLines.length} line(s) could not be confidently parsed and were kept out of the analysis — the valid games
          were still processed.
        </p>
      )}

      <p className="text-[9px] text-white/35 leading-relaxed px-1">
        Every recorded pick settles automatically from the verified result once the game finishes — no manual entry — and each
        individual game becomes a learning event for the engine. Probabilities are model estimates, never guarantees.
      </p>
    </div>
  );
}