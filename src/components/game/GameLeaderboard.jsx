import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Trophy } from "lucide-react";
import { rankTitle } from "@/lib/forgottenOnesData";

export default function GameLeaderboard({ me }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.GameProfile.list("-xp", 50)
      .then((data) => setRows(data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [me?.xp]);

  const sorted = [...rows].sort((a, b) => (b.xp || 0) - (a.xp || 0));

  return (
    <div className="noir-panel rounded-2xl p-5 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-[#c5a059]" />
        <h3 className="font-bold text-[#d1a985] tracking-wide">Global Leaderboard</h3>
      </div>
      {loading ? (
        <p className="text-xs text-[#8a6d3b] text-center py-6">Summoning the ranks…</p>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-[#8a6d3b] text-center py-6">No players yet — be the first to rise!</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.slice(0, 20).map((p, i) => {
            const mine = me && p.id === me.id;
            const rank = rankTitle(p.level || 1);
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-2 rounded-xl border ${
                  mine ? "bg-[#2a1a0e]/60 border-[#d97757]/50" : "bg-[#0a0706]/60 border-[#c5a059]/12"
                }`}
              >
                <span className={`w-7 text-center font-bold text-sm ${i < 3 ? "text-[#d1a985]" : "text-[#6a5a3b]"}`}>
                  {i === 0 ? "★" : i < 3 ? ["◆", "◇"][i - 1] : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate text-foreground">{p.player_name}{mine && " (you)"}</p>
                  <p className="text-[10px] text-[#8a6d3b]">{rank} · Lv {p.level || 1}</p>
                </div>
                <span className="text-xs font-bold text-[#d1a985]">{p.xp || 0} XP</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}