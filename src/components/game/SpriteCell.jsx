import React from "react";

// === THE BACK DOOR ===
// Renders ONE cell cropped out of an already-hosted composite sprite-sheet
// image (media.base44.com public URL) using pure CSS background-position +
// background-size. No AI image generation, no UploadFile, no integration
// credits, and no rate limit — the browser just loads the existing file.
//
// Grid math (standard CSS sprite technique):
//   background-size   = cols*100% × rows*100%   (image is "cols"× wider, "rows"× taller than the box)
//   background-pos-x  = col / (cols-1) * 100%    (0% = first column … 100% = last column)
//   background-pos-y  = row / (rows-1) * 100%
export default function SpriteCell({
  src,
  cols = 1,
  rows = 1,
  col = 0,
  row = 0,
  className = "",
  rounded = true,
  overlay = true,
  children,
}) {
  const posX = cols > 1 ? (col / (cols - 1)) * 100 : 0;
  const posY = rows > 1 ? (row / (rows - 1)) * 100 : 0;
  return (
    <div
      className={`relative overflow-hidden ${rounded ? "rounded-xl" : ""} ${className}`}
      style={{
        backgroundImage: `url(${src})`,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${posX}% ${posY}%`,
        backgroundRepeat: "no-repeat",
        backgroundColor: "#0a0706",
      }}
    >
      {overlay && <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/30 pointer-events-none" />}
      {children}
    </div>
  );
}