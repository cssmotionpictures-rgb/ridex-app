import React from "react";
import PageHeader from "@/components/shared/PageHeader";
import PlayerLeaderboard from "@/components/playerstats/PlayerLeaderboard";
import PlayerProfile from "@/components/playerstats/PlayerProfile";
import { XG_LEAGUES, currentXgSeason, getXgLeaguePlayers } from "@/lib/understatPlayers";

// PLAYER xG DASHBOARD — season expected-goals stats for every player across
// the major leagues, with a search and a full per-match profile view.

export default function PlayerStats() {
  const [league, setLeague] = React.useState(XG_LEAGUES[0].slug);
  const [players, setPlayers] = React.useState([]);
  const [season, setSeason] = React.useState(currentXgSeason());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selected, setSelected] = React.useState(null);

  const load = React.useCallback(async (slug) => {
    setLoading(true);
    setError("");
    setPlayers([]);
    try {
      const r = await getXgLeaguePlayers(slug, currentXgSeason());
      setPlayers(r.players);
      setSeason(r.season);
    } catch (e) {
      setError(e?.message || "Player stats unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(league);
  }, [league, load]);

  return (
    <div>
      <PageHeader
        eyebrow="Stats Hub"
        title="Player xG Dashboard"
        subtitle="Season expected-goals and goal stats for every player — search any league, tap a player for their full match-by-match trend."
      />
      {selected ? (
        <PlayerProfile player={selected} season={season} onBack={() => setSelected(null)} />
      ) : (
        <PlayerLeaderboard
          players={players}
          loading={loading}
          error={error}
          season={season}
          league={league}
          onLeague={setLeague}
          onRetry={() => load(league)}
          onSelect={setSelected}
        />
      )}
    </div>
  );
}