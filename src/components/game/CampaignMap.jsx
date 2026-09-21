import React from "react";
import { EPISODES, getLevelEnemy, getLevelScene, difficultyForEpisode, LEVEL_MAP_IMAGE, getLevelThumb, getLevelTitle } from "@/lib/forgottenOnesData";
import { Lock, Star, Skull } from "lucide-react";
import SpriteCell from "./SpriteCell";

export default function CampaignMap({ profile, onStartBattle }) {
  const completed = (profile?.completed_levels || "").split(",").filter(Boolean);
  const completedSet = new Set(completed);
  const highest = profile?.highest_episode || 1;
  const isPremium = profile?.premium;

  const levelState = (epId, lvl) => {
    const key = `${epId}-${lvl}`;
    if (completedSet.has(key)) return "done";
    const prevKey = `${epId}-${lvl - 1}`;
    const prevDone = lvl === 1 ? true : completedSet.has(prevKey);
    const prevEpisodeDone = epId === 1 ? true : completedSet.has(`${epId - 1}-20`);
    if (prevDone && prevEpisodeDone) return "available";
    return "locked";
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold text-lg text-[#d1a985] tracking-wide">Story Campaign</h3>
        <p className="text-xs text-[#8a6d3b]">200+ levels across 12 episodes · 4 difficulty tiers (Beginner → Hard). Free through Episode 3.</p>
      </div>
      {EPISODES.map((ep) => {
        const epFree = ep.free;
        const diff = difficultyForEpisode(ep.id);
        const lockedByPremium = !epFree && !isPremium;
        const doneCount = completed.filter((k) => k.startsWith(`${ep.id}-`)).length;
        return (
          <div key={ep.id} className="noir-panel rounded-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${ep.color}, transparent)` }} />
            <div className="p-4 flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm font-heading shrink-0"
                style={{ background: `linear-gradient(180deg, ${ep.color}22, ${ep.color}10)`, color: ep.color, border: `1px solid ${ep.color}55` }}
              >
                {ep.id}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-sm text-foreground">Episode {ep.id}: {ep.title}</h4>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold tracking-wider" style={{ background: `${diff.color}22`, color: diff.color, border: `1px solid ${diff.color}55` }}>{diff.label.toUpperCase()}</span>
                  {epFree && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#2bb3c0]/15 text-[#5ed1da] font-semibold tracking-wider">FREE</span>}
                  {lockedByPremium && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#c5a059]/15 text-[#d1a985] font-semibold flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" /> PREMIUM
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#8a6d3b] mt-0.5 italic">{ep.theme}</p>
                <p className="text-[10px] mt-1 flex items-center gap-1 text-[#c0484a]"><Skull className="w-3 h-3" /> Boss: {ep.boss}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[#0a0706] overflow-hidden border border-[#c5a059]/12">
                    <div className="h-full transition-all" style={{ width: `${(doneCount / 20) * 100}%`, background: `linear-gradient(90deg, ${ep.color}, ${ep.color}aa)` }} />
                  </div>
                  <span className="text-[10px] text-[#8a6d3b]">{doneCount}/20</span>
                </div>
              </div>
            </div>
            {!lockedByPremium && (
              <div className="px-4 pb-4">
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                  {Array.from({ length: 20 }).map((_, i) => {
                    const lvl = i + 1;
                    const st = levelState(ep.id, lvl);
                    const enemy = getLevelEnemy(ep.id, lvl);
                    const scene = getLevelScene(ep.id, lvl);
                    const available = st === "available";
                    const done = st === "done";
                    const globalLvl = (ep.id - 1) * 20 + lvl;
                    const thumb = getLevelThumb(globalLvl);
                    return (
                      <button
                        key={lvl}
                        onClick={() => available && onStartBattle(ep.id, lvl)}
                        disabled={!available}
                        title={`${scene.title} · ${scene.location} · ${scene.time} · ${scene.weather}`}
                        className={`aspect-square rounded-lg text-[10px] font-bold flex items-center justify-center transition-all relative overflow-hidden ${
                          done
                            ? "border border-[#d97757]/55 text-[#f0c9a8]"
                            : available
                            ? "border border-[#d97757]/45 text-foreground card-lift"
                            : "bg-[#0a0706]/40 text-[#4a3a22] border border-[#c5a059]/8"
                        }`}
                        style={available && enemy.isBoss ? { borderColor: ep.color, color: ep.color, boxShadow: `0 0 12px -4px ${ep.color}` } : undefined}
                      >
                        <SpriteCell src={LEVEL_MAP_IMAGE} cols={10} rows={10} col={thumb.col} row={thumb.row} overlay={false} rounded={false} className="absolute inset-0 w-full h-full ken-burns-soft" />
                        <div className={`absolute inset-0 ${done ? "bg-[#2a1a0e]/80" : "bg-black/45"}`} />
                        <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                          {done ? <Star className="w-3 h-3" /> : enemy.isBoss ? <Skull className="w-3 h-3" /> : lvl}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {lockedByPremium && (
              <div className="px-4 pb-4 pt-1">
                <p className="text-[11px] text-[#d1a985]/80 italic">Unlock with Premium in the Spirit Store to continue the journey.</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}