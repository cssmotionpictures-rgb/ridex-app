import React from "react";
import { apiFootball, LEAGUES, currentSeason } from "@/lib/apiFootball";
import { Loader2, Goal, Hand } from "lucide-react";
import StatsUnavailableNotice from "./StatsUnavailableNotice";

export default function PlayerStats() {
  const [leagueId, setLeagueId] = React.useState(LEAGUES[0].id);
  const [scorers, setScorers] = React.useState([]);
  const [assists, setAssists] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    setScorers([]);
    setAssists([]);
    try {
      // sequence the two calls to avoid the per-minute rate limit
      const s = await apiFootball("players/topscorers", { league: leagueId, season: currentSeason() });
      await new Promise((r) => setTimeout(r, 600));
      const a = await apiFootball("players/topassists", { league: leagueId, season: currentSeason() });
      setScorers(s?.data?.response || []);
      setAssists(a?.data?.response || []);
      if (s?.error && a?.error) setError("Too many requests — try again in a minute.");
    } catch (e) {
      setError(e?.message || "Failed to load player stats");
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <select
          value={leagueId}
          onChange={(e) => setLeagueId(Number(e.target.value))}
          className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary max-w-[65%]"
        >
          {LEAGUES.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">Season {currentSeason()}/{currentSeason() + 1}</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading top scorers & assists…
        </div>
      )}

      {!loading && error && <StatsUnavailableNotice error={error} />}

      {!loading && !error && (scorers.length || assists.length) ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <PlayerList title="Top Scorers" icon={Goal} accent="text-primary" players={scorers} statKey="goals" />
          <PlayerList title="Top Assists" icon={Hand} accent="text-accent" players={assists} statKey="assists" />
        </div>
      ) : null}

      {!loading && !error && !scorers.length && !assists.length && (
        <div className="text-center py-10 text-muted-foreground">
          <Goal className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No player stats available for this league/season.</p>
        </div>
      )}
    </div>
  );
}

function PlayerList({ title, icon: Icon, accent, players, statKey }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-secondary">
        <Icon className={`w-4 h-4 ${accent}`} />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {players.slice(0, 15).map((p, i) => {
        const stat = p.statistics?.[0];
        const val = statKey === "goals" ? stat?.goals?.total : stat?.assists?.total;
        return (
          <div key={p.player?.id || i} className="flex items-center gap-2 px-3 py-2 border-t border-border/40">
            <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
            <img src={p.player?.photo} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" onError={(e) => e.target.style.visibility = "hidden"} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{p.player?.name}</div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                {stat?.team?.logo && <img src={stat.team.logo} alt="" className="w-3 h-3 object-contain" onError={(e) => e.target.style.visibility = "hidden"} />}
                <span className="truncate">{stat?.team?.name}</span>
              </div>
            </div>
            <span className={`text-lg font-extrabold ${accent} tabular-nums`}>{val ?? 0}</span>
          </div>
        );
      })}
    </div>
  );
}