import React from "react";
import { Clapperboard } from "lucide-react";

// Subtle, periodically-moving watermark that deters screen-recording
// without blocking the video's main action. Very low-opacity and tiny.
const POSITIONS = [
  { top: "10%", left: "5%" },
  { top: "14%", right: "6%" },
  { bottom: "16%", left: "8%" },
  { bottom: "12%", right: "10%" },
  { top: "44%", left: "6%" },
  { top: "48%", right: "5%" },
];

export default function VideoWatermark({ label = "CSS MOVIES", intervalMs = 10000, className = "" }) {
  const [pos, setPos] = React.useState(0);
  const [fade, setFade] = React.useState(true);

  React.useEffect(() => {
    const move = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setPos((p) => (p + 1) % POSITIONS.length);
        setFade(true);
      }, 500);
    }, intervalMs);
    return () => clearInterval(move);
  }, [intervalMs]);

  const style = { ...POSITIONS[pos], transition: "opacity 0.5s ease, top 0.6s ease, left 0.6s ease, right 0.6s ease, bottom 0.6s ease" };

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute z-20 select-none ${className}`}
      style={style}
    >
      <div
        className="flex items-center gap-1.5 rounded-full pl-1.5 pr-2.5 py-1"
        style={{
          opacity: fade ? 0.62 : 0,
          background: "linear-gradient(135deg, rgba(18,14,6,0.6), rgba(40,30,10,0.4))",
          border: "1px solid rgba(247,201,72,0.38)",
          backdropFilter: "blur(2px)",
        }}
      >
        <span className="font-heading text-[11px] font-extrabold leading-none gold-text" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}>RIDE X</span>
        <span className="text-[9px] font-semibold text-primary/90 leading-none whitespace-nowrap" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}>{label}</span>
      </div>
    </div>
  );
}