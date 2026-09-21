import React from "react";
import { Gem, RefreshCw, Loader2, Ban, BadgeCheck } from "lucide-react";
import LegRow from "@/components/sports/LegRow";
import SlipSceneHeader from "@/components/sports/SlipSceneHeader";
import { scanSlipPools, getLiveNowPairs, liveNow } from "@/lib/slipDealing";
import { recordBankuDay } from "@/lib/bankuLedger";
import { attachRealOdds, oddsKey } from "@/lib/bookmakerOdds";
import { notifyValueOpportunities } from "@/lib/valueAlerts";

// KALA — THE DAILY VERIFIED 10 × 2.50. An EVERY-DAY, ONE-DAY drop built ONLY
// from scrutinized, confirmed, verified and qualified games:
//   · every candidate comes from the verified pools — verified form on BOTH
//     sides, head-to-head scrutiny, real scoring rates. Never a guess.
//   · a leg enters ONLY when the live bookmaker feed ACTUALLY quotes the
//     pick at 2.50 or better — a REAL captured price, never a model estimate.
//   · a pick the feed does not cover, or quotes under 2.50, NEVER enters —
//     no companion stacking, no model-priced legs, no padding of any kind.
// The drop is day-keyed: a new day always re-deals fresh. If fewer than 10
// games carry a real 2.50+ quote right now, the drop shows that honest count
// — quality before count, never an assumption.

export const KALA_LEGS = 10; // the drop's target game count
export const KALA_MAX_LEGS = 12; // a few more when the verified supply allows
export const KALA_MIN_PRICE = 2.5; // every leg's REAL price floor
const todayKey = () => new Date().toISOString().slice(0, 10);

export default function KalaSlip() {
  const [busy, setBusy] = React.useState(true);
  const [legs, setLegs] = React.useState(null);
  const [stats, setStats] = React.useState({ scanned: 0, games: 0, priced: 0 });
  const [feedError, setFeedError] = React.useState(null);

  const load = React.useCallback(async (force) => {
    setBusy(true);
    setFeedError(null);
    try {
      const [pools, liveSet] = await Promise.all([
        scanSlipPools(force),
        getLiveNowPairs().catch(() => new Set()),
      ]);
      // THE SUPPLY — every verified scrutinized pick across ALL pools (90%+
      // deep picks, market, live capture and the worldwide football pool),
      // deduped by (game, market) so the same pick never enters twice. Every
      // one of these candidates already passed the pools' scrutiny gates:
      // verified form on both sides, head-to-head checks, real scoring rates.
      const seen = new Set();
      const candidates = [];
      // ONE-WEEK WINDOW — a one-day drop never carries far-future fixtures:
      // only games kicking off within the next 7 days enter, the exact same
      // window as the shared deal.
      const todayStr = new Date().toISOString().slice(0, 10);
      const cutoffStr = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const inWeek = (d) => !!d && d >= todayStr && d <= cutoffStr;
      const push = (c) => {
        const k = oddsKey(c);
        if (!c.marketLabel || !inWeek(c.date) || seen.has(k)) return;
        seen.add(k);
        c.live = liveNow(liveSet, c.home, c.away);
        candidates.push(c);
      };
      for (const p of pools.deep || []) {
        push({
          date: p.date, home: p.home, away: p.away, league: p.league,
          marketLabel: p.marketLabel, prob: p.probability, fairOdds: p.fairOdds,
          h2h: p.h2h, reasons: p.reasons || [],
        });
      }
      for (const g of [...(pools.market || []), ...(pools.live || []), ...(pools.world || [])]) {
        const base = { date: g.date, home: g.home, away: g.away, league: g.league, h2h: g.h2h, reasons: [g.rates].filter(Boolean) };
        if (g.risky) push({ ...base, marketLabel: g.risky.label, prob: g.risky.prob });
        if (g.sugar) push({ ...base, marketLabel: g.sugar.label, prob: g.sugar.prob });
        if (g.seven) push({ ...base, marketLabel: g.seven.label, prob: g.seven.prob });
        for (const s of g.reals || []) push({ ...base, marketLabel: s.label, prob: s.prob });
      }

      // REAL PRICES — attach the live bookmaker feed once. A pick the feed
      // does not cover carries no price and can NEVER become a leg.
      // force on REFRESH — a user-forced re-deal must also bypass the cached
      // odds response (a stale "feed unavailable" answer otherwise hides the
      // fresh real prices behind the 10-minute client cache).
      // A FAILED feed is recorded as an explicit API_ERROR — it is NEVER
      // swallowed into an empty pool that masquerades as "no bookmaker
      // quoted". One paced retry absorbs transient platform throttles.
      let oddsRes = null;
      for (let attempt = 0; attempt < 2 && !oddsRes; attempt++) {
        const r = await attachRealOdds(candidates, { force: force === true }).catch((e) => ({
          providerStatus: "provider_error", providerMessage: String(e?.message || e), map: new Map(),
        }));
        if (r.providerStatus === "provider_error" && attempt === 0) {
          await new Promise((w) => setTimeout(w, 2500)); // paced retry
        } else {
          oddsRes = r;
        }
      }
      const realMap = oddsRes?.map || new Map();
      const feedFailed = oddsRes?.providerStatus === "provider_error" || oddsRes?.providerStatus === "missing_key";
      setFeedError(feedFailed ? (oddsRes?.providerMessage || "real bookmaker feed unreachable — API_ERROR") : null);
      const realOf = (c) => {
        const o = realMap.get(oddsKey(c));
        return o && o.price ? o : null;
      };

      // THE QUALIFICATION BAR — verified AND really priced: only a pick the
      // bookmaker ACTUALLY quotes at 2.50+ becomes a leg. Anything else —
      // uncovered picks, cheaper quotes — is dropped, never model-priced,
      // never stacked, never padded.
      const games = new Map();
      let priced = 0;
      for (const c of candidates) {
        const real = realOf(c);
        if (!real) continue;
        priced++;
        if (real.price < KALA_MIN_PRICE) continue;
        const k = `${c.date}|${c.home}|${c.away}`;
        if (!games.has(k)) games.set(k, []);
        games.get(k).push({ c, real });
      }

      // ONE LEG PER GAME — the surest verified pick the bookmaker really
      // quotes at 2.50+. One game, one leg, no duplicates.
      const all = [];
      for (const picks of games.values()) {
        picks.sort((a, b) => (Number(b.c.prob) || 0) - (Number(a.c.prob) || 0));
        const { c, real } = picks[0];
        all.push({
          date: c.date, home: c.home, away: c.away, league: c.league, h2h: c.h2h, live: c.live,
          marketLabel: c.marketLabel, prob: c.prob, fairOdds: c.fairOdds, real,
          odds: real.price, legProb: Number(c.prob) || 0,
          reasons: [
            ...(c.reasons || []),
            c.h2h ? `Head-to-head (${c.h2h})` : null,
            `REAL ${real.price.toFixed(2)} quote captured from ${real.bookmaker} — the bookmaker's own price, never a model estimate`,
            "Verified-pool pick — scrutinized form on both sides, head-to-head and real scoring rates. No assumption, no guess.",
          ].filter(Boolean),
        });
      }
      // TODAY'S GAMES LEAD (the one-day drop), then nearest kickoffs,
      // surest legs before the rest.
      const today = todayKey();
      all.sort((a, b) =>
        (a.date === today ? 0 : 1) - (b.date === today ? 0 : 1) ||
        String(a.date).localeCompare(String(b.date)) ||
        (b.legProb || 0) - (a.legProb || 0)
      );
      const dealt = all.slice(0, KALA_MAX_LEGS);
      setLegs(dealt);
      setStats({ scanned: candidates.length, games: games.size, priced });
      // Persist the DISPLAYED legs to the results ledger under the "kala" slip
      // so every leg settles against the real final score. Idempotent; a
      // failure never breaks the drop.
      if (dealt.length) {
        recordBankuDay(dealt, "kala").catch(() => {});
        // IN-BROWSER value alerts — real-priced legs the model rates above
        // the book's implied probability.
        notifyValueOpportunities(dealt.map((l) => ({ ...l, realOdds: l.real })));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => { load(false); }, [load]);

  const fmtOdds = (n) => (n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2));
  const combined = (legs || []).reduce((p, c) => p * (c.odds || 1), 1);
  const winProb = (legs || []).reduce((p, c) => p * (c.legProb || 0), 1);
  const todayCount = (legs || []).filter((l) => l.date === todayKey()).length;

  return (
    <div className="space-y-3">
      <SlipSceneHeader
        scene="football"
        kicker="RIDE X EVERY-DAY ONE-DAY DROP · SCRUTINIZED · CONFIRMED · VERIFIED · QUALIFIED"
        title="KALA — THE DAILY VERIFIED 10 × 2.50"
        badges={["VERIFIED POOLS ONLY", "EVERY LEG REAL ×2.50+", "TODAY'S GAMES LEAD", "NO MODEL PRICING"]}
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
        One drop every morning · only scrutinized, confirmed, verified and qualified games enter · a leg exists ONLY when the live bookmaker feed really quotes the pick at ×2.50 or better — a pick the feed does not cover, or quotes under 2.50, never enters, and a model estimate never prices a leg · today's games lead · the drop re-deals fresh every single day
      </p>

      {busy && !legs && (
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
          <p className="text-[11px] text-muted-foreground mt-2">Dealing today's verified ×2.50 games…</p>
        </div>
      )}

      {legs && (
        <>
          {legs.length > 0 && (
            <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <Gem className="w-4 h-4 text-primary" /> {todayKey()} DROP
                </p>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground inline-flex items-center gap-1">
                  <BadgeCheck className="w-3 h-3" /> {legs.length} GAMES · ALL REAL ×2.50+
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Games</p>
                  <p className="font-heading font-extrabold text-lg">{legs.length}<span className="text-sm text-muted-foreground font-bold"> · target {KALA_LEGS}</span></p>
                </div>
                <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Combined</p>
                  <p className="font-heading font-extrabold text-lg text-primary">{fmtOdds(combined)}</p>
                </div>
                <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Playing today</p>
                  <p className="font-heading font-extrabold text-lg">{todayCount}</p>
                </div>
                <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Real quotes scanned</p>
                  <p className="font-heading font-extrabold text-lg">{stats.priced.toLocaleString()}</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Every leg carries a REAL captured 2.50+ bookmaker quote — {stats.scanned.toLocaleString()} verified candidates were scanned across the scrutinized pools and only these cleared the real-price bar. A model estimate never masquerades as a bookmaker quote, and the drop is never padded.
                {legs.length < KALA_LEGS ? " Fewer than the 10-game target carry a real 2.50+ quote right now — the honest count is shown rather than padded." : ""}
                {" "}Estimated model probability ALL legs win ≈{" "}
                <span className="text-amber-400 font-semibold">1 in {Math.max(1, Math.round(1 / Math.max(winProb, 1e-12))).toLocaleString()}</span> — a
                mathematical model estimate, NOT a guarantee.
              </p>
            </div>
          )}

          {legs.length === 0 ? (
            feedError ? (
              <div className="rounded-2xl border border-dashed border-destructive/60 bg-destructive/10 px-4 py-5 text-center">
                <p className="text-sm font-bold text-red-400 flex items-center justify-center gap-1.5">
                  <Ban className="w-4 h-4" /> REAL PRICE FEED UNREACHABLE — API_ERROR
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  The live bookmaker feed could not be reached ({feedError}). No leg is EVER dealt without a real captured quote — the drop stays empty rather than padded with a guess or a model-priced leg. Tap REFRESH to retry the feed.
                </p>
              </div>
            ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-5 text-center">
              <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1.5">
                <Ban className="w-4 h-4" /> NO REAL-PRICED ×2.50 GAME IN THE VERIFIED POOL RIGHT NOW
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {stats.scanned.toLocaleString()} verified candidates were scanned; {stats.priced.toLocaleString()} carried a real bookmaker quote and none currently clears the ×2.50 bar. The drop is never padded with a guess, a model-priced leg or an assumption — the next scan brings games the moment they qualify.
              </p>
            </div>
            )
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card p-2">
              <div className="rounded-xl bg-black/30 border border-border/40 divide-y divide-border/30 max-h-80 overflow-y-auto no-scrollbar">
                {legs.map((p, i) => (
                  <LegRow
                    key={`${p.home}-${p.away}-${i}`}
                    leg={{
                      date: p.date, home: p.home, away: p.away, league: p.league,
                      marketLabel: p.marketLabel, probability: p.prob,
                      fairOdds: (Number(p.prob) || 0) > 0 ? 1 / p.prob : null,
                      realOdds: p.real, h2h: p.h2h, reasons: p.reasons, live: p.live,
                    }}
                    index={i}
                    odds={p.odds}
                    meta={
                      `${p.date !== todayKey() ? `plays ${p.date} · ` : "TODAY · "}${p.league} · ${p.marketLabel} · model ${Math.round((p.prob || 0) * 100)}%` +
                      ` · REAL ${Number(p.real.price).toFixed(2)} (${p.real.bookmaker})`
                    }
                  />
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground/70 text-center mt-1.5">
                Tap any leg — its verified pick, the real bookmaker quote and the full scrutinized analysis open inside.
              </p>
            </div>
          )}
        </>
      )}

      <p className="text-[9px] text-muted-foreground/50 text-center tracking-wider">RIDE X · KALA EVERY-DAY ONE-DAY DROP · SCRUTINIZED · CONFIRMED · VERIFIED · QUALIFIED · REAL ×2.50+ ONLY · NO GUARANTEES</p>
    </div>
  );
}