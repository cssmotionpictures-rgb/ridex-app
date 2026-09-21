import React from "react";
import { CalendarDays, Trophy } from "lucide-react";
import { teamColors } from "@/lib/teamStyle";

// CINEMATIC MATCH POSTER — the card's own mini key-art strip, built from the
// two sides' real club colors (curated for the famous clubs, deterministic
// for the rest), the league name and the kickoff date. Gives every
// prediction card a professional matchday-poster look across all sports.
export default function MatchPoster({ home, away, league, date, live }) {
  const [h1, h2] = teamColors(home || "");
  const [a1, a2] = teamColors(away || "");
  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-border/60"
      style={{
        background: `linear-gradient(115deg, ${h1} 0%, ${h2} 26%, rgba(11,14,20,0.94) 46%, rgba(11,14,20,0.94) 54%, ${a2} 74%, ${a1} 100%)`,
      }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 70% at 50% 130%, rgba(0,0,0,0.85), transparent 60%)" }} />
      <div className="relative px-3.5 py-3 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {league && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/45 border border-white/10 text-[9px] font-bold uppercase tracking-wider text-white/90">
              <Trophy className="w-2.5 h-2.5" /> {league}
            </span>
          )}
          {date && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/45 border border-white/10 text-[9px] font-bold text-white/80">
              <CalendarDays className="w-2.5 h-2.5" /> {date}
            </span>
          )}
          {live && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/90 text-[9px] font-black text-white animate-pulse">LIVE NOW</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-3 h-3 rounded-full border border-white/25 shrink-0" style={{ background: h1 }} />
            <p className="text-xs font-extrabold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{home}</p>
          </div>
          <span className="font-cinzel font-black text-[11px] tracking-[0.2em] text-white/60 shrink-0">VS</span>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
            <p className="text-xs font-extrabold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{away}</p>
            <span className="w-3 h-3 rounded-full border border-white/25 shrink-0" style={{ background: a1 }} />
          </div>
        </div>
      </div>
    </div>
  );
}