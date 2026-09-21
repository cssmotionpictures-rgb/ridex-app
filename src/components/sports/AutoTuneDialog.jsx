import React from "react";
import Hls from "hls.js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Radio, RefreshCw, Signal, Wifi, Ban, SkipForward, ShieldAlert, Tv } from "lucide-react";
import { autoTuneMatch, markDeadStation } from "@/lib/streamAutoTune";

// AUTO-TUNE DIALOG — click Watch on any match and this scans every sports
// station source, detects the ones actually responding, ranks them for THAT
// match and auto-plays the best working one. Everything stays in-app; if
// nothing works it says so honestly and offers the channel browser.

const STATUS_META = {
  working: { label: "WORKING", cls: "text-emerald-400", Icon: Signal },
  reachable: { label: "REACHABLE", cls: "text-amber-400", Icon: Wifi },
  blocked: { label: "BLOCKED", cls: "text-red-400", Icon: Ban },
};

function normalizeMatch(m) {
  if (!m) return null;
  let home = m.home || m.strHomeTeam || "";
  let away = m.away || m.strAwayTeam || "";
  const ev = m.strEvent || "";
  if ((!home || !away) && ev) {
    const parts = ev.split(/\s+vs\.?\s+/i);
    if (parts.length === 2) { home = home || parts[0]; away = away || parts[1]; }
  }
  return {
    home: home || "Home",
    away: away || "Away",
    league: m.league || m.strLeague || "",
    country: m.country || m.strCountry || "",
  };
}

export default function AutoTuneDialog({ match, onClose, onBrowse }) {
  const info = normalizeMatch(match);
  const open = !!match;
  const [scan, setScan] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [playing, setPlaying] = React.useState(null);
  const [playState, setPlayState] = React.useState("idle"); // idle | loading | playing | failed
  const videoRef = React.useRef(null);
  const hlsRef = React.useRef(null);
  const watchdogRef = React.useRef(null);

  const destroyPlayer = () => {
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
  };

  const playStation = React.useCallback((ch) => {
    const video = videoRef.current;
    if (!video || !ch?.url) { setPlayState("failed"); return; }
    destroyPlayer();
    video.removeAttribute("src");
    setPlaying(ch);
    setPlayState("loading");
    const fail = () => { markDeadStation(ch.url); setPlayState("failed"); };
    video.onplaying = () => {
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      setPlayState("playing");
    };
    video.onerror = () => fail();
    const startWatchdog = () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        if (videoRef.current && videoRef.current.readyState < 3) fail();
      }, 9000);
    };
    if (ch.url.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ manifestLoadingTimeOut: 8000, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 2 });
      hlsRef.current = hls;
      hls.loadSource(ch.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); startWatchdog(); });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          try { hls.destroy(); } catch {}
          if (hlsRef.current === hls) hlsRef.current = null;
          fail();
        }
      });
    } else {
      video.src = ch.url;
      video.play().catch(() => {});
      startWatchdog();
    }
  }, []);

  React.useEffect(() => {
    if (!match) return;
    const target = normalizeMatch(match);
    setScan({ done: 0, total: 0, checked: [] });
    setResult(null);
    setPlaying(null);
    setPlayState("idle");
    let cancelled = false;
    autoTuneMatch(target, (p) => { if (!cancelled) setScan(p); })
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        if (res.candidates && res.candidates[0]) playStation(res.candidates[0]);
      })
      .catch(() => {
        if (!cancelled) setResult({ match: target, candidates: [], deadCount: 0, poolSize: 0, relevantCount: 0, checkedCount: 0, failed: true });
      });
    return () => { cancelled = true; destroyPlayer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  const tryNext = () => {
    if (!result?.candidates?.length || !playing) return;
    const idx = result.candidates.findIndex((c) => c.url === playing.url);
    const next = result.candidates[(idx + 1) % result.candidates.length];
    if (next) playStation(next);
  };

  const candidates = result?.candidates || [];
  const noStations = result && !candidates.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="rounded-2xl max-w-[94vw] sm:max-w-2xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 text-left">
          <DialogTitle className="text-sm pr-6 leading-snug">
            {info ? `${info.home} vs ${info.away}` : "Auto-tune"}
          </DialogTitle>
          <DialogDescription className="text-[10px]">
            {info?.league ? `${info.league} · ` : ""}Auto-detecting working sports stations showing this match
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-3">
          {/* Player stage — video stays mounted so tuning is instant */}
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-border/60">
            <video
              ref={videoRef}
              controls
              playsInline
              autoPlay
              muted
              className={`absolute inset-0 w-full h-full bg-black ${playing ? "" : "hidden"}`}
            />
            {playing && playState === "playing" && (
              <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-1 rounded-full pointer-events-none">
                <Radio className="w-3 h-3 animate-pulse" /> LIVE · {playing.name}
              </span>
            )}
            {!playing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-xs font-semibold">Scanning all sports stations…</p>
                {info && <p className="text-[11px] text-muted-foreground">for {info.home} vs {info.away}</p>}
                {scan && scan.total > 0 && (
                  <>
                    <div className="w-40 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${(scan.done / scan.total) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{scan.done}/{scan.total} candidate stations probed</p>
                  </>
                )}
              </div>
            )}
            {playing && playState === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-[11px] text-muted-foreground">Tuning to {playing.name}…</p>
              </div>
            )}
            {playing && playState === "failed" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                <p className="text-xs font-semibold">{playing.name} dropped</p>
                <button onClick={tryNext} className="px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold inline-flex items-center gap-1.5">
                  <SkipForward className="w-3 h-3" /> Try next station
                </button>
              </div>
            )}
            {noStations && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                <ShieldAlert className="w-7 h-7 text-amber-400" />
                <p className="text-xs font-semibold">No working station detected right now</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed max-w-xs">
                  {result.poolSize > 0
                    ? `${result.relevantCount || 0} of ${result.poolSize} stations matched this match — none responded. Availability is set by each provider.`
                    : "Station sources could not be loaded. Check your connection and try again."}
                </p>
              </div>
            )}
          </div>

          {/* Detected stations */}
          {candidates.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">
                  Detected stations · {candidates.filter((c) => c.status === "working").length} working
                </p>
                {playing && (
                  <button onClick={tryNext} className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline">
                    <RefreshCw className="w-3 h-3" /> next
                  </button>
                )}
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto noir-scrollbar">
                {candidates.map((c) => {
                  const meta = STATUS_META[c.status] || STATUS_META.reachable;
                  const Icon = meta.Icon;
                  return (
                    <button
                      key={c.url}
                      onClick={() => playStation(c)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${playing?.url === c.url ? "bg-primary/15 border border-primary/40" : "border border-transparent hover:bg-secondary"}`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.cls}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] font-semibold truncate">{c.name}</span>
                        {c.matched && <span className="block text-[9px] text-muted-foreground truncate">matched: {c.matched}</span>}
                      </span>
                      <span className={`text-[8px] font-bold shrink-0 ${meta.cls}`}>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status + honest note */}
          <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
            {result && !noStations && candidates.length > 0
              ? `Scanned ${result.poolSize} stations · ${result.relevantCount} matched this match · probed the top ${result.checkedCount} · ${result.deadCount} dead removed from future scans.`
              : "The engine scans every station source, keeps only the ones that respond, and auto-plays the best match — no invented links."}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onBrowse && onBrowse(info || match)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs py-2.5"
            >
              <Tv className="w-4 h-4" /> Browse all channels
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}