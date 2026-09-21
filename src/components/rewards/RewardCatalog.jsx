import React from "react";
import { Button } from "@/components/ui/button";
import { REWARDS, saveProfile, recompute } from "@/lib/rewards";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function RewardCatalog({ profile, onUpdate }) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState("");

  const redeem = async (r) => {
    if ((profile.points || 0) < r.pointsCost) return;
    setBusy(r.key);
    try {
      const points = (profile.points || 0) - r.pointsCost;
      const total_redeemed = (profile.total_redeemed || 0) + 1;
      await base44.entities.RewardRedemption.create({ reward_key: r.key, reward_name: r.name, points_cost: r.pointsCost });
      const patch = { ...recompute({ ...profile, points, total_redeemed }), points, total_redeemed };
      await saveProfile(profile.id, patch);
      onUpdate(patch);
      toast({ title: `Redeemed: ${r.name}`, description: `-${r.pointsCost} pts` });
    } catch (e) {
      toast({ title: "Redemption failed", variant: "destructive" });
    }
    setBusy("");
  };

  return (
    <div>
      <h3 className="font-semibold mb-3">Redeem rewards</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {REWARDS.map((r) => {
          const can = (profile.points || 0) >= r.pointsCost;
          return (
            <div key={r.key} className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col">
              <div className="text-3xl">{r.emoji}</div>
              <p className="font-semibold mt-1">{r.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex-1">{r.desc}</p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm font-bold text-primary">{r.pointsCost} pts</span>
                <Button size="sm" disabled={!can || busy === r.key} onClick={() => redeem(r)} className="rounded-full">
                  {busy === r.key ? "..." : "Redeem"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}