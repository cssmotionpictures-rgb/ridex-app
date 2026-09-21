import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import RewardedAd from "@/components/shared/RewardedAd";
import AdBanner from "@/components/shared/AdBanner";
import { money } from "@/lib/pricing";
import { Search, Play, Lock, X, Headphones, Video, Share2, Captions, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import ShareButton from "@/components/shared/ShareButton";
import TvStationBug from "@/components/tv/TvStationBug";

const GENRES = ["All", "Afrobeats", "Pop", "Hip-Hop", "Gospel", "R&B", "Dancehall", "Highlife", "Jazz", "Reggae", "Electronic"];

export default function Music() {
  const [tracks, setTracks] = useState([]);
  const [videos, setVideos] = useState([]);
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState("All");
  const [unlocked, setUnlocked] = useState({});
  const [nowPlaying, setNowPlaying] = useState(null);
  const [ad, setAd] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);

  const load = async () => {
    const [t, v] = await Promise.all([
      base44.entities.Music.filter({ status: "published" }, "-created_date", 100),
      base44.entities.MusicVideo.filter({ status: "published" }, "-created_date", 100),
    ]);
    setTracks(t);
    setVideos(v);
  };
  useEffect(() => { load(); }, []);

  const match = (it) => (genre === "All" || it.genre === genre) && (!q || `${it.title} ${it.artist}`.toLowerCase().includes(q.toLowerCase()));

  const ft = tracks.filter(match);
  const fv = videos.filter(match);

  const play = (kind, item) => {
    if (item.is_free || unlocked[item.id]) {
      setNowPlaying({ kind, item });
      const ent = kind === "track" ? "Music" : "MusicVideo";
      base44.entities[ent].update(item.id, { plays: (item.plays || 0) + 1 }).catch(() => {});
    } else {
      setAd({ kind, item });
    }
  };

  const onReward = async () => {
    if (!ad) return;
    setUnlocked((u) => ({ ...u, [ad.item.id]: true }));
    setNowPlaying({ kind: ad.kind, item: ad.item });
    setAd(null);
  };

  const featured = tracks.find((t) => t.featured) || ft[0];

  // Subtitle cue parsing + generator for the music video currently playing
  let cues = [];
  const subsRaw = nowPlaying?.kind === "video" ? (nowPlaying?.item?.subtitles_en || "") : "";
  try {
    const p = JSON.parse(subsRaw);
    if (Array.isArray(p)) cues = p;
    else if (p && Array.isArray(p.cues)) cues = p.cues;
  } catch {}
  const isPlainSubs = !cues.length && !!subsRaw.trim();
  const activeCue = cues.find((c) => currentTime >= c.start && currentTime < c.end) || null;

  const generateSubs = async () => {
    if (subsLoading || !nowPlaying?.item?.video_url) return;
    setSubsLoading(true);
    try {
      const res = await base44.functions.invoke('generate-subtitles', {
        kind: 'video',
        entityId: nowPlaying.item.id,
        videoUrl: nowPlaying.item.video_url,
        totalSeconds: Number(nowPlaying.item.duration_seconds) || 0,
      });
      const data = res?.data?.subtitles || res?.subtitles;
      if (data) {
        const en = Array.isArray(data) ? JSON.stringify(data) : data;
        setNowPlaying((np) => np ? { ...np, item: { ...np.item, subtitles_en: en, subtitles_status: 'ready' } } : np);
      }
    } catch (e) {
      // subtitles simply won't be available for this file
    } finally {
      setSubsLoading(false);
    }
  };

  // Auto-generate English subtitles the first time a music video plays without any
  useEffect(() => {
    if (nowPlaying?.kind !== 'video') return;
    const item = nowPlaying.item;
    if (!item?.video_url) return;
    const hasSubs = !!(item.subtitles_en && item.subtitles_en.trim());
    const processing = item.subtitles_status === 'processing';
    if (!hasSubs && !processing && !subsLoading) generateSubs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying]);

  return (
    <div>
      <PageHeader eyebrow="RIDE X Sounds" title="Music & Videos" subtitle="Stream tracks and music videos. Premium drops unlock with a quick rewarded ad." />

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs, artists…" className="pl-9 rounded-full bg-card" />
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-4">
        {GENRES.map((g) => (
          <button key={g} onClick={() => setGenre(g)} className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${genre === g ? "bg-primary text-primary-foreground font-semibold" : "bg-secondary text-muted-foreground"}`}>{g}</button>
        ))}
      </div>

      {featured && (
        <div className="rounded-3xl overflow-hidden border border-border/60 bg-gradient-to-br from-primary/15 via-card to-accent/10 p-6 md:p-8 mb-8 flex flex-col md:flex-row gap-6 items-center">
          <div className="size-40 md:size-48 rounded-2xl overflow-hidden shrink-0 bg-secondary">
            {featured.cover_url ? <Image src={featured.cover_url} fittingType="fill" className="size-full" /> : <div className="size-full flex items-center justify-center"><Headphones className="size-10 text-primary" /></div>}
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2">Featured</p>
            <h2 className="text-2xl md:text-3xl font-extrabold">{featured.title}</h2>
            <p className="text-muted-foreground">{featured.artist} · {featured.genre}</p>
            <div className="flex gap-2 mt-4">
              <Button className="rounded-full" onClick={() => play("track", featured)}><Play className="size-4" /> Play</Button>
              {!featured.is_free && <span className="text-xs text-muted-foreground self-center ml-2">{money(featured.price)} · watch ad to unlock</span>}
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="tracks" className="mt-2">
        <TabsList className="bg-transparent p-0 h-auto gap-1 mb-5">
          <TabsTrigger value="tracks" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Headphones className="size-3.5 mr-1" /> Tracks</TabsTrigger>
          <TabsTrigger value="videos" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Video className="size-3.5 mr-1" /> Music Videos</TabsTrigger>
        </TabsList>

        <TabsContent value="tracks" className="space-y-2">
          {ft.length === 0 && <p className="text-sm text-muted-foreground">No tracks yet.</p>}
          {ft.map((t) => (
            <div key={t.id} className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card p-3 hover:border-primary/40 transition-colors">
              <button onClick={() => play("track", t)} className="size-12 rounded-xl overflow-hidden bg-secondary shrink-0 relative group">
                {t.cover_url ? <Image src={t.cover_url} fittingType="fill" className="size-full" /> : <Headphones className="size-5 text-muted-foreground m-3" />}
                <span className="absolute inset-0 bg-background/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">{unlocked[t.id] || t.is_free ? <Play className="size-5 text-primary" /> : <Lock className="size-5 text-primary" />}</span>
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{t.title}</p>
                <p className="text-sm text-muted-foreground truncate">{t.artist} · {t.genre}</p>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-1">
                <p className="text-xs text-muted-foreground">{(t.plays || 0).toLocaleString()} plays</p>
                <p className="text-xs">{t.is_free ? "Free" : money(t.price)}</p>
                <ShareButton type="music" id={t.id} title={t.title} size="icon" className="h-7 w-7" />
              </div>
            </div>
          ))}
          <AdBanner />
        </TabsContent>

        <TabsContent value="videos">
          {fv.length === 0 && <p className="text-sm text-muted-foreground">No music videos yet.</p>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {fv.map((v) => (
              <button key={v.id} onClick={() => play("video", v)} className="text-left group">
                <div className="aspect-square rounded-2xl overflow-hidden bg-secondary relative">
                  {v.cover_url ? <Image src={v.cover_url} fittingType="fill" className="size-full" /> : <Video className="size-8 text-muted-foreground m-auto mt-[40%]" />}
                  <span className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    {unlocked[v.id] || v.is_free ? <Play className="size-8 text-primary" /> : <Lock className="size-8 text-primary" />}
                  </span>
                </div>
                <p className="font-semibold text-sm mt-2 truncate">{v.title}</p>
                <p className="text-xs text-muted-foreground truncate">{v.artist} · {v.is_free ? "Free" : money(v.price)}</p>
                <div className="mt-1">
                  <ShareButton type="video" id={v.id} title={v.title} size="icon" className="h-7 w-7" />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6"><AdBanner /></div>
        </TabsContent>
      </Tabs>

      <RewardedAd open={!!ad} onOpenChange={(o) => !o && setAd(null)} movieTitle={ad ? `${ad.item.title} — ${ad.item.artist}` : ""} onReward={onReward} />

      {nowPlaying && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[600] w-[94%] max-w-2xl rounded-3xl border border-border/70 bg-card p-3 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl overflow-hidden bg-secondary shrink-0">
              {nowPlaying.item.cover_url && <Image src={nowPlaying.item.cover_url} fittingType="fill" className="size-full" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate text-sm">{nowPlaying.item.title}</p>
              <p className="text-xs text-muted-foreground truncate">{nowPlaying.item.artist}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setNowPlaying(null)}><X className="size-4" /></Button>
          </div>
          {nowPlaying.kind === "track" ? (
            <audio src={nowPlaying.item.audio_url} controls autoPlay className="w-full mt-2" />
          ) : (
            <div className="relative mt-2">
              <video
                ref={(el) => { if (el && nowPlaying.kind === "video") { el.play().catch(() => {}); if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); } }}
                src={nowPlaying.item.video_url}
                controls
                autoPlay
                preload="auto"
                playsInline
                className="video-8k w-full rounded-xl max-h-72"
                onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                onSeeked={(e) => setCurrentTime(e.target.currentTime)}
              />
              <TvStationBug />
              {cues.length > 0 && activeCue && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-[8%] w-[90%] flex justify-center pointer-events-none">
                  <p className="text-center text-white text-base sm:text-lg font-semibold leading-snug px-3 py-1 rounded bg-black/55" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,1)" }}>{activeCue.text}</p>
                </div>
              )}
              {subsLoading && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-[8%] flex items-center pointer-events-none">
                  <span className="flex items-center gap-2 text-xs text-white/90 bg-black/55 px-3 py-1 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating subtitles…
                  </span>
                </div>
              )}
            </div>
          )}
          {nowPlaying.kind === "video" && (
            <div className="mt-2">
              {!cues.length && !isPlainSubs ? (
                <button onClick={generateSubs} disabled={subsLoading} className="flex items-center gap-2 text-xs text-primary hover:underline mx-auto">
                  <Captions className="w-4 h-4" /> {subsLoading ? "Generating subtitles…" : "Generate English subtitles"}
                </button>
              ) : (
                <button onClick={() => setSubsOpen((v) => !v)} className="w-full flex items-center justify-between text-xs px-2 py-1">
                  <span className="flex items-center gap-1.5"><Captions className="w-3.5 h-3.5 text-primary" /> English subtitles (auto-translated)</span>
                  {subsOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              )}
              {subsOpen && (
                <div className="text-xs text-muted-foreground leading-relaxed px-2 pb-1">
                  {cues.length ? cues.map((c, i) => <span key={i}>{c.text} </span>) : <span className="whitespace-pre-line">{nowPlaying.item.subtitles_en}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}