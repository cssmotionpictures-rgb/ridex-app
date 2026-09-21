import React from "react";
import { Gift, CheckCircle2, Flame } from "lucide-react";

export default function DailyRewards({ profile, onClaim }) {
  const today = new Date().toISOString().slice(0, 10);
  const claimed = profile?.last_daily_claim === today;
  const streak = profile?.login_streak || 0;
  const nextReward = 50 + Math.min(Math.max(streak, 1) * 5, 100);

  return (
    <div className="noir-panel rounded-2xl p-5 relative overflow-hidden">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-[#1a120a] border border-[#d97757]/35 flex items-center justify-center">
          <Gift className="w-5 h-5 text-[#d97757]" />
        </div>
        <div>
          <h3 className="font-bold text-[#d1a985] tracking-wide">Daily Reward</h3>
          <p className="text-[11px] text-[#8a6d3b] flex items-center gap-1">
            <Flame className="w-3 h-3 text-[#d97757]" /> Login streak: {streak} day{streak !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mb-4">
        {Array.from({ length: 7 }).map((_, i) => {
          const day = i + 1;
          const reached = streak >= day;
          return (
            <div
              key={i}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] border ${
                reached
                  ? "bg-gradient-to-b from-[#2a1a0e] to-[#1a120a] border-[#d97757]/50 text-[#f0c9a8]"
                  : "bg-[#0a0706] border-[#c5a059]/12 text-[#6a5a3b]"
              }`}
            >
              <span className="font-bold">{50 + Math.min(day * 5, 100)}</span>
              <span className="text-[8px] tracking-wider">SP</span>
            </div>
          );
        })}
      </div>
      <button
        onClick={onClaim}
        disabled={claimed}
        className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
          claimed ? "bg-[#0a0706] text-[#6a5a3b] border border-[#c5a059]/12" : "btn-noir-primary"
        }`}
      >
        {claimed ? (
          <span className="flex items-center justify-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Claimed today</span>
        ) : (
          `Claim ${nextReward} Spirit Points`
        )}
      </button>
    </div>
  );
}