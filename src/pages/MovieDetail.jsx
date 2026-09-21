import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import RewardedAd from "@/components/shared/RewardedAd";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import AdBanner from "@/components/shared/AdBanner";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { money } from "@/lib/pricing";
import { Play, Crown, Gift, Star, Share2, Captions, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import ShareButton from "@/components/shared/ShareButton";
import VideoWatermark from "@/components/shared/VideoWatermark";

export default function MovieDetail() {
  const id = new URLSearchParams(window.location.search).get("id");
  const [movie, setMovie] = React.useState(null);
  const [unlocked, setUnlocked] = React.useState(false);
  const [previewLeft, setPreviewLeft] = React.useState(45);
  const [playing, setPlaying] = React.useState(false);
  const [ad, setAd] = React.useState(false);
  const [checkout, setCheckout] = React.useState(false);
  const [subsOpen, setSubsOpen] = React.useState(false);
  const [subsLoading, setSubsLoading] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const videoRef = React.useRef(null);

  const MAX_ADS = 5;
  const AD_GRANT = 12;
  const todayKey = new Date().toISOString().slice(0, 10);
  const [adCount, setAdCount] = React.useState(0);
  const [videoLoaded, setVideoLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(`mx_ad_${id}`);
      if (raw) {
        const { day, count } = JSON.parse(raw);
        setAdCount(day === todayKey ? count : 0);
      }
    } catch {}
  }, [id]);

  const persistAd = (count) => {
    try { localStorage.setItem(`mx_ad_${id}`, JSON.stringify({ day: todayKey, count })); } catch {}
  };
  const adsLeft = Math.max(0, MAX_ADS - adCount);

  React.useEffect(() => {
    if (id) base44.entities.Movie.get(id).then(async (m) => {
      setMovie(m);
      setPreviewLeft(Number(m.preview_seconds) || 45);
      base44.entities.Movie.update(m.id, { view_count: (m.view_count || 0) + 1 });
      const paid = await base44.entities.Transaction.filter({ service: "movie", reference_id: m.id, status: "paid" });
      if (paid.length > 0) setUnlocked(true);
      else setUnlocked(!!m.is_free);
    });
  }, [id]);

  React.useEffect(() => {
    if (!playing || unlocked) return;
    const t = setInterval(() => setPreviewLeft((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [playing, unlocked]);

  React.useEffect(() => {
    if (previewLeft === 0) {
      setPlaying(false);
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.controls = false; }
    }
  }, [previewLeft]);

  const startPlayback = () => {
    setVideoLoaded(true);
    setPlaying(true);
  };

  // Only attach the source + begin playback after the user actually taps play,
  // so the full movie file never downloads on page open (major data savings).
  React.useEffect(() => {
    if (!videoLoaded || !videoRef.current) return;
    videoRef.current.play().catch(() => {});
    const el = videoRef.current;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
  }, [videoLoaded]);

  if (!movie) return <p className="text-muted-foreground">Loading…</p>;

  let cues = [];
  try {
    const p = JSON.parse(movie.subtitles_en || "");
    if (Array.isArray(p)) cues = p;
    else if (p && Array.isArray(p.cues)) cues = p.cues;
  } catch {}
  const isPlainSubs = !cues.length && !!(movie.subtitles_en || "").trim();
  const activeCue = cues.find((c) => currentTime >= c.start && currentTime < c.end) || null;

  const gateVisible = !unlocked && previewLeft === 0;

  const generateSubs = async () => {
    if (subsLoading || !movie?.video_url) return;
    setSubsLoading(true);
    try {
      const res = await base44.functions.invoke('generate-subtitles', { movieId: movie.id, videoUrl: movie.video_url, totalSeconds: (Number(movie.duration_minutes) || 0) * 60 });
      const data = res?.data?.subtitles || res?.subtitles;
      if (data) {
        const en = Array.isArray(data) ? JSON.stringify(data) : data;
        setMovie((m) => ({ ...m, subtitles_en: en, subtitles_status: 'ready' }));
        setSubsOpen(true);
      }
    } catch (e) {
      // subtitles simply won't be available for this file
    } finally {
      setSubsLoading(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow={movie.genre} title={movie.title} subtitle={`${movie.release_year || ""} · ${movie.duration_minutes || 0} min · directed by ${movie.director || "—"}`} action={
        <ShareButton type="movie" id={movie.id} title={movie.title} variant="outline" size="sm">
          <Share2 className="w-4 h-4 mr-1" /> Share
        </ShareButton>
      } />

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-8">
        <div>
          <div className="relative aspect-video rounded-3xl overflow-hidden bg-black border border-border/60">
            {movie.video_url ? (
              <video
                ref={videoRef}
                src={videoLoaded ? movie.video_url : undefined}
                poster={movie.poster_url}
                controls={videoLoaded && (playing || unlocked)}
                preload="metadata"
                playsInline
                className="video-8k w-full h-full object-contain"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                onSeeked={(e) => setCurrentTime(e.target.currentTime)}
              />
            ) : (
              movie.poster_url && <Image src={movie.poster_url} alt={movie.title} className="w-full h-full" />
            )}

            {movie.video_url && <VideoWatermark label="MOVIES" />}

            {/* Permanent on-screen subtitles — burned-in style, always shown while a cue is active (play or pause) */}
            {videoLoaded && cues.length > 0 && activeCue && !gateVisible && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-[8%] w-[92%] flex justify-center pointer-events-none">
                <p
                  className="text-center text-white text-base sm:text-xl font-semibold leading-snug px-4 py-1.5 rounded-md bg-black/70"
                  style={{ textShadow: "0 2px 4px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,1)" }}
                >
                  {activeCue.text}
                </p>
              </div>
            )}
            {subsLoading && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-[8%] flex items-center gap-2 pointer-events-none">
                <span className="flex items-center gap-2 text-xs text-white/90 bg-black/55 px-3 py-1 rounded-full">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating subtitles…
                </span>
              </div>
            )}

            {!playing && !gateVisible && (
              <button onClick={startPlayback} className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Play className="w-8 h-8" />
                </span>
              </button>
            )}

            {gateVisible && (
              <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="font-heading text-xl font-bold">Free preview ended</p>
                <p className="text-sm text-muted-foreground">
                  {adsLeft > 0 ? `Watch a short ad for ${AD_GRANT}s more · ${adsLeft} of ${MAX_ADS} free views left today` : "You've used all 5 free ad views today — pay to continue or come back tomorrow."}
                </p>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {adsLeft > 0 && (
                    <Button className="rounded-full" onClick={() => setAd(true)}><Gift className="w-4 h-4 mr-2" /> Watch a {AD_GRANT}s ad</Button>
                  )}
                  <Button variant="outline" className="rounded-full" onClick={() => setCheckout(true)}>Pay {money(movie.price)}</Button>
                </div>
              </div>
            )}
          </div>

          {!unlocked && (
            <p className="text-xs text-muted-foreground mt-3">
              Free preview: {previewLeft}s remaining
            </p>
          )}
          {unlocked && <p className="text-xs text-emerald-400 mt-3">Full movie unlocked — enjoy.</p>}

          {/* Subtitle controls — generate + full transcript (live cue shows on the video) */}
          {!cues.length && !isPlainSubs && (
            <div className="mt-4 flex justify-center">
              <button onClick={generateSubs} disabled={subsLoading} className="flex items-center gap-2 text-sm text-primary hover:underline disabled:opacity-60">
                <Captions className="w-4 h-4" /> {subsLoading ? "Generating subtitles…" : "Generate English subtitles"}
              </button>
            </div>
          )}

          {(cues.length > 0 || isPlainSubs) && (
            <div className="mt-3 rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
              <button onClick={() => setSubsOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Captions className="w-4 h-4 text-primary" />
                  English subtitles (auto-translated)
                </span>
                {subsOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {subsOpen && (
                <div className="px-4 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed border-t border-border/40">
                  {cues.length ? cues.map((c, i) => <span key={i}>{c.text} </span>) : <span className="whitespace-pre-line">{movie.subtitles_en}</span>}
                </div>
              )}
            </div>
          )}

          <div className="mt-6"><AdBanner type="pause" label="Sponsored · CSS Constructions — hire Caterpillar machines today" /></div>

          <h3 className="font-semibold mt-8 mb-2">Synopsis</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{movie.description}</p>
          {movie.cast && <p className="text-sm text-muted-foreground mt-4"><span className="text-foreground">Cast:</span> {movie.cast}</p>}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-3">
            <p className="flex items-center gap-2 text-primary"><Star className="w-4 h-4 fill-current" /> {movie.rating} rating</p>
            <p className="text-sm text-muted-foreground">{movie.view_count || 0} views</p>
            <Button className="w-full rounded-full font-semibold" onClick={() => setAd(true)} disabled={unlocked || adsLeft <= 0}>
              <Gift className="w-4 h-4 mr-2" /> {adsLeft > 0 ? `Watch ad for ${AD_GRANT}s (${adsLeft} left today)` : "Ad views used today"}
            </Button>
            <Button variant="outline" className="w-full rounded-full" onClick={() => setCheckout(true)} disabled={unlocked}>
              Buy for {money(movie.price)}
            </Button>
            <Button variant="secondary" className="w-full rounded-full" onClick={() => setCheckout(true)}>
              <Crown className="w-4 h-4 mr-2" /> Premium ₦5,000/mo
            </Button>
          </div>
        </div>
      </div>

      <RewardedAd
        open={ad}
        onOpenChange={setAd}
        movieTitle={movie.title}
        onReward={() => {
          const next = adCount + 1;
          setAdCount(next);
          persistAd(next);
          setVideoLoaded(true);
          setPreviewLeft((p) => (p > 0 ? p : 0) + AD_GRANT);
          setPlaying(true);
          if (videoRef.current) videoRef.current.play().catch(() => {});
        }}
      />
      <CheckoutDialog
        open={checkout}
        onOpenChange={setCheckout}
        amount={movie.price || 500}
        service="movie"
        description={`CSS Motion Pictures · ${movie.title}`}
        referenceId={movie.id}
        allowCash={false}
        onPaid={() => { setUnlocked(true); setVideoLoaded(true); setPlaying(true); if (videoRef.current) videoRef.current.play().catch(() => {}); }}
      />
    </div>
  );
}