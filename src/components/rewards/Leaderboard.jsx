import React from "react";
import { getLevel } from "@/lib/rewards";

export default function Leaderboard({ profiles, meId }) {
  const rows = [...profiles].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 10);
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div>
      <h3 className="font-semibold mb-3">Leaderboard</h3>
      <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/60">
        {rows.length === 0 && <p className="p-5 text-sm text-muted-foreground">Be the first to earn points!</p>}
        {rows.map((p, i) => (
          <div key={p.id} className={`flex items-center gap-3 p-3 ${p.created_by_id === meId ? "bg-primary/5" : ""}`}>
            <span className="w-6 text-center font-bold">{medal[i] || i + 1}</span>
            <span className="flex-1 truncate text-sm">{p.owner_name || `Member`}</span>
            <span className="text-xs text-muted-foreground">{getLevel(p.points || 0).name}</span>
            <span className="font-bold text-primary text-sm">{p.points || 0} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}