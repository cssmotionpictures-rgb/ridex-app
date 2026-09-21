import React from "react";
import { QrCode, Copy, Check } from "lucide-react";

// Deterministic QR-style block rendered from the ticket code hash (pure CSS,
// no external QR library). Scannable-looking visual + the code text for entry.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export default function QrTicket({ code, size = 140 }) {
  const [copied, setCopied] = React.useState(false);
  const cells = 21;
  const seed = hashStr(code || "RDX");
  const grid = [];
  for (let i = 0; i < cells * cells; i++) {
    const v = (hashStr(code + ":" + i) ^ seed) % 100;
    grid.push(v > 48);
  }
  // corner finder squares
  const isFinder = (r, c) => {
    const inBox = (br, bc) => r >= br && r < br + 7 && c >= bc && c < bc + 7;
    return inBox(0, 0) || inBox(0, cells - 7) || inBox(cells - 7, 0);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="rounded-xl bg-white p-2 grid"
        style={{ gridTemplateColumns: `repeat(${cells}, 1fr)`, width: size, height: size }}
      >
        {grid.map((on, i) => {
          const r = Math.floor(i / cells), c = i % cells;
          const finder = isFinder(r, c);
          const border = finder && (r % 6 === 0 || c % 6 === 0 || (r % 6 === 1 && c % 6 === 1) ? false : false);
          let fill = on;
          if (finder) {
            const br = r < 7 ? 0 : cells - 7;
            const bc = c < 7 ? 0 : cells - 7;
            const lr = r - br, lc = c - bc;
            fill = lr === 0 || lr === 6 || lc === 0 || lc === 6 || (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
          }
          return <div key={i} style={{ background: fill ? "#0a0a0a" : "transparent" }} />;
        })}
      </div>
      <button onClick={copy} className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground">
        <QrCode className="w-3.5 h-3.5" />
        <span className="font-bold tracking-wider">{code}</span>
        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}