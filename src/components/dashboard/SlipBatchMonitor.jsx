import React from "react";
import { Layers, RefreshCw, Loader2 } from "lucide-react";
import { getBatches, settleSlipLedger } from "@/lib/slipLedger";

// 50-LEG BATCH MONITOR (admin) — every dealt SPECIAL ODDS ticket (football +
// basketball, incl. CHOP EBA), graded leg-by-leg against real final scores:
// legs won / lost / still open, whether the ticket is still alive, and the
// combined odds it was dealt at. Sits next to the weekly bankroll chart so
// the whole betting operation is visible on one screen.

const fmtOdds = (n) => (n >= 1000 ? Math.round(n).toLocaleString() : Number(n || 0).toFixed(1));

function statusOf(legs) {
  const losses = legs.filter((l) => l.status === "loss").length;
  const open = legs.filter((l) => l.status === "open").length;
  if (losses > 0) return { label: "BUSTED", cls: "bg-red-500/15 text-red-400" };
  if (open > 0) return { label: "ALIVE", cls: "bg-emerald-500/15 text-emerald-400" };
  return { label: "ALL LEGS WON", cls: "bg-primary/20 text-primary" };
}

export default function SlipBatchMonitor() {
  const [rows, setRows] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setBusy(true);
    try {
      await settleSlipLedger();
    } catch {}
    setRows(getBatches());
    setBusy(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Layers className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">50-Leg Batch Monitor</p>
          <p className="text-[10px] text-muted-foreground">
            Every dealt SPECIAL ODDS ticket, graded leg-by-leg against real final scores — a ticket stays ALIVE until one leg loses.
          </p>
        </div>
        <button
          onClick={load}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-[10px] font-bold text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          SETTLE
        </button>
      </div>

      {rows === null ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> Settling 50-leg batches against real results…
        </div>
      ) : !rows.length ? (
        <p className="text-[11px] text-muted-foreground px-1">
          No 50-leg batches recorded yet — the five SPECIAL ODDS tickets are logged here the moment the engine deals them.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.slice(0, 12).map((b) => {
            const wins = b.legs.filter((l) => l.status === "win").length;
            const losses = b.legs.filter((l) => l.status === "loss").length;
            const open = b.legs.filter((l) => l.status === "open").length;
            const st = statusOf(b.legs);
            return (
              <div key={b.batchId} className="rounded-xl bg-secondary/40 border border-border/50 px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">
                    {b.name} <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{b.sport}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Dealt {b.dealtAt} · {b.legs.length} legs · {fmtOdds(b.combinedOdds)} combined odds
                  </p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {wins}W / {losses}L / {open} still open
                  </p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-1 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[9px] text-muted-foreground/50">
        Legs settle on the full dealt pick (main market + padding picks) against real final scores from the same feeds the engines scanned. Never self-reported.
      </p>
    </div>
  );
}