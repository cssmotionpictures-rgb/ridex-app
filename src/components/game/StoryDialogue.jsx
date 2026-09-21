import React, { useState, useEffect } from "react";
import RealFighter from "./RealFighter";
import { CHARACTERS } from "@/lib/forgottenOnesData";

// Cinematic story dialogue between characters — plays a typewriter conversation
// (protagonist, ally, enemy) before each battle, giving the campaign an
// adventure-movie narrative. Tap to advance; on the last line, begin the fight.
export default function StoryDialogue({ lines, scene, difficulty, onComplete }) {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const line = lines[idx];

  useEffect(() => {
    setTyped("");
    setDone(false);
    if (!line) return;
    let i = 0;
    const t = setInterval(() => {
      i++;
      setTyped(line.text.slice(0, i));
      if (i >= line.text.length) { clearInterval(t); setDone(true); }
    }, 20);
    return () => clearInterval(t);
  }, [idx, line]);

  const next = () => {
    if (!done) { setTyped(line.text); setDone(true); return; }
    if (idx < lines.length - 1) setIdx(idx + 1);
    else onComplete?.();
  };

  const speaker = line?.speaker || "";
  const speakerChar = CHARACTERS.find((c) => c.name === speaker);
  const isEnemy = !speakerChar;
  const color = speakerChar?.color || "#c0484a";

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end px-4 pb-4 bg-gradient-to-t from-[#040303]/95 via-[#040303]/65 to-transparent" onClick={next}>
      {scene && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 text-center px-4">
          {difficulty && (
            <p className="text-[9px] uppercase tracking-[0.3em] font-bold" style={{ color: difficulty.color }}>
              {difficulty.label} Difficulty
            </p>
          )}
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#d97757] mt-1">{scene.time} · {scene.weather}</p>
          <p className="text-xs text-[#d1a985] italic mt-0.5">{scene.location} — {scene.detail}</p>
        </div>
      )}
      <div className="noir-panel rounded-2xl p-4 max-w-md mx-auto w-full cursor-pointer">
        <div className="flex items-start gap-3">
          <div className="w-16 h-20 rounded-lg overflow-hidden shrink-0 flex items-end justify-center" style={{ background: `radial-gradient(ellipse at 50% 30%, ${color}33, #0a0706)` }}>
            <RealFighter
              skin={speakerChar?.skin || "#6b4423"}
              garb={color}
              garb2="#1a0d08"
              aura={color}
              weapon={speakerChar?.weapon || "none"}
              spectral={isEnemy}
              height={74}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color }}>{speaker}</p>
            <p className="text-sm text-foreground leading-snug mt-1 min-h-[2.6rem]">
              {typed}{!done && <span className="animate-pulse">▌</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-1">
            {lines.map((_, i) => (
              <span key={i} className={`w-5 h-1 rounded-full ${i === idx ? "bg-[#d97757]" : i < idx ? "bg-[#c5a059]/60" : "bg-[#c5a059]/20"}`} />
            ))}
          </div>
          <span className="text-[10px] text-[#8a6d3b]">tap to {idx < lines.length - 1 ? "continue" : "begin fight"} ▸</span>
        </div>
      </div>
    </div>
  );
}