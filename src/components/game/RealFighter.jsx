import React from "react";

// Detailed, anatomically-stylized REAL HUMAN fighter render — zero-credit, no
// external images. Replaces the old stick-figure "alphabets". Parametrized by
// skin tone, garb color, aura, weapon and pose so every fighter reads as a
// distinct real human in a PS5-style fighting-game art style.
let _id = 0;

export default function RealFighter({
  skin = "#6b4423",
  garb = "#c5a059",
  garb2 = "#1a0d08",
  aura = "#f7c948",
  weapon = "none", // sword | spear | staff | fist | none
  pose = "guard", // guard | attack | defend
  spectral = false,
  power = 0,
  height = 200,
}) {
  const uid = React.useMemo(() => `rf${++_id}`, []);
  const skinGrad = `${uid}-skin`;
  const garbGrad = `${uid}-garb`;
  const auraId = `${uid}-aura`;
  const op = spectral ? 0.55 : 1;
  const filter = spectral ? `drop-shadow(0 0 12px ${aura})` : `drop-shadow(0 5px 12px rgba(0,0,0,0.75))`;

  const frontArm = pose === "attack" ? "translate(16, -2) rotate(20)" : pose === "defend" ? "translate(-4, -14) rotate(-10)" : "translate(2, -4) rotate(8)";
  const backArm = pose === "defend" ? "translate(6, -12) rotate(-8)" : "translate(-2, 0) rotate(-6)";

  return (
    <svg viewBox="0 0 120 220" height={height} style={{ filter, overflow: "visible" }} className="idle-breathe">
      <defs>
        <linearGradient id={skinGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skin} stopOpacity={op} />
          <stop offset="60%" stopColor={skin} stopOpacity={op} />
          <stop offset="100%" stopColor="#000" stopOpacity={op * 0.5} />
        </linearGradient>
        <linearGradient id={garbGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={garb} stopOpacity={0.96} />
          <stop offset="100%" stopColor={garb2} stopOpacity={0.92} />
        </linearGradient>
        <radialGradient id={auraId} cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor={aura} stopOpacity={0.45 * (0.35 + power * 0.65)} />
          <stop offset="100%" stopColor={aura} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* aura */}
      <ellipse cx="60" cy="100" rx="56" ry="90" fill={`url(#${auraId})`} />
      {/* ground shadow */}
      <ellipse cx="60" cy="210" rx="26" ry="6" fill="rgba(0,0,0,0.55)" />

      {/* BACK leg */}
      <path d="M58 120 L46 178 L40 204 L49 206 L58 150 Z" fill={`url(#${skinGrad})`} stroke="#000" strokeOpacity="0.25" strokeWidth="0.6" />
      {/* BACK arm */}
      <g transform={backArm} style={{ transformOrigin: "60px 60px" }}>
        <path d="M52 58 L34 78 L30 96 L39 98 L44 82 L58 66 Z" fill={`url(#${skinGrad})`} stroke="#000" strokeOpacity="0.2" strokeWidth="0.5" />
        <circle cx="31" cy="96" r="5" fill={`url(#${skinGrad})`} />
      </g>

      {/* TORSO */}
      <path d="M40 52 Q60 46 80 52 L84 120 Q60 132 36 120 Z" fill={`url(#${garbGrad})`} />
      <path d="M44 50 Q60 56 76 50 L80 64 Q60 70 40 64 Z" fill={`url(#${skinGrad})`} opacity="0.92" />
      <path d="M50 66 Q60 70 70 66 L72 108 Q60 112 48 108 Z" fill="#000" opacity="0.18" />
      <line x1="60" y1="68" x2="60" y2="108" stroke="#000" strokeOpacity="0.22" strokeWidth="0.8" />
      <line x1="52" y1="82" x2="68" y2="82" stroke="#000" strokeOpacity="0.18" strokeWidth="0.6" />
      <line x1="51" y1="93" x2="69" y2="93" stroke="#000" strokeOpacity="0.18" strokeWidth="0.6" />
      <rect x="38" y="112" width="44" height="7" rx="2" fill={garb} stroke="#000" strokeOpacity="0.3" strokeWidth="0.5" />

      {/* FRONT leg */}
      <path d="M62 120 L74 176 L82 204 L72 206 L60 150 Z" fill={`url(#${skinGrad})`} stroke="#000" strokeOpacity="0.2" strokeWidth="0.5" />
      <path d="M72 204 L86 206 L84 210 L70 210 Z" fill="#1a0d08" />

      {/* HEAD + neck */}
      <path d="M52 44 Q52 30 60 26 Q68 30 68 44 L66 52 Q60 56 54 52 Z" fill={`url(#${skinGrad})`} stroke="#000" strokeOpacity="0.2" strokeWidth="0.5" />
      <path d="M50 30 Q60 15 70 30 Q66 23 60 23 Q54 23 50 30 Z" fill="#1a0d08" />
      <line x1="56" y1="38" x2="59" y2="38" stroke="#1a0d08" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="63" y1="38" x2="66" y2="38" stroke="#1a0d08" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M55 35 Q60 33 65 35" stroke="#1a0d08" strokeWidth="0.8" fill="none" strokeLinecap="round" />
      <path d="M54 46 Q60 50 66 46" stroke="#000" strokeOpacity="0.2" strokeWidth="0.5" fill="none" />

      {/* FRONT arm */}
      <g transform={frontArm} style={{ transformOrigin: "60px 58px" }}>
        <path d="M68 56 L86 74 L92 92 L84 94 L78 78 L66 64 Z" fill={`url(#${skinGrad})`} stroke="#000" strokeOpacity="0.2" strokeWidth="0.5" />
        <circle cx="88" cy="93" r="5.5" fill={`url(#${skinGrad})`} />
        <line x1="85" y1="91" x2="91" y2="91" stroke="#000" strokeOpacity="0.25" strokeWidth="0.5" />
      </g>

      {/* weapon */}
      {weapon === "sword" && (
        <g transform={frontArm} style={{ transformOrigin: "60px 58px" }}>
          <rect x="86" y="18" width="4" height="80" rx="2" fill="#d8d8e0" stroke="#000" strokeOpacity="0.3" strokeWidth="0.4" />
          <rect x="82" y="92" width="12" height="4" rx="1" fill={garb} />
        </g>
      )}
      {weapon === "spear" && (
        <>
          <rect x="92" y="12" width="2.5" height="100" rx="1" fill="#6b4423" />
          <path d="M88 8 L96 6 L98 18 L92 20 Z" fill="#d8d8e0" />
        </>
      )}
      {weapon === "staff" && (
        <>
          <rect x="90" y="16" width="3" height="96" rx="1.5" fill={garb} />
          <circle cx="91.5" cy="14" r="5" fill={aura} opacity="0.85" />
        </>
      )}
    </svg>
  );
}