import React, { useEffect, useState } from "react";
import { loadCharacterReferences, CHARACTER_REFERENCE_NAMES } from "@/lib/characterAssets";
import { CHARACTERS } from "@/lib/forgottenOnesData";
import { Check, Lock } from "lucide-react";

// CHARACTER SELECT — displays the 17 official master character references as
// selectable portraits with stats. Selection sets the active fighter, whose
// identity asset is then used in the real-time arena. Portraits are allowed here
// (this is the selection screen, NOT active combat).

function statsFor(id) {
  const char = CHARACTERS.find((c) => c.id === id);
  if (char) {
    return {
      power: char.atk || 14,
      speed: 55 + ((id * 37) % 40),
      defense: Math.round((char.hp || 100) / 4),
      spirit: 45 + ((id * 23) % 50),
      special: char.ability?.name || "Ancestral Arts",
      finisher: "Ancestral Finish",
    };
  }
  return {
    power: 70 + id,
    speed: 55 + ((id * 37) % 40),
    defense: 60 + ((id * 29) % 40),
    spirit: 50 + ((id * 23) % 50),
    special: "Ancient Power",
    finisher: "Ancestral Finish",
  };
}

export default function CharacterSelect({ profile, onSelect }) {
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(profile?.active_character_id || 1);

  useEffect(() => {
    let alive = true;
    loadCharacterReferences()
      .then((r) => { if (alive) { setRefs(r); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const playableMaxId = CHARACTERS.length || 15;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-[#c5a059]/30 border-t-[#d97757] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="noir-panel rounded-2xl p-4">
        <h2 className="font-bold text-[#d1a985] tracking-wide flex items-center gap-2">
          <span className="text-[#d97757]">◈</span> Character Select
        </h2>
        <p className="text-xs text-[#8a6d3b] mt-1">
          The 17 master character references. Select your fighter — their identity carries into the arena.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {refs.map((ref) => {
          const active = ref.id === selected;
          const playable = ref.id <= playableMaxId;
          const s = statsFor(ref.id);
          return (
            <div
              key={ref.id}
              className={`relative rounded-2xl border overflow-hidden transition-all ${
                active ? "border-[#d97757]/70 noir-frame bg-[#2a1a0e]/40" : "border-[#c5a059]/18 bg-[#0c0907]/80"
              } ${playable ? "card-lift" : "opacity-70"}`}
            >
              <div className="relative w-full aspect-[3/4] overflow-hidden bg-[#0a0706]">
                <img
                  src={ref.url}
                  alt={ref.name}
                  className="w-full h-full object-cover object-top ken-burns-soft"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#040303] via-transparent to-transparent" />
                <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-[#0a0706]/80 border border-[#c5a059]/30 px-1.5 py-0.5 rounded-full text-[#d1a985]">
                  {String(ref.id).padStart(2, "0")}
                </span>
                {active && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] bg-[#d97757] text-[#1a0d08] px-1.5 py-0.5 rounded-full font-bold tracking-wider flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" /> ACTIVE
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-bold text-foreground leading-tight truncate">{ref.name}</p>
                <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-[#8a6d3b]">
                  <span>POWER <b className="text-[#d1a985]">{s.power}</b></span>
                  <span>SPEED <b className="text-[#d1a985]">{s.speed}</b></span>
                  <span>DEF <b className="text-[#d1a985]">{s.defense}</b></span>
                  <span>SPIRIT <b className="text-[#d1a985]">{s.spirit}</b></span>
                </div>
                <p className="text-[10px] text-[#d97757] mt-1 truncate">◈ {s.special}</p>
                <button
                  disabled={!playable}
                  onClick={() => { setSelected(ref.id); onSelect?.(ref); }}
                  className={`mt-2 w-full py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition ${
                    playable
                      ? active ? "btn-noir-primary" : "btn-noir-ghost"
                      : "bg-[#0a0706] text-[#6a5a3b] border border-[#c5a059]/15 cursor-not-allowed"
                  }`}
                >
                  {playable ? (active ? "SELECTED" : "SELECT") : (<span className="flex items-center justify-center gap-1"><Lock className="w-3 h-3" /> Soon</span>)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}