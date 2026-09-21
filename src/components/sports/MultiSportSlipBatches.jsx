import React from "react";
import { Loader2, RefreshCw, Dices } from "lucide-react";
import SpecialSlipBatch from "@/components/sports/SpecialSlipBatch";
import TennisOddsAlerts from "@/components/sports/TennisOddsAlerts";
import { SLIP_SPORTS, dealSportSlips, scanSportPool } from "@/lib/multiSportSlips";
import { cycleInfo } from "@/lib/dealtPickMemory";
import { recordBatches } from "@/lib/slipLedger";

// MORE SPORTS SPECIAL ODDS — the same 50-leg slip engine as football and
// basketball, dealt for tennis, American football, baseball and ice hockey:
// next-7-days games only, verified form on both sides, H2H scrutinized, 94%+
// picks padded with a second verified market, dealt exclusively across the
// five named tickets per sport. Every ticket is logged into the batch ledger
// so the admin dashboard monitors its legs as the real games finish.

export default function MultiSportSlipBatches() {
  const [sportIdx, setSportIdx] = React.useState(0);
  const [pool, setPool] = React.useState(null);
  const [scanning, setScanning] = React.useState(true);
  const [active, setActive] = React.useState(0);
  const cfg = SLIP_SPORTS[sportIdx];

  const scan = React.useCallback(
    async (force = false) => {
      setScanning(true);
      try {
        setPool(await scanSportPool(cfg, force));
      } finally {
        setScanning(false);
      }
    },
    [cfg]
  );

  React.useEffect(() => {
    setPool(null);
    setActive(0);
    scan();
  }, [scan]);

  const batches = React.useMemo(() => dealSportSlips(pool || [], cfg).batches, [pool, cfg]);

  React.useEffect(() => {
    recordBatches(cfg.key, batches);
  }, [batches, cfg.key]);

  const activeBatch = batches[active];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0"><Dices className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">MORE SPORTS SPECIAL ODDS SLIPS</p>
          <p className="text-[10px] text-muted-foreground">
            {cfg.name} · {batches.reduce((n, b) => n + b.legs.length, 0)} verified legs dealt into {batches.length} slips · next-7-days games only · never the same pick on two tickets · every leg padded with a 2nd verified market · H2H + scoring scrutiny · pick cycle day {cycleInfo().day}/7 — a new Day 1 starts automatically after Day 7
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

      {cfg.key === "tennis" && <TennisOddsAlerts />}

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {SLIP_SPORTS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setSportIdx(i)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${
              i === sportIdx ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {batches.map((b, i) => (
          <button
            key={b.name}
            onClick={() => setActive(i)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${
              i === active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {b.name.replace(` ${cfg.suffix}`, "")} {b.legs.length > 0 && <span className={i === active ? "" : "text-primary"}>{b.legs.length}</span>}
          </button>
        ))}
      </div>

      {!scanning && batches.every((b) => b.legs.length === 0) && (
        <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-5 text-center">
          <p className="text-sm font-bold text-amber-400">NO VERIFIED {cfg.name.toUpperCase()} GAMES IN THE FEED THIS WEEK</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            The {cfg.name} fixture feed carries no games with verified results inside the next 7 days right now.
            Nothing is dealt without verified form on both sides — the feed is re-scanned daily and the slips fill
            automatically the moment real fixtures appear.
          </p>
        </div>
      )}

      <SpecialSlipBatch
        key={`${cfg.key}-${activeBatch.name}`}
        name={activeBatch.name}
        legs={activeBatch.legs}
        scanning={scanning}
      />
    </div>
  );
}