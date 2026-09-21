import React, { useEffect, useRef, useState } from "react";
import { X, Maximize2, Minimize2, Loader2, RotateCw } from "lucide-react";
import { embedUrl } from "@/lib/arcadeGames";
import NativeCanvasGame from "@/components/game/NativeCanvasGame";

export default function ArcadePlayer({ game, onClose }) {
  const wrapRef = useRef(null);
  const [isFs, setIsFs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);
  const [failed, setFailed] = useState(false);

  const native = !!game?.native;

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement && wrapRef.current && document.fullscreenElement === wrapRef.current) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else wrapRef.current?.requestFullscreen?.().catch(() => {});
  };

  const reload = () => { setLoading(true); setFailed(false); setReloads((n) => n + 1); };

  useEffect(() => {
    if (native) { setLoading(false); setFailed(false); return; }
    setLoading(true); setFailed(false);
    const t = setTimeout(() => setFailed(true), 12000);
    return () => clearTimeout(t);
  }, [game?.slug, reloads, native]);

  if (!game) return null;

  return (
    <div ref={wrapRef} className="fixed inset-0 z-[2000] bg-[#050507] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-black/90 border-b border-primary/30 z-10">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-xl shrink-0">{game.icon || "🎮"}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate leading-tight">{game.name}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">{native ? "Ride X Arcade · Built-in Game" : "Ride X Arcade · In-App Player"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={reload} className="p-2 rounded-full bg-white/5 border border-border text-muted-foreground hover:text-foreground" title={native ? "Restart" : "Reload game"}>
            <RotateCw className="w-4 h-4" />
          </button>
          <button onClick={toggleFs} className="p-2 rounded-full bg-white/5 border border-border text-muted-foreground hover:text-foreground" title="Fullscreen">
            {isFs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 rounded-full bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Game stage */}
      <div className="relative flex-1 bg-black flex items-center justify-center">
        {native ? (
          <NativeCanvasGame key={`${game.engine}-${reloads}`} engine={game.engine} />
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black">
                <Loader2 className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground">Loading {game.name}…</p>
              </div>
            )}
            <iframe
              key={`${game.slug}-${reloads}`}
              src={embedUrl(game.slug)}
              title={game.name}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; fullscreen; gamepad; microphone; camera; clipboard-write"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setFailed(true); }}
            />
            {failed && !loading && (
              <div className="absolute bottom-3 inset-x-3 z-20 flex items-center justify-between gap-2 rounded-xl bg-black/85 border border-primary/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Game taking too long? Some titles need a reload.</p>
                <button onClick={reload} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold whitespace-nowrap">Reload</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}