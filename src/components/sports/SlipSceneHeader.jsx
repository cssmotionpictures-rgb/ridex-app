import React from "react";

// Cinematic sport-scene header for every betting slip — the sport's own dark
// playing surface (pitch stripes, hardwood planks, hard-court lines, clay,
// yard lines, rink ice) with a live-monitor style kicker and badge strip,
// matching the Monster Engine / live sports monitor look.

const SCENES = {
  football: "scene-football",
  basketball: "scene-basketball",
  tennis: "scene-tennis",
  baseball: "scene-baseball",
  nfl: "scene-nfl",
  hockey: "scene-hockey",
};

export default function SlipSceneHeader({ scene = "football", kicker, title, badges = [], right }) {
  return (
    <div className={`rounded-xl ${SCENES[scene] || SCENES.football} border border-white/10 px-3.5 py-2.5 flex items-center justify-between gap-2`}>
      <div className="min-w-0">
        {kicker ? <p className="text-[8px] font-black text-white/50 tracking-[0.22em] truncate">{kicker}</p> : null}
        <p className="text-[13px] font-black text-white truncate tracking-wide">{title}</p>
        {badges.filter(Boolean).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {badges.filter(Boolean).map((b, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-[8px] font-bold text-[#00e676] whitespace-nowrap">
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}