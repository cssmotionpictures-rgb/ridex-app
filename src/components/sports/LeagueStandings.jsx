import React from "react";
import { LEAGUES, getSeasonMatches, computeStandings, teamForm } from "@/lib/openFootball";
import { Loader2, X, Trophy } from "lucide-react";
import StatsUnavailableNotice from "./StatsUnavailableNotice";

// League tables computed fully in-browser from the openfootball season file
// (no api-football server function). Tap a team for its record + last-5 form.
export default function LeagueStandings() {
  const first = LEAGUES.find((l) => l.inBrowser);
  const [leagueKey, setLeagueKey] = React.useState(first.key);
  const [rows, setRows] = React.useState([]);
  const [allMatches, setAllMatches] = React.useState([]);
  const [season, setSeason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [detail, setDetail] = React.useState(null);

  const league = LEAGUES.find((l) => l.key === leagueKey);

  const load = React.useCallback(async () => {
    if (!league?.inBrowser) { setRows([]); return; }
    setLoading(true); setError("");
    try {
      const { matches, season: yr } = await getSeasonMatches(league.key);
      setAllMatches(matches); setSeason(yr);
      setRows(computeStandings(matches));
    } catch (e) {
      setError(e?.message || "Failed to load standings");
    } finally {
      setLoading(false);
    }
  }, [leagueKey]);

  React.useEffect(() => { load(); }, [load]);

  if (!league?.inBrowser) return <StatsUnavailableNotice />;

  const openTeam = (row) => setDetail({ row, form: teamForm(allMatches, row.team) });

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <select
          value={leagueKey}
          onChange={(e) => setLeagueKey(e.target.value)}
          className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary max-w-[65%]"
        >
          {LEAGUES.map((l) => (
            <option key={l.key} value={l.key}>{l.label}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{season ? `Season ${season.replace("-", "/")}` : ""}</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading {league.label} table…
        </div>
      )}

      {!loading && error && <StatsUnavailableNotice error={error} />}

      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="grid grid-cols-[24px_1fr_24px_24px_24px_24px_28px_28px] gap-1 px-2 py-2 bg-secondary text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            <span className="text-center">#</span>
            <span>Team</span>
            <span className="text-center">P</span>
            <span className="text-center">W</span>
            <span className="text-center">D</span>
            <span className="text-center">L</span>
            <span className="text-center">GD</span>
            <span className="text-center">Pts</span>
          </div>
          {rows.map((r, idx) => {
            const top4 = idx < 4;
            const bottom3 = idx >= rows.length - 3;
            return (
              <button
                key={r.team}
                onClick={() => openTeam(r)}
                className="grid grid-cols-[24px_1fr_24px_24px_24px_24px_28px_28px] gap-1 px-2 py-2 items-center text-xs w-full hover:bg-secondary/60 border-t border-border/40 text-left"
              >
                <span className={`text-center font-bold ${top4 ? "text-primary" : bottom3 ? "text-red-400" : "text-muted-foreground"}`}>{idx + 1}</span>
                <span className="truncate font-medium">{r.team}</span>
                <span className="text-center tabular-nums">{r.p}</span>
                <span className="text-center tabular-nums">{r.w}</span>
                <span className="text-center tabular-nums">{r.d}</span>
                <span className="text-center tabular-nums">{r.l}</span>
                <span className="text-center tabular-nums">{r.gd > 0 ? `+${r.gd}` : r.gd}</span>
                <span className="text-center font-bold tabular-nums">{r.pts}</span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No standings available for this league.</p>
        </div>
      )}

      {detail && <TeamDetailDialog detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function TeamDetailDialog({ detail, onClose }) {
  const r = detail.row;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-base">{r.team}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Played" value={r.p} />
          <Stat label="Points" value={r.pts} highlight />
          <Stat label="Wins" value={r.w} />
          <Stat label="Draws" value={r.d} />
          <Stat label="Losses" value={r.l} />
          <Stat label="Goal diff" value={r.gd > 0 ? `+${r.gd}` : r.gd} />
          <Stat label="Goals for" value={r.gf} />
          <Stat label="Goals against" value={r.ga} />
          <div className="col-span-2 rounded-lg p-2 bg-primary/10 border border-primary/30">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Form (last 5)</div>
            <div className="font-bold mt-0.5 text-primary tracking-[0.3em]">{detail.form}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`rounded-lg p-2 ${highlight ? "bg-primary/10 border border-primary/30" : "bg-secondary"}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-bold mt-0.5 ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}