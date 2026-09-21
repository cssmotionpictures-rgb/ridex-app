import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import LiveFootballEmbeds from "@/components/sports/LiveFootballEmbeds";
import StreamMatchGrid from "@/components/sports/StreamMatchGrid";
import { Loader2, Trophy, Play } from "lucide-react";

export default function SportsWorldCup() {
  const [matches, setMatches] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [watchQuery, setWatchQuery] = React.useState("World Cup");

  React.useEffect(() => {
    base44.entities.LiveMatch.filter({ league: "FIFA World Cup 2026" }, "kickoff_time", 50)
      .then(setMatches).catch(() => setMatches([])).finally(() => setLoading(false));
  }, []);

  const handleWatch = (e) => setWatchQuery(e.strHomeTeam || e.strEvent || "World Cup");

  return (
    <div>
      <PageHeader
        eyebrow="🌍 World Cup 2026"
        title="FIFA World Cup 2026"
        subtitle="Pick any match and watch it play directly in the Ride X in-app player — no redirects, no external sites."
      />

      <LiveFootballEmbeds watchQuery={watchQuery} />

      <h2 className="text-lg font-bold mt-6 mb-3">Choose a match to watch</h2>
      <StreamMatchGrid league="World Cup" onWatch={handleWatch} />

      <h2 className="text-base font-semibold mt-8 mb-3">All World Cup fixtures</h2>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading fixtures…</div>
      ) : matches.length === 0 ? (
        <div className="text-center py-8">
          <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">World Cup fixtures will appear here once scheduled.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((m) => (
            <div key={m.id} className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.team_a} vs {m.team_b}</p>
                <p className="text-xs text-muted-foreground">
                  {m.kickoff_time ? new Date(m.kickoff_time).toLocaleString("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "TBD"}
                  {m.venue ? ` · ${m.venue}` : ""}
                </p>
              </div>
              <button
                onClick={() => setWatchQuery(`${m.team_a} ${m.team_b}`)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 whitespace-nowrap"
              >
                <Play className="w-3 h-3" /> Watch in player
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground/70 mt-6">
        Every match plays inside the Ride X in-app player — no external redirects, no leaving the app.
      </p>
    </div>
  );
}