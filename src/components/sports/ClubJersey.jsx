import React from "react";

// Real club jersey: shows the official kit image (strEquipment) when available,
// otherwise a jersey silhouette filled with the club's real kit colour, with the
// official crest (or emoji fallback) centred on the chest.
export default function ClubJersey({ color, secondary, badge, equipment, emoji, size = 44 }) {
  const fill = color || "#1e6f5c";
  return (
    <div className="relative mx-auto flex items-center justify-center" style={{ width: size, height: size }}>
      {equipment ? (
        <img
          src={equipment}
          alt=""
          className="rounded object-contain"
          style={{ width: size, height: size }}
          onError={(e) => { e.target.style.display = "none"; e.target.dataset.fallback = "1"; }}
        />
      ) : (
        <div className="relative" style={{ width: size, height: size }}>
          <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
            <path
              d="M24 9 L20 13 L9 17 L12 27 L20 24 L20 56 Q20 59 23 59 L41 59 Q44 59 44 56 L44 24 L52 27 L55 17 L44 13 L40 9 L36 13 Q32 16 28 13 Z"
              fill={fill}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth="1.5"
            />
            <path d="M28 13 Q32 17 36 13" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
            {secondary && <rect x="30" y="16" width="4" height="42" fill={secondary} opacity="0.5" />}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center pt-1.5">
            {badge ? (
              <img
                src={badge}
                alt=""
                className="rounded object-contain"
                style={{ width: size * 0.38, height: size * 0.38 }}
                onError={(e) => { e.target.style.display = "none"; }}
              />
            ) : (
              <span className="text-sm leading-none">{emoji || "⚽"}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}