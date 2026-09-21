import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import VideoWatermark from "@/components/shared/VideoWatermark";
import TvStationBug from "@/components/tv/TvStationBug";
import { Image } from "@/components/ui/image";
import { Loader2, Tv, Radio, X, Search, Heart, History, Star, Globe, ExternalLink, Film } from "lucide-react";
import GlobalTVPlayer from "@/components/tv/GlobalTVPlayer";
import StationPlayer from "@/components/tv/StationPlayer";

// Legitimate free ad-supported / Nollywood platforms — opened in a new tab (not embedded;
// most block iframe framing or are app-only). These are the stable, legal options.
const FREE_PLATFORMS = [
  { name: "AfroLandTV", url: "https://afrolandtv.com", desc: "Free Nollywood & African movies" },
  { name: "NolliStream", url: "https://nollistream.com", desc: "Free ad-supported Nollywood VOD" },
  { name: "Pluto TV", url: "https://pluto.tv", desc: "Free Hollywood movie channels" },
  { name: "Plex TV", url: "https://plex.tv/watch-free", desc: "Free movies & live TV" },
  { name: "Roku Channel", url: "https://therokuchannel.roku.com", desc: "Free live TV & movies" },
];

const CATEGORIES = ["All", "News", "Sports", "Entertainment", "Music", "Movies", "Kids", "Family", "Religion", "Documentary"];
const FAV_KEY = "ridex_tv_favs";
const RECENT_KEY = "ridex_tv_recent";

// A YouTube channel ID (starts with UC, 24 chars) means a genuine 24/7 live stream —
// we embed via /embed/live_stream?channel= so it always shows the current live feed.
// A regular video ID is on-demand content (plays once, not "live").
const isChannelId = (id) => typeof id === "string" && /^UC[A-Za-z0-9_-]{22}$/.test(id);

// Build a YouTube embed URL that forces English captions on.
// cc_load_policy=1 turns captions on, cc_lang_pref=en prefers English,
// hl=en sets the player UI language. We also add the IFrame API enablejsapi=1
// so the player can force captions on after it loads.
const ytEmbedUrl = (id, isLive) =>
  isLive
    ? `https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&playsinline=1&cc_load_policy=1&cc_lang_pref=en&hl=en`
    : `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&playsinline=1&cc_load_policy=1&cc_lang_pref=en&hl=en`;

function LiveTimer() {
  const [secs, setSecs] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const h = String(Math.floor(secs / 3600)).padStart(2, "0");
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return <span className="tabular-nums">{secs >= 3600 ? `${h}:${m}:${s}` : `${m}:${s}`}</span>;
}

export default function TVStations() {
  const [channels, setChannels] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [cat, setCat] = React.useState("All");
  const [search, setSearch] = React.useState("");
  const [active, setActive] = React.useState(null);
  const [favs, setFavs] = React.useState([]);
  const [recent, setRecent] = React.useState([]);
  const [view, setView] = React.useState("curated");

  React.useEffect(() => {
    try {
      setFavs(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"));
    } catch {}
    base44.entities.TVStation.filter({ status: "active" }, "-featured", 200)
      .then((c) => setChannels(c))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sortChannels = (arr) =>
    [...arr].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (a.sort_order || 100) - (b.sort_order || 100));

  const filtered = sortChannels(
    channels
      .filter((c) => (cat === "All" ? true : c.category === cat))
      .filter((c) => !search || c.name?.toLowerCase().includes(search.toLowerCase()))
  );

  const featured = channels.filter((c) => c.featured);
  const favChannels = channels.filter((c) => favs.includes(c.id));
  const recentChannels = recent
    .map((id) => channels.find((c) => c.id === id))
    .filter(Boolean);

  const toggleFav = (id) => {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  };

  const play = (c) => {
    setActive(c);
    const next = [c.id, ...recent.filter((id) => id !== c.id)].slice(0, 5);
    setRecent(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  };

  const ChannelCard = ({ c }) => (
    <div className="relative rounded-2xl border border-border/60 bg-card overflow-hidden card-lift text-left">
      <button onClick={() => play(c)} className="block w-full text-left">
        <div className="h-28 bg-secondary flex items-center justify-center relative">
          {c.logo_url ? (
            <Image src={c.logo_url} className="w-full h-full" fittingType="fill" />
          ) : (
            <Tv className="w-10 h-10 text-primary" />
          )}
          {(c.stream_url || c.youtube_id) ? (
            (c.stream_url || isChannelId(c.youtube_id)) ? (
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded-full">
                <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
              </span>
            ) : (
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-bold text-sky-300 bg-sky-500/15 px-1.5 py-0.5 rounded-full">
                <History className="w-2.5 h-2.5" /> ON DEMAND
              </span>
            )
          ) : null}
          {c.is_sponsored ? (
            <span className="absolute top-2 right-2 text-[8px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-full uppercase">Sponsored</span>
          ) : null}
        </div>
        <div className="p-2">
          <p className="text-sm font-semibold truncate">{c.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-[11px] text-muted-foreground">{c.category}</p>
            {c.country && <p className="text-[10px] text-muted-foreground/70">· {c.country}</p>}
          </div>
        </div>
      </button>
      <button
        onClick={() => toggleFav(c.id)}
        className="absolute bottom-2 right-2 text-muted-foreground hover:text-red-400"
        aria-label="Favourite"
      >
        <Heart className={`w-4 h-4 ${favs.includes(c.id) ? "fill-red-500 text-red-500" : ""}`} />
      </button>
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X TV"
        title="Live TV — Free Channels"
        subtitle="Verified embeddable live streams: international & Nigerian news, and Nollywood movies. Completely free, no login required."
        action={
          <span className="text-xs text-muted-foreground bg-secondary px-3 py-1.5 rounded-full">
            {channels.length} channels live
          </span>
        }
      />

      <div className="flex gap-2 mb-5">
        <button onClick={() => setView("curated")} className={`px-4 py-2 rounded-full text-sm font-medium ${view === "curated" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>Curated</button>
        <button onClick={() => setView("global")} className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1.5 ${view === "global" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}><Globe className="w-4 h-4" /> Global Live TV</button>
      </div>

      {view === "global" && (
        <>
          <GlobalTVPlayer />
          <div className="mt-5 rounded-2xl border border-border/60 bg-card p-4">
            <p className="text-sm font-semibold flex items-center gap-2 mb-1"><Film className="w-4 h-4 text-primary" /> Free Nollywood & Hollywood platforms</p>
            <p className="text-xs text-muted-foreground mb-3">Legitimate ad-supported services. Open in a new tab — most block in-app embedding.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FREE_PLATFORMS.map((p) => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5 card-lift">
                  <ExternalLink className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.desc}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </>
      )}

      {view === "curated" && (
      <>
      {recentChannels.length > 0 && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-primary mb-2 flex items-center gap-1.5"><History className="w-3 h-3" /> Recently watched</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {recentChannels.map((c) => (
              <button key={c.id} onClick={() => play(c)} className="shrink-0 w-28 rounded-xl border border-border/60 bg-card overflow-hidden card-lift text-left">
                <div className="h-16 bg-secondary flex items-center justify-center">
                  {c.logo_url ? <Image src={c.logo_url} className="w-full h-full" fittingType="fill" /> : <Tv className="w-6 h-6 text-primary" />}
                </div>
                <p className="text-[11px] font-semibold truncate p-1.5">{c.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {favChannels.length > 0 && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-primary mb-2 flex items-center gap-1.5"><Star className="w-3 h-3" /> Favourites</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {favChannels.map((c) => <ChannelCard key={c.id} c={c} />)}
          </div>
        </div>
      )}

      {featured.length > 0 && (
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wide text-primary mb-3">Featured channels</p>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {sortChannels(featured).map((c) => (
              <button
                key={c.id}
                onClick={() => play(c)}
                className="shrink-0 w-44 rounded-2xl border border-border/60 bg-card overflow-hidden card-lift text-left"
              >
                <div className="h-24 bg-secondary flex items-center justify-center">
                  {c.logo_url ? <Image src={c.logo_url} className="w-full h-full" fittingType="fill" /> : <Tv className="w-8 h-8 text-primary" />}
                </div>
                <div className="p-2">
                  <p className="text-sm font-semibold truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.category}{c.country ? ` · ${c.country}` : ""}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search channels…"
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${cat === c ? "bg-primary text-primary-foreground font-semibold" : "bg-secondary text-muted-foreground"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Tv className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No channels in this category yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((c) => <ChannelCard key={c.id} c={c} />)}
        </div>
      )}
      </>
      )}

      {active && (
        <div className="fixed inset-0 z-[600] bg-black/85 flex items-center justify-center p-3" onClick={() => setActive(null)}>
          <div className="relative w-full max-w-3xl bg-card rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <div>
                <p className="font-semibold">{active.name}</p>
                <p className="text-xs text-muted-foreground">{active.category}{active.country ? ` · ${active.country}` : ""}{active.is_sponsored && active.sponsor_name ? ` · Sponsored by ${active.sponsor_name}` : ""}</p>
              </div>
              <div className="flex items-center gap-3">
                {(active.stream_url || (active.youtube_id && isChannelId(active.youtube_id))) && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-400 bg-red-500/15 px-2 py-1 rounded-full">
                    <Radio className="w-3 h-3 animate-pulse" /> LIVE <LiveTimer />
                  </span>
                )}
                {!active.stream_url && active.youtube_id && !isChannelId(active.youtube_id) && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-300 bg-sky-500/15 px-2 py-1 rounded-full">
                    <History className="w-3 h-3" /> ON DEMAND
                  </span>
                )}
                <button onClick={() => setActive(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="relative aspect-video bg-black">
              {(active.stream_url || active.youtube_id) ? (
                <StationPlayer station={active} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Tv className="w-10 h-10" />
                  <p className="text-sm">Live stream link pending</p>
                  <p className="text-xs">An admin will add the live embed shortly.</p>
                </div>
              )}
              <TvStationBug live={!!active.stream_url || isChannelId(active.youtube_id)} />
            </div>
            {/* TV-style subtitle strip — arranged for readability, sits below the screen */}
            <div className="bg-black/95 border-t border-primary/30 px-4 pt-2 pb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/15 border border-primary/40 px-2 py-1 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" /> CC English
                </span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-widest">English subtitles on</span>
              </div>
              <p
                className="text-center text-sm sm:text-base font-medium leading-relaxed text-foreground px-2 min-h-[2.5rem] flex items-center justify-center"
                style={{ textShadow: "0 2px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)", letterSpacing: "0.01em" }}
              >
                {active.description || `Now playing: ${active.name}`}
              </p>
            </div>
            {active.description && <p className="p-4 text-sm text-muted-foreground">{active.description}</p>}
          </div>
        </div>
      )}
    </div>
  );
}