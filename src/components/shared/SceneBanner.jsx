import React from "react";

// Cinematic dark scene banner for the non-sports sections — mirrors the
// sports prediction slip headers: dark scene surface (night-road lane paint,
// route grid), gold kicker, badge strip, film grain. scene = a .scene-* class
// defined in index.css (scene-ride, scene-logistics, or any sport scene).
export default function SceneBanner({ scene = "scene-ride", kicker, title, badges = [], right }) {
  return (
    <div className={`${scene} relative overflow-hidden rounded-2xl border border-white/10 px-4 py-4 mb-6 film-grain`}>
      <div className="relative z-[3] flex items-center justify-between gap-3">
        <div className="min-w-0">
          {kicker ? <p className="text-[9px] font-black text-white/50 tracking-[0.22em] uppercase truncate">{kicker}</p> : null}
          <p className="text-base sm:text-lg font-black text-white tracking-wide truncate">{title}</p>
          {badges.filter(Boolean).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {badges.filter(Boolean).map((b, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-black/40 border border-white/10 text-[8px] font-bold text-[#f7c948] whitespace-nowrap">
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </div>
  );
}