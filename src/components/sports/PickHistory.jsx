import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, History, Target, Trophy, CalendarDays } from "lucide-react";

// Pick history — every engine pick the model has published, grouped by board
// day, shown NEXT TO the real match outcome once the match finishes. Settled
// records come straight from the EnginePick store (locked at kickoff, settled
// against the actual score) so the accuracy view is the engine's real record.

const STATUS_STYLES = {
  win: { label: "WIN", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  loss: { label: "LOSS", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  open: { label: "UPCOMING", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  locked: { label: "LIVE", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  void: { label: "VOID", cls: "bg-secondary text-muted-foreground border-border/60" },
  postponed: { label: "POSTPONED", cls: "bg-secondary text-muted-foreground border-border/60" },
};

function OutcomeRow({ r }) {
  const s = STATUS_STYLES[r.status] || STATUS_STYLES.open;
  const settled = r.status === "win" || r.status === "loss" || r.status === "void";
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground truncate">{r.home_team} vs {r.away_team}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {r.market_label || r.market_key} · {Math.round((r.probability || 0) * 100)}% model probability{r.local_time ? ` · ${r.local_time}` : ""}
        </p>
      </div>
      {settled && r.actual_home_goals != null && (
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-foreground/90">
          {r.actual_home_goals} – {r.actual_away_goals}
        </span>
      )}
      <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-bold ${s.cls}`}>{s.label}</span>
    </div>
  );
}

export default function PickHistory() {
  const [rows, setRows] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await base44.entities.EnginePick.filter({}, "-kickoff", 300);
        if (alive) setRows(list || []);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (failed) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-6 text-center">
        <p className="text-sm font-bold text-red-400">HISTORY UNAVAILABLE</p>
        <p className="text-[11px] text-muted-foreground mt-1">The pick records could not be loaded right now.</p>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card px-4 py-8 flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <p className="text-xs">Loading engine history…</p>
      </div>
    );
  }

  const decided = rows.filter((r) => r.status === "win" || r.status === "loss");
  const wins = decided.filter((r) => r.status === "win").length;
  const hitRate = decided.length ? wins / decided.length : null;
  const settledAccuracy = hitRate != null ? Math.round(hitRate * 100) : null;
  const avgProb = rows.length ? rows.reduce((s, r) => s + (r.probability || 0), 0) / rows.length : 0;

  const byDate = {};
  for (const r of rows) {
    const k = r.date_key || String(r.kickoff || "").slice(0, 10) || "—";
    (byDate[k] = byDate[k] || []).push(r);
  }
  const days = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary shrink-0" />
          <p className="font-bold text-sm">PICK HISTORY & ACCURACY</p>
          <span className="ml-auto text-[10px] text-muted-foreground">{rows.length} picks recorded</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-secondary/50 px-2 py-2 text-center">
            <Trophy className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
            <p className="text-sm font-bold mt-0.5">{settledAccuracy != null ? `${settledAccuracy}%` : "—"}</p>
            <p className="text-[9px] text-muted-foreground">settled hit rate</p>
          </div>
          <div className="rounded-xl bg-secondary/50 px-2 py-2 text-center">
            <p className="text-sm font-bold mt-5">{wins}/{decided.length}</p>
            <p className="text-[9px] text-muted-foreground">picks won / settled</p>
          </div>
          <div className="rounded-xl bg-secondary/50 px-2 py-2 text-center">
            <Target className="w-3.5 h-3.5 text-primary mx-auto" />
            <p className="text-sm font-bold mt-0.5">{Math.round(avgProb * 100)}%</p>
            <p className="text-[9px] text-muted-foreground">avg model probability</p>
          </div>
        </div>
        {decided.length === 0 && (
          <p className="text-[10px] text-muted-foreground/70">
            No picks have settled yet — outcomes appear here automatically once each match finishes.
          </p>
        )}
      </div>

      {days.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-6 text-center">
          <CalendarDays className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
          <p className="text-sm font-semibold">No picks recorded yet</p>
          <p className="text-[11px] text-muted-foreground mt-1">The engine stores every published pick here as soon as the board runs.</p>
        </div>
      ) : (
        days.map(([dateKey, dayRows]) => {
          const dayDecided = dayRows.filter((r) => r.status === "win" || r.status === "loss");
          const dayWins = dayDecided.filter((r) => r.status === "win").length;
          return (
            <div key={dateKey} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-secondary/40">
                <p className="text-[11px] font-bold tracking-wide">{dateKey}</p>
                {dayDecided.length > 0 ? (
                  <span className={`text-[10px] font-bold ${dayWins === dayDecided.length ? "text-emerald-400" : dayWins === 0 ? "text-red-400" : "text-amber-400"}`}>
                    {dayWins}/{dayDecided.length} won
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">{dayRows.length} picks · awaiting kickoff</span>
                )}
              </div>
              <div className="divide-y divide-border/40">
                {dayRows.map((r) => <OutcomeRow key={r.id || r.fixture_id} r={r} />)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}