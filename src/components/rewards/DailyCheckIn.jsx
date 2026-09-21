import React from "react";
import { Button } from "@/components/ui/button";
import { Flame, Gift } from "lucide-react";
import { CHECKIN_BASE, saveProfile, recompute } from "@/lib/rewards";

export default function DailyCheckIn({ profile, onUpdate }) {
  const today = new Date().toDateString();
  const checked = (profile.last_check_in || "") === today;
  const [busy, setBusy] = React.useState(false);

  const checkIn = async () => {
    if (checked || busy) return;
    setBusy(true);
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const streak = (profile.last_check_in || "") === yesterday ? (profile.streak_days || 0) + 1 : 1;
    const bonus = Math.min(streak, 5) * 2;
    const gained = CHECKIN_BASE + bonus;
    const points = (profile.points || 0) + gained;
    const weekly = (profile.weekly_points || 0) + gained;
    const patch = {
      ...recompute({ ...profile, points, streak_days: streak }),
      points, streak_days: streak, last_check_in: today, weekly_points: weekly,
    };
    await saveProfile(profile.id, patch);
    setBusy(false);
    onUpdate(patch);
  };

  const days = profile.streak_days || 0;
  return (
    <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6">
      <div className="flex items-center gap-4">
        <div className="size-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
          <Flame className={`w-6 h-6 ${days >= 1 ? "text-primary fill-current" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Daily streak</p>
          <p className="text-2xl font-extrabold">{days} day{days !== 1 ? "s" : ""} 🔥</p>
          <p className="text-xs text-muted-foreground mt-0.5">Check in daily to earn points + keep your streak alive.</p>
        </div>
        <Button onClick={checkIn} disabled={checked || busy} className="rounded-full font-semibold shrink-0">
          {checked ? <><Gift className="w-4 h-4 mr-1" /> Checked in</> : "Check in (+10 pts)"}
        </Button>
      </div>
    </div>
  );
}