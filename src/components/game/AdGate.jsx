import React, { useEffect, useRef, useState } from "react";
import { X, Crown, Play, Loader2, Volume2 } from "lucide-react";
import { loadAdVideos } from "@/lib/adCreatives";
import { loadAdCreative, reportSponsorAdPlay } from "@/lib/sponsorAds";

// In-app "watch ad" gate shown before each free game play. Plays a REAL video
// ad creative — a paid sponsor ad if one is available (revenue tracked server-
// side), otherwise a platform trailer. The game launches once the creative has
// played for MIN_WATCH seconds or to the end, whichever comes first. Premium
// users skip entirely (handled by the caller). Works on web and the mobile app.
export default function AdGate({ game, onDone, onPremium, onClose }) {
  const MIN_WATCH = 5;
  const [src, setSrc] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [ended, setEnded] = useState(false);
  const [ready, setReady] = useState(false);
  const [sponsorAd, setSponsorAd] = useState(null);
  const [sponsorName, setSponsorName] = useState("");
  const launched = useRef(false);

  useEffect(() => {
    (async () => {
      const fallback = await loadAdVideos();
      const creative = await loadAdCreative("arcade", fallback);
      setSrc(creative.videoUrl);
      setSponsorAd(creative.sponsorAd);
      setSponsorName(creative.sponsorName);
    })();
  }, []);

  useEffect(() => {
    if (launched.current) return;
    if (ended || elapsed >= MIN_WATCH) {
      launched.current = true;
      if (sponsorAd) reportSponsorAdPlay(sponsorAd);
      const t = setTimeout(() => onDone?.(), 350);
      return () => clearTimeout(t);
    }
  }, [ended, elapsed, onDone, sponsorAd]);

  // Watchdog: if the ad creative fails to load/play, don't trap the user —
  // auto-launch the game after a short grace period.
  useEffect(() => {
    const t = setTimeout(() => {
      if (launched.current) return;
      launched.current = true;
      if (sponsorAd) reportSponsorAdPlay(sponsorAd);
      onDone?.();
    }, 9000);
    return () => clearTimeout(t);
  }, [onDone, sponsorAd]);

  const pct = Math.min(100, (elapsed / MIN_WATCH) * 100);
  const done = ended || elapsed >= MIN_WATCH;

  return (
    <div className="fixed inset-0 z-[1900] flex flex-col items-center justify-center bg-black/95 px-6 text-center">
      <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/5 border border-border text-muted-foreground hover:text-foreground">
        <X className="w-5 h-5" />
      </button>

      <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold mb-1">Ride X Arcade · Free Play</p>
      <h3 className="text-lg font-extrabold text-foreground mb-4">{game?.name}</h3>

      <div className="w-full max-w-xs rounded-2xl border border-border bg-card/60 p-5">
        <p className="text-sm text-muted-foreground mb-3">Your game starts after this short ad…</p>
        <div className="relative h-40 rounded-xl bg-black overflow-hidden mb-3">
          {src ? (
            <video
              src={src}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
              preload="auto"
              onCanPlay={() => setReady(true)}
              onTimeUpdate={(e) => setElapsed(e.target.currentTime)}
              onEnded={() => setEnded(true)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          <span className="absolute top-2 left-2 text-[9px] uppercase tracking-[0.25em] bg-black/70 px-1.5 py-0.5 rounded-full flex items-center gap-1">
            <Volume2 className="w-2.5 h-2.5" /> {sponsorName ? `Sponsored by ${sponsorName}` : "Sponsored"}
          </span>
          {src && !ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 h-1 bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{done ? "Launching…" : `Ad playing · ${Math.max(0, Math.ceil(MIN_WATCH - elapsed))}s`}</span>
          {done ? <Play className="w-4 h-4 text-primary" /> : <span className="text-muted-foreground/70">{pct.toFixed(0)}%</span>}
        </div>
      </div>

      <button onClick={onPremium} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary border border-primary/40 bg-primary/10 rounded-xl px-4 py-2">
        <Crown className="w-4 h-4" /> Go Premium — skip all ads & unlimited play
      </button>
    </div>
  );
}