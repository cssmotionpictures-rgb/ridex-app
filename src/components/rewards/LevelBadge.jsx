import React from "react";

const META = {
  "New User": { c: "#9ca3af", e: "🌱" },
  Bronze: { c: "#b08d57", e: "🥉" },
  Silver: { c: "#c0c0c0", e: "🥈" },
  Gold: { c: "#f7c948", e: "🥇" },
  Platinum: { c: "#7fd8e0", e: "💠" },
  Diamond: { c: "#b388ff", e: "💎" },
};

export default function LevelBadge({ level, size = 64 }) {
  const m = META[level] || META.Bronze;
  return (
    <div
      className="rounded-full flex items-center justify-center shadow-inner shrink-0"
      style={{
        width: size, height: size,
        background: `radial-gradient(circle at 30% 30%, ${m.c}55, ${m.c}22)`,
        border: `2px solid ${m.c}`, color: m.c,
      }}
    >
      <span style={{ fontSize: size * 0.4 }}>{m.e}</span>
    </div>
  );
}