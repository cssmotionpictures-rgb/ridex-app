import React from "react";

// Pure-CSS cinematic backdrop: fog, drifting embers, vignette, film grain.
export default function CinematicBackdrop({ dense = false, grain = true }) {
  const count = dense ? 18 : 11;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="fonoir-bg absolute inset-0" />
      <div className="fog-layer" />
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="ember-dot"
          style={{
            left: `${(i * 53 + 7) % 100}%`,
            bottom: `${(i * 17) % 40}%`,
            "--dur": `${3.4 + (i % 5) * 0.7}s`,
            "--delay": `${(i % 7) * 0.55}s`,
            "--drift": `${(i % 2 ? 1 : -1) * (8 + (i % 4) * 5)}px`,
          }}
        />
      ))}
      <div className="vignette" />
      {grain && <div className="film-grain absolute inset-0" />}
    </div>
  );
}