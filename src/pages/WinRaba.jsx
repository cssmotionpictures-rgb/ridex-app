import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Star, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DayCard from "@/components/winraba/DayCard";
import AccaDialog from "@/components/winraba/AccaDialog";
import AccaList from "@/components/winraba/AccaList";
import AccaLab from "@/components/winraba/AccaLab";
import ScanReport from "@/components/winraba/ScanReport";
import BigHammerPanel from "@/components/winraba/BigHammerPanel";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import {
  buildWinRabaBoard, windowDateKeys, WR_LEAGUES,
} from "@/lib/winRaba";
import { recordWinRabaBoard, recordWinRabaAcca, settleWinRaba, getWinRabaStats } from "@/lib/winRabaLedger";
import { readWithRetry } from "@/lib/throttledRead";
import {
  recordEnginePicks, settleEnginePredictions, getEngineCalibration, getEngineWeights,
} from "@/lib/ensemble/store";

// WIN RABA — 5-day Morning + Evening rollover accumulator module.
// Completely separate from every existing RIDE X prediction tab: it reads the
// same verified data core but records and settles only in its own ledger.
export default function WinRaba() {
  const { toast } = useToast();
  const [board, setBoard] = React.useState(null);
  const [scan, setScan] = React.useState("idle"); // idle | scanning | ready | error
  const [progress, setProgress] = React.useState({ done: 0, total: WR_LEAGUES.length });
  const [topN, setTopN] = React.useState(3);
  const [dialog, setDialog] = React.useState(null); // { level, dateKey, candidates }
  const [busy, setBusy] = React.useState(false);
  const [accas, setAccas] = React.useState([]);
  // 429 handling: "Loading…" while the first acca read is pending, the honest
  // "Temporarily unavailable — retrying." state once retries exhaust, and the
  // last good accas kept on screen throughout — never a false empty.
  const [accasLoading, setAccasLoading] = React.useState(true);
  const [stats, setStats] = React.useState(null);
  const [results, setResults] = React.useState({});

  // Secondary ledger read — 429-aware: retry with backoff, keep the last good
  // accas on screen, never blank the list over a temporary throttle.
  const accasRetry = React.useRef(null);
  const [accasThrottled, setAccasThrottled] = React.useState(false);
  const loadAccas = async () => {
    try {
      const rows = await readWithRetry(() => base44.entities.WinRabaAcca.filter({}, "-created_date", 100));
      setAccas(rows || []);
      setAccasThrottled(false);
    } catch (e) {
      if (e?.isThrottle) {
        setAccasThrottled(true); // keep the last good accas — never []
        clearTimeout(accasRetry.current);
        accasRetry.current = setTimeout(loadAccas, 45000);
      }
    } finally {
      setAccasLoading(false);
    }
    };
  const loadStats = async () => setStats(await getWinRabaStats().catch(() => null));

  // Latest stored prediction per fixture — settled results show on the board,
  // and superseded rows show as UPDATED (history is never rewritten).
  const loadResults = async (windowStart) => {
    try {
      const rows = await readWithRetry(() =>
        base44.entities.WinRabaSelection.filter(
          { lagos_date_key: { $gte: windowStart || windowDateKeys()[0] } },
          "-created_date",
          500
        )
      );
      const byFx = {};
      (rows || []).forEach((r) => {
        const prev = byFx[r.fixture_id];
        if (!prev || (r.prediction_version || 1) >= (prev.prediction_version || 1)) byFx[r.fixture_id] = r;
      });
      setResults(Object.fromEntries(Object.entries(byFx).map(([k, r]) => [k, r.status])));
    } catch (e) {
      // a temporary throttle keeps the last good badges; a real failure clears them as before
      if (!e?.isThrottle) setResults({});
    }
  };

  // Settle finished games, then refresh badges, accas and the lab.
  const runSettle = async () => {
    try {
      await settleEnginePredictions().catch(() => null); // engine ledger grades from real results
      const res = await settleWinRaba();
      if (res && (res.settled || res.accas)) {
        await Promise.all([loadResults(), loadAccas(), loadStats()]);
      }
    } catch {
      // retried on the next visit
    }
  };

  const scanBoard = async (force = false) => {
    setScan("scanning");
    try {
      const st = stats || (await getWinRabaStats().catch(() => null));
      // The engine's learned state — calibration buckets and model weights
      // from settled history (honest null until the sample is meaningful).
      const [calibration, learnedWeights] = await Promise.all([
        getEngineCalibration().catch(() => null),
        getEngineWeights().catch(() => null),
      ]);
      const b = await buildWinRabaBoard({
        onProgress: (done, total) => setProgress({ done, total }),
        force,
        marketAdjust: st?.marketAdjust || {},
        calibration,
        learnedWeights,
      });
      setBoard(b);
      // Every selection permanently recorded before kickoff — versioned,
      // never overwritten (WIN RABA ledger + engine ledger).
      await Promise.all([
        recordWinRabaBoard(b.days),
        recordEnginePicks(b).catch(() => null),
      ]);
      await loadResults(b.windowStart);
      setScan("ready");
    } catch {
      setScan("error");
    }
  };

  React.useEffect(() => {
    scanBoard();
    loadAccas();
    loadStats();
    runSettle();
    return () => clearTimeout(accasRetry.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LAST-MINUTE UPDATE — a pre-kickoff refresh re-scan; a changed prediction
  // becomes Prediction Version 2 (Version 1 stays in the ledger).
  const lastMinuteRefresh = async () => {
    await scanBoard(true);
    toast({
      title: "Board refreshed",
      description: "Latest odds and form re-checked. Changed predictions are stored as Version 2 — the originals stay on record.",
    });
  };

  const openAcca = (level, day) => {
    const candidates =
      level === "rollover5"
        ? board.days.flatMap((d) => d.all).sort((a, b) => b.score - a.score) // ranked globally
        : level === "fullday"
        ? day.all
        : day[level];
    if (!candidates.length) {
      toast({ title: "NO QUALIFYING RIDE X PICKS", description: "The engine never lowers its threshold just to fill an accumulator." });
      return;
    }
    setDialog({ level, dateKey: level === "rollover5" ? board.windowStart : day.dateKey, candidates });
  };

  const confirmAcca = async (acca) => {
    setBusy(true);
    try {
      await recordWinRabaBoard(board.days); // members are on record before the acca is linked
      await recordWinRabaAcca(acca, dialog.dateKey);
      await loadAccas();
      toast({
        title: "Paper acca recorded",
        description: `Tracked in WIN RABA's own ledger. Stake ₦${acca.paperStake.toLocaleString()} · potential paper return ₦${acca.potentialReturn.toLocaleString()}.`,
      });
      setDialog(null);
    } catch {
      toast({ title: "Couldn't record the acca", description: "Check your connection and try again." });
    }
    setBusy(false);
  };

  const allPicks = board ? board.days.flatMap((d) => d.all) : [];

  return (
    <div>
      <PageHeader
        eyebrow="WIN RABA · Next 5 days"
        title="Morning + Evening rollover accumulator"
        subtitle="The engine analyzes the next five days, ranks its strongest qualifying predictions per Lagos session, and lets you choose how aggressively to combine them. Slots are never padded — if nothing qualifies, it says so."
        action={
          <Button variant="outline" className="rounded-full" onClick={lastMinuteRefresh} disabled={scan === "scanning"}>
            {scan === "scanning" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Last-minute refresh
          </Button>
        }
      />

      <Tabs defaultValue="board" className="space-y-5">
        <TabsList className="bg-transparent p-0 h-auto gap-1">
          {[
            ["board", "5-Day Board"],
            ["accas", `My Accas${accas.length ? ` (${accas.length})` : ""}`],
            ["lab", "Acca Lab"],
          ].map(([v, label]) => (
            <TabsTrigger
              key={v}
              value={v}
              className="rounded-full px-4 py-1.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="board" className="space-y-4">
          {scan === "scanning" && !board && (
            <div className="rounded-3xl border border-border/60 bg-card/70 p-10 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">
                Scanning verified fixtures across {progress.total} leagues… {progress.done}/{progress.total}
              </p>
            </div>
          )}
          {scan === "error" && (
            <div className="rounded-3xl border border-rose-500/30 bg-card/70 p-8 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-sm font-semibold">Couldn't build the board</p>
              <p className="text-xs text-muted-foreground">Check your connection and tap Last-minute refresh to try again.</p>
            </div>
          )}

          {board && (
            <>
              <ScanReport report={board.report} />

              <BigHammerPanel picks={board.bigHammer || []} results={results} />

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Show per session:</span>
                {[3, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTopN(n)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold border transition-colors ${
                      topN === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    TOP {n}
                  </button>
                ))}
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {allPicks.length} qualifying picks · window {board.windowStart} → {board.dates[board.dates.length - 1]} (rolls forward daily)
                </span>
              </div>

              {allPicks.length === 0 && scan === "ready" && (
                <div className="rounded-3xl border border-border/60 bg-card/70 p-10 text-center">
                  <p className="text-sm font-bold">NO QUALIFYING RIDE X PICKS.</p>
                  <p className="text-xs text-muted-foreground mt-1">The engine never lowers its threshold just to create an accumulator.</p>
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-4">
                {board.days.map((d) => (
                  <DayCard key={d.dateKey} day={d} topN={topN} results={results} onBuild={openAcca} />
                ))}
              </div>

              <div className="rounded-3xl border border-primary/30 bg-primary/5 p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> 5-DAY ROLLOVER</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The strongest qualifying selections across all five days, ranked globally — never every game blindly combined.
                    </p>
                  </div>
                  <Button
                    className="rounded-full font-bold shrink-0"
                    disabled={allPicks.length === 0}
                    onClick={() => openAcca("rollover5")}
                  >
                    BUILD 5-DAY ROLLOVER
                  </Button>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground px-1">
                ☀️ Morning / Day = kickoffs 00:00–16:59 Lagos · 🌙 Evening = 17:00–23:59 Lagos. All times shown in Africa/Lagos.
                WIN RABA is a prediction system, not a guarantee — qualifying pick is the strongest claim it ever makes.
              </p>
            </>
          )}
        </TabsContent>

        <TabsContent value="accas">
          <AccaList accas={accas} loading={accasLoading} throttled={accasThrottled} />
        </TabsContent>

        <TabsContent value="lab">
          <AccaLab stats={stats} />
        </TabsContent>
      </Tabs>

      <AccaDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        level={dialog?.level}
        dateKey={dialog?.dateKey}
        candidates={dialog?.candidates || []}
        busy={busy}
        onConfirm={confirmAcca}
      />
    </div>
  );
}