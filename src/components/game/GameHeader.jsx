import React from "react";
import { Sparkles, Crown, Flame } from "lucide-react";
import { rankTitle } from "@/lib/forgottenOnesData";

export default function GameHeader({ profile }) {
  if (!profile) return null;
  const rank = rankTitle(profile.level);
  const xpNeed = 100 + (profile.level - 1) * 60;
  const pct = Math.min(((profile.xp || 0) / xpNeed) * 100, 100);
  return (
    <div className="noir-panel rounded-2xl p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#c5a059]/60 to-transparent" />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-12 h-12 shrink-0">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#3a2a14] to-[#1a120a] border border-[#c5a059]/40 flex items-center justify-center">
            <Crown className="w-6 h-6 text-[#d1a985]" />
          </div>
          <div className="absolute -inset-1 rounded-xl border border-[#d97757]/20 rune-pulse pointer-events-none" />
        </div>
        <div className="flex-1 min-w-[140px]">
          <p className="font-bold text-sm leading-tight text-foreground">{profile.player_name}</p>
          <p className="text-[11px] text-[#d1a985] font-semibold tracking-wide">{rank} · Lv {profile.level}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#1a120a] border border-[#d97757]/30">
            <Flame className="w-3.5 h-3.5 text-[#d97757]" />
            <span className="font-bold text-[#f0c9a8]">{profile.spirit_points || 0}</span>
          </div>
          {profile.premium && (
            <div className="px-2.5 py-1.5 rounded-full bg-gradient-to-r from-[#d97757] to-[#c5a059] text-[#1a0d08] font-bold text-[10px] tracking-wider">PREMIUM</div>
          )}
        </div>
        {profile.booster_battles > 0 && (
          <div className="text-[11px] text-[#d1a985] font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> 2x XP · {profile.booster_battles} left
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[9px] text-[#8a6d3b] mb-1 uppercase tracking-widest">
          <span>XP</span><span>{profile.xp || 0}/{xpNeed}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[#0a0706] overflow-hidden border border-[#c5a059]/15">
          <div className="h-full bg-gradient-to-r from-[#8a6d3b] via-[#c5a059] to-[#d1a985] transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}