import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import TvStationBug from "@/components/tv/TvStationBug";
import { Loader2, Tv, Search, Radio, Globe, ChevronDown, SkipForward, AlertCircle, Zap, Square } from "lucide-react";

// Community-maintained M3U playlists — auto-updated, no fragile hardcoded links.
const PLAYLISTS = [
  { id: "free_tv_main", name: "🌐 Free-TV Global (HD)", url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8", desc: "Plex · Pluto · Redbox · Roku · Samsung TV+" },
  { id: "iptv_org_main", name: "📡 IPTV.org Global", url: "https://iptv-org.github.io/iptv/index.m3u", desc: "60+ countries · 80,000+ channels" },
  { id: "free_tv_usa", name: "🇺🇸 Free-TV USA", url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/lists/usa.m3u8", desc: "US free channels" },
  { id: "free_tv_china", name: "🇨🇳 Free-TV China", url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/lists/china.m3u8", desc: "CCTV · Chinese channels" },
  { id: "free_tv_japan", name: "🇯🇵 Free-TV Japan", url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/lists/japan.m3u8", desc: "Japan free channels" },
  { id: "free_tv_hk", name: "🇭🇰 Free-TV Hong Kong", url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/lists/hong_kong.m3u8", desc: "Hong Kong free channels" },
  { id: "world_ip_tv", name: "🌍 World IP TV (Auto-verified)", url: "https://romaxa55.github.io/world_ip_tv/output/index.m3u", desc: "Updated every 6 hours" },
  { id: "iptvru2026", name: "🔥 Mega Playlist 9000+", url: "https://raw.githubusercontent.com/IPTVRU2026/IPTVMIR/main/IPTV_MEGA_PLAYLIST.m3u", desc: "Weekly · 9000+ channels" },
  { id: "vbskycn_cn", name: "🇨🇳 China IPTV (IPv4)", url: "https://live.zbds.top/tv/iptv4.m3u", desc: "China · daily updates" },
  // Hollywood on-demand movie M3Us (TMDB-sourced, genre-grouped)
  { id: "tmdb_top", name: "🏆 Top IMDB Movies", url: "https://aymrgknetzpucldhpkwm.supabase.co/storage/v1/object/public/tmdb/top-movies.m3u", desc: "Top-rated Hollywood films" },
  { id: "tmdb_action", name: "💥 Hollywood — Action", url: "https://aymrgknetzpucldhpkwm.supabase.co/storage/v1/object/public/tmdb/action-movies.m3u", desc: "Action movie streams" },
  { id: "tmdb_comedy", name: "😂 Hollywood — Comedy", url: "https://aymrgknetzpucldhpkwm.supabase.co/storage/v1/object/public/tmdb/comedy-movies.m3u", desc: "Comedy movie streams" },
  { id: "tmdb_horror", name: "👻 Hollywood — Horror", url: "https://aymrgknetzpucldhpkwm.supabase.co/storage/v1/object/public/tmdb/horror-movies.m3u", desc: "Horror movie streams" },
  { id: "tmdb_romance", name: "❤️ Hollywood — Romance", url: "https://aymrgknetzpucldhpkwm.supabase.co/storage/v1/object/public/tmdb/romance-movies.m3u", desc: "Romance movie streams" },
  { id: "tmdb_scifi", name: "🚀 Hollywood — Sci-Fi", url: "https://aymrgknetzpucldhpkwm.supabase.co/storage/v1/object/public/tmdb/science-fiction-movies.m3u", desc: "Science-fiction movie streams" },
];

const MAX_RENDER = 400;
const DEAD_KEY = "ridex_gtv_dead"; // persisted { [playlistId]: [url,...] } of removed/dead channels

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const channels = [];
  let current = null;
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const nameMatch = line.match(/,([^,]+)$/);
      const name = nameMatch ? nameMatch[1].trim() : "Unknown";
      const groupMatch = line.match(/group-title="([^"]*)"/);
      const group = groupMatch ? groupMatch[1].trim() : "General";
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      current = { name, group, url: null, logo: logoMatch ? logoMatch[1] : "" };
    } else if (line.startsWith("http") && current) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

export default function GlobalTVPlayer({ playlists = PLAYLISTS }) {
  const [playlistId, setPlaylistId] = useState(playlists[0]?.id || "free_tv_main");
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [active, setActive] = useState(null);
  const [dead, setDead] = useState(() => { try { return JSON.parse(localStorage.getItem(DEAD_KEY) || "{}"); } catch { return {}; } });
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const watchdogRef = useRef(null);
  const [playState, setPlayState] = useState("idle"); // idle | loading | playing | unavailable

  const markDead = (url) => {
    if (!url) return;
    setDead((prev) => {
      const list = prev[playlistId] || [];
      if (list.includes(url)) return prev;
      const next = { ...prev, [playlistId]: [...list, url] };
      try { localStorage.setItem(DEAD_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setChannels((prev) => prev.filter((c) => c.url !== url));
  };

  const restoreDead = () => {
    setDead((prev) => {
      const next = { ...prev };
      delete next[playlistId];
      try { localStorage.setItem(DEAD_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    load(playlistId);
  };

  const [scanning, setScanning] = useState({ running: false, done: 0, total: 0, removed: 0 });
  const scanningRef = useRef({ running: false });

  // Reachability check — community IPTV streams are often CORS-blocked in-browser
  // (hls.js can't fetch the manifest) even though they play fine in the native app,
  // so a real playback test gives false negatives and wipes the whole list. We only
  // mark a channel dead if its server is truly unreachable (DNS fail / connection
  // refused / timeout); anything that responds is kept.
  const testChannel = async (ch) => {
    if (!ch.url) return true;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 7000);
      await fetch(ch.url, { mode: "no-cors", signal: ctrl.signal });
      clearTimeout(t);
      return true;
    } catch {
      return false;
    }
  };

  const scanChannels = async () => {
    const dl = dead[playlistId] || [];
    const list = channels.filter((c) => c.url && !dl.includes(c.url)).filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()));
    if (!list.length) return;
    scanningRef.current.running = true;
    setScanning({ running: true, done: 0, total: list.length, removed: 0 });
    const batch = 4;
    let removed = 0; let done = 0;
    for (let i = 0; i < list.length; i += batch) {
      if (!scanningRef.current.running) break;
      const slice = list.slice(i, i + batch);
      const results = await Promise.all(slice.map(async (c) => ({ c, ok: await testChannel(c) })));
      for (const { c, ok } of results) { if (!ok) { markDead(c.url); removed++; } done++; }
      setScanning({ running: scanningRef.current.running, done, total: list.length, removed });
    }
    scanningRef.current.running = false;
    setScanning({ running: false, done, total: list.length, removed });
  };

  const stopScan = () => { scanningRef.current.running = false; setScanning((s) => ({ ...s, running: false })); };

  const load = async (id) => {
    const p = playlists.find((x) => x.id === id);
    if (!p) return;
    setLoading(true);
    setStatus(`Loading ${p.name}…`);
    setChannels([]);
    setActive(null);
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
    try {
      const res = await fetch(p.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseM3U(text);
      if (!parsed.length) throw new Error("No channels found");
      setChannels(parsed);
      setStatus(`${parsed.length.toLocaleString()} channels · ${p.name}`);
    } catch (err) {
      setStatus(`Failed: ${err.message}. Try another playlist.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(playlistId);
    return () => { if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; } if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; } };
  }, []);

  const play = (ch) => {
    setActive(ch);
    setPlayState("loading");
    const video = videoRef.current;
    if (!video || !ch.url) { setPlayState("unavailable"); return; }
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
    const markUnavailable = () => {
      markDead(ch.url);
      setPlayState("unavailable");
      setStatus(`“${ch.name}” isn't available right now — removed from your list. Try another channel.`);
    };
    const startWatchdog = () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        if (videoRef.current && videoRef.current.readyState < 3) markUnavailable();
      }, 9000);
    };
    video.onplaying = () => {
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      setPlayState("playing");
    };
    video.onerror = () => markUnavailable();
    const isHls = ch.url.includes(".m3u8");
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true, lowLatencyMode: true, startLevel: -1,
        maxBufferLength: 20, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 2,
        manifestLoadingTimeOut: 8000, levelLoadingTimeOut: 8000,
      });
      hlsRef.current = hls;
      hls.loadSource(ch.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); startWatchdog(); });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) { try { hls.destroy(); } catch {} hlsRef.current = null; markUnavailable(); }
      });
    } else {
      video.src = ch.url;
      video.play().catch(() => {});
      startWatchdog();
    }
  };

  const playNext = () => {
    const dl = dead[playlistId] || [];
    const list = channels.filter((c) => !dl.includes(c.url)).filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()));
    const idx = active ? list.findIndex((c) => c.url === active.url) : -1;
    const next = list[(idx + 1) % list.length] || list[0];
    if (next) play(next);
  };

  const deadList = dead[playlistId] || [];
  const filtered = channels.filter((c) => !deadList.includes(c.url)).filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()));
  const groups = {};
  filtered.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
  const groupEntries = Object.entries(groups).filter(([, items]) => items.length);
  let rendered = 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/60 border border-border/60 rounded-xl px-3 py-2">
        <Globe className="w-4 h-4 text-primary shrink-0" />
        <span>Community-maintained playlists · thousands of free channels · auto-updated. Pick a playlist, search, and tap a channel to watch.</span>
      </div>

      {/* Player */}
      <div className="relative rounded-2xl overflow-hidden border border-border/60 bg-black aspect-video">
        {active ? (
          <video ref={videoRef} controls playsInline autoPlay className="absolute inset-0 w-full h-full bg-black" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Globe className="w-10 h-10 text-primary/50" />
            <p className="text-sm">Select a channel to start watching</p>
          </div>
        )}
        {active && playState === "playing" && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-1 rounded-full">
            <Radio className="w-3 h-3 animate-pulse" /> LIVE · {active.name}
          </span>
        )}
        {active && <TvStationBug live />}
        {active && playState === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs">Tuning to {active.name}…</p>
          </div>
        )}
        {active && playState === "unavailable" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
            <AlertCircle className="w-8 h-8 text-amber-400" />
            <p className="text-sm font-medium text-foreground">{active.name} isn't available right now</p>
            <button onClick={playNext} className="mt-1 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5">
              <SkipForward className="w-3.5 h-3.5" /> Try next channel
            </button>
          </div>
        )}
      </div>

      {/* Playlist selector */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <select
            value={playlistId}
            onChange={(e) => { setPlaylistId(e.target.value); load(e.target.value); }}
            className="w-full appearance-none pl-3 pr-9 py-2.5 rounded-xl bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
        {loading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : (
          <span className="text-xs text-muted-foreground bg-secondary px-3 py-1.5 rounded-full">{channels.length} ch</span>
        )}
      </div>

      {status && <p className="text-xs text-muted-foreground px-1">{status}</p>}

      {/* Scan & remove dead channels */}
      <div className="flex flex-wrap items-center gap-2">
        {!scanning.running ? (
          <button onClick={scanChannels} disabled={loading || !channels.length} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 disabled:opacity-50">
            <Zap className="w-3.5 h-3.5" /> Scan & remove dead
          </button>
        ) : (
          <button onClick={stopScan} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-destructive text-white">
            <Square className="w-3.5 h-3.5" /> Stop
          </button>
        )}
        {scanning.running && (
          <span className="text-xs text-muted-foreground">Testing {scanning.done}/{scanning.total} · {scanning.removed} removed</span>
        )}
        {scanning.total > 0 && !scanning.running && scanning.done > 0 && (
          <span className="text-xs text-muted-foreground">Last scan: {scanning.removed} removed of {scanning.total} tested</span>
        )}
      </div>
      {scanning.running && (
        <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${scanning.total ? (scanning.done / scanning.total) * 100 : 0}%` }} />
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search channels…" className="w-full pl-9 pr-3 py-2 rounded-xl bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
      {deadList.length > 0 && (
        <button onClick={restoreDead} className="text-[11px] text-muted-foreground hover:text-primary underline">
          {deadList.length} removed channel{deadList.length > 1 ? "s" : ""} hidden · Restore
        </button>
      )}

      {/* Channel list grouped */}
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {groupEntries.length === 0 && !loading && <p className="text-center text-muted-foreground py-10">No channels loaded.</p>}
        {groupEntries.map(([group, items]) => {
          if (rendered >= MAX_RENDER) return null;
          const show = items.slice(0, Math.min(items.length, MAX_RENDER - rendered));
          rendered += show.length;
          return (
            <div key={group}>
              <p className="text-xs uppercase tracking-wide text-primary mb-2 px-1 truncate">📁 {group} ({items.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {show.map((c, i) => (
                  <button key={group + i} onClick={() => play(c)} className={`text-left rounded-xl border p-2.5 bg-card card-lift ${active?.url === c.url ? "border-primary" : "border-border/60"}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {c.logo ? <img src={c.logo} alt="" className="w-8 h-8 rounded object-contain bg-secondary/40 shrink-0" onError={(e) => (e.currentTarget.style.display = "none")} /> : <Tv className="w-7 h-7 text-primary/50 shrink-0" />}
                      <p className="text-xs font-semibold truncate">{c.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length > MAX_RENDER && <p className="text-center text-xs text-muted-foreground py-2">Showing first {MAX_RENDER} of {filtered.length.toLocaleString()}. Refine your search to see more.</p>}
      </div>
    </div>
  );
}