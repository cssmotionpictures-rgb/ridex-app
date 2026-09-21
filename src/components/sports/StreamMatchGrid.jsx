import React from "react";
import { Radio, Calendar, Loader2, Trophy, Play } from "lucide-react";
import { fetchSportsEvents, statusOf, statusLabel, fmtTime } from "@/lib/sportsScores";

// Real live + upcoming matches from TheSportsDB, with a "Watch Live" button that
// loads the match into the in-app IPTV player via the parent's onWatch handler.
export default function StreamMatchGrid({ onWatch, league }) {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sub, setSub] = React.useState("live");

  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const list = await fetchSportsEvents();
        if (!cancelled) setEvents(list);
      } catch {} finally { if (!cancelled) setLoading(false); }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const filtered = events
    .filter((e) => (league ? (e.strLeague || "").toLowerCase().includes(league.toLowerCase()) : true))
    .filter((e) => (sub === "all" ? true : statusOf(e) === sub))
    .sort((a, b) => {
      const rank = { live: 0, upcoming: 1, ft: 2 };
      const ra = rank[statusOf(a)] ?? 3;
      const rb = rank[statusOf(b)] ?? 3;
      if (ra !== rb) return ra - rb;
      if (ra === 1) return (a.strTime || "").localeCompare(b.strTime || "");
      return (b.strTime || "").localeCompare(a.strTime || "");
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading live & upcoming matches…
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {[
          { k: "live", l: "Live Now" },
          { k: "upcoming", l: "Upcoming" },
          { k: "all", l: "All" },
        ].map((t) => (
          <button key={t.k} onClick={() => setSub(t.k)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${sub === t.k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Trophy className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {sub === "live" ? "No matches live right now." : sub === "upcoming" ? "No upcoming fixtures in the next 2 days." : "No matches found."}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">Refreshes automatically every minute.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((e) => {
            const st = statusOf(e);
            const isLive = st === "live";
            const isFt = st === "ft";
            return (
              <div key={e.idEvent || `${e.strEvent}-${e.dateEvent}-${e.strTime}`} className="rounded-2xl border border-border/60 bg-card overflow-hidden card-lift">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-secondary/40">
                  <span className="text-[11px] text-muted-foreground truncate max-w-[70%]">{e.strLeague}</span>
                  {isLive ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">
                      <Radio className="w-2.5 h-2.5 animate-pulse" /> {statusLabel(e)}
                    </span>
                  ) : isFt ? (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{statusLabel(e)}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Calendar className="w-2.5 h-2.5" /> {fmtTime(e.strTime)}
                    </span>
                  )}
                </div>
                <div className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {e.strHomeTeamBadge && <img src={e.strHomeTeamBadge} alt="" className="w-6 h-6 rounded object-contain" onError={(ev) => (ev.target.style.display = "none")} />}
                      <span className="text-sm font-medium truncate">{e.strHomeTeam || "Home"}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {e.strAwayTeamBadge && <img src={e.strAwayTeamBadge} alt="" className="w-6 h-6 rounded object-contain" onError={(ev) => (ev.target.style.display = "none")} />}
                      <span className="text-sm font-medium truncate">{e.strAwayTeam || "Away"}</span>
                    </div>
                  </div>
                  <div className="text-center font-heading font-extrabold text-lg shrink-0">
                    {isLive || isFt ? `${e.intHomeScore ?? 0} : ${e.intAwayScore ?? 0}` : <span className="text-muted-foreground/50 text-sm font-medium">vs</span>}
                  </div>
                </div>
                {isLive ? (
                  <button onClick={() => onWatch(e)} className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 bg-primary/10 text-primary hover:bg-primary/20 border-t border-border/50">
                    <Play className="w-3 h-3" /> Watch Live
                  </button>
                ) : isFt ? (
                  <div className="w-full text-center text-[11px] font-medium py-1.5 bg-secondary text-muted-foreground border-t border-border/50">Match Ended</div>
                ) : (
                  <div className="w-full text-center text-[11px] font-medium py-1.5 bg-secondary text-muted-foreground border-t border-border/50">Kick-off {fmtTime(e.strTime)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}