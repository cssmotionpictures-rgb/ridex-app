import React from "react";
import { RefreshCw, Loader2, BadgeCheck, Radio, Ban } from "lucide-react";
import LegRow from "@/components/sports/LegRow";
import SlipSceneHeader from "@/components/sports/SlipSceneHeader";
import BankuCalendarSync from "@/components/sports/BankuCalendarSync";
import { recordBankuDay } from "@/lib/bankuLedger";
import { getWeekDeal, getLiveNowPairs, liveNow } from "@/lib/slipDealing";

// BANKu — THE MORNING DROP. One ticket every morning: the 15 BEST qualified
// picks of the day — TODAY's games fill the drop first, and when today runs
// short, the next days' nearest verified games fill it to 15. Every leg is
// qualified, verified and scrutinized before it can enter — verified form on
// both sides, head-to-head consulted, scrutiny bars cleared. The engine's
// 90%+ deep-pool picks are badged VERIFIED; every other leg is a qualifying
// market-pool or LIVE-captured pick that cleared its own scrutiny bar.

export const LEGS = 15;
const todayKey = () => new Date().toISOString().slice(0, 10);

let deal = { date: "", promise: null };

// THE ONE SHARED DEAL — BANKu now reads its legs from the same exclusive week
// deal as every other slip section (@/lib/slipDealing): the morning drop,
// KALA, the SPECIAL ODDS slips, CHOP EBA and the market slips are all dealt
// from ONE pool with ONE exclusivity set, so a pick that lands on the daily
// drop never appears on any other ticket — every tab carries its own distinct
// picks. Day-keyed: stable all day, fresh tomorrow (or on a forced refresh).
export function getBanku(force = false) {
  const today = todayKey();
  if (!force && deal.promise && deal.date === today) return deal.promise;
  deal = {
    date: today,
    promise: (async () => {
      const [weekDeal, liveSet] = await Promise.all([
        getWeekDeal(force),
        getLiveNowPairs().catch(() => new Set()),
      ]);
      const legs = weekDeal.banku || [];
      // Persist the day's drop to the results table — the weekly lookback
      // reads these rows. Idempotent upsert; a failure never breaks the drop.
      recordBankuDay(legs).catch(() => {});
      // An empty drop is never cached for the day — the next read rescans
      // (the shared deal above already refuses to cache a dead deal).
      if (!legs.length) deal.date = "";
      return legs.map((leg) => ({ ...leg, live: liveNow(liveSet, leg.home, leg.away) }));
    })().catch(() => {
      deal.date = ""; // failed read — retried on the next call, never cached empty
      return [];
    }),
  };
  return deal.promise;
}

export default function BankuSlip() {
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

  const fmtOdds = (n) => (n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2));
  const combined = (picks || []).reduce((p, c) => p * (1 / Math.max(c.prob || 0.01, 0.01)), 1);
  const winProb = (picks || []).reduce((p, c) => p * (c.prob || 0), 1);
  const sureCount = (picks || []).filter((p) => p.sure).length;
  const liveCount = (picks || []).filter((p) => p.live).length;

  return (
    <div className="space-y-3">
      <SlipSceneHeader
        scene="football"
        kicker="RIDE X DAILY DROP · QUALIFIED · VERIFIED · SCRUTINIZED"
        title="BANKu — THE MORNING 15"
        badges={["ONE DROP EVERY MORNING", "TODAY'S GAMES FIRST", "NEVER PADDED"]}
        right={
          <button
            onClick={() => load(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00e676] text-[#0b0e14] text-[10px] font-black whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {busy ? "DEALING…" : "REFRESH"}
          </button>
        }
      />
      <p className="text-[10px] text-muted-foreground px-1">
        Today's games first — next-day verified games fill it to 15 when today runs short · one best pick per game (a second scrutinized market fills it to exactly 15 when games run short)
      </p>

      {busy && !picks && (
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
          <p className="text-[11px] text-muted-foreground mt-2">Verifying today's fixtures — qualifying, scrutinizing, dealing the drop…</p>
        </div>
      )}

      {picks && (
        <>
          <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <BadgeCheck className="w-4 h-4 text-primary" /> {todayKey()} DROP
              </p>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">MODEL ESTIMATES</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Legs</p>
                <p className="font-heading font-extrabold text-lg">{picks.length}<span className="text-sm text-muted-foreground font-bold">/15</span></p>
              </div>
              <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Combined fair odds</p>
                <p className="font-heading font-extrabold text-lg text-primary">{fmtOdds(combined)}</p>
              </div>
              <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">90%+ verified legs</p>
                <p className="font-heading font-extrabold text-lg">{sureCount}</p>
              </div>
              <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Live now</p>
                <p className="font-heading font-extrabold text-lg flex items-center gap-1.5">
                  {liveCount > 0 && <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />}{liveCount}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Estimated model probability ALL legs win ≈{" "}
              <span className="text-amber-400 font-semibold">1 in {Math.max(1, Math.round(1 / Math.max(winProb, 1e-12))).toLocaleString()}</span> — a
              mathematical model estimate, NOT a guarantee. A fresh drop lands every day; this ticket never carries yesterday's games.
            </p>
          </div>

          {picks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-5 text-center">
              <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1.5">
                <Ban className="w-4 h-4" /> NO QUALIFIED GAMES IN THE DROP WINDOW YET
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Nothing in the coming days' fixtures has cleared verification and scrutiny yet — the drop appears the moment a game qualifies. The engine never pads the ticket.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card p-2">
              <div className="rounded-xl bg-black/30 border border-border/40 divide-y divide-border/30 max-h-80 overflow-y-auto no-scrollbar">
                {picks.map((p, i) => (
                  <LegRow
                    key={`${p.home}-${p.away}-${i}`}
                    leg={{
                      date: p.date, home: p.home, away: p.away, league: p.league,
                      marketLabel: p.marketLabel, probability: p.prob, fairOdds: 1 / Math.max(p.prob || 0.01, 0.01),
                      companion: p.companion, companion2: p.companion2, corners: p.corners,
                      h2h: p.h2h, reasons: p.reasons,
                    }}
                    index={i}
                    meta={`${p.date !== todayKey() ? `plays ${p.date} · ` : ""}${p.league} · ${p.marketLabel} · model ${Math.round((p.prob || 0) * 100)}%${p.sure ? " · 90%+ VERIFIED" : ""}${p.live ? " · LIVE NOW" : ""}`}
                  />
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground/70 text-center mt-1.5">
                Tap any leg — the full verified analysis behind the pick opens inside.
                {picks.length < LEGS && <> · {picks.length} qualified in the drop window — the ticket ships short rather than padded.</>}
              </p>
            </div>
          )}
        </>
      )}

      {picks && picks.length > 0 && <BankuCalendarSync picks={picks} />}

      <p className="text-[9px] text-muted-foreground/50 text-center tracking-wider">RIDE X · BANKu DAILY DROP · QUALIFIED · VERIFIED · SCRUTINIZED · NO GUARANTEES</p>
    </div>
  );
}