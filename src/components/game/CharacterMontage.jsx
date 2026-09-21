import React from "react";
import { Image } from "@/components/ui/image";
import { EPISODES, CHARACTER_SHEET_IMAGE } from "@/lib/forgottenOnesData";

// Cinematic character-sheet backdrop: the official Season 1 sheet rendered as a
// dimmed, vignetted montage behind the game hero.
export default function CharacterMontage() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="fonoir-bg absolute inset-0" />

      {/* Official character sheet (dimmed) */}
      {CHARACTER_SHEET_IMAGE && (
        <div className="absolute inset-0 opacity-[0.22]">
          <Image src={CHARACTER_SHEET_IMAGE} fittingType="fill" className="w-full h-full" />
        </div>
      )}

      {/* Bottom: journey episode strip */}
      <div className="absolute inset-x-0 bottom-[6%] h-[24%] opacity-[0.13] px-3">
        <div className="flex items-center gap-1.5 h-full">
          {EPISODES.map((ep, i) => (
            <div key={ep.id} className="flex-1 flex flex-col justify-end h-full">
              <div
                className="rounded-t border-t border-x border-[#c5a059]/40 flex items-end justify-center pb-1"
                style={{
                  height: `${40 + (i % 5) * 12}%`,
                  background: `linear-gradient(180deg, transparent, ${ep.color}33)`,
                }}
              >
                <span className="text-[7px] text-[#d1a985] uppercase tracking-wider font-heading whitespace-nowrap rotate-180"
                  style={{ writingMode: "vertical-rl" }}>
                  {ep.title}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tagline watermark */}
      <div className="absolute inset-x-0 bottom-[30%] text-center opacity-[0.10] px-4">
        <p className="text-[9px] sm:text-[11px] tracking-[0.3em] uppercase text-[#d1a985] font-heading">
          They were not destroyed. They were erased.
        </p>
      </div>

      <div className="fog-layer" />
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className="ember-dot"
          style={{
            left: `${(i * 53 + 7) % 100}%`,
            bottom: `${(i * 17) % 45}%`,
            "--dur": `${3.4 + (i % 5) * 0.7}s`,
            "--delay": `${(i % 7) * 0.55}s`,
            "--drift": `${(i % 2 ? 1 : -1) * (8 + (i % 4) * 5)}px`,
          }}
        />
      ))}
      <div className="vignette" />
      <div className="absolute inset-0 bg-[#060606]/60" />
    </div>
  );
}