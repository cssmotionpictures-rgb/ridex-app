import React from "react";
import { loadAdVideos } from "@/lib/adCreatives";
import QuickBetPopup from "@/components/sports/QuickBetPopup";
import TvStationBug from "@/components/tv/TvStationBug";
import { X, Loader2, Volume2, VolumeX, Maximize2, Radio } from "lucide-react";

const AD_INTERVAL = 20; // seconds of watching before each ad
const AD_DURATION = 6;  // ad length (kept short so the stream feels fast)

export default function MatchStream({ match, onClose, hasMembership }) {
  const adFree = !!hasMembership;
  const videoRef = React.useRef(null);
  const adVideoRef = React.useRef(null);
  const watchTimer = React.useRef(null);
  const adTimer = React.useRef(null);

  const [adVideos, setAdVideos] = React.useState([]);
  const [adActive, setAdActive] = React.useState(false);
  const [adCountdown, setAdCountdown] = React.useState(AD_DURATION);
  const [adIdx, setAdIdx] = React.useState(0);
  const [secondsWatched, setSecondsWatched] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [loadingAd, setLoadingAd] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    loadAdVideos(8).then((v) => mounted && setAdVideos(v)).finally(() => mounted && setLoadingAd(false));
    return () => { mounted = false; };
  }, []);

  // Watch-time ticker: counts only while the stream is actually playing
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const startTick = () => {
      if (watchTimer.current) return;
      watchTimer.current = setInterval(() => {
        setSecondsWatched((s) => {
          const ns = s + 1;
          if (ns >= AD_INTERVAL && !adFree) {
            triggerAd();
            return 0;
          }
          return ns;
        });
      }, 1000);
    };
    const stopTick = () => {
      clearInterval(watchTimer.current);
      watchTimer.current = null;
    };
    v.addEventListener("play", startTick);
    v.addEventListener("playing", startTick);
    v.addEventListener("pause", stopTick);
    v.addEventListener("waiting", stopTick);
    return () => {
      v.removeEventListener("play", startTick);
      v.removeEventListener("playing", startTick);
      v.removeEventListener("pause", stopTick);
      v.removeEventListener("waiting", stopTick);
      stopTick();
      clearInterval(adTimer.current);
    };
  }, []);

  const triggerAd = React.useCallback(() => {
    const v = videoRef.current;
    if (v) v.pause();
    setAdActive(true);
    setAdCountdown(AD_DURATION);
    setAdIdx((i) => (i + 1) % Math.max(adVideos.length, 1));
    adTimer.current = setInterval(() => {
      setAdCountdown((c) => {
        if (c <= 1) {
          clearInterval(adTimer.current);
          adTimer.current = null;
          endAd();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adVideos]);

  const endAd = React.useCallback(() => {
    setAdActive(false);
    const v = videoRef.current;
    if (v) v.play().catch(() => {});
    setSecondsWatched(0);
  }, []);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const goFullscreen = () => {
    const v = videoRef.current;
    if (v && v.requestFullscreen) v.requestFullscreen();
  };

  const progress = (secondsWatched / AD_INTERVAL) * 100;
  const adSrc = adVideos[adIdx] || adVideos[0];

  return (
    <div className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in" onClick={onClose}>
      <div className="relative w-full max-w-3xl rounded-2xl overflow-hidden bg-card border border-border/60" onClick={(e) => e.stopPropagation()}>
        {/* Score header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-secondary/40">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400">
              <Radio className="w-3.5 h-3.5 animate-pulse" /> LIVE
            </span>
            <span className="text-sm font-medium truncate">{match.team_a} {match.score_a} – {match.score_b} {match.team_b}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">{match.league}</span>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Video stage */}
        <div className="relative bg-black aspect-video">
          <video
            ref={videoRef}
            src={match.stream_url}
            poster={match.poster_url}
            autoPlay
            playsInline
            controls
            className="w-full h-full object-contain video-8k"
          />

          {/* Ad interval progress bar (top of video) */}
          {!adActive && !adFree && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
              <div className="h-full bg-primary transition-all duration-1000 ease-linear" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* Custom quick controls */}
          {!adActive && (
            <div className="absolute bottom-14 right-3 flex gap-1.5">
              <button onClick={toggleMute} className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70">{muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
              <button onClick={goFullscreen} className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70"><Maximize2 className="w-4 h-4" /></button>
            </div>
          )}

          {!adActive && <TvStationBug live />}

          {/* Ad overlay */}
          {adActive && (
            <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-10">
              {loadingAd ? (
                <div className="text-white/70 flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading ad…</div>
              ) : (
                <>
                  <video
                    ref={adVideoRef}
                    src={adSrc}
                    autoPlay
                    playsInline
                    muted
                    onEnded={endAd}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                  <div className="absolute top-3 left-3 bg-yellow-500 text-black text-xs font-bold px-2.5 py-1 rounded-full">AD</div>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full">
                    Stream resumes in {adCountdown}s…
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div className="h-full bg-yellow-400 transition-all duration-1000 ease-linear" style={{ width: `${((AD_DURATION - adCountdown) / AD_DURATION) * 100}%` }} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Quick Bet — free 4-second prediction flash during live matches */}
        {match.status === "live" && <QuickBetPopup match={match} />}

        {/* Footer hint */}
        <div className="px-4 py-2.5 text-center text-xs text-muted-foreground">
          {adActive ? "Advertisement — your stream continues automatically" : adFree ? "✓ Ad-free member — enjoy uninterrupted football" : `Next ad in ${AD_INTERVAL - secondsWatched}s · ad-supported free streaming`}
        </div>
        <p className="px-4 pb-2 text-center text-[10px] text-muted-foreground/70">By watching you agree to our <a href="/terms" className="underline">Terms</a>. Streams are provided by third parties.</p>
      </div>
    </div>
  );
}