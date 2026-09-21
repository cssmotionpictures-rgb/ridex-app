import React from "react";
import { History, Loader2 } from "lucide-react";
import { settleBankuPicks, getBankuHistory } from "@/lib/bankuLedger";
import { celebrateWin } from "@/lib/winCelebration";
import { resolveParticipantDisplay } from "@/lib/participantIdentity";

const BADGE = {
  win: { label: "WIN", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  loss: { label: "LOSS", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  open: { label: "AWAITING", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  void: { label: "NO RESULT", cls: "bg-secondary text-muted-foreground border-border/60" },
};

// LAST WEEK'S BANKu — every daily drop is stored in the results table and
// graded against the real final score, so the 15 games can be looked back on
// day by day. Wins settled just now fire the voice + badge celebration.
export default function BankuHistory() {
  const [rows, setRows] = React.useState(null);
  const [settledNow, setSettledNow] = React.useState(0);
  const [throttled, setThrottled] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const retryRef = { current: null };

    // 429-aware history read: retry with backoff, keep the last good week on
    // screen while retrying, and never blank this panel over a temporary
    // throttle. A real (non-429) failure empties the list exactly as before.
    const load = async () => {
      try {
        const hist = await getBankuHistory(7);
        if (!alive) return;
        setRows(hist);
        setThrottled(false);
      } catch (e) {
        if (!alive) return;
        if (e?.isThrottle) {
          setThrottled(true); // last good rows stay on screen — never []
          clearTimeout(retryRef.current);
          retryRef.current = setTimeout(load, 45000);
        } else {
          setRows([]);
        }
      }
    };

    (async () => {
      try {
        const s = await settleBankuPicks();
        if (!alive) return;
        setSettledNow(s.settled || 0);
        (s.wins || []).forEach((w) => celebrateWin({ home: resolveParticipantDisplay(w.home), away: resolveParticipantDisplay(w.away), market: resolveParticipantDisplay(w.market) }));
      } catch {}
      load();
    })();

    return () => {
      alive = false;
      clearTimeout(retryRef.current);
    };
  }, []);

  if (!rows) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card px-4 py-5 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <p className="text-[11px]">
          {throttled ? "Temporarily unavailable — retrying." : "Settling past BANKu drops against real final scores…"}
        </p>
      </div>
    );
  }

  const byDate = {};
  for (const r of rows) (byDate[r.date_key || "—"] = byDate[r.date_key || "—"] || []).push(r);
  const days = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <History className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">LAST WEEK'S BANKu — RESULTS</p>
          <p className="text-[10px] text-muted-foreground">
            Every daily drop is stored and graded against the real final score — look back day by day.
          </p>
        </div>
      </div>
      {settledNow > 0 && (
        <p className="text-[10px] text-emerald-400 font-semibold">
          {settledNow} pick{settledNow !== 1 ? "s" : ""} settled just now — wins celebrated with the full works.
        </p>
      )}
      {throttled && days.length > 0 && (
        <p className="text-[10px] text-amber-400 font-semibold">Refreshing…</p>
      )}
      {days.length === 0 ? (
        <p className="text-[11px] text-muted-foreground py-2">
          {throttled
            ? "Temporarily unavailable — retrying."
            : "No drops stored yet — today's drop is recorded automatically and results appear here as the games finish."}
        </p>
      ) : (
        days.map(([dateKey, dayRows]) => {
          const decided = dayRows.filter((r) => r.status === "win" || r.status === "loss");
          const wins = decided.filter((r) => r.status === "win").length;
          return (
            <div key={dateKey} className="rounded-xl bg-secondary/30 border border-border/40 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-black/20">
                <p className="text-[10px] font-bold tracking-wide">{dateKey}</p>
                {decided.length > 0 ? (
                  <span
                    className={`text-[9px] font-bold ${
                      wins === decided.length ? "text-emerald-400" : wins === 0 ? "text-red-400" : "text-amber-400"
                    }`}
                  >
                    {wins}/{decided.length} hit{decided.length < dayRows.length ? ` · ${dayRows.length - decided.length} awaiting` : ""}
                  </span>
                ) : (
                  <span className="text-[9px] text-muted-foreground">{dayRows.length} picks · awaiting kickoff</span>
                )}
              </div>
              <div className="divide-y divide-border/30">
                {dayRows.map((r) => {
                  const b = BADGE[r.status] || BADGE.open;
                  const settled = r.status === "win" || r.status === "loss";
                  return (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold truncate">{resolveParticipantDisplay(r.home)} vs {resolveParticipantDisplay(r.away)}</p>
                        <p className="text-[9px] text-muted-foreground truncate">
                          {resolveParticipantDisplay(r.market_label)} · {Math.round((r.probability || 0) * 100)}% model
                        </p>
                      </div>
                      {settled && (
                        <span className="text-[10px] font-bold tabular-nums shrink-0">
                          {r.actual_home}–{r.actual_away}
                        </span>
                      )}
                      <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[8px] font-bold ${b.cls}`}>{b.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}