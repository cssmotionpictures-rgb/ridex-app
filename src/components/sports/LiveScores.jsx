import React from "react";
import { Radio, Calendar, CheckCircle2, Loader2, RefreshCw, Globe, Trophy, Volume2, VolumeX, Search, Play } from "lucide-react";
import { playGoalSound, playRedCardSound, playPenaltySound, playYellowCardSound, primeAudio } from "@/lib/sportsSounds";
import { announceScore } from "@/lib/scoreCommentary";
import { fetchSportsEvents, SPORTS } from "@/lib/sportsScores";
import {
  MAJOR_LEAGUES,
  fetchLiveFixtures,
  fetchTodayMajorFixtures,
  fetchFixtureAlerts,
  mapTsdEvent,
  matchStatusLabel,
} from "@/lib/liveFootballScores";

const SOCCER_POLL_MS = 300000; // API-FOOTBALL live scores — every 5 min (free-quota friendly)
const OTHER_POLL_MS = 60000;   // TheSportsDB feeds (other sports) — every 60s
const ALERTS_MIN_MS = 900000;  // card / penalty scan — every 15 min, respects the free quota
const MAX_ALERT_FIXTURES = 3;  // live games scanned for cards & penalties per pass

// Per-sport flash banner wording — the spoken call uses the same real terms.
const SPORT_FLASH = {
  soccer: { emoji: "⚽", term: "GOAL!" },
  basketball: { emoji: "🏀", term: "SCORE!" },
  tennis: { emoji: "🎾", term: "SET!" },
  american_football: { emoji: "🏈", term: "SCORE!" },
  baseball: { emoji: "⚾", term: "RUN!" },
  ice_hockey: { emoji: "🏒", term: "GOAL!" },
  rugby: { emoji: "🏉", term: "TRY!" },
};

// Live scores board. Soccer is powered by API-FOOTBALL (Premier League,
// Champions League, La Liga, Bundesliga, Serie A, Ligue 1, Süper Lig,
// Europa League) with real minutes and scores; other sports come from the
// keyless worldwide feed. All sound alerts — goals, red cards, penalties,
// yellow cards — fire automatically in the browser.
export default function LiveScores({ onWatchMatch }) {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [league, setLeague] = React.useState("All");
  const [sub, setSub] = React.useState("all");
  const [lastRefresh, setLastRefresh] = React.useState(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [soundOn, setSoundOn] = React.useState(true);
  const [goalFlash, setGoalFlash] = React.useState(null);
  const [alertFlash, setAlertFlash] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [sport, setSport] = React.useState("soccer");
  const prevScoresRef = React.useRef({});
  const seenAlertIds = React.useRef(new Set());
  const lastAlertsAt = React.useRef(0);
  const soundOnRef = React.useRef(false);
  React.useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  // Browsers block audio until a user gesture — prime the audio engine on the
  // first tap/click so the default-on alerts actually play automatically.
  React.useEffect(() => {
    const handler = () => { primeAudio(); };
    const opts = { once: true, passive: true };
    window.addEventListener("pointerdown", handler, opts);
    window.addEventListener("keydown", handler, opts);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  // Score detection — diff scores per fixture between refreshes and fire the
  // sport's real call as a SPOKEN announcement (with the scoring player's
  // name when the feed carries it) plus the goal horn, automatically.
  const detectGoals = async (list) => {
    const prev = prevScoresRef.current;
    const newScores = [];
    list.forEach((m) => {
      if (!m.id) return;
      const hs = m.hs == null ? null : Number(m.hs);
      const as = m.as == null ? null : Number(m.as);
      const old = prev[m.id];
      if (old && hs != null && as != null && m.status !== "upcoming" && (hs > old.h || as > old.a)) {
        const side = hs > old.h ? "home" : "away";
        newScores.push({ m, side, delta: side === "home" ? hs - old.h : as - old.a, hs, as });
      }
      prev[m.id] = { h: hs ?? old?.h ?? 0, a: as ?? old?.a ?? 0 };
    });
    prevScoresRef.current = prev;
    if (!newScores.length || !soundOnRef.current) return;
    let last = null;
    for (const ev of newScores.slice(-3)) {
      // Scorer name — the soccer major leagues carry real goal events with the
      // scoring player's name; other sports announce the team with the score.
      let player = null;
      if (sport === "soccer" && ev.m.isMajor) {
        try {
          const alerts = await fetchFixtureAlerts(ev.m.id);
          const goals = alerts.filter(
            (a) => a.type === "goal" && a.player && ((ev.side === "home" && a.team === ev.m.home) || (ev.side === "away" && a.team === ev.m.away))
          );
          if (goals.length) player = goals[goals.length - 1].player;
        } catch { /* quota or network — team call only */ }
      }
      last = { ...ev, player };
      announceScore({ sport, home: ev.m.home, away: ev.m.away, hs: ev.hs, as: ev.as, side: ev.side, delta: ev.delta, player });
    }
    playGoalSound();
    if (last) {
      setGoalFlash({
        sport,
        home: last.m.home,
        away: last.m.away,
        hs: last.hs,
        as: last.as,
        player: last.player,
        who: last.side === "home" ? last.m.home : last.m.away,
      });
      setTimeout(() => setGoalFlash(null), 4500);
    }
  };

  // Red cards, penalties & yellow cards — scan the live major-league games
  // through the cached api-football proxy; every fresh event fires its sound.
  const scanAlerts = async (list) => {
    const now = Date.now();
    if (now - lastAlertsAt.current < ALERTS_MIN_MS) return;
    const liveMajors = list.filter((m) => m.status === "live" && m.isMajor).slice(0, MAX_ALERT_FIXTURES);
    if (!liveMajors.length) return;
    lastAlertsAt.current = now;
    for (const m of liveMajors) {
      try {
        const alerts = await fetchFixtureAlerts(m.id);
        // goal events are announced by the score-detection call (with the
        // scorer's name) — the card/penalty scan skips them here.
        const fresh = alerts.filter((a) => a.type !== "goal" && !seenAlertIds.current.has(a.id));
        alerts.forEach((a) => seenAlertIds.current.add(a.id));
        if (!fresh.length || !soundOnRef.current) continue;
        const pick = fresh[fresh.length - 1];
        const info = {
          ...pick,
          kind: pick.type === "redcard" ? "Red Card" : pick.type === "yellowcard" ? "Yellow Card" : "Penalty",
          fixture: `${m.home} vs ${m.away}`,
        };
        if (pick.type === "redcard") playRedCardSound();
        else if (pick.type === "yellowcard") playYellowCardSound();
        else playPenaltySound();
        setAlertFlash(info);
        setTimeout(() => setAlertFlash(null), 5000);
      } catch { /* quota or network — silent */ }
    }
  };

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setErr("");
    try {
      if (sport === "soccer") {
        const fetchMerged = async () => {
          const [liveRes, todayRes] = await Promise.allSettled([fetchLiveFixtures(), fetchTodayMajorFixtures()]);
          const live = liveRes.status === "fulfilled" ? liveRes.value : [];
          const today = todayRes.status === "fulfilled" ? todayRes.value : [];
          const byId = new Map();
          today.forEach((m) => byId.set(m.id, m));
          live.forEach((m) => byId.set(m.id, m)); // live scores override the day card
          const merged = [...byId.values()];
          if (!merged.length) throw new Error("empty");
          return merged;
        };
        let merged = null;
        try {
          merged = await fetchMerged();
        } catch {
          try {
            // one automatic retry — transient upstream blips clear on the second pass
            await new Promise((r) => setTimeout(r, 1500));
            merged = await fetchMerged();
          } catch {
            merged = null;
          }
        }
        if (!merged) {
          // API-FOOTBALL quota exhausted or unavailable — fall back to the
          // worldwide TheSportsDB feed so the board still shows real scores.
          const tsd = await fetchSportsEvents("soccer");
          merged = tsd.map(mapTsdEvent);
        }
        await detectGoals(merged);
        setEvents(merged);
        scanAlerts(merged);
      } else {
        const deduped = await fetchSportsEvents(sport);
        const mapped = deduped.map(mapTsdEvent);
        // an empty feed is a real result (rest day / no events tracked today)
        // — the board shows its empty state, not a failure banner.
        await detectGoals(mapped);
        setEvents(mapped);
      }
      setLastRefresh(new Date());
    } catch (e) {
      setErr("Couldn't load live scores right now. Tap refresh to try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sport]);

  React.useEffect(() => {
    load();
    // paused while the tab is hidden — the free API quota is never spent on a
    // page nobody is looking at
    const id = setInterval(() => {
      if (!document.hidden) load(true);
    }, sport === "soccer" ? SOCCER_POLL_MS : OTHER_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const leagueRank = React.useMemo(
    () => Object.fromEntries(MAJOR_LEAGUES.map((l, i) => [l.id, i])),
    []
  );

  const leagueChips = React.useMemo(() => {
    if (sport === "soccer") {
      // Majors first (board order), then any other competition with live/today
      // fixtures — a live game is never hidden just because it isn't a major.
      const presentMajors = MAJOR_LEAGUES.filter((l) => events.some((m) => m.leagueId === l.id));
      const majorNames = new Set(presentMajors.map((l) => l.name));
      const others = [...new Set(events.map((m) => m.league).filter((l) => l && !majorNames.has(l)))].sort();
      return ["All", ...presentMajors.map((l) => l.name), ...others];
    }
    const set = new Set(events.map((m) => m.league).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [events, sport]);

  const filtered = React.useMemo(() => {
    const rank = { live: 0, upcoming: 1, ft: 2 };
    const q = search.toLowerCase().trim();
    return events
      .filter((m) => league === "All" || m.league === league)
      .filter((m) => sub === "all" || m.status === sub)
      .filter((m) => !q || [m.home, m.away, m.league].some((s) => s && s.toLowerCase().includes(q)))
      .sort((a, b) => {
        const ra = rank[a.status] ?? 3;
        const rb = rank[b.status] ?? 3;
        if (ra !== rb) return ra - rb;
        const la = leagueRank[a.leagueId] ?? 99;
        const lb = leagueRank[b.leagueId] ?? 99;
        if (la !== lb) return la - lb;
        const ka = a.kickoff instanceof Date && !isNaN(a.kickoff) ? a.kickoff.getTime() : 0;
        const kb = b.kickoff instanceof Date && !isNaN(b.kickoff) ? b.kickoff.getTime() : 0;
        return ra === 1 ? ka - kb : kb - ka;
      });
  }, [events, league, sub, search, leagueRank]);

  const liveCount = events.filter((m) => m.status === "live").length;

  if (loading) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-10 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm">Loading live scores across all competitions…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score flash banner — the sport's real call + the scorer's name */}
      {goalFlash && (() => {
        const f = SPORT_FLASH[goalFlash.sport] || SPORT_FLASH.soccer;
        return (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-primary text-primary-foreground font-heading font-extrabold text-base sm:text-lg shadow-2xl animate-fade-in flex items-center gap-2 max-w-[92vw]">
            <span className="text-2xl">{f.emoji}</span> {f.term} {goalFlash.who}{goalFlash.player ? ` (${goalFlash.player})` : ""} · {goalFlash.home} {goalFlash.hs} : {goalFlash.as} {goalFlash.away}
          </div>
        );
      })()}
      {/* Red card / penalty / yellow card flash banner */}
      {alertFlash && (
        <div className={`fixed top-32 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl font-heading font-extrabold text-sm sm:text-base shadow-2xl animate-fade-in flex items-center gap-2 max-w-[92vw] ${alertFlash.kind === "Penalty" ? "bg-primary text-primary-foreground" : "bg-destructive text-white"}`}>
          <span className="text-xl">{alertFlash.kind === "Red Card" ? "🟥" : alertFlash.kind === "Yellow Card" ? "🟨" : "🎯"}</span>
          {alertFlash.kind}! {alertFlash.team}{alertFlash.player ? ` (${alertFlash.player})` : ""}{alertFlash.minute ? ` ${alertFlash.minute}'` : ""} · {alertFlash.fixture}
        </div>
      )}

      {/* Sport switcher */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {SPORTS.map((sp) => (
          <button
            key={sp.key}
            onClick={() => { setSport(sp.key); setLeague("All"); setSub("all"); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              sport === sp.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {sp.label}
          </button>
        ))}
      </div>

      {/* Status bar */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex items-center gap-2 text-sm font-bold text-red-400">
            <Radio className="w-4 h-4 animate-pulse" /> {liveCount} live
          </div>
          <span className="text-xs text-muted-foreground">{events.length} fixtures{sport === "soccer" ? " · all competitions" : ""}</span>
          {lastRefresh && (
            <span className="text-[11px] text-muted-foreground/70">
              Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { if (!soundOn) primeAudio(); setSoundOn((s) => !s); }}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${soundOn ? "bg-primary/15 text-primary border border-primary/40" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            title={soundOn ? "Sound alerts on — goal, red card, penalty & yellow card" : "Turn on sound alerts"}
          >
            {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {soundOn ? "Sound On" : "Sound Off"}
          </button>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Sound preview + note */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>Preview alerts:</span>
        <button onClick={() => { primeAudio(); playGoalSound(); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary hover:text-foreground">⚽ Goal</button>
        <button onClick={() => { primeAudio(); playRedCardSound(); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary hover:text-foreground">🟥 Red card</button>
        <button onClick={() => { primeAudio(); playPenaltySound(); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary hover:text-foreground">🎯 Penalty</button>
        <button onClick={() => { primeAudio(); playYellowCardSound(); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary hover:text-foreground">🟨 Yellow card</button>
        <button
          onClick={() => { primeAudio(); announceScore({ sport, home: "Arsenal", away: "Chelsea", hs: 2, as: 1, side: "home", delta: 1, player: "Saka" }); playGoalSound(); }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary hover:text-foreground"
        >
          🎤 Voice call
        </button>
        <span className="text-muted-foreground/70">All alerts fire automatically as matches happen — the voice announcer speaks the scoring player's name and shouts the sport's real call (GOAL, touchdown, basket, set…). One tap anywhere first unlocks browser audio.</span>
      </div>

      {err && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {err}
        </div>
      )}

      {/* Search matches */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search matches by team or league…"
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      {/* League filter */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {leagueChips.map((l) => (
          <button
            key={l}
            onClick={() => setLeague(l)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              league === l ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {[
          { k: "all", l: "All", i: Globe },
          { k: "live", l: "Live Now", i: Radio },
          { k: "upcoming", l: "Upcoming", i: Calendar },
          { k: "ft", l: "Finished", i: CheckCircle2 },
        ].map((t) => {
          const Icon = t.i;
          return (
            <button
              key={t.k}
              onClick={() => setSub(t.k)}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                sub === t.k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.l}
            </button>
          );
        })}
      </div>

      {/* Match list */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <Trophy className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No matches match this filter right now.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Scores refresh automatically — every 5 minutes for the major leagues.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((m) => {
            const isLive = m.status === "live";
            const isFt = m.status === "ft";
            return (
              <div
                key={m.id}
                className="rounded-2xl border border-border/60 bg-card overflow-hidden card-lift"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-secondary/40">
                  <span className="text-[11px] text-muted-foreground truncate max-w-[70%]">{m.league}</span>
                  {isLive ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">
                      <Radio className="w-2.5 h-2.5 animate-pulse" /> {matchStatusLabel(m)}
                    </span>
                  ) : isFt ? (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{matchStatusLabel(m)}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Calendar className="w-2.5 h-2.5" /> {m.localTime}
                    </span>
                  )}
                </div>
                <div className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {m.homeLogo && <img src={m.homeLogo} alt="" className="w-6 h-6 rounded object-contain" loading="lazy" onError={(ev) => (ev.target.style.display = "none")} />}
                      <span className="text-sm font-medium truncate">{m.home || "Home"}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {m.awayLogo && <img src={m.awayLogo} alt="" className="w-6 h-6 rounded object-contain" loading="lazy" onError={(ev) => (ev.target.style.display = "none")} />}
                      <span className="text-sm font-medium truncate">{m.away || "Away"}</span>
                    </div>
                  </div>
                  <div className="text-center font-heading font-extrabold text-lg shrink-0">
                    {isLive || isFt ? `${m.hs ?? 0} : ${m.as ?? 0}` : <span className="text-muted-foreground/50 text-sm font-medium">vs</span>}
                  </div>
                </div>
                {onWatchMatch && m.status !== "ft" && (
                  <button onClick={() => onWatchMatch(m)} className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 bg-primary/10 text-primary hover:bg-primary/20 border-t border-border/50">
                    <Play className="w-3 h-3" /> Watch in player
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground/70 pt-2">
        {sport === "soccer" ? (
          <>Live scores powered by API-FOOTBALL — every live competition worldwide, from the Premier League and Champions League to qualifiers, friendlies and smaller leagues. Auto-refreshes every 5 minutes with automatic goal, card & penalty alerts.</>
        ) : (
          <>Live scores powered by TheSportsDB — auto-refreshes every 60 seconds. Data may lag a few minutes behind real time.</>
        )}
      </p>
    </div>
  );
}