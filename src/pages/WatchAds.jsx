import React from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import { buildWatchQueue, TIKTOK_URL, TIKTOK_HANDLE } from "@/lib/watchAds";
import { reportSponsorAdPlay } from "@/lib/sponsorAds";
import WatchAdVideo from "@/components/watch/WatchAdVideo";
import CreateWatchAdForm from "@/components/watch/CreateWatchAdForm";
import WatchAdsAdmin from "@/components/watch/WatchAdsAdmin";
import { Play, SkipForward, Megaphone, Music2, Tv, Gift } from "lucide-react";

const PROMO_DURATION = 8000;

export default function WatchAds() {
  const [queue, setQueue] = React.useState([]);
  const [idx, setIdx] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [watched, setWatched] = React.useState(0);
  const [canSkip, setCanSkip] = React.useState(false);
  const [promoProgress, setPromoProgress] = React.useState(0);

  const load = React.useCallback(async () => {
    const q = await buildWatchQueue();
    setQueue(q);
    setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const current = queue[idx];

  const advance = React.useCallback(() => {
    setCanSkip(false);
    setPromoProgress(0);
    setIdx((i) => (i + 1) % Math.max(queue.length, 1));
    setWatched((w) => w + 1);
  }, [queue.length]);

  React.useEffect(() => {
    if (!current) return;
    setCanSkip(false);
    setPromoProgress(0);
    if (current.type === "promo") {
      const start = Date.now();
      const tick = setInterval(() => {
        const p = Math.min(1, (Date.now() - start) / PROMO_DURATION);
        setPromoProgress(p);
        if (p >= 1) { clearInterval(tick); advance(); }
      }, 80);
      const skipTimer = setTimeout(() => setCanSkip(true), 2500);
      return () => { clearInterval(tick); clearTimeout(skipTimer); };
    }
    const skipTimer = setTimeout(() => setCanSkip(true), 3000);
    return () => clearTimeout(skipTimer);
  }, [current, advance]);

  React.useEffect(() => {
    if (current?.type === "sponsor") reportSponsorAdPlay(current.ad);
  }, [current]);

  if (loading) return <div className="py-20 text-center text-muted-foreground">Loading ad reel…</div>;
  if (!queue.length) return <div className="py-20 text-center text-muted-foreground">No ads available right now.</div>;

  return (
    <div>
      <PageHeader
        eyebrow="📺 Watch Ads"
        title="Watch & Discover"
        subtitle="Watch real ads and discover every Ride X service. Paid ads play when available; in between, we show you what Ride X can do."
        action={<div className="inline-flex items-center gap-2 text-sm bg-primary/10 text-primary px-3 py-1.5 rounded-full font-semibold"><Gift className="w-4 h-4" /> {watched} watched</div>}
      />

      {/* Player — vertical 9:16 TikTok-style spotlight that fits the Ride X video adverts */}
      <div className="mx-auto max-w-[460px] rounded-3xl overflow-hidden border border-border/60 bg-black aspect-[9/16] relative">
        {current.type === "sponsor" || current.type === "ridex" ? (
          <WatchAdVideo src={current.video_url} onEnded={advance} />
        ) : (
          <div className="absolute inset-0 app-bg-template flex flex-col items-center justify-center text-center p-6">
            <div className="text-5xl mb-3">{current.emoji}</div>
            <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2">{current.title}</p>
            <h2 className="text-2xl md:text-3xl font-extrabold mb-3 max-w-md">{current.headline}</h2>
            <p className="text-muted-foreground max-w-md text-sm md:text-base">{current.body}</p>
            <div className="flex flex-wrap gap-2 mt-5 justify-center">
              <Link to={current.path} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-semibold"><Play className="w-4 h-4" /> Try {current.title}</Link>
              <a href={TIKTOK_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 border border-border px-4 py-2 rounded-full text-sm font-semibold"><Music2 className="w-4 h-4" /> {TIKTOK_HANDLE}</a>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary/40">
              <div className="h-full bg-primary transition-all duration-100" style={{ width: `${promoProgress * 100}%` }} />
            </div>
          </div>
        )}
        <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider bg-black/60 px-2 py-0.5 rounded-full">
          {current.type === "sponsor" ? "Ad · " + current.sponsor : current.type === "ridex" ? "Ride X · Spotlight" : "Ride X · " + current.title}
        </div>
        {canSkip && (
          <button onClick={advance} className="absolute bottom-3 right-3 inline-flex items-center gap-1 text-xs bg-black/70 px-3 py-1.5 rounded-full hover:bg-black/90">
            <SkipForward className="w-3.5 h-3.5" /> Next ad
          </button>
        )}
      </div>

      {/* Advertise slot */}
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 mt-6 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" />
          <p className="text-sm">Want your video ad to play here? Create it below — it runs across the Watch Ads hub.</p>
        </div>
        <Link to="/admin" className="text-xs text-primary underline">Admin: manage ads →</Link>
      </div>

      {/* Self-serve ad creation slot */}
      <CreateWatchAdForm onCreated={load} />

      {/* Inline admin ad manager (approve / reject / delete — works in-browser) */}
      <WatchAdsAdmin onChanged={load} />

      {/* Up-next queue */}
      <h3 className="font-semibold mt-6 mb-2">Up next</h3>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {queue.slice(idx + 1, idx + 11).map((c, i) => (
          <div key={i} className="shrink-0 w-40 rounded-xl border border-border/60 bg-card p-2">
            <div className="h-20 rounded-lg bg-secondary/40 flex items-center justify-center text-2xl">
              {c.type === "sponsor" || c.type === "ridex" ? <Tv className="w-6 h-6 text-muted-foreground" /> : c.emoji}
            </div>
            <p className="text-xs font-medium mt-1.5 truncate">{c.type === "sponsor" ? c.sponsor : c.type === "ridex" ? "Ride X" : c.title}</p>
            <p className="text-[10px] text-muted-foreground truncate">{c.type === "sponsor" ? "Sponsor ad" : c.type === "ridex" ? "Ride X video" : c.headline}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-[11px] text-muted-foreground/70 mt-6">
        The reel plays any available video. Ride X service promos run as the back-door filler so it's never empty. Follow{" "}
        <a href={TIKTOK_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">{TIKTOK_HANDLE}</a> on TikTok.
      </p>
    </div>
  );
}