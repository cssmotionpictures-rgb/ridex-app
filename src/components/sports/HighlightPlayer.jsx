import React from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";

export default function HighlightPlayer({ src, title, competition, date, onClose }) {
  const wrapRef = React.useRef(null);
  const [fs, setFs] = React.useState(false);

  const toggleFs = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch {}
  };

  React.useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !document.fullscreenElement) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!src) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-fade-in">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-secondary/60">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {competition}{date ? ` · ${new Date(date).toLocaleDateString("en-NG")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={toggleFs} className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-background/60 text-muted-foreground hover:text-foreground">
            {fs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-background/60 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div ref={wrapRef} className="flex-1 flex items-center justify-center bg-black relative">
        <iframe
          src={src}
          title={title || "Highlight"}
          className="w-full h-full"
          frameBorder="0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          // Sandbox: allow scripts + same-origin so ScoreBat's player works, but
          // deliberately OMIT allow-top-navigation and allow-popups so the iframe
          // can never redirect the app or open external tabs — plays in-app only.
          sandbox="allow-scripts allow-same-origin allow-presentation"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="absolute top-3 right-3 z-[5] bg-black/55 text-primary text-[11px] font-bold px-2.5 py-1 rounded-full pointer-events-none backdrop-blur-sm">🏆 RIDE X</div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground/70 py-2.5 px-4">
        Playing directly in the Ride X in-app player · no redirects · powered by ScoreBat
      </p>
    </div>
  );
}