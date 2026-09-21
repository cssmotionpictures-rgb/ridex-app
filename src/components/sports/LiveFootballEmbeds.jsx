import React from "react";
import Hls from "hls.js";
import { base44 } from "@/api/base44Client";
import { Radio, Maximize2, ExternalLink, Tv, ShieldAlert, Loader2, Search, Play, Film, RefreshCw, Zap, Square } from "lucide-react";

const LEAGUE_TABS = [
  "All", "Premier League", "Champions League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "World Cup 2026", "AFCON", "Copa America",
];

// IPTV channels are named by BROADCASTER, not by team. So when a user clicks a match,
// we map the league / team-country to likely broadcaster keywords and search those.
const LEAGUE_BROADCASTERS = {
  "Premier League": ["premier", "sky sports", "bt sport", "tnt sports", "match"],
  "English Premier League": ["premier", "sky sports", "bt sport", "tnt sports"],
  "Champions League": ["champions", "uefa", "bt sport", "tnt sports", "canal+"],
  "UEFA Champions League": ["champions", "uefa", "bt sport", "tnt sports", "canal+"],
  "Europa League": ["europa", "uefa", "bt sport"],
  "La Liga": ["la liga", "gol", "movistar", "espn", "liga"],
  "Spanish La Liga": ["la liga", "gol", "movistar", "espn", "liga"],
  "Bundesliga": ["bundesliga", "sky sport", "dazn", "bundes"],
  "German Bundesliga": ["bundesliga", "sky sport", "dazn", "bundes"],
  "Serie A": ["serie a", "sky sport", "dazn", "italia"],
  "Italian Serie A": ["serie a", "sky sport", "dazn", "italia"],
  "Ligue 1": ["ligue 1", "canal+", "prime", "france"],
  "French Ligue 1": ["ligue 1", "canal+", "prime", "france"],
  "Eredivisie": ["eredivisie", "ziggo", "espn"],
  "Primeira Liga": ["liga", "sport tv", "espn"],
  "World Cup": ["fifa", "world cup", "fox", "telemundo", "bbc", "itv"],
  "FIFA World Cup": ["fifa", "world cup", "fox", "telemundo", "bbc", "itv"],
  "AFCON": ["afcon", "africa", "supersport", "canal+"],
  "Africa Cup of Nations": ["afcon", "africa", "supersport", "canal+"],
  "Copa America": ["copa", "america", "espn", "directv"],
  "Nations League": ["nations", "uefa"],
  "Saudi Pro League": ["saudi", "ssc", "dazn"],
  "MLS": ["mls", "apple", "espn"],
  "Argentine Primera División": ["espn", "tyc", "tnt", "fox", "directv", "dsports"],
  "Argentine Primera Division": ["espn", "tyc", "tnt", "fox", "directv", "dsports"],
  "Brazilian Serie A": ["globo", "sbt", "espn", "premiere"],
  "Mexican Primera Division": ["liga", "azteca", "televisa", "espn"],
  "Liga MX": ["liga", "azteca", "televisa", "espn"],
};

// When the league isn't in the map, fall back to country-based broadcaster guesses
const COUNTRY_BROADCASTERS = {
  "Argentina": ["espn", "tyc", "tnt", "fox", "directv", "dsports"],
  "Brazil": ["globo", "sbt", "espn", "premiere"],
  "Spain": ["movistar", "gol", "espn"],
  "England": ["sky sports", "bt sport", "tnt sports", "itv", "bbc"],
  "Italy": ["sky sport", "dazn", "rai"],
  "Germany": ["sky sport", "dazn", "bundesliga"],
  "France": ["canal+", "prime", "france"],
  "Nigeria": ["supersport", "dazn", "espn"],
  "USA": ["fox", "espn", "cbs", "nbc", "telemundo"],
};

// Broadcasters likely to carry a live match — a sensible default search list
const GENERIC_SPORTS_KEYWORDS = ["espn", "sky sport", "bein", "tnt", "fox sport", "supersport", "dazn", "canal", "premier", "bt sport", "match", "live", "sport"];

// Multiple merged playlists → plenty of channel options. All are fetched, parsed,
// merged and de-duplicated into one big sports-channel list.
const PLAYLISTS = [
  "https://iptv-org.github.io/iptv/categories/sports.m3u", // ~320 dedicated sports channels
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8", // free HD TV channels worldwide
  "https://iptv-org.github.io/iptv/index.m3u", // master fallback (13,500+ channels, filtered to sports)
];

const SOURCES = [
  {
    key: "iptv",
    name: "Live Sports Channels",
    type: "playlist",
    playlists: PLAYLISTS,
    site: "https://iptv-org.github.io",
    note: "Hundreds of free sports channels — auto-rotates if a stream is blocked",
  },
  {
    key: "scorebat",
    name: "ScoreBat Highlights",
    type: "highlights",
    site: "https://www.scorebat.com",
    note: "Official match highlights & live clips — real embeds, no loading pages",
  },
];

const SPORTS_RE = /sport|football|soccer|premier|liga|bundes|serie|ligue|world|cup|ucl|uefa|afcon|copa|espn|bein|sky|bt|tnt|fox|supersport|dazn|canal|match|live|gol|arena|tv|channel/i;
const MAX_ROTATIONS = 20; // cap auto-rotation so we don't loop forever on a fully-blocked list

export default function LiveFootballEmbeds({ watchQuery }) {
  const wrapRef = React.useRef(null);
  const videoRef = React.useRef(null);
  const hlsRef = React.useRef(null);

  const [active, setActive] = React.useState("iptv");
  const [league, setLeague] = React.useState("All");
  const [channels, setChannels] = React.useState([]);
  const [picked, setPicked] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [loadingPl, setLoadingPl] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [rotating, setRotating] = React.useState(false);
  const [rotateCount, setRotateCount] = React.useState(0);
  const [fs, setFs] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [loadState, setLoadState] = React.useState("idle");
  const loadTimer = React.useRef(null);

  // Dead-channel removal (persisted) + scan tool
  const [dead, setDead] = React.useState(() => { try { return JSON.parse(localStorage.getItem("ridex_sports_dead") || "[]"); } catch { return []; } });
  const [scanning, setScanning] = React.useState({ running: false, done: 0, total: 0, removed: 0 });
  const scanningRef = React.useRef({ running: false });

  const markDead = (url) => {
    if (!url) return;
    setDead((prev) => { if (prev.includes(url)) return prev; const n = [...prev, url]; try { localStorage.setItem("ridex_sports_dead", JSON.stringify(n)); } catch {} return n; });
    setChannels((prev) => prev.filter((c) => c.url !== url));
  };

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
    const list = filteredChannels.filter((c) => c.url);
    if (!list.length) return;
    scanningRef.current.running = true;
    setScanning({ running: true, done: 0, total: list.length, removed: 0 });
    const batch = 4; let removed = 0; let done = 0;
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

  const restoreDead = async () => {
    setDead([]); try { localStorage.removeItem("ridex_sports_dead"); } catch {}
    setLoadingPl(true);
    try {
      const pl = current?.playlists || PLAYLISTS;
      const results = await Promise.all(pl.map((u) => fetch(u).then((r) => r.text()).then(parsePlaylist).catch(() => [])));
      const seen = new Set(); const merged = [];
      for (const list of results) for (const c of list) if (SPORTS_RE.test(c.name) && !seen.has(c.url)) { seen.add(c.url); merged.push(c); }
      merged.sort((a, b) => a.name.localeCompare(b.name));
      setChannels(merged.slice(0, 400));
      setStatus("All channels restored");
    } finally { setLoadingPl(false); }
  };

  // ScoreBat highlights state
  const [sbItems, setSbItems] = React.useState([]);
  const [sbLoading, setSbLoading] = React.useState(false);
  const [sbPicked, setSbPicked] = React.useState(null);
  const [sbError, setSbError] = React.useState("");

  const current = SOURCES.find((s) => s.key === active);

  // Refs so the auto-rotation logic inside playHls can read the latest channels/picked
  const channelsRef = React.useRef([]);
  const pickedRef = React.useRef(null);
  React.useEffect(() => { channelsRef.current = channels; }, [channels]);
  React.useEffect(() => { pickedRef.current = picked; }, [picked]);
  const rotateCountRef = React.useRef(0);
  const playHlsRef = React.useRef(null);

  const destroyHls = () => {
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
  };

  // Play a .m3u8 url. On a fatal error, auto-rotate to the next channel in the list
  // (capped at MAX_ROTATIONS) so a blocked source is skipped automatically.
  const playHls = React.useCallback((url, { userInitiated = false } = {}) => {
    const video = videoRef.current;
    if (!video) return;
    destroyHls();
    video.removeAttribute("src");
    const startPlayback = () => {
      if (userInitiated) {
        video.muted = false;
        video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
        if (wrapRef.current && !document.fullscreenElement) {
          try {
            if (wrapRef.current.requestFullscreen) wrapRef.current.requestFullscreen().catch(() => {});
            else if (wrapRef.current.webkitRequestFullscreen) wrapRef.current.webkitRequestFullscreen();
          } catch {}
        }
      } else {
        video.muted = true;
        video.play().catch(() => {});
      }
      // Success — reset rotation counters
      rotateCountRef.current = 0;
      setRotateCount(0);
      setRotating(false);
      setStatus("Playing");
    };

    const rotateToNext = () => {
      const list = channelsRef.current;
      if (!list.length) { setStatus("No channels available to switch to"); return; }
      if (rotateCountRef.current >= MAX_ROTATIONS) {
        setRotating(false);
        setStatus(`All ${MAX_ROTATIONS} tried sources were blocked — pick one manually or try ScoreBat`);
        return;
      }
      // Find the index after the current picked channel
      const curIdx = list.findIndex((c) => c.url === pickedRef.current?.url);
      const nextIdx = (curIdx + 1) % list.length;
      const next = list[nextIdx];
      if (!next) return;
      rotateCountRef.current += 1;
      setRotateCount(rotateCountRef.current);
      setRotating(true);
      setPicked(next);
      pickedRef.current = next;
      setStatus(`Source blocked — auto-switching to ${next.name} (${rotateCountRef.current}/${MAX_ROTATIONS})…`);
      // small delay before retrying the next channel
      setTimeout(() => playHlsRef.current && playHlsRef.current(next.url, { userInitiated: false }), 700);
    };

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => startPlayback());
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          try { hls.destroy(); } catch {}
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // CORS / blocked / 404 → auto-rotate to the next channel
            rotateToNext();
          } else {
            // Media error — also try the next channel
            rotateToNext();
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => startPlayback(), { once: true });
      video.addEventListener("error", () => rotateToNext(), { once: true });
    } else {
      setStatus("HLS not supported in this browser");
    }
  }, []);
  playHlsRef.current = playHls;

  const parsePlaylist = (text) => {
    const lines = text.split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXTINF")) {
        const name = (lines[i].split(",")[1] || "Channel").trim();
        const logoMatch = lines[i].match(/tvg-logo="([^"]*)"/);
        const url = (lines[i + 1] || "").trim();
        if (url && /^https?:\/\//.test(url)) out.push({ name, url, logo: logoMatch ? logoMatch[1] : "" });
      }
    }
    return out;
  };

  // Fetch all playlists in parallel, merge and de-duplicate into one sports channel list
  React.useEffect(() => {
    let cancelled = false;
    if (current?.key !== "iptv") return;
    if (channels.length) return;
    setLoadingPl(true);
    setStatus("Loading sports channels…");

    Promise.all(
      current.playlists.map((url) =>
        fetch(url).then((r) => r.text()).then(parsePlaylist).catch(() => [])
      )
    ).then((results) => {
      if (cancelled) return;
      const seen = new Set();
      const merged = [];
      for (const list of results) {
        for (const c of list) {
          if (SPORTS_RE.test(c.name) && !seen.has(c.url)) {
            seen.add(c.url);
            merged.push(c);
          }
        }
      }
      const live = merged.filter((c) => !dead.includes(c.url));
      live.sort((a, b) => a.name.localeCompare(b.name));
      setChannels(live.slice(0, 400));
      setStatus(live.length ? `${live.length} sports channels ready — tap one to play (auto-rotates if blocked)` : "No sports channels found");
      if (live[0]) { setPicked(live[0]); pickedRef.current = live[0]; playHls(live[0].url); }
    }).finally(() => !cancelled && setLoadingPl(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Fetch ScoreBat highlights from the backend function (real embed URLs, no loading page)
  React.useEffect(() => {
    let cancelled = false;
    if (current?.key !== "scorebat") return;
    if (sbItems.length) return;
    setSbLoading(true);
    setSbError("");
    base44.functions.invoke("scorebat-highlights", {})
      .then((res) => {
        if (cancelled) return;
        const items = (res?.data?.items || res?.items || []).slice(0, 40);
        setSbItems(items);
        if (items[0]) { setSbPicked(items[0]); setStarted(true); }
        else setSbError("No highlights available right now.");
      })
      .catch((e) => !cancelled && setSbError(e?.message || "Failed to load highlights"))
      .finally(() => !cancelled && setSbLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // External "watch this match" — find a broadcaster channel matching the league,
  // falling back to country and generic sports keywords (NOT the team name).
  React.useEffect(() => {
    if (!watchQuery) return;
    if (active !== "iptv") setActive("iptv");
    if (current?.key !== "iptv" || !channels.length) return;
    setQuery(watchQuery);
    rotateCountRef.current = 0;
    setRotateCount(0);

    const candidates = LEAGUE_BROADCASTERS[watchQuery] || GENERIC_SPORTS_KEYWORDS;
    let found = null;
    for (const kw of candidates) {
      found = channels.find((c) => c.name.toLowerCase().includes(kw));
      if (found) break;
    }
    if (found) {
      setPicked(found);
      pickedRef.current = found;
      playHls(found.url, { userInitiated: true });
      setStatus(`Playing ${found.name} — for "${watchQuery}"`);
    } else {
      // No league-broadcaster match — pick the first live sports channel and let auto-rotation find a working one
      const first = channels[0];
      if (first) {
        setPicked(first);
        pickedRef.current = first;
        playHls(first.url, { userInitiated: true });
        setStatus(`No live channel matched "${watchQuery}" — trying nearest sports channel (auto-rotates if blocked)`);
      } else {
        setStatus(`No live channel matched "${watchQuery}" — try ScoreBat highlights`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchQuery, channels]);

  React.useEffect(() => {
    if (current?.type !== "hls" && current?.type !== "playlist") destroyHls();
    if (current?.key !== "iptv") { setChannels([]); setPicked(null); }
    setStatus("");
    setStarted(false);
    setRotating(false);
    setRotateCount(0);
    rotateCountRef.current = 0;
    setLoadState("idle");
    if (loadTimer.current) { clearTimeout(loadTimer.current); loadTimer.current = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  React.useEffect(() => () => { destroyHls(); if (loadTimer.current) clearTimeout(loadTimer.current); }, []);

  const goFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch {}
  };
  React.useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  const filteredChannels = channels.filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()));
  const showVideo = current?.type === "hls" || current?.type === "playlist";
  const showSbIframe = current?.type === "highlights" && sbPicked && started;

  const onIframeLoad = () => {
    setLoadState("ready");
    if (loadTimer.current) { clearTimeout(loadTimer.current); loadTimer.current = null; }
  };

  // Manual "try next channel" button for the user
  const tryNextChannel = () => {
    const list = channelsRef.current;
    if (!list.length) return;
    const curIdx = list.findIndex((c) => c.url === pickedRef.current?.url);
    const nextIdx = (curIdx + 1) % list.length;
    const next = list[nextIdx];
    setPicked(next);
    pickedRef.current = next;
    rotateCountRef.current = 0;
    setRotateCount(0);
    playHls(next.url, { userInitiated: true });
  };

  return (
    <div className="rounded-3xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-secondary/40">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400">
            <Radio className="w-3.5 h-3.5 animate-pulse" /> LIVE
          </span>
          <span className="text-sm font-semibold">Watch Live Football Free</span>
          {rotating && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              <RefreshCw className="w-3 h-3 animate-spin" /> auto-switching {rotateCount}/{MAX_ROTATIONS}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {current?.key === "iptv" && channels.length > 0 && (
            <button onClick={tryNextChannel} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground">
              <RefreshCw className="w-3.5 h-3.5" /> Next channel
            </button>
          )}
          <button onClick={goFullscreen} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground">
            <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
          </button>
        </div>
      </div>

      {/* League tabs */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
        {LEAGUE_TABS.map((l) => (
          <button key={l} onClick={() => setLeague(l)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${league === l ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Source switcher */}
      {SOURCES.length > 1 && (
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          {SOURCES.map((s) => (
            <button key={s.key} onClick={() => setActive(s.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${active === s.key ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Player stage */}
      <div ref={wrapRef} className="relative bg-black aspect-video w-full">
        {showVideo && (
          <video ref={videoRef} controls autoPlay muted playsInline className="w-full h-full object-contain video-8k" />
        )}
        {current?.type === "highlights" && !started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6 bg-secondary/40">
            <Film className="w-10 h-10 text-primary" />
            <p className="text-sm font-semibold">{current?.name}</p>
            <p className="text-xs text-muted-foreground max-w-sm">{current?.note}. Pick a match below to play its highlights.</p>
            {sbLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading highlights…</div>}
            {sbError && <p className="text-xs text-red-400">{sbError}</p>}
          </div>
        )}
        {showSbIframe && (
          <>
            <iframe key={sbPicked?.videos?.[0]?.src} src={sbPicked?.videos?.[0]?.src} onLoad={onIframeLoad} title={`ScoreBat — ${sbPicked?.title}`}
              className="w-full h-full" frameBorder="0"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen
              referrerPolicy="no-referrer-when-downgrade" />
            {loadState === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center bg-black">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Loading highlight…</p>
              </div>
            )}
          </>
        )}
        <div className="absolute top-3 left-3 z-[5] pointer-events-none select-none">
          <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-primary/30">
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-red-400 uppercase tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live</span>
            <span className="text-xs font-extrabold gold-text leading-none">RIDE X</span>
            <span className="text-[10px] font-semibold text-primary/90 leading-none hidden sm:inline">Live Football</span>
          </div>
        </div>
        {showVideo && status && (
          <div className="absolute bottom-3 left-3 z-[5] bg-black/55 text-white text-[11px] px-2.5 py-1 rounded-full backdrop-blur-sm max-w-[85%]">
            {loadingPl && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}{status}
          </div>
        )}
      </div>

      {/* IPTV channel picker */}
      {current?.key === "iptv" && channels.length > 0 && (
        <div className="px-4 py-3 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search channels…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!scanning.running ? (
              <button onClick={scanChannels} disabled={loadingPl || !channels.length} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 disabled:opacity-50">
                <Zap className="w-3.5 h-3.5" /> Scan & remove dead
              </button>
            ) : (
              <button onClick={stopScan} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-destructive text-white">
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            )}
            {scanning.running && <span className="text-xs text-muted-foreground">Testing {scanning.done}/{scanning.total} · {scanning.removed} removed</span>}
            {dead.length > 0 && !scanning.running && <button onClick={restoreDead} className="text-[11px] text-muted-foreground hover:text-primary underline">{dead.length} removed · Restore</button>}
          </div>
          {scanning.running && (
            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${scanning.total ? (scanning.done / scanning.total) * 100 : 0}%` }} />
            </div>
          )}
          <div className="flex gap-2 flex-wrap max-h-44 overflow-y-auto">
            {filteredChannels.map((c, i) => (
              <button key={i} onClick={() => { setPicked(c); pickedRef.current = c; rotateCountRef.current = 0; setRotateCount(0); playHls(c.url, { userInitiated: true }); }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] whitespace-nowrap border ${picked?.url === c.url ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {c.logo && <img src={c.logo} alt="" className="w-4 h-4 rounded object-contain" onError={(e) => e.target.style.display = "none"} />}
                {c.name}
              </button>
            ))}
            {filteredChannels.length === 0 && <p className="text-xs text-muted-foreground">No channels match "{query}".</p>}
          </div>
        </div>
      )}

      {/* ScoreBat highlights grid */}
      {current?.key === "scorebat" && (
        <div className="px-4 py-3 space-y-3">
          {sbLoading && <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading highlights…</div>}
          {sbError && <p className="text-xs text-red-400 text-center py-4">{sbError}</p>}
          {!sbLoading && !sbError && sbItems.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {sbItems.map((h, i) => (
                <button key={i} onClick={() => { setSbPicked(h); setStarted(true); setLoadState("loading"); }}
                  className={`text-left rounded-xl overflow-hidden border ${sbPicked?.title === h.title ? "border-primary" : "border-border/60"} bg-secondary/40 hover:bg-secondary`}>
                  {h.thumbnail && <img src={h.thumbnail} alt="" className="w-full h-20 object-cover" onError={(e) => (e.target.style.display = "none")} />}
                  <div className="p-2">
                    <p className="text-[11px] font-semibold line-clamp-2">{h.title}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{h.competition?.name || h.competition || ""}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Source meta + fallback */}
      <div className="px-4 py-3 space-y-2 border-t border-border/60">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Tv className="w-3.5 h-3.5" /> {current?.name}</span>
          <span className="text-primary font-medium">· {current?.note}</span>
        </div>
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground/80">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>If a stream is geo-blocked or CORS-blocked, the engine auto-switches to the next working channel (up to {MAX_ROTATIONS} tries). You can also tap "Next channel" or pick one manually.</p>
        </div>
        {current?.site && (
          <a href={current.site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <ExternalLink className="w-3.5 h-3.5" /> Open {current?.name} site
          </a>
        )}
      </div>
    </div>
  );
}