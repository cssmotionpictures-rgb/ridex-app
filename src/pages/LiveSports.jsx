import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import LiveFootballEmbeds from "@/components/sports/LiveFootballEmbeds";
import LiveScores from "@/components/sports/LiveScores";
import StreamMatchGrid from "@/components/sports/StreamMatchGrid";
import MembershipBanner from "@/components/sports/MembershipBanner";
import ClubPicker from "@/components/sports/ClubPicker";
import PredictGame from "@/components/sports/PredictGame";
import AiPredictions from "@/components/sports/AiPredictions";
import RollOverPlan from "@/components/sports/RollOverPlan";
import MonsterRollover from "@/components/sports/MonsterRollover";
import MonsterRolloverDashboard from "@/components/sports/MonsterRolloverDashboard";
import PredictionLeaderboard from "@/components/sports/PredictionLeaderboard";
import ForumList from "@/components/sports/ForumList";
import MatchNotifications from "@/components/sports/MatchNotifications";
import MatchCalendarView from "@/components/sports/MatchCalendarView";
import AutoTuneDialog from "@/components/sports/AutoTuneDialog";
import ResponsibleGamblingNotice from "@/components/sports/ResponsibleGamblingNotice";
import ProPlaybook from "@/components/sports/ProPlaybook";
import SportradarHealthPanel from "@/components/sports/SportradarHealthPanel";
import SrDatabasePanel from "@/components/sports/SrDatabasePanel";
import SrModelPredictions from "@/components/sports/SrModelPredictions";
import StatsHub from "@/components/sports/StatsHub";
import HeadToHead from "@/components/sports/HeadToHead";
import BreakingNewsTicker from "@/components/sports/BreakingNewsTicker";
import LiveMatchPing from "@/components/sports/LiveMatchPing";
import WeatherCard from "@/components/sports/WeatherCard";
import DisasterAlerts from "@/components/sports/DisasterAlerts";
import { BarChart3 } from "lucide-react";
import { fetchSportsEvents, statusOf } from "@/lib/sportsScores";
import { fetchLiveFixtures } from "@/lib/liveFootballScores";
import GlobalTVPlayer from "@/components/tv/GlobalTVPlayer";
import { Radio, Trophy, Target, MessagesSquare, Film, Globe, Tv, Swords, CalendarDays, Activity } from "lucide-react";

// Auto-updated, community-maintained sports M3U playlists that play in-app (no custom headers needed).
const SPORTS_PLAYLISTS = [
  { id: "iptv_sports", name: "⚽ IPTV.org Sports (Global)", url: "https://iptv-org.github.io/iptv/categories/sports.m3u", desc: "Dedicated sports channels worldwide" },
  { id: "world_ip_sports", name: "🌍 World IP TV (Auto-verified)", url: "https://romaxa55.github.io/world_ip_tv/output/index.m3u", desc: "Updated every 6 hours · dead links purged" },
  { id: "t_sports", name: "📡 T-Sports (Cricket/Football)", url: "https://raw.githubusercontent.com/abusaeeidx/T-Sports-Playlist-Auto-Update/refs/heads/main/universal_player.m3u", desc: "Auto-updating every 30 min" },
  { id: "iptv_org_all", name: "🌐 IPTV.org All Channels", url: "https://iptv-org.github.io/iptv/index.m3u", desc: "60+ countries · search for sports" },
];

export default function LiveSports() {
  const [clubs, setClubs] = React.useState([]);
  const [user, setUser] = React.useState(null);
  const [membership, setMembership] = React.useState(null);
  const [tab, setTab] = React.useState("streams");
  const [watchQuery, setWatchQuery] = React.useState("");
  const [autoTune, setAutoTune] = React.useState(null);
  const [liveCount, setLiveCount] = React.useState(0);

  React.useEffect(() => {
    (async () => {
      try {
        const [u, cList] = await Promise.all([
          base44.auth.me(),
          base44.entities.FootballClub.list("-fans_count", 30),
        ]);
        setUser(u);
        setClubs(cList || []);
        if (u?.id) {
          try {
            const mems = await base44.entities.SportsMembership.filter({ user_id: u.id }, "-created_date", 5);
            const act = (mems || []).find((m) => m.status === "active" && (!m.expires_at || new Date(m.expires_at) > new Date()));
            setMembership(act || null);
          } catch {}
        }
      } catch {}
    })();
  }, []);

  // Real live match count from TheSportsDB (refreshes every 60s)
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        // Real live count from API-FOOTBALL (cached 5 min server-side) — every
        // competition counts, and the board's live fixtures are the same feed.
        const live = await fetchLiveFixtures();
        if (cancelled) return;
        setLiveCount(live.filter((m) => m.status === "live").length);
        if (live.filter((m) => m.status === "live").length === 0) {
          // fallback: the keyless worldwide feed may still see games the
          // primary feed hasn't picked up yet
          const events = await fetchSportsEvents();
          if (!cancelled) setLiveCount(events.filter((e) => statusOf(e) === "live").length);
        }
      } catch {
        try {
          const events = await fetchSportsEvents();
          if (!cancelled) setLiveCount(events.filter((e) => statusOf(e) === "live").length);
        } catch {}
      }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const selectedClub = user?.club_id ? clubs.find((c) => c.id === user.club_id) : null;

  // Pass the LEAGUE name (not the team name) — LiveFootballEmbeds maps the league to
  // broadcaster keywords (ESPN, Sky, beIN…) and searches IPTV channels for those,
  // since channels are named by broadcaster, never by team.
  // Watch Live → the auto-tune engine detects working stations for THIS
  // match and auto-plays the best one.
  const handleWatchMatch = (e) => {
    setAutoTune(e);
  };

  const tabs = [
    { k: "scores", l: "Live Scores", icon: Trophy },
    { k: "calendar", l: "Match Calendar", icon: CalendarDays },
    { k: "streams", l: "Live Streams", icon: Radio },
    { k: "predict", l: "Predict & Win", icon: Target },
    { k: "h2h", l: "Head to Head", icon: Swords },
    { k: "stats", l: "Stats Hub", icon: BarChart3 },
    { k: "forum", l: "Fan Forum", icon: MessagesSquare },
  ];

  const subNav = [
    { to: "/player-stats", l: "Player xG Stats", icon: Activity },
    { to: "/sports/highlights", l: "Highlights", icon: Film },
    { to: "/sports/world-cup", l: "World Cup 2026", icon: Globe },
    { to: "/sports/sources", l: "Where to Watch", icon: Tv },
  ];

  return (
    <div>
      <PageHeader eyebrow="⚽ Live Sports" title="Football Live Streams" subtitle="Watch, predict, and debate — the full match-day experience in one place."
        action={
          <div className="flex items-center gap-2">
            <MatchNotifications />
            <div className="inline-flex items-center gap-2 text-sm bg-red-500/10 text-red-400 px-3 py-1.5 rounded-full font-semibold"><Radio className="w-4 h-4 animate-pulse" /> {liveCount} live now</div>
          </div>
        } />

      <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
        {subNav.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.to} to={s.to} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground whitespace-nowrap">
              <Icon className="w-3.5 h-3.5" /> {s.l}
            </Link>
          );
        })}
      </div>

      <LiveMatchPing />

      <div className="space-y-3 mb-6">
        <BreakingNewsTicker />
        <DisasterAlerts />
        <WeatherCard />
      </div>

      <div className="space-y-4 mb-6">
        <MembershipBanner membership={membership} user={user} />
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <ClubPicker clubs={clubs} user={user} selected={selectedClub} onChange={() => {}} />
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.k} onClick={() => setTab(t.k)} className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === t.k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" /> {t.l}
            </button>
          );
        })}
      </div>

      {tab === "scores" && <LiveScores onWatchMatch={handleWatchMatch} />}

      {tab === "calendar" && <MatchCalendarView />}

      {tab === "streams" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Radio className="w-5 h-5 text-primary" /> Live Football & Sports Channels</h2>
            <p className="text-xs text-muted-foreground mb-3">Auto-updated community sports playlists — tap a channel to watch right here. If a channel is blocked, hit "Try next channel" to auto-skip.</p>
            <GlobalTVPlayer playlists={SPORTS_PLAYLISTS} />
          </div>
          <LiveFootballEmbeds watchQuery={watchQuery} />
          <StreamMatchGrid onWatch={handleWatchMatch} />
        </div>
      )}

      {tab === "predict" && (
        <div className="space-y-6">
          <Link to="/monster-engine" className="block rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/15 to-transparent px-4 py-3">
            <p className="text-sm font-extrabold text-primary tracking-wide">MONSTER ENGINE HUB →</p>
            <p className="text-[10px] text-muted-foreground">Live multi-sport prediction dashboard · tennis, basketball, football, baseball, NFL & hockey · today's double slip</p>
          </Link>
          <ResponsibleGamblingNotice />
          <ProPlaybook />
          <MonsterRollover />
          <MonsterRolloverDashboard />
          <SportradarHealthPanel />
          <SrDatabasePanel user={user} />
          <SrModelPredictions user={user} />
          <AiPredictions user={user} membership={membership} onCopied={() => setTab("predict")} />
          <RollOverPlan user={user} onCopied={() => setTab("predict")} />
          <PredictGame user={user} />
          <div>
            <h2 className="text-lg font-bold mb-3">Leaderboards</h2>
            <PredictionLeaderboard />
          </div>
        </div>
      )}

      {tab === "h2h" && <HeadToHead />}

      {tab === "stats" && <StatsHub />}

      {tab === "forum" && <ForumList user={user} />}

      <AutoTuneDialog
        match={autoTune}
        onClose={() => setAutoTune(null)}
        onBrowse={(m) => {
          setWatchQuery(m?.league || m?.strLeague || m?.strEvent || "");
          setTab("streams");
          setAutoTune(null);
        }}
      />

      <p className="text-center text-[11px] text-muted-foreground/70 mt-8">By watching you agree to our <Link to="/terms" className="underline">Terms</Link>. Ride X links to third-party and official platforms — availability is set by each provider.</p>
    </div>
  );
}