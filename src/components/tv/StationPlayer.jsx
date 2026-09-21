import React from "react";
import Hls from "hls.js";
import { Loader2 } from "lucide-react";

// A YouTube channel ID (starts with UC, 24 chars) is a genuine 24/7 live stream.
const isChannelId = (id) => typeof id === "string" && /^UC[A-Za-z0-9_-]{22}$/.test(id);

// YouTube embed with mute=1 so the browser allows autoplay — the user taps the
// player to unmute instead of having to press a separate "play" button.
const ytEmbedUrl = (id, isLive) =>
  isLive
    ? `https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&mute=1&playsinline=1&cc_load_policy=1&cc_lang_pref=en&hl=en`
    : `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0&playsinline=1&cc_load_policy=1&cc_lang_pref=en&hl=en`;

// Plays a station straight from the in-app player. If the station has a direct
// `stream_url` (HLS), it streams via hls.js with no YouTube page at all. If the
// stream is geo-blocked / dead, it automatically falls back to the YouTube
// embed so the user always gets something to watch.
export default function StationPlayer({ station }) {
  const videoRef = React.useRef(null);
  const hlsRef = React.useRef(null);
  const [useYoutube, setUseYoutube] = React.useState(!station?.stream_url);
  const [state, setState] = React.useState("loading");

  React.useEffect(() => {
    if (useYoutube || !station?.stream_url) return;
    const video = videoRef.current;
    if (!video) return;
    setState("loading");
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
    const url = station.stream_url;
    const isHls = /\.m3u8(\?|$)/i.test(url);
    const fail = () => setUseYoutube(true);

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, manifestLoadingTimeOut: 8000, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 1 });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.muted = true;
        video.play().then(() => setState("playing")).catch(() => setState("playing"));
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) { try { hls.destroy(); } catch {} hlsRef.current = null; fail(); }
      });
    } else {
      video.src = url;
      video.muted = true;
      video.play().then(() => setState("playing")).catch(fail);
      video.addEventListener("error", fail, { once: true });
    }
    return () => { if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; } };
  }, [useYoutube, station?.stream_url]);

  if (!station) return null;

  if (useYoutube) {
    const isLive = isChannelId(station.youtube_id);
    return (
      <iframe
        src={ytEmbedUrl(station.youtube_id, isLive)}
        title={station.name}
        className="absolute inset-0 w-full h-full"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <>
      <video ref={videoRef} controls playsInline autoPlay muted className="absolute inset-0 w-full h-full bg-black" />
      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-black pointer-events-none">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs">Tuning to {station.name}…</p>
        </div>
      )}
    </>
  );
}