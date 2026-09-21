import React from "react";
import confetti from "canvas-confetti";
import { Trophy, X } from "lucide-react";

// WIN BADGE OVERLAY — listens for every settled WIN across the app and shows
// the congratulations badge with a gold confetti burst. The voice shout and
// triumphant sound are fired by the celebration engine itself.
export default function WinCelebrationOverlay() {
  const [win, setWin] = React.useState(null);
  const timer = React.useRef(null);

  React.useEffect(() => {
    const onWin = (e) => {
      const detail = (e && e.detail) || {};
      setWin(detail);
      try {
        confetti({
          particleCount: 140,
          spread: 85,
          origin: { y: 0.35 },
          colors: ["#f7c948", "#ffe9a8", "#ffffff"],
        });
      } catch {}
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setWin(null), 6500);
    };
    window.addEventListener("ridex:win", onWin);
    return () => {
      window.removeEventListener("ridex:win", onWin);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!win) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center pointer-events-none px-4">
      <div className="pointer-events-auto relative max-w-sm w-full rounded-3xl border-2 border-primary/60 bg-gradient-to-br from-primary/25 via-card to-card p-6 text-center space-y-3 shadow-2xl animate-fade-in">
        <button
          onClick={() => setWin(null)}
          aria-label="Close"
          className="absolute top-2 right-2 p-1.5 rounded-full bg-secondary/70 text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 border-2 border-primary/50 flex items-center justify-center">
          <Trophy className="w-8 h-8 text-primary title-glow" />
        </div>
        <p className="font-heading font-extrabold text-2xl gold-text">WINNER! WINNER!</p>
        <p className="text-sm font-semibold">{win.home} vs {win.away}</p>
        {win.market && (
          <p className="inline-block px-3 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
            {win.market} — HIT!
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          Congratulations — your prediction landed. Settled from the real final score. 18+, play responsibly.
        </p>
      </div>
    </div>
  );
}