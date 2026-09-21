import React from "react";
import { installedFighters, getFighterConfig } from "@/lib/fighterCharacters";
import { Check, Box } from "lucide-react";

// 3D FIGHTER SELECT — the real rigged characters (Babatunde GLB + the 6 uploaded
// FBX fighters). Selecting one saves `active_fighter_key` to the game profile,
// which the 3D arena reads to spawn that fighter. No portraits needed — each
// card is a noir-style silhouette with the fighter's name, role and combat stats.

function StatBar({ label, value, max, color }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-12 text-[9px] uppercase tracking-wider text-[#8a6d3b]">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[#0a0706] overflow-hidden border border-[#c5a059]/15">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function FighterSelect({ profile, onSelect }) {
  const fighters = installedFighters().filter((f) => f.role !== "enemy");
  const activeKey = profile?.active_fighter_key || "babatunde";

  return (
    <div className="space-y-4">
      <div className="noir-panel rounded-2xl p-4">
        <h2 className="font-bold text-[#d1a985] tracking-wide flex items-center gap-2">
          <span className="text-[#d97757]">◈</span> 3D Fighter Select
        </h2>
        <p className="text-xs text-[#8a6d3b] mt-1">
          Real rigged characters — Babatunde (GLB) plus {fighters.length - 1} uploaded FBX fighters. Pick one; it spawns in the PS5 arena as your fighter.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {fighters.map((f) => {
          const active = f.key === activeKey;
          const s = f.stats || {};
          return (
            <div
              key={f.key}
              className={`relative rounded-2xl border overflow-hidden transition-all ${
                active ? "border-[#d97757]/70 noir-frame bg-[#2a1a0e]/40" : "border-[#c5a059]/18 bg-[#0c0907]/80"
              } card-lift`}
            >
              <div className="relative w-full aspect-[3/4] overflow-hidden bg-[#0a0706] flex items-center justify-center">
                {/* Stylized fighter silhouette — no portrait dependency */}
                <div className="silhouette-figure idle-breathe" style={{ "--sil-color": active ? "#3a2a1e" : "#1a120c", "--sil-glow": "rgba(217,119,87,0.5)" }}>
                  <Box className="sil-icon" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#040303] via-transparent to-transparent" />
                <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-[#0a0706]/80 border border-[#c5a059]/30 px-1.5 py-0.5 rounded-full text-[#d1a985] uppercase">
                  {f.modelUrl?.endsWith(".fbx") ? "FBX" : "GLB"}
                </span>
                {active && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] bg-[#d97757] text-[#1a0d08] px-1.5 py-0.5 rounded-full font-bold tracking-wider flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" /> ACTIVE
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-bold text-foreground leading-tight truncate">{f.name}</p>
                <p className="text-[9px] text-[#8a6d3b] uppercase tracking-wider">{f.role}</p>
                <div className="mt-1.5 space-y-1">
                  <StatBar label="PWR" value={s.damageMultiplier || 1} max={1.5} color="linear-gradient(90deg,#d97757,#f0d9a8)" />
                  <StatBar label="DEF" value={s.defense || 1} max={1.5} color="linear-gradient(90deg,#3fae6a,#6dd49a)" />
                  <StatBar label="SPD" value={s.movementSpeed || 1} max={1.5} color="linear-gradient(90deg,#2bb3c0,#5ed1da)" />
                  <StatBar label="HP"  value={s.maxHealth || 1000} max={1500} color="linear-gradient(90deg,#c0484a,#e07466)" />
                </div>
                <button
                  onClick={() => onSelect?.(f.key, f.name)}
                  className={`mt-2 w-full py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition ${
                    active ? "btn-noir-primary" : "btn-noir-ghost"
                  }`}
                >
                  {active ? "SELECTED" : "SELECT"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}