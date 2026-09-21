import React from "react";
import { Loader2, Search, RefreshCw, TrendingUp } from "lucide-react";
import { XG_LEAGUES } from "@/lib/understatPlayers";

// PLAYER LEADERBOARD — season xG stats for every player in the selected league,
// searchable by name or club, sortable by the headline stats. Tapping a row
// opens that player's full profile with per-match trends.

const SORTS = [
  { k: "goals", label: "Goals" },
  { k: "xG", label: "xG" },
  { k: "assists", label: "Assists" },
  { k: "xA", label: "xA" },
];

const POS_LABEL = { F: "FWD", M: "MID", D: "DEF", G: "GK" };
const POS_STYLE = {
  F: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  M: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  D: "bg-sky-400/10 text-sky-300 border-sky-400/30",
  G: "bg-rose-400/10 text-rose-300 border-rose-400/30",
};

export default function PlayerLeaderboard({ players, loading, error, season, league, onLeague, onRetry, onSelect }) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("goals");

  const qn = q.trim().toLowerCase();
  const rows = React.useMemo(() => {
    const filtered = players.filter(
      (p) => !qn || String(p.name).toLowerCase().includes(qn) || String(p.team).toLowerCase().includes(qn)
    );
    filtered.sort((a, b) => (b[sort] - a[sort]) || b.goals - a.goals || String(a.name).localeCompare(String(b.name)));
    return filtered.slice(0, 30);
  }, [players, qn, sort]);

  const activeLeague = XG_LEAGUES.find((l) => l.slug === league);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {XG_LEAGUES.map((l) => (
          <button
            key={l.slug}
            type="button"
            onClick={() => onLeague(l.slug)}
            className={`rounded-full px-3.5 py-2 text-[11px] font-bold whitespace-nowrap min-h-[36px] inline-flex items-center transition-colors ${
              league === l.slug ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player or club…"
          className="w-full bg-secondary/60 border border-border/60 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
        {SORTS.map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => setSort(s.k)}
            className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold whitespace-nowrap transition-colors ${
              sort === s.k ? "bg-primary/20 text-primary border border-primary/50" : "bg-secondary text-muted-foreground border border-border/40 hover:text-foreground"
            }`}
          >
            TOP {s.label.toUpperCase()}
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
          {activeLeague?.label} · Season {season}/{String(season + 1).slice(2)}
        </span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading season player stats…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-5 text-center">
          <p className="text-sm font-bold text-rose-200">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary border border-border/60 px-4 py-2 text-xs font-bold hover:text-foreground"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="rounded-3xl border border-border/60 bg-card overflow-hidden">
          {rows.map((p, i) => (
            <button
              key={p.id || i}
              type="button"
              onClick={() => onSelect(p)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 border-t border-border/40 first:border-t-0 hover:bg-secondary/50 text-left"
            >
              <span className="text-xs font-extrabold text-muted-foreground w-5 text-center shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-bold truncate">{p.name}</span>
                  <span className={`shrink-0 inline-flex px-1.5 py-px rounded border text-[9px] font-extrabold ${POS_STYLE[p.position] || "bg-secondary text-muted-foreground border-border/40"}`}>
                    {POS_LABEL[p.position] || p.position}
                  </span>
                </span>
                <span className="block text-[10px] text-muted-foreground truncate">{p.team}</span>
              </span>
              <span className="flex items-center gap-2.5 shrink-0 tabular-nums">
                <span className="text-center">
                  <span className="block text-[9px] text-muted-foreground leading-none">G</span>
                  <span className="block text-sm font-extrabold leading-tight">{p.goals}</span>
                </span>
                <span className="text-center">
                  <span className="block text-[9px] text-muted-foreground leading-none">xG</span>
                  <span className="block text-sm font-extrabold text-primary leading-tight">{p.xG.toFixed(1)}</span>
                </span>
                <span className="text-center">
                  <span className="block text-[9px] text-muted-foreground leading-none">A</span>
                  <span className="block text-sm font-extrabold leading-tight">{p.assists}</span>
                </span>
                <span className="text-center hidden xs:block">
                  <span className="block text-[9px] text-muted-foreground leading-none">xA</span>
                  <span className="block text-sm font-extrabold text-accent leading-tight">{p.xA.toFixed(1)}</span>
                </span>
              </span>
            </button>
          ))}
          {rows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No players match “{q}” in this league.
            </p>
          )}
          {rows.length > 0 && (
            <p className="px-3 py-2.5 border-t border-border/40 text-[10px] text-muted-foreground">
              Tap any player for their full per-match expected-goals trend. xG = expected goals from shot quality — a raw public statistic, not a prediction.
            </p>
          )}
        </div>
      )}
    </div>
  );
}