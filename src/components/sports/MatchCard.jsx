import React from "react";
import { Radio, Calendar } from "lucide-react";

export default function MatchCard({ match, onWatch }) {
  const isLive = match.status === "live";
  const initials = (name) => (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="rounded-3xl border border-border/60 bg-card overflow-hidden card-lift">
      <div className="relative h-32 bg-gradient-to-br from-secondary to-card flex items-center justify-between px-6">
        <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 20% 50%, ${match.team_a_color}, transparent 45%), radial-gradient(circle at 80% 50%, ${match.team_b_color}, transparent 45%)` }} />
        <div className="relative flex flex-col items-center gap-1 z-10">
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-heading font-extrabold text-sm" style={{ background: match.team_a_color }}>{initials(match.team_a)}</div>
          <span className="text-xs font-medium max-w-[80px] text-center leading-tight">{match.team_a}</span>
        </div>
        <div className="relative z-10 text-center px-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-500/15 px-2.5 py-1 rounded-full">
              <Radio className="w-3 h-3 animate-pulse" /> LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="w-3 h-3" /> {match.kickoff_time ? new Date(match.kickoff_time).toLocaleString("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Soon"}
            </span>
          )}
          <div className="mt-1.5 font-heading font-extrabold text-lg">
            {isLive ? `${match.score_a} : ${match.score_b}` : "VS"}
          </div>
          {isLive && match.minute && <div className="text-[10px] text-muted-foreground">{match.minute}</div>}
        </div>
        <div className="relative flex flex-col items-center gap-1 z-10">
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-heading font-extrabold text-sm" style={{ background: match.team_b_color }}>{initials(match.team_b)}</div>
          <span className="text-xs font-medium max-w-[80px] text-center leading-tight">{match.team_b}</span>
        </div>
      </div>
      <div className="p-4">
        <p className="text-xs text-muted-foreground mb-3">{match.league}{match.venue ? ` · ${match.venue}` : ""}</p>
        {isLive ? (
          <button onClick={() => onWatch(match)} className="w-full h-10 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            ▶ Watch Live
          </button>
        ) : (
          <div className="w-full h-10 rounded-full bg-secondary text-muted-foreground text-sm font-medium flex items-center justify-center">
            {match.status === "ended" ? "Match Ended" : "Coming Soon"}
          </div>
        )}
      </div>
    </div>
  );
}