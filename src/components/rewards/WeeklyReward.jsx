import React from "react";
import { Button } from "@/components/ui/button";
import { CalendarCheck } from "lucide-react";
import { WEEKLY_THRESHOLD, WEEKLY_BONUS, saveProfile, recompute } from "@/lib/rewards";

export default function WeeklyReward({ profile, onUpdate }) {
  const eligible = (profile.weekly_points || 0) >= WEEKLY_THRESHOLD;
  const claim = async () => {
    if (!eligible) return;
    const points = (profile.points || 0) + WEEKLY_BONUS;
    const patch = { ...recompute({ ...profile, points }), points, last_weekly_claim: new Date().toISOString() };
    await saveProfile(profile.id, patch);
    onUpdate(patch);
  };
  const pct = Math.min(100, ((profile.weekly_points || 0) / WEEKLY_THRESHOLD) * 100);
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6">
      <div className="flex items-center gap-4">
        <div className="size-12 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
          <CalendarCheck className="w-6 h-6 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">Weekly reward</p>
          <p className="text-lg font-bold">Earn {WEEKLY_THRESHOLD} pts this week → +{WEEKLY_BONUS} bonus</p>
          <p className="text-xs text-muted-foreground mt-0.5">{profile.weekly_points || 0}/{WEEKLY_THRESHOLD} pts this week</p>
          <div className="h-2 rounded-full bg-secondary mt-2 overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Button onClick={claim} disabled={!eligible} className="rounded-full shrink-0">Claim</Button>
      </div>
    </div>
  );
}