import React from "react";
import { getProgress, LEVELS } from "@/lib/rewards";
import LevelBadge from "./LevelBadge";

export default function PointsHeader({ profile }) {
  const { pct, remaining, cur, next } = getProgress(profile.points || 0);
  return (
    <div className="glass rounded-3xl border border-border/60 p-6 flex flex-col md:flex-row items-center gap-6">
      <LevelBadge level={cur.name} size={84} />
      <div className="flex-1 w-full">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">{cur.name} member</p>
            <p className="text-3xl font-extrabold">
              {profile.points || 0} <span className="text-base text-muted-foreground font-normal">pts</span>
            </p>
          </div>
          {next && (
            <p className="text-xs text-muted-foreground text-right">
              {remaining} pts to <span className="text-foreground font-semibold">{next.name}</span>
            </p>
          )}
        </div>
        <div className="h-2.5 rounded-full bg-secondary mt-3 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          {LEVELS.map((l) => (
            <span key={l.name} className={cur.name === l.name ? "text-primary font-bold" : ""}>
              {l.emoji} {l.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}