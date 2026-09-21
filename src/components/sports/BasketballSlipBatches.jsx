import React from "react";
import { Loader2, RefreshCw, Target } from "lucide-react";
import SpecialSlipBatch from "@/components/sports/SpecialSlipBatch";
import { BB_BATCH_NAMES, dealBasketballSlips, scanBasketballPool } from "@/lib/basketballSlips";
import { cycleInfo } from "@/lib/dealtPickMemory";
import { recordBatches } from "@/lib/slipLedger";

// BASKETBALL SPECIAL ODDS — the football SPECIAL ODDS structure mirrored for
// basketball: next-7-days games only, verified form on both sides, H2H
// scrutinized, 94%+ picks padded with a second verified market, dealt
// exclusively across the five named tickets. Same persistent pick memory and
// 7-day cycle — after Day 7 the next day is a brand-new Day 1 automatically,
// and a pick never repeats on a later day, ticket, or cycle.

export default function BasketballSlipBatches() {
  const [pool, setPool] = React.useState(null);
  const [scanning, setScanning] = React.useState(true);
  const [active, setActive] = React.useState(0);

  const scan = React.useCallback(async (force = false) => {
    setScanning(true);
    try {
      setPool(await scanBasketballPool(force));
    } finally {
      setScanning(false);
    }
  }, []);

  React.useEffect(() => {
    scan();
  }, [scan]);

  const batches = React.useMemo(() => dealBasketballSlips(pool || []).batches, [pool]);

  // Log every dealt basketball ticket into the slip ledger so the admin
  // dashboard can monitor each batch's legs as the real games finish.
  React.useEffect(() => {
    recordBatches("basketball", batches);
  }, [batches]);

  const activeBatch = batches[active];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0"><Target className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">BASKETBALL SPECIAL ODDS SLIPS</p>
          <p className="text-[10px] text-muted-foreground">
            {batches.reduce((n, b) => n + b.legs.length, 0)} verified legs dealt into {BB_BATCH_NAMES.length} slips · next-7-days games only · never the same pick on two tickets · every leg padded with a 2nd verified market · H2H + scoring scrutiny · pick cycle day {cycleInfo().day}/7 — a new Day 1 starts automatically after Day 7
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
            {b.name.replace(" BBALL", "")} {b.legs.length > 0 && <span className={i === active ? "" : "text-primary"}>{b.legs.length}</span>}
          </button>
        ))}
      </div>

      {!scanning && batches.every((b) => b.legs.length === 0) && (
        <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-5 text-center">
          <p className="text-sm font-bold text-amber-400">NO VERIFIED BASKETBALL GAMES IN THE FEED THIS WEEK</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            The basketball fixture feed carries no games with verified results inside the next 7 days right now — the
            NBA season resumes in October. Nothing is dealt without verified form on both sides — the feed is
            re-scanned daily and the slips fill automatically the moment real fixtures appear.
          </p>
        </div>
      )}

      <SpecialSlipBatch
        key={activeBatch.name}
        name={activeBatch.name}
        legs={activeBatch.legs}
        scanning={scanning}
      />
    </div>
  );
}