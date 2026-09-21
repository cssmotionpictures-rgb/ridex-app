import React from "react";
import { Trophy, Skull, Zap, Sparkles, Swords, Home, ChevronRight } from "lucide-react";

// Cinematic end-of-match screen — shows the result, the fighter's identity,
// max combo / flawless bonus, and the XP + Spirit Points earned. "Next Battle"
// returns to the hub where the next level is already queued.
export default function VictoryScreen({ result, reward, characterName, enemyName, combo, onExit }) {
  const win = result === "win";
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center px-6 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: win
            ? "radial-gradient(ellipse at 50% 30%, rgba(247,201,72,0.18), transparent 60%)"
            : "radial-gradient(ellipse at 50% 30%, rgba(192,72,74,0.18), transparent 60%)",
        }}
      />
      <div className="relative flex flex-col items-center gap-3 w-full max-w-sm">
        {win ? (
          <>
            <Trophy className="w-14 h-14 text-[#f7c948] mb-1" style={{ filter: "drop-shadow(0 0 18px rgba(247,201,72,0.7))" }} />
            <h2 className="cinzel-title font-extrabold bronze-text" style={{ fontSize: "clamp(2.6rem,12vw,4.2rem)", letterSpacing: "0.1em" }}>VICTORY</h2>
            <p className="text-sm text-[#d1a985] -mt-1 text-center">{characterName} prevails over {enemyName}</p>
          </>
        ) : (
          <>
            <Skull className="w-14 h-14 text-[#c0484a] mb-1" style={{ filter: "drop-shadow(0 0 18px rgba(192,72,74,0.6))" }} />
            <h2 className="cinzel-title font-extrabold" style={{ fontSize: "clamp(2.6rem,12vw,4.2rem)", letterSpacing: "0.1em", color: "#c0484a", textShadow: "0 0 24px rgba(192,72,74,0.6)" }}>DEFEAT</h2>
            <p className="text-sm text-[#8a6d3b] -mt-1 text-center">{characterName} has fallen. Rise again, remembered one.</p>
          </>
        )}

        {reward && (
          <div className="w-full mt-3 noir-panel rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8a6d3b] flex items-center gap-1.5"><Swords className="w-4 h-4" /> Max Combo</span>
              <span className="font-bold text-[#f0d9a8]">×{reward.combo ?? combo ?? 0}</span>
            </div>
            {reward.flawless && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#8a6d3b] flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Flawless Bonus</span>
                <span className="font-bold text-emerald-300">PERFECT</span>
              </div>
            )}
            <div className="ornate-divider my-1" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8a6d3b] flex items-center gap-1.5"><Zap className="w-4 h-4 text-[#2bb3c0]" /> Spirit Points</span>
              <span className="font-bold text-[#5ed1da]">+{reward.sp}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8a6d3b] flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-[#f7c948]" /> XP Earned</span>
              <span className="font-bold text-[#f7c948]">+{reward.xp}{reward.booster ? " (2× booster)" : ""}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-4 w-full">
          <button onClick={onExit} className="flex-1 px-4 py-2.5 rounded-xl btn-noir-ghost font-semibold text-sm flex items-center justify-center gap-1.5">
            <Home className="w-4 h-4" /> Hub
          </button>
          <button onClick={onExit} className="flex-1 px-4 py-2.5 rounded-xl btn-noir-primary font-semibold text-sm flex items-center justify-center gap-1.5">
            {win ? "Next Battle" : "Retry"} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}