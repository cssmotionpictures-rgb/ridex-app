import React from "react";
import { Wallet, TrendingUp, Loader2, ShieldCheck, Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { scanSlipPools } from "@/lib/slipDealing";
import { attachRealOdds, oddsKey } from "@/lib/bookmakerOdds";
import { logBetAudit } from "@/lib/betAuditLog";

const BANKROLL_KEY = "ridex_pro_bankroll";

const RULES = [
  { t: "Value betting", d: "Only bet when the real bookmaker price pays MORE than the model's fair price — the engine surfaces exactly those legs below." },
  { t: "Bankroll 1%–2% rule", d: "Never stake more than 1–2% of your betting bankroll on one bet. Survive the losing streaks — set yours below." },
  { t: "Singles & doubles only", d: "Every extra leg multiplies the bookmaker's margin. Pros bet one or two matches per slip — not 20-leg lottery tickets." },
  { t: "Niche markets", d: "Corners, team points and scoring-rate markets are priced less carefully by bookmakers — that's where mistakes live." },
  { t: "No emotion", d: "The engine knows no favorites — only verified form, head-to-head and real scoring rates. Cold objectivity, every pick." },
];

function PickCard({ p, stake }) {
  const ro = p.ro;
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold truncate">{p.home} vs {p.away}</p>
          <p className="text-[10px] text-muted-foreground truncate">{p.date} · {p.league} · {p.marketLabel}</p>
        </div>
        <p className="font-heading font-extrabold text-primary text-lg leading-none shrink-0">{ro.price.toFixed(2)}</p>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>Model {Math.round((p.probability || 0) * 100)}%</span>
        <span>Book implied {Math.round((ro.implied || 0) * 100)}%</span>
        <span className="text-emerald-400 font-semibold">Edge +{ro.edgePct} pts</span>
        <span className="text-emerald-400 font-semibold">EV +{ro.evPct}%</span>
        <span>{ro.bookmaker}</span>
      </div>
      {stake > 0 && (
        <p className="text-[10px] text-foreground/80 font-semibold">Suggested stake (bankroll rule): ₦{stake.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
      )}
    </div>
  );
}

export default function ProPlaybook() {
  const [bankroll, setBankroll] = React.useState("");
  const [pct, setPct] = React.useState(1);
  const [picks, setPicks] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const saved = localStorage.getItem(BANKROLL_KEY);
    if (saved) setBankroll(saved);
  }, []);

  React.useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      try {
        const { deep } = await scanSlipPools();
        const legs = (deep || []).flatMap((g) =>
          (g.cands || []).map((c) => ({
            date: g.date,
            home: g.home,
            away: g.away,
            league: g.league,
            marketLabel: c.label,
            probability: c.prob,
            fairOdds: c.prob ? 1 / c.prob : null,
          }))
        );
        const { map } = await attachRealOdds(legs);
        const valued = legs
          .map((l) => ({ ...l, ro: map.get(oddsKey(l)) }))
          .filter((l) => l.ro && !l.ro.status && Number(l.ro.edgePct) > 0)
          .sort((a, b) => (b.ro.evPct || 0) - (a.ro.evPct || 0));
        if (live) setPicks(valued);
      } catch {
        if (live) setPicks([]);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const setBank = (v) => {
    const prev = Math.max(0, Number(bankroll) || 0);
    const next = Math.max(0, Number(v) || 0);
    setBankroll(v);
    localStorage.setItem(BANKROLL_KEY, v);
    if (next !== prev) {
      logBetAudit({
        type: "bankroll_adjustment",
        sport: "bankroll",
        match: "Pro Playbook bankroll",
        market: `${pct}% stake rule bankroll set`,
        bankrollBefore: prev,
        bankrollAfter: next,
        notes: "pro playbook bankroll updated",
      });
    }
  };
  const bankNum = Math.max(0, Number(bankroll) || 0);
  const stake = bankNum * (pct / 100);
  const singles = [];
  for (const p of picks || []) {
    if (singles.length >= 3) break;
    if (!singles.some((q) => q.home === p.home && q.away === p.away)) singles.push(p);
  }
  const double = (picks || []).filter((p) => !singles.some((q) => q.home === p.home && q.away === p.away));
  const doubleLegs = [];
  for (const p of double) {
    if (doubleLegs.length >= 2) break;
    if (!doubleLegs.some((q) => q.home === p.home && q.away === p.away)) doubleLegs.push(p);
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0"><Calculator className="w-4 h-4" /></div>
        <div className="min-w-0">
          <p className="text-sm font-bold">PRO PLAYBOOK — BET LIKE A BUSINESS</p>
          <p className="text-[10px] text-muted-foreground">The five rules professional bettors actually follow, applied to this engine's verified pool with real bookmaker prices.</p>
        </div>
      </div>

      <div className="grid gap-1.5">
        {RULES.map((r) => (
          <div key={r.t} className="flex gap-2 rounded-xl bg-secondary/40 border border-border/40 px-3 py-2">
            <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold">{r.t}</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{r.d}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <p className="text-xs font-bold">BANKROLL MANAGER — THE 1%–2% RULE</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Your betting bankroll (₦)</p>
            <Input
              type="number"
              min="0"
              className="h-9 rounded-lg text-sm"
              value={bankroll}
              onChange={(e) => setBank(e.target.value)}
              placeholder="e.g. 10000"
            />
          </div>
          <div className="flex gap-1 pb-0.5">
            {[1, 2].map((v) => (
              <button
                key={v}
                onClick={() => setPct(v)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${pct === v ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Maximum stake per bet: <span className="font-bold text-primary">₦{stake.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> — money you can afford to lose, never more.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <p className="text-xs font-bold">VALUE BETS — REAL PRICES PAYING ABOVE MODEL FAIR ODDS</p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-secondary/30 px-3 py-4 text-[11px] text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning the verified pool against the live bookmaker feed…
          </div>
        ) : singles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-secondary/30 px-3 py-4 text-[11px] text-muted-foreground">
            No value bets right now — the live bookmaker prices cover the pool's leagues but none currently pay above the model's fair odds. Value comes and goes with the market; the playbook updates with every scan. Nothing is shown without a REAL price.
          </div>
        ) : (
          <div className="space-y-2">
            {singles.map((p, i) => (
              <PickCard key={`s-${i}`} p={p} stake={stake} />
            ))}
            {doubleLegs.length === 2 && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] font-bold text-accent">TODAY'S DOUBLE — two value legs, one ticket</p>
                {doubleLegs.map((p, i) => (
                  <PickCard key={`d-${i}`} p={p} stake={stake} />
                ))}
                <p className="text-[10px] text-muted-foreground">
                  Combined odds {doubleLegs[0].ro.price.toFixed(2)} × {doubleLegs[1].ro.price.toFixed(2)} = {(doubleLegs[0].ro.price * doubleLegs[1].ro.price).toFixed(2)} · honest chance both win ≈ {Math.round((doubleLegs[0].probability || 0) * (doubleLegs[1].probability || 0) * 100)}%
                </p>
              </div>
            )}
          </div>
        )}
        <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
          Every price above is a REAL bookmaker quote (The Odds API feed); every percentage is the engine's model estimate from verified form — value betting pays over dozens of bets, never in any single one. Model probabilities, never guarantees.
        </p>
      </div>
    </div>
  );
}