import React from "react";
import { Loader2, RefreshCw, ListChecks, Utensils, Target, Flame, Candy, CupSoda } from "lucide-react";
import { getWeekDeal } from "@/lib/slipDealing";
import { legOdds } from "@/components/sports/SpecialSlipBatch";
import { cycleInfo } from "@/lib/dealtPickMemory";
import MarketSlipCard from "@/components/sports/MarketSlipCard";
import { attachRealOdds, oddsKey } from "@/lib/bookmakerOdds";

// CHOP EBA · SUGAR · DRINK 7UP — named market slips at fixed game counts, all
// built from the same verified season data as the SPECIAL ODDS pool (real
// fixtures, form on both sides, head-to-head scrutiny). One best pick per
// game per slip, no padding — the combined accumulator is shown per size.
//
// TAB ISOLATION — every section renders ONLY on its own tab: CHOP EBA shows
// the CHOP EBA slips, RISKY shows the risky combo slip, SUGAR and DRINK 7UP
// show theirs. No picks, odds or rollover-cycle data ever leak across tabs —
// each tab reads exactly its dealt array from the one shared exclusive deal.

// Exact pricing — a leg uses its REAL captured bookmaker price when the odds
// feed covers it, otherwise its exact model fair odds (1 ÷ probability).
// No invented bookmaker margin anywhere.
const legOf = (g, mk) => ({
  home: g.home,
  away: g.away,
  league: g.league,
  date: g.date,
  marketLabel: mk.label,
  prob: mk.prob,
  odds: 1 / mk.prob,
  h2h: g.h2h || null,
  reasons: [
    g.rates,
    g.h2h ? `Head-to-head (${g.h2h})` : null,
    g.h2hGoals != null ? `Last real meetings averaged ${g.h2hGoals.toFixed(1)} goals — the line was checked against it` : null,
  ].filter(Boolean),
});

function SizeChips({ sizes, value, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sizes.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
            value === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {s} GAMES
        </button>
      ))}
    </div>
  );
}

const SECTIONS = [
  { key: "chop", label: "CHOP EBA", icon: Utensils },
  { key: "risky", label: "RISKY", icon: Flame },
  { key: "sugar", label: "SUGAR", icon: Candy },
  { key: "seven", label: "DRINK 7UP", icon: CupSoda },
];

export default function MarketSlipSections() {
  const [rawDeal, setRawDeal] = React.useState(null);
  const [scanning, setScanning] = React.useState(true);
  const [section, setSection] = React.useState("chop");
  const [sel, setSel] = React.useState({ chop: 50, chopSingle: 50, risky: 10, sugar: 10, seven: 10 });

  // ONE SHARED DEAL (@/lib/slipDealing): the market slips, SPECIAL ODDS,
  // BANKu and KALA all read the SAME day-keyed exclusive deal — a (game,
  // market) pick never sits on two sections' tickets.
  const scan = React.useCallback(async (force = false) => {
    setScanning(true);
    try {
      setRawDeal(await getWeekDeal(force));
    } finally {
      setScanning(false);
    }
  }, []);

  React.useEffect(() => {
    scan();
  }, [scan]);

  const dealt = React.useMemo(
    () => rawDeal || { chopPicks: [], risky: [], sugar: [], seven: [], specials: [] },
    [rawDeal]
  );
  // REAL BOOKMAKER ODDS — each dealt leg is matched against the live odds feed
  // (real best price + bookmaker + timestamp); unmatched legs get an explicit
  // unavailable status, never a model number posing as a bookmaker price.
  const [oddsMap, setOddsMap] = React.useState(null);
  const oddsLegs = React.useMemo(
    () => [
      ...dealt.chopPicks,
      ...["risky", "sugar", "seven"].flatMap((k) =>
        dealt[k].map(({ g, pick }) => ({ date: g.date, home: g.home, away: g.away, marketLabel: pick.label }))
      ),
    ],
    [dealt]
  );
  React.useEffect(() => {
    if (!oddsLegs.length) return;
    let live = true;
    attachRealOdds(oddsLegs).then((r) => {
      if (live) setOddsMap(r.map);
    });
    return () => {
      live = false;
    };
  }, [oddsLegs]);
  // TWO PICKS PER GAME — each CHOP EBA leg carries its 90%+ main pick PLUS the
  // verified padding picks (2nd/3rd market at 90%+, H2H-checked) and the
  // verified corner-feed line, same as the SPECIAL ODDS slips. The combined
  // odds multiply per game, so 50 games chase the 1,000,000 target.
  const chop = dealt.chopPicks.map((p) => {
    const ro = oddsMap?.get(oddsKey(p));
    return {
      home: p.home,
      away: p.away,
      league: p.league,
      date: p.date,
      marketLabel: p.marketLabel,
      companion: p.companion,
      companion2: p.companion2,
      corners: p.corners,
      prob: p.probability,
      odds: legOdds({ ...p, realOdds: ro }), // real feed price for the main market when one exists
      realOdds: ro,
      h2h: p.h2h || null,
      reasons: p.reasons || [],
    };
  });
  // CHOP EBA single-pick variant — the same qualified games, but ONLY the one
  // best (90%+ verified) pick per game, no padding. Its own accumulator.
  const chopSingle = dealt.chopPicks.map((p) => {
    const ro = oddsMap?.get(oddsKey(p));
    return {
      home: p.home,
      away: p.away,
      league: p.league,
      date: p.date,
      marketLabel: p.marketLabel,
      prob: p.probability,
      odds:
        ro && !ro.status ? ro.price
        : Number(p.marketOdds) > 1 ? Number(p.marketOdds)
        : 1 / Math.max(0.01, p.probability || 0.5),
      realOdds: ro,
      h2h: p.h2h || null,
      reasons: p.reasons || [],
    };
  });
  const withOdds = (arr) =>
    arr.map(({ g, pick }) => {
      const ro = oddsMap?.get(oddsKey({ date: g.date, home: g.home, away: g.away, marketLabel: pick.label }));
      return { ...legOf(g, pick), odds: ro && !ro.status ? ro.price : 1 / pick.prob, realOdds: ro };
    });
  const risky = withOdds(dealt.risky);
  const sugar = withOdds(dealt.sugar);
  const seven = withOdds(dealt.seven);

  const counts = { chop: chopSingle.length, risky: risky.length, sugar: sugar.length, seven: seven.length };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <ListChecks className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">CHOP EBA · SUGAR · DRINK 7UP</p>
          <p className="text-[10px] text-muted-foreground">
            Fixed-count market slips · next-7-days games only · never the same pick twice across tickets · verified form both sides · H2H scrutinized · pick cycle day {cycleInfo().day}/7 — rolls to a new Day 1 automatically
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {scanning ? "SCANNING…" : "RESCAN"}
        </button>
      </div>

      {/* SECTION TABS — strictly isolated: only the open tab's data renders */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${
              section === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {counts[key] > 0 && <span className={`ml-0.5 ${section === key ? "" : "text-primary"}`}>{counts[key]}</span>}
          </button>
        ))}
      </div>

      {scanning && !rawDeal ? (
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
          <p className="text-[11px] text-muted-foreground mt-2">Deep-scanning verified season data across 23 leagues…</p>
        </div>
      ) : section === "chop" ? (
        <div className="space-y-3">
          {/* CHOP EBA — one best pick per game, single-pick accumulator */}
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                <Utensils className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">CHOP EBA</p>
                <p className="text-[10px] text-muted-foreground">
                  One best pick per game — 90%+ verified, confirmed deep-analysis picks only, never a guess · next 7 days only · {chopSingle.length} qualified games
                </p>
              </div>
            </div>
            <SizeChips sizes={[50, 30, 20, 10]} value={sel.chopSingle} onPick={(s) => setSel({ ...sel, chopSingle: s })} />
            <MarketSlipCard name="CHOP EBA" legs={chopSingle.slice(0, sel.chopSingle)} size={sel.chopSingle} />
          </div>

          {/* CHOP EBA PADDED — two picks per game, the 1,000,000 combination */}
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">CHOP EBA PADDED — 1,000,000 TARGET</p>
                <p className="text-[10px] text-muted-foreground">
                  Two picks per game — 90%+ main pick + its 2nd verified padding pick (90%+, H2H-checked — Over 1.5 and Over 0.5 are NEVER played together, the padding is always a non-redundant market) + verified corner line · next 7 days only, never the same pick as another ticket · {chop.length} qualified games
                </p>
              </div>
            </div>
            <SizeChips sizes={[50, 30, 20, 10]} value={sel.chop} onPick={(s) => setSel({ ...sel, chop: s })} />
            <MarketSlipCard name="CHOP EBA PADDED" legs={chop.slice(0, sel.chop)} size={sel.chop} target={1000000} />
          </div>
        </div>
      ) : section === "risky" ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-400">RISKY — OVER 2.5 + BTTS YES (padded combo)</p>
              <p className="text-[10px] text-muted-foreground">
                High-risk combo slip · verified scoring rates on both sides · never the same pick as another ticket · {risky.length} qualified games
              </p>
            </div>
          </div>
          <SizeChips sizes={[3, 5, 10, 15, 20]} value={sel.risky} onPick={(s) => setSel({ ...sel, risky: s })} />
          <MarketSlipCard name="CHOP EBA RISKY" legs={risky.slice(0, sel.risky)} size={sel.risky} />
        </div>
      ) : section === "sugar" ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <Candy className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">SUGAR</p>
              <p className="text-[10px] text-muted-foreground">
                Double chance &amp; home-win safety picks — H2H-contradiction-checked, never the same pick twice · {sugar.length} qualified games
              </p>
            </div>
          </div>
          <SizeChips sizes={[3, 5, 10, 15, 20, 30]} value={sel.sugar} onPick={(s) => setSel({ ...sel, sugar: s })} />
          <MarketSlipCard name="SUGAR" legs={sugar.slice(0, sel.sugar)} size={sel.sugar} />
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <CupSoda className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">DRINK 7UP</p>
              <p className="text-[10px] text-muted-foreground">
                1 &amp; 2 — straight home/away wins, H2H-contradiction-checked, never the same pick twice · {seven.length} qualified games
              </p>
            </div>
          </div>
          <SizeChips sizes={[5, 10, 15, 20, 30, 40]} value={sel.seven} onPick={(s) => setSel({ ...sel, seven: s })} />
          <MarketSlipCard name="DRINK 7UP" legs={seven.slice(0, sel.seven)} size={sel.seven} />
        </div>
      )}
    </div>
  );
}