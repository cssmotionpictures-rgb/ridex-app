import React from "react";
import { LEAGUES, getSeasonMatches, getResults, getUpcoming } from "@/lib/openFootball";
import { Loader2, CalendarDays } from "lucide-react";
import StatsUnavailableNotice from "./StatsUnavailableNotice";

// Fixtures + results, fully in-browser (no api-football server function).
// Results are computed from the openfootball season file; upcoming fixtures
// come from TheSportsDB's free key. Non-openfootball leagues show the notice.
export default function FixturesList() {
  const first = LEAGUES.find((l) => l.inBrowser);
  const [leagueKey, setLeagueKey] = React.useState(first.key);
  const [view, setView] = React.useState("results"); // results | upcoming
  const [results, setResults] = React.useState([]);
  const [upcoming, setUpcoming] = React.useState([]);
  const [season, setSeason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const league = LEAGUES.find((l) => l.key === leagueKey);

  const load = React.useCallback(async () => {
    if (!league?.inBrowser) {
      setResults([]); setUpcoming([]); return;
    }
    setLoading(true); setError("");
    try {
      const { matches, season: yr } = await getSeasonMatches(league.key);
      setSeason(yr);
      setResults(getResults(matches));
      setUpcoming(await getUpcoming(league.tsd));
    } catch (e) {
      setError(e?.message || "Failed to load fixtures");
    } finally {
      setLoading(false);
    }
  }, [leagueKey]);

  React.useEffect(() => { load(); }, [load]);

  if (!league?.inBrowser) return <StatsUnavailableNotice />;

  const items = view === "upcoming" ? upcoming : results;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={leagueKey}
          onChange={(e) => setLeagueKey(e.target.value)}
          className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary max-w-[55%]"
        >
          {LEAGUES.map((l) => (
            <option key={l.key} value={l.key}>{l.label}</option>
          ))}
        </select>
        <div className="inline-flex rounded-lg border border-border/60 overflow-hidden">
          <button onClick={() => setView("results")} className={`px-3 py-1.5 text-xs font-medium ${view === "results" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>Results</button>
          <button onClick={() => setView("upcoming")} className={`px-3 py-1.5 text-xs font-medium ${view === "upcoming" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>Upcoming</button>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{view === "upcoming" ? "Live upcoming" : `Season ${season.replace("-", "/")}`}</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading {view === "upcoming" ? "upcoming" : "recent"} {league.label} fixtures…
        </div>
      )}

      {!loading && error && <StatsUnavailableNotice error={error} />}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No {view} fixtures found for {league.label}.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((m, i) => {
          const hasScore = m.score && m.score.ft;
          const [h, a] = hasScore ? m.score.ft : [null, null];
          return (
            <div key={i} className="rounded-xl border border-border/60 bg-card p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.team1}</div>
                <div className="text-sm font-medium truncate text-muted-foreground">{m.team2}</div>
              </div>
              <div className="text-center flex-shrink-0">
                {hasScore ? (
                  <div className="text-lg font-extrabold tabular-nums">{h} - {a}</div>
                ) : (
                  <div>
                    <div className="text-sm font-semibold tabular-nums">{m.date?.slice(5)}</div>
                    <div className="text-[10px] text-muted-foreground">{m.time || "TBD"}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}