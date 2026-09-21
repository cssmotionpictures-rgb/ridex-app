import React from "react";
import { Sigma, RefreshCw, Loader2, ShieldAlert, BadgeCheck, Ban, Radio } from "lucide-react";
import LegRow from "@/components/sports/LegRow";
import { scanSlipPools, getLiveNowPairs, liveNow } from "@/lib/slipDealing";
import { attachRealOdds, prefetchRealOdds, oddsKey, ODDS_PROVIDER, ODDS_TTL_MINUTES } from "@/lib/bookmakerOdds";
import { optimizeAccumulator } from "@/lib/oddsMath";
import { getLastRawResponse } from "@/providers/odds/theOddsApi";

// REAL-ODDS ACCUMULATOR — the engine's flagship honest build. Every price on
// this ticket is a REAL bookmaker decimal price fetched live from the odds
// provider (bookmaker name + odds timestamp shown). Model probabilities, fair
// odds and edges are labeled MODEL ESTIMATES and never presented as bookmaker
// prices. Legs without a fresh real price are excluded — the engine refuses
// to manufacture prices to reach the target. Not a guarantee, ever.
//
// RESPONSIVENESS: the last computed ticket is cached at module level, so
// switching tabs and coming back renders INSTANTLY from the cache; the odds
// feed is prefetched in PARALLEL with the fixture scan (it used to run
// serially — pools, then odds); and the verified-candidate count is on
// screen the moment the scan lands, with the ticket updating the instant
// the odds feed answers.

const TARGET = 1000000;
const MAX_LEGS = 50;
const FRESH_MS = ODDS_TTL_MINUTES * 60 * 1000; // a cached ticket younger than the odds window is served as-is

// Module cache — survives tab switches (the reported tab-switch delay was
// the component throwing its result away on every unmount).
let lastRun = { date: "", at: 0, out: null };

const todayKey = () => new Date().toISOString().slice(0, 10);

// Every candidate pick from the verified pools (90%+ deep picks, the market
// pool's single markets, the LIVE capture's in-play picks, and every game's
// straight provider-priced markets), deduped by game+market.
function buildCandidates(pools) {
  const seen = new Set();
  const out = [];
  const push = (c) => {
    const k = oddsKey(c);
    if (!c.marketLabel || seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  for (const p of pools.deep || []) {
    push({
      date: p.date, home: p.home, away: p.away, league: p.league,
      marketLabel: p.marketLabel, prob: p.probability, fairOdds: p.fairOdds,
      h2h: p.h2h, reasons: p.reasons || [], src: "90%+ verified deep pool",
    });
  }
  // The worldwide pool (API-FOOTBALL) is scanned too — its leagues (MLS,
  // Brazil, Japan…) are covered by the odds provider, so those games can
  // carry real prices as well.
  for (const g of [...(pools.market || []), ...(pools.live || []), ...(pools.world || [])]) {
    const base = { date: g.date, home: g.home, away: g.away, league: g.league, h2h: g.h2h, reasons: [g.rates].filter(Boolean), src: g.live ? "live capture (in play)" : "verified market pool" };
    if (g.risky) push({ ...base, marketLabel: g.risky.label, prob: g.risky.prob });
    if (g.sugar) push({ ...base, marketLabel: g.sugar.label, prob: g.sugar.prob });
    if (g.seven) push({ ...base, marketLabel: g.seven.label, prob: g.seven.prob });
    for (const s of g.reals || []) push({ ...base, marketLabel: s.label, prob: s.prob, src: g.live ? "live capture (in play)" : "verified straight markets" });
  }
  return out;
}

function qualityLetter(leg) {
  if (!leg.real) return "D";
  if (leg.h2h && leg.real.books >= 4) return "A";
  if (leg.h2h || leg.real.books >= 3) return "B";
  return "C";
}

export default function RealOddsAccumulator() {
  const cached = lastRun.out && lastRun.date === todayKey() ? lastRun.out : null;
  const [busy, setBusy] = React.useState(!cached);
  const [out, setOut] = React.useState(cached);
  const [note, setNote] = React.useState(cached ? "" : "Verifying fixtures…");

  const run = React.useCallback(async (force = false) => {
    setBusy(true);
    if (!out) setNote("Verifying fixtures…");
    try {
      // ODDS PREFETCH — the live bookmaker feed starts loading NOW, in
      // parallel with the fixture scan (this used to be serial). The same
      // provider credits are spent either way — the shared backend cache
      // makes the final attach near-instant.
      prefetchRealOdds(undefined, { force }).catch(() => {});
      const pools = await scanSlipPools(force);
      const liveSet = await getLiveNowPairs().catch(() => new Set());
      const candidates = buildCandidates(pools);
      // Render-time LIVE flags — matches currently in progress.
      for (const c of candidates) c.live = liveNow(liveSet, c.home, c.away);
      // STAGE 1 — the verified candidate count is on screen the moment the
      // scan lands; the odds update renders as soon as the feed answers.
      setNote(`${candidates.length} verified candidates — fetching live bookmaker odds…`);
      const res = await attachRealOdds(candidates, { force });
      const qualified = [];
      const noOdds = [];
      for (const c of candidates) {
        const e = res.map.get(oddsKey(c));
        if (e && e.price) qualified.push({ ...c, real: e });
        else noOdds.push({ ...c, oddsStatus: e || { status: "odds_unavailable", reason: "no odds record" } });
      }

      // OPTIMIZER — real prices only, log-based (no overflow), one selection
      // per fixture, positive-EV requirement, trimmed toward the 1,000,000
      // target WITHOUT ever modifying an actual bookmaker price. The pure
      // implementation lives in @/lib/oddsMath.js and is covered by the
      // automated test suite.
      const opt = optimizeAccumulator(
        qualified.map((c) => ({ ...c, price: c.real.price, evPct: c.real.evPct })),
        { target: TARGET, maxLegs: MAX_LEGS, minLegs: 20, overshoot: 1.05 }
      );
      const chosen = opt.chosen;
      const rejected = opt.rejected;
      chosen.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
      const combined = opt.combined;
      const winProb = chosen.reduce((p, c) => p * (c.prob || 0), 1);
      const newOut = {
        chosen, rejected, noOdds, combined, winProb,
        providerStatus: res.providerStatus,
        missingKey: res.missingKey,
        providerMessage: res.providerMessage,
        credits: res.creditsRemaining,
        fetchedAt: res.fetchedAt,
        candidates: candidates.length,
      };
      lastRun = { date: todayKey(), at: Date.now(), out: newOut };
      setOut(newOut);
      setNote("");
    } catch {
      setNote("");
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    // Fresh enough → serve the cached ticket instantly, no refetch. Stale
    // or missing → refresh in the background.
    if (!cached || Date.now() - lastRun.at > FRESH_MS) run();
  }, [run]);

  const fmtOdds = (n) => (n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2));
  const diffPct = out ? (out.combined / TARGET - 1) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <Sigma className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">REAL-ODDS 50-GAME ACCUMULATOR</p>
          <p className="text-[10px] text-muted-foreground">
            Live bookmaker prices only · {ODDS_PROVIDER} feed · odds freshness {ODDS_TTL_MINUTES} min · one pick per game · positive-EV only · 1,000,000 target
          </p>
        </div>
        <button
          onClick={() => run(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {busy ? "FETCHING…" : "REFRESH ODDS"}
        </button>
      </div>

      {busy && out && note && (
        <p className="text-[10px] text-primary/90 px-1 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" /> {note}
        </p>
      )}

      {out && out.providerStatus === "missing_key" && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-sm font-bold text-red-400">REAL BOOKMAKER ODDS UNAVAILABLE</p>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The <span className="text-foreground font-semibold">{out.missingKey || "THE_ODDS_API_KEY"}</span> secret (The Odds API) is not set, so no real
            bookmaker price can be fetched. The engine <span className="text-foreground font-semibold">refuses to produce a real-odds accumulator or invent
            prices</span> — add the key in Settings → Secrets and press REFRESH ODDS. Model-estimate tickets stay available on the other tabs, clearly labeled.
          </p>
        </div>
      )}
      {out && out.providerStatus === "provider_error" && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-4">
          <p className="text-sm font-bold text-amber-400">ODDS PROVIDER ERROR</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            {out.providerMessage || "The odds provider did not respond."} No accumulator is produced from failed feeds — tap REFRESH ODDS to retry.
          </p>
        </div>
      )}

      {busy && !out && (
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
          <p className="text-[11px] text-muted-foreground mt-2">{note || "Verifying fixtures · fetching live bookmaker odds…"}</p>
        </div>
      )}

      {out && out.providerStatus === "ok" && (
        <>
          <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <BadgeCheck className="w-4 h-4 text-primary" /> ACCUMULATOR SUMMARY
              </p>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">REAL BOOKMAKER ODDS</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Selections</p>
                <p className="font-heading font-extrabold text-lg">{out.chosen.length}</p>
              </div>
              <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Combined real odds</p>
                <p className="font-heading font-extrabold text-lg text-primary">{fmtOdds(out.combined)}</p>
              </div>
              <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Target</p>
                <p className="font-heading font-extrabold text-lg">1,000,000</p>
              </div>
              <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Difference</p>
                <p className={`font-heading font-extrabold text-lg ${Math.abs(diffPct) <= 10 ? "text-emerald-400" : "text-amber-400"}`}>
                  {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}%
                </p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Combined odds = product of the {out.chosen.length} legs' REAL bookmaker prices. Estimated model probability ALL legs win ≈{" "}
              <span className="text-amber-400 font-semibold">1 in {Math.max(1, Math.round(1 / Math.max(out.winProb, 1e-12))).toLocaleString()}</span> — a
              mathematical model estimate, NOT a guarantee.
              {out.credits != null && <> · provider credits remaining: <span className="text-foreground font-semibold">{out.credits.toLocaleString()}</span></>}
              {out.fetchedAt && <> · odds fetched {new Date(out.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}
            </p>
          </div>

          {import.meta.env.DEV && (
            <details className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2">
              <summary className="text-[10px] font-bold text-muted-foreground cursor-pointer">DEV — raw provider data</summary>
              <pre className="text-[8px] text-muted-foreground overflow-x-auto mt-1 max-h-40 whitespace-pre-wrap noir-scrollbar">
                {JSON.stringify(getLastRawResponse()?.sports?.[0]?.events?.slice(0, 2) ?? null, null, 1)}
              </pre>
            </details>
          )}

          {out.chosen.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-5 text-center">
              <p className="text-sm font-bold text-amber-400">NO REAL-PRICED LEGS RIGHT NOW</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {out.noOdds.length} verified picks were scanned but none currently carries a fresh bookmaker price that clears the value bar — the engine
                publishes nothing rather than pricing legs itself.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card p-2">
              <div className="rounded-xl bg-black/30 border border-border/40 divide-y divide-border/30 max-h-72 overflow-y-auto no-scrollbar">
                {out.chosen.map((c, i) => (
                  <LegRow
                    key={`${c.date}-${c.home}-${c.away}-${i}`}
                    leg={{
                      date: c.date, home: c.home, away: c.away, league: c.league,
                      marketLabel: c.marketLabel, probability: c.prob, fairOdds: c.fairOdds,
                      h2h: c.h2h, reasons: [
                        ...c.reasons,
                        `Real price verified — ${c.real.bookmaker} @ ${c.real.price.toFixed(2)} (${c.real.books} books in feed, best price kept, never averaged)`,
                      ].filter(Boolean),
                      realOdds: c.real,
                      quality: qualityLetter(c),
                    }}
                    index={i}
                    odds={c.real.price}
                    meta={`${c.date} · ${c.league} · ${c.marketLabel} · model ${Math.round((c.prob || 0) * 100)}% · ${c.real.bookmaker} ${c.real.price.toFixed(2)} · EV ${c.real.evPct >= 0 ? "+" : ""}${c.real.evPct}%`}
                  />
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground/70 text-center mt-1.5">Tap any leg — the real bookmaker price, its timestamp and the full analysis open inside.</p>
            </div>
          )}
        </>
      )}

      {out && (out.rejected.length > 0 || out.noOdds.length > 0) && (
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
          <p className="text-[11px] font-bold flex items-center gap-1.5">
            <Ban className="w-3.5 h-3.5 text-muted-foreground" /> STRONGEST REJECTED CANDIDATES
          </p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
            {[
              ...out.rejected.slice(0, 10).map((r) => ({ ...r, hasPrice: true })),
              ...out.noOdds.slice(0, 10).map((c) => ({ c, reason: c.oddsStatus?.reason || "odds unavailable", hasPrice: false })),
            ].map((r, i) => (
              <div key={i} className="rounded-lg bg-secondary/30 border border-border/40 px-2.5 py-1.5">
                <p className="text-[10px] font-semibold truncate flex items-center gap-1.5">
                  {r.c.live && <Radio className="w-3 h-3 text-red-400 shrink-0 animate-pulse" />}
                  {r.c.home} vs {r.c.away} — {r.c.marketLabel}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {r.hasPrice ? `Model ${Math.round((r.c.prob || 0) * 100)}% · real ${r.c.real.price.toFixed(2)} · ` : ""}
                  REJECTED: {r.reason}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
            {out.candidates || 0} verified candidates scanned (incl. matches currently in progress) · {out.chosen.length} kept with fresh real prices · {out.rejected.length + out.noOdds.length} rejected
            (live in-play — pre-match prices suspended at kickoff, odds unavailable, stale, no value, duplicate fixture, league/market not covered, target reached). Nothing is ever priced by the engine itself.
          </p>
        </div>
      )}

      <p className="text-[9px] text-muted-foreground/50 text-center tracking-wider">RIDE X · REAL ODDS ENGINE · REAL PRICES IN · MODEL ANALYSIS SEPARATE · NO GUARANTEES</p>
    </div>
  );
}