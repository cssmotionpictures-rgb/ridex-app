import React from "react";
import { Zap, RefreshCw, Loader2 } from "lucide-react";
import SpecialSlipBatch from "@/components/sports/SpecialSlipBatch";
import { BATCH_NAMES, getWeekDeal } from "@/lib/slipDealing";
import { recordBatches } from "@/lib/slipLedger";
import { cycleInfo } from "@/lib/dealtPickMemory";
import PickCalendarSync from "@/components/sports/PickCalendarSync";
import { attachRealOdds, oddsKey } from "@/lib/bookmakerOdds";

// SPECIAL ODDS AUTO-BATCHING — the engine's qualified pool (verified form on
// both sides, last-5 head-to-head, scoring & conceding rates, and a
// verified corner-feed line where both sides have tracked history) is
// split into five named SportyBet-ready
// tickets. Each slip is filled sequentially from the surest games: 40–50
// legs, chained until the combined odds pass the 2,000,000 target (every leg
// padded with a second verified pick). One real ticket can't carry 169 games.

// Dealing lives in @/lib/slipDealing — the same deterministic deal is shared
// with the CHOP EBA / SUGAR / DRINK 7UP sections, so a game can never appear
// on two different tickets.

export default function SpecialSlipBatches({ picks }) {
  const [dealt, setDealt] = React.useState(null);
  const [scanning, setScanning] = React.useState(true);
  const [active, setActive] = React.useState(0);
  const picksRef = React.useRef(picks);
  picksRef.current = picks;

  // ONE SHARED DEAL (@/lib/slipDealing): the SPECIAL ODDS slips, CHOP EBA,
  // the market slips, BANKu and KALA all read the SAME day-keyed exclusive
  // deal, so a (game, market) pick never sits on two sections' tickets no
  // matter which component renders first. The bulk-build button forces a
  // fresh scan + re-deal on demand.
  const scan = React.useCallback(async (force = false) => {
    setScanning(true);
    try {
      setDealt(await getWeekDeal(force, picksRef.current || []));
    } finally {
      setScanning(false);
    }
  }, []);

  React.useEffect(() => {
    scan();
  }, [scan]);

  const batches = dealt?.specials || [];

  // REAL BOOKMAKER ODDS — every dealt leg is matched against the live odds feed
  // (best real price + bookmaker + timestamp). Legs the feed doesn't price
  // carry an explicit "unavailable" status — never a model number dressed up
  // as a bookmaker price.
  const [oddsMap, setOddsMap] = React.useState(null);
  const oddsLegs = React.useMemo(
    () =>
      dealt
        ? [
            ...dealt.specials.flatMap((b) => b.legs),
            ...dealt.chopPicks,
            ...["risky", "sugar", "seven"].flatMap((k) =>
              (dealt[k] || []).map(({ g, pick }) => ({ date: g.date, home: g.home, away: g.away, marketLabel: pick.label }))
            ),
          ]
        : [],
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
  // Log every 50-leg ticket (the five specials + CHOP EBA) into the slip
  // ledger so the admin dashboard can monitor each batch's legs as the real
  // games finish.
  React.useEffect(() => {
    if (dealt) recordBatches("football", [...dealt.specials, { name: "CHOP EBA", legs: dealt.chopPicks }]);
  }, [dealt]);
  const activeBatch = batches[active] || { name: BATCH_NAMES[0] || "SPECIAL ODDS", legs: [] };

  // Calendar-ready legs for the selected slip — kickoff events with the
  // corners line baked into the event title.
  const calendarPicks = (activeBatch?.legs || []).map((p) => ({
    ...p,
    kickoff: p.timestamp || (p.date ? `${p.date}T12:00:00Z` : null),
    marketLabel: `${p.marketLabel}${p.companion ? ` + ${p.companion.label}` : ""}${p.companion2 ? ` + ${p.companion2.label}` : ""}${p.corners ? ` + ${p.corners.label}` : ""}`,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0"><Zap className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">SPECIAL ODDS SLIPS</p>
          <p className="text-[10px] text-muted-foreground">
            {batches.reduce((n, b) => n + b.legs.length, 0)} verified legs dealt into {BATCH_NAMES.length} slips · next-7-days games only · never the same pick on two tickets · every game padded with a 2nd verified pick · verified corner stats cross-referenced · H2H + scoring scrutiny · pick cycle day {cycleInfo().day}/7 — a new Day 1 starts automatically after Day 7, fresh games every day
          </p>
        </div>
        <button
          onClick={() => scan(true)}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {scanning ? "BUILDING…" : "BULK-BUILD SLIPS"}
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {batches.map((b, i) => (
          <button
            key={b.name}
            onClick={() => setActive(i)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${i === active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            {b.name.replace(" SPECIAL ODDS", "")} {b.legs.length > 0 && <span className={i === active ? "" : "text-primary"}>{b.legs.length}</span>}
          </button>
        ))}
      </div>

      <SpecialSlipBatch
        key={activeBatch.name}
        name={activeBatch.name}
        legs={activeBatch.legs.map((l) => ({ ...l, realOdds: oddsMap?.get(oddsKey(l)) }))}
        scanning={scanning}
      />

      <PickCalendarSync picks={calendarPicks} />
    </div>
  );
}