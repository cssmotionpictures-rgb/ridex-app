import React from "react";
import { Link } from "react-router-dom";
import { Banknote, RefreshCw, Loader2, BadgeCheck, Radio, Ban } from "lucide-react";
import { getBanku, LEGS } from "@/components/sports/BankuSlip";

// BANKu — the dashboard's dedicated section for the daily drop: today's 15
// best picks, qualified, verified & scrutinized by the engine. It reads the
// SAME day-keyed deal the sports section deals (never a second opinion) and
// keeps the interface a clean list of only the top-tier qualified games.

export default function BankuDrop() {
  const [busy, setBusy] = React.useState(true);
  const [picks, setPicks] = React.useState(null);

  const load = React.useCallback(async (force) => {
    setBusy(true);
    try {
      setPicks(await getBanku(force));
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => { load(false); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const combined = (picks || []).reduce((p, c) => p * (1 / Math.max(c.prob || 0.01, 0.01)), 1);
  const sureCount = (picks || []).filter((p) => p.sure).length;
  const liveCount = (picks || []).filter((p) => p.live).length;
  const fmtOdds = (n) => (n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2));

  return (
    <div className="rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="size-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Banknote className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-extrabold">BANKu — TODAY'S VERIFIED 15</p>
          <p className="text-[11px] text-muted-foreground">
            The day's best picks · qualified, verified & scrutinized only · one best pick per game
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {busy ? "DEALING…" : "REFRESH"}
        </button>
      </div>

      {busy && !picks ? (
        <div className="rounded-2xl bg-black/30 border border-border/40 px-4 py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
          <p className="text-[11px] text-muted-foreground mt-2">
            Verifying today's fixtures — qualifying, scrutinizing, dealing the drop…
          </p>
        </div>
      ) : picks && picks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-black/20 px-4 py-5 text-center">
          <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1.5">
            <Ban className="w-4 h-4" /> NO QUALIFIED GAMES TODAY YET
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Nothing from today's fixtures has cleared verification and scrutiny so far — the drop
            appears the moment a game qualifies. The engine never pads the list.
          </p>
        </div>
      ) : picks ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Legs</p>
              <p className="font-heading font-extrabold text-lg">
                {picks.length}<span className="text-sm text-muted-foreground font-bold">/{LEGS}</span>
              </p>
            </div>
            <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Combined fair odds</p>
              <p className="font-heading font-extrabold text-lg text-primary">{fmtOdds(combined)}</p>
            </div>
            <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">90%+ verified</p>
              <p className="font-heading font-extrabold text-lg">{sureCount}</p>
            </div>
            <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Live now</p>
              <p className="font-heading font-extrabold text-lg flex items-center gap-1.5">
                {liveCount > 0 && <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />}{liveCount}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-black/30 border border-border/40 divide-y divide-border/30">
            {picks.map((p, i) => {
              const pct = Math.max(4, Math.min(100, Math.round((p.prob || 0) * 100)));
              return (
                <div key={`${p.home}-${p.away}-${i}`} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="text-[10px] font-bold text-muted-foreground w-5 text-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{p.home} vs {p.away}</p>
                    <p className="text-[9px] text-muted-foreground truncate flex items-center gap-1">
                      <span className="truncate">{p.league} · {p.marketLabel}</span>
                      {p.sure && <BadgeCheck className="w-2.5 h-2.5 text-primary shrink-0" />}
                      {p.live && <Radio className="w-2.5 h-2.5 text-red-400 animate-pulse shrink-0" />}
                    </p>
                  </div>
                  <div className="w-14 shrink-0">
                    <p className="text-[11px] font-bold text-right text-primary tabular-nums">{Math.round((p.prob || 0) * 100)}%</p>
                    <div className="h-1 rounded-full bg-secondary overflow-hidden mt-0.5">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <div className="flex items-center justify-between gap-2 mt-3">
        <p className="text-[9px] text-muted-foreground/70">
          {today} drop{picks && picks.length < LEGS ? ` · ${picks.length} qualified today — the list ships short rather than padded` : " · a fresh drop lands every day"}
        </p>
        <Link to="/sports" className="text-[10px] font-bold text-primary whitespace-nowrap hover:underline">
          Open full drop & analysis →
        </Link>
      </div>
    </div>
  );
}