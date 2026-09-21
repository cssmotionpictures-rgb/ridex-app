import React, { useState } from "react";
import { CHARACTERS } from "@/lib/forgottenOnesData";
import CharacterCard from "./CharacterCard";

const UNLOCK_COST = { Hero: 0, Orisa: 500, Legend: 800, Villain: 800 };

export default function CharacterRoster({ profile, onSelect, onUnlock }) {
  const unlocked = (profile?.unlocked_characters || "1,2,3,4,5").split(",").map(Number);
  const activeId = profile?.active_character_id || 1;
  const [pending, setPending] = useState(null);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold text-lg text-[#d1a985] tracking-wide">Character Roster</h3>
        <p className="text-xs text-[#8a6d3b]">17 playable Orisa & legends. Tap to set your active fighter. Locked ones unlock with Spirit Points.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {CHARACTERS.map((c) => {
          const isUnlocked = unlocked.includes(c.id);
          const isActive = activeId === c.id;
          const cost = UNLOCK_COST[c.tier] || 500;
          return (
            <div key={c.id} className="relative">
              <CharacterCard
                character={c}
                locked={!isUnlocked}
                active={isActive}
                onSelect={(ch) => isUnlocked && onSelect(ch)}
              />
              {!isUnlocked && (
                <button
                  onClick={() => {
                    setPending(c);
                    onUnlock(c, cost);
                  }}
                  className="absolute bottom-2 left-2 right-2 text-[10px] py-1 rounded-lg btn-noir-primary font-semibold"
                >
                  Unlock · {cost} SP
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}