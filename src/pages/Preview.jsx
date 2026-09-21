import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Button } from "@/components/ui/button";
import ShareButton from "@/components/shared/ShareButton";
import { Play, Crown, ArrowRight, Headphones, Lock } from "lucide-react";
import VideoWatermark from "@/components/shared/VideoWatermark";

const ENT = { movie: "Movie", music: "Music", video: "MusicVideo" };
const APP_PATH = {
  movie: (id) => `/movie?id=${id}`,
  music: (id) => `/music`,
  video: (id) => `/music`,
};
const LABEL = { movie: "movie", music: "track", video: "music video" };

export default function Preview() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = React.useState(null);
  const [notFound, setNotFound] = React.useState(false);
  const [left, setLeft] = React.useState(45);
  const [playing, setPlaying] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const mediaRef = React.useRef(null);
  const ent = ENT[type];

  React.useEffect(() => {
    if (!ent || !id) { setNotFound(true); return; }
    base44.entities[ent].get(id).then((it) => {
      setItem(it);
      const p = Number(it.preview_seconds) || 45;
      setLeft(p);
    }).catch(() => setNotFound(true));
  }, [ent, id]);

  React.useEffect(() => {
    if (!playing || ended) return;
    const t = setInterval(() => {
      setLeft((p) => {
        if (p <= 1) {
          clearInterval(t);
          setEnded(true);
          setPlaying(false);
          if (mediaRef.current) mediaRef.current.pause();
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [playing, ended]);

  const play = () => {
    setPlaying(true);
    if (mediaRef.current) mediaRef.current.play().catch(() => {});
  };

  const openInApp = () => navigate(APP_PATH[type](id));
  const isAudio = type === "music";
  const mediaUrl = item && (item.video_url || item.audio_url);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div>
          <p className="font-heading text-2xl font-bold mb-2">Content unavailable</p>
          <p className="text-sm text-muted-foreground mb-6">This preview link is no longer available.</p>
          <Button className="rounded-full" onClick={() => navigate("/")}>Open RIDE X</Button>
        </div>
      </div>
    );
  }

  if (!item) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top brand bar */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-border/60">
        <button onClick={() => navigate("/")} className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground font-extrabold flex items-center justify-center">R</span>
          <span className="font-heading font-extrabold tracking-tight">RIDE X</span>
        </button>
        <span className="text-xs uppercase tracking-[0.25em] text-primary">Free preview</span>
        <Button size="sm" className="rounded-full" onClick={openInApp}>Open app</Button>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        <div className="rounded-3xl overflow-hidden border border-border/60 bg-black relative">
          <div className="relative aspect-video">
            {mediaUrl ? (
              isAudio ? (
                <div className="w-full h-full flex items-center justify-center">
                  {item.cover_url && <Image src={item.cover_url} alt={item.title} className="absolute inset-0 w-full h-full object-cover opacity-40" />}
                  <audio ref={mediaRef} src={mediaUrl} className="relative z-10 w-[80%]" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setEnded(true); setPlaying(false); }} />
                </div>
              ) : (
                <video ref={mediaRef} src={mediaUrl} className="video-8k w-full h-full object-contain" preload="auto" playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setEnded(true); setPlaying(false); }} />
              )
            ) : item.poster_url ? (
              <Image src={item.poster_url} alt={item.title} className="w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Headphones className="w-12 h-12 text-muted-foreground" /></div>
            )}

            {/* Subtle moving CSS MOVIES watermark */}
            {mediaUrl && !ended && <VideoWatermark label="CSS MOVIES" />}

            {/* Play overlay */}
            {!isAudio && !playing && !ended && (
              <button onClick={play} className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Play className="w-8 h-8" />
                </span>
              </button>
            )}

            {/* Countdown badge */}
            {playing && !ended && (
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-black/70 text-xs font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Preview · {left}s left
              </div>
            )}

            {/* Progress ring (visual) */}
            {playing && !ended && (
              <div className="absolute bottom-0 left-0 h-1 bg-primary" style={{ width: `${100 - (left / (Number(item.preview_seconds) || 45)) * 100}%` }} />
            )}

            {/* End overlay */}
            {ended && (
              <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <Lock className="w-10 h-10 text-primary" />
                <p className="font-heading text-xl md:text-2xl font-bold">Free preview ended</p>
                <p className="text-sm text-muted-foreground max-w-sm">Keep watching the full {LABEL[type]} on RIDE X. Sign up free to unlock it.</p>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  <Button className="rounded-full" onClick={openInApp}>
                    <Crown className="w-4 h-4 mr-2" /> Watch full on RIDE X <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                  <ShareButton type={type} id={id} title={item.title} variant="outline" size="default">
                    Share preview
                  </ShareButton>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2">{isAudio ? "RIDE X Sounds" : "CSS Motion Pictures"}</p>
          <h1 className="text-2xl md:text-3xl font-extrabold">{item.title}</h1>
          {(item.artist || item.director) && <p className="text-sm text-muted-foreground mt-1">{item.artist || `Directed by ${item.director}`}</p>}
          {item.description && <p className="text-sm text-muted-foreground leading-relaxed mt-3 max-w-2xl">{item.description}</p>}

          <div className="flex flex-wrap gap-2 mt-5">
            <Button className="rounded-full" onClick={openInApp}><Crown className="w-4 h-4 mr-2" /> Open in RIDE X</Button>
            <ShareButton type={type} id={id} title={item.title} variant="outline" size="default">
              Share this {LABEL[type]}
            </ShareButton>
          </div>

          <p className="text-xs text-muted-foreground mt-6 border-t border-border/60 pt-4">
            RIDE X — rides, deliveries, equipment rental, restaurants, movies, music & car wash. One app, everything you need.
          </p>
        </div>
      </main>
    </div>
  );
}