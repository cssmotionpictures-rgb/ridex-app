import React from "react";

// Distressed bronze logo treatment for THE FORGOTTEN ONES.
export default function GameLogo({ size = "lg", tagline = true }) {
  const fontSize = size === "sm" ? "1.6rem" : size === "md" ? "2.1rem" : "clamp(2.1rem, 7.2vw, 3.6rem)";
  return (
    <div className="flex flex-col items-center select-none w-full">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="inline-block w-8 h-px bg-gradient-to-r from-transparent via-[#c5a059] to-transparent" />
        <span className="text-[10px] tracking-[0.42em] text-[#8a6d3b] uppercase font-medium">Ride X</span>
        <span className="inline-block w-8 h-px bg-gradient-to-r from-transparent via-[#c5a059] to-transparent" />
      </div>
      <h1
        className="bronze-text cinzel-title title-glow font-extrabold leading-[0.95]"
        style={{ fontSize, letterSpacing: "0.07em" }}
      >
        THE FORGOTTEN ONES
      </h1>
      <div className="ornate-divider w-full max-w-lg mt-1.5" />
      {tagline && (
        <p className="text-[11px] sm:text-xs text-[#9a7d4b] mt-1 italic tracking-[0.18em] uppercase">
          Reclaim the Ancestral Legacy
        </p>
      )}
    </div>
  );
}