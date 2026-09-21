import React from "react";
import Hls from "hls.js";
import { Play, X } from "lucide-react";

// Vertical 9:16 (TikTok-style) ad player for the Watch Ads hub.
// One persistent <video> element stays mounted so the "Watch Ad" tap can play
// it UNMUTED inside the user gesture (browser autoplay rules otherwise block
// sound). Tapping opens a true full-screen view (Fullscreen API on
// desktop/Android; a fixed 100dvh overlay on iOS) and AUTOMATICALLY returns to
// the reel the instant the advert ends.
export default function WatchAdVideo({ src, onEnded, label = "Watch Ad" }) {
  const videoRef = React.useRef(null);
  const overlayRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);

  // Wire the source once; keep a muted looping preview running in the box.
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    let hls = null;
    const isHls = /\.m3u8(\?|$)/i.test(src);
    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(src); hls.attachMedia(v);
      hls.on(Hls.Events.ERROR, (_e, data) => { if (data?.fatal && playing) finishAd(); });
    } else {
      v.src = src;
    }
    if (!playing) { v.muted = true; v.loop = true; v.play().catch(() => {}); }
    return () => { try { hls?.destroy(); } catch {} try { v.removeAttribute("src"); v.load(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const finishAd = React.useCallback(() => {
    const v = videoRef.current;
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch {}
    setPlaying(false);
    // resume the muted looping preview
    requestAnimationFrame(() => {
      const vv = videoRef.current;
      if (!vv) return;
      vv.muted = true; vv.loop = true; vv.currentTime = 0;
      vv.play().catch(() => {});
    });
    onEnded?.();
  }, [onEnded]);

  const startAd = () => {
    const v = videoRef.current;
    if (!v) return;
    // Everything below runs INSIDE the user gesture so unmuted playback is allowed.
    v.muted = false;
    v.loop = false;
    v.currentTime = 0;
    const p = v.play();
    if (p && typeof p.then === "function") p.catch(() => { /* ignore autoplay rejection */ });
    setPlaying(true);
    // Best-effort true device fullscreen (desktop / Android). iOS keeps the overlay.
    requestAnimationFrame(() => {
      const overlay = overlayRef.current;
      try {
        if (overlay?.requestFullscreen) overlay.requestFullscreen().catch(() => {});
        else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
      } catch {}
    });
  };

  const wrapperCls = playing
    ? "fixed inset-0 z-[9999] bg-black flex items-center justify-center"
    : "absolute inset-0 bg-black";

  return (
    <div ref={overlayRef} className={wrapperCls} style={playing ? { height: "100dvh" } : undefined}>
      <video
        ref={videoRef}
        className={playing ? "max-w-full max-h-full object-contain" : "w-full h-full object-cover"}
        playsInline
        controls={false}
        onEnded={finishAd}
      />
      {playing ? (
        <button onClick={finishAd} className="absolute top-4 right-4 w-11 h-11 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white active:scale-90 transition" aria-label="Close advert">
          <X className="w-5 h-5" />
        </button>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 pointer-events-none" />
          <button
            onClick={startAd}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white active:scale-95 transition"
          >
            <span className="w-16 h-16 rounded-full bg-white/15 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg">
              <Play className="w-7 h-7 ml-1" fill="currentColor" />
            </span>
            <span className="text-sm font-bold tracking-wide drop-shadow">{label}</span>
          </button>
        </>
      )}
    </div>
  );
}