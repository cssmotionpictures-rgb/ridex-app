import React from "react";
import RealFighter from "./RealFighter";
import SpriteCell from "./SpriteCell";
import { CHARACTER_SHEET_IMAGE, CHARACTER_SPRITE } from "@/lib/forgottenOnesData";

// Roster card now shows a REAL HUMAN fighter render (not initials), so the
// character select screen reads as a cast of real fighters.
export default function CharacterCard({ character, locked, active, onSelect, compact }) {
  const c = character;
  return (
    <button
      onClick={() => !locked && onSelect?.(c)}
      disabled={locked}
      className={`relative text-left rounded-2xl border p-2 transition-all overflow-hidden ${
        active ? "border-[#d97757]/60 bg-[#2a1a0e]/40 noir-frame" : "border-[#c5a059]/18 bg-[#0c0907]/80"
      } ${locked ? "opacity-55" : "card-lift hover:border-[#d97757]/45"}`}
      style={{ boxShadow: active ? `inset 0 0 0 1px ${c.color}40, 0 0 20px -8px ${c.color}80` : undefined }}
    >
      <div className="w-full h-24 rounded-xl overflow-hidden mb-2 relative" style={{ background: `linear-gradient(180deg, ${c.color}18, #0a0706)` }}>
        {CHARACTER_SPRITE[c.id] ? (
          <div className="absolute inset-0 ken-burns-soft">
            <SpriteCell src={CHARACTER_SHEET_IMAGE} cols={5} rows={3} col={CHARACTER_SPRITE[c.id].col} row={CHARACTER_SPRITE[c.id].row} className="w-full h-full" />
          </div>
        ) : (
          <div className="w-full h-full flex items-end justify-center ken-burns-soft">
            <RealFighter skin={c.skin || "#6b4423"} garb={c.color} garb2="#1a0d08" aura={c.color} weapon={c.weapon || "none"} height={92} />
          </div>
        )}
      </div>
      <p className="text-xs font-bold leading-tight text-foreground truncate">{c.name}</p>
      <p className="text-[10px] text-[#8a6d3b] leading-tight mt-0.5 truncate">{c.role}</p>
      {!compact && (
        <div className="mt-1 space-y-1">
          <div className="flex justify-between text-[10px] text-[#6a5a3b]">
            <span>HP {c.hp}</span><span>ATK {c.atk}</span>
          </div>
          <p className="text-[10px] text-[#d1a985] font-medium truncate flex items-center gap-1">
            <span className="text-[#d97757]">◈</span> {c.ability.name}
          </p>
        </div>
      )}
      {locked && (
        <span className="absolute top-2 right-2 text-[10px] bg-[#0a0706] border border-[#c5a059]/25 px-1.5 py-0.5 rounded-full text-[#8a6d3b]">🔒</span>
      )}
      {active && (
        <span className="absolute top-2 right-2 text-[9px] bg-[#d97757] text-[#1a0d08] px-1.5 py-0.5 rounded-full font-bold tracking-wider">ACTIVE</span>
      )}
    </button>
  );
}