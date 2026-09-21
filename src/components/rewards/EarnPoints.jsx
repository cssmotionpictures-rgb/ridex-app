import React from "react";
import { Button } from "@/components/ui/button";
import RewardedAd from "@/components/shared/RewardedAd";
import { AD_POINTS, saveProfile, recompute } from "@/lib/rewards";
import { PlayCircle } from "lucide-react";

export default function EarnPoints({ profile, onUpdate }) {
  const [open, setOpen] = React.useState(false);

  const grant = async () => {
    const points = (profile.points || 0) + AD_POINTS;
    const weekly = (profile.weekly_points || 0) + AD_POINTS;
    const patch = { ...recompute({ ...profile, points, weekly_points: weekly }), points, weekly_points: weekly };
    await saveProfile(profile.id, patch);
    onUpdate(patch);
  };

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6">
      <div className="flex items-center gap-4">
        <div className="size-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
          <PlayCircle className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Earn points</p>
          <p className="text-lg font-bold">Watch a short ad → +{AD_POINTS} pts</p>
          <p className="text-xs text-muted-foreground mt-0.5">Stack points to unlock rewards and level up faster.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="rounded-full shrink-0">
          <PlayCircle className="w-4 h-4 mr-1" /> Watch
        </Button>
      </div>
      <RewardedAd open={open} onOpenChange={setOpen} movieTitle="Reward Hub" onReward={grant} />
    </div>
  );
}