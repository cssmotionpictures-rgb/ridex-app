import React from "react";
import { Loader2, Target, TrendingUp, CalendarDays } from "lucide-react";
import { getLedger, settleLedger } from "@/lib/pickLedger";
import { settleBankuPicks, getBankuHistory } from "@/lib/bankuLedger";
import { celebrateWin } from "@/lib/winCelebration";
import EngineSuccessRateChart from "@/components/sports/EngineSuccessRateChart";

// ACCURACY view — the board's daily predictions vs the REAL final scores.
// Every recorded pick is settled against the actual goals scored in the
// match (from the same fixture feed the engine scans), so the hit rate and
// calibration below are the engine's true measured performance over time —
// never self-reported, never manufactured.

const BADGE = {
  win: { label: "WIN", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  loss: { label: "LOSS", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  open: { label: "AWAITING KICKOFF", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  void: { label: "NO RESULT DATA", cls: "bg-secondary text-muted-foreground border-border/60" },
};

function AccuracyRow({ r }) {
  const settled = r.status === "win" || r.status === "loss";
  const b = BADGE[r.status] || BADGE.open;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground truncate">{r.home} vs {r.away}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {r.src && <span className="text-primary font-bold">{r.src} · </span>}
          {r.marketLabel} · {Math.round((r.probability || 0) * 100)}% model probability
          {r.predictedHome != null && r.predictedAway != null
            ? ` · model said ${r.predictedHome}-${r.predictedAway}`
            : ""}
        </p>
      </div>
      {settled && (
        <div className="text-right shrink-0">
          <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Final score</p>
          <p className="text-sm font-bold tabular-nums">{r.actualHome} – {r.actualAway}</p>
        </div>
      )}
      <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-bold ${b.cls}`}>{b.label}</span>
    </div>
  );
}

export default function EngineAccuracy() {
  const [rows, setRows] = React.useState(null);
  const [settledNow, setSettledNow] = React.useState(0);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      // Settle both ledgers first — the board's recorded picks AND the stored
      // BANKu / KALA daily drops — so the table shows every real recorded
      // pick, graded against the real final score. Every newly settled WIN
      // gets the full celebration (idempotent — a win celebrates exactly once).
      let ledgerRows = [];
      let settled = 0;
      const wins = [];
      try {
        const res = await settleLedger();
        ledgerRows = res.rows || [];
        settled += res.settled || 0;
        (res.wins || []).forEach((w) => wins.push(w));
      } catch {
        if (alive) setFailed(true);
        ledgerRows = getLedger();
      }
      try {
        const s = await settleBankuPicks();
        settled += s.settled || 0;
        (s.wins || []).forEach((w) => wins.push(w));
      } catch {}
      let dropRows = [];
      try {
        const [banku, kala] = await Promise.all([
          getBankuHistory(7, "banku").catch(() => []),
          getBankuHistory(7, "kala").catch(() => []),
        ]);
        dropRows = [...(banku || []), ...(kala || [])].map((r) => ({
          fixtureId: `drop-${r.id}`,
          date: r.date_key,
          home: r.home,
          away: r.away,
          league: r.league || "",
          marketLabel: r.market_label || "",
          probability: r.probability || 0,
          predictedHome: null,
          predictedAway: null,
          status: r.status || "open",
          actualHome: r.actual_home,
          actualAway: r.actual_away,
          src: r.slip === "kala" ? "KALA DROP" : "BANKu DROP",
        }));
      } catch {}
      if (alive) {
        setRows([...ledgerRows, ...dropRows]);
        setSettledNow(settled);
        wins.forEach((w) => celebrateWin({ home: w.home, away: w.away, market: w.market }));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!rows) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card px-4 py-8 flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <p className="text-xs">Settling recorded picks against real final scores…</p>
      </div>
    );
  }

  const decided = rows.filter((r) => r.status === "win" || r.status === "loss");
  const wins = decided.filter((r) => r.status === "win").length;
  const hitRate = decided.length ? wins / decided.length : null;
  const avgProb = decided.length
    ? decided.reduce((s, r) => s + (r.probability || 0), 0) / decided.length
    : null;
  // Calibration: how the engine's stated confidence compares to reality.
  const calib = hitRate != null && avgProb != null ? hitRate - avgProb : null;

  const byDate = {};
  for (const r of rows) {
    const k = r.date || "—";
    (byDate[k] = byDate[k] || []).push(r);
  }
  const days = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary shrink-0" />
          <p className="font-bold text-sm">ENGINE ACCURACY — PREDICTIONS vs FINAL SCORES</p>
          <span className="ml-auto text-[10px] text-muted-foreground">{rows.length} recorded</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-secondary/50 px-2 py-2 text-center">
            <p className="text-sm font-bold">{hitRate != null ? `${Math.round(hitRate * 100)}%` : "—"}</p>
            <p className="text-[9px] text-muted-foreground">real hit rate</p>
          </div>
          <div className="rounded-xl bg-secondary/50 px-2 py-2 text-center">
            <p className="text-sm font-bold">{wins}/{decided.length}</p>
            <p className="text-[9px] text-muted-foreground">won / settled</p>
          </div>
          <div className="rounded-xl bg-secondary/50 px-2 py-2 text-center">
            <p className="text-sm font-bold">{avgProb != null ? `${Math.round(avgProb * 100)}%` : "—"}</p>
            <p className="text-[9px] text-muted-foreground">avg stated probability</p>
          </div>
        </div>
        {calib != null && (
          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <TrendingUp className="w-3 h-3 text-primary shrink-0" />
            Calibration: the engine said {Math.round(avgProb * 100)}% on average and hit{" "}
            {Math.round(hitRate * 100)}% —{" "}
            <span className={calib >= 0 ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
              {calib >= 0 ? "outperforming its stated confidence" : "slightly below its stated confidence"}
            </span>
            . Settled from the real final scores, never self-reported.
          </p>
        )}
        {failed && (
          <p className="text-[10px] text-muted-foreground/70">
            Live settlement was interrupted — the table below shows the last settled state.
          </p>
        )}
        {settledNow > 0 && (
          <p className="text-[10px] text-emerald-400 font-semibold">
            {settledNow} new pick{settledNow !== 1 ? "s" : ""} settled against final scores just now.
          </p>
        )}
        {decided.length === 0 && (
          <p className="text-[10px] text-muted-foreground/70">
            Nothing has settled yet — recorded picks settle automatically here once their matches finish.
          </p>
        )}
      </div>

      <EngineSuccessRateChart rows={rows} />

      {days.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-6 text-center">
          <CalendarDays className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
          <p className="text-sm font-semibold">No predictions recorded yet</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Every pick you view on the 7-day board is tracked here automatically and graded against the real result.
          </p>
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
                  <span
                    className={`text-[10px] font-bold ${
                      dayWins === dayDecided.length
                        ? "text-emerald-400"
                        : dayWins === 0
                        ? "text-red-400"
                        : "text-amber-400"
                    }`}
                  >
                    {dayWins}/{dayDecided.length} won
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">{dayRows.length} picks · awaiting kickoff</span>
                )}
              </div>
              <div className="divide-y divide-border/40">
                {dayRows.map((r) => (
                  <AccuracyRow key={r.fixtureId} r={r} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}