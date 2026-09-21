import React from "react";
import { Image } from "@/components/ui/image";
import RealFighter from "./RealFighter";
import SpriteCell from "./SpriteCell";
import { CHARACTERS, CHARACTER_SHEET_IMAGE, CHARACTER_SPRITE } from "@/lib/forgottenOnesData";

// Cinematic fighter portrait. Renders the character's real photo when an
// image URL is set, otherwise a detailed REAL HUMAN fighter render (RealFighter)
// — never the old stick-figure "alphabets". Aura intensity scales with `power`
// so a stronger fighter glows harder.
export default function FighterPortrait({
  name,
  role,
  color = "#c5a059",
  image = "",
  isPlayer = false,
  isBoss = false,
  fighterProps,
  power = 0,
  width = 140,
  height = 200,
  glow = 50,
}) {
  const frameClass = isPlayer ? "player" : isBoss ? "boss" : "foe";
  const fp = fighterProps || { skin: "#6b4423", garb: color, garb2: "#1a0d08", aura: color, weapon: "none", spectral: false };
  // Back door: if this fighter matches one of the 15 sheet characters, show
  // their real portrait cropped from the uploaded sheet (zero credits).
  const char = CHARACTERS.find((c) => c.name.toLowerCase() === String(name || "").toLowerCase());
  const sprite = char ? CHARACTER_SPRITE[char.id] : null;
  return (
    <div className="relative" style={{ width, height }}>
      <div
        className={`portrait-frame ${frameClass} w-full h-full`}
        style={{ boxShadow: `0 0 ${glow + power * 40}px -10px ${color}cc, 0 18px 44px -16px rgba(0,0,0,0.92)` }}
      >
        {image ? (
          <div className="absolute inset-0 idle-breathe">
            <Image src={image} fittingType="fill" className="w-full h-full" focalPointX={0.5} focalPointY={0.35} />
          </div>
        ) : sprite ? (
          <div className="absolute inset-0 ken-burns">
            <SpriteCell src={CHARACTER_SHEET_IMAGE} cols={5} rows={3} col={sprite.col} row={sprite.row} className="w-full h-full" />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-end justify-center pb-1">
            <div className={power > 0.5 ? "power-surge" : "idle-breathe"}>
              <RealFighter {...fp} power={power} height={height} />
            </div>
            {power > 0.5 && <div className="absolute inset-0 power-aura-ring" style={{ boxShadow: `inset 0 0 ${20 * power}px ${color}` }} />}
          </div>
        )}
        <div className="name-plate">
          <div className="np-name" style={{ color: isBoss ? "#ff8a6a" : "#f0d9a8" }}>{name}</div>
          {role && <div className="np-role">{role}</div>}
        </div>
      </div>
      <div className="ground-shadow" />
    </div>
  );
}