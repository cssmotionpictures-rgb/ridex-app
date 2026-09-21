import React from "react";
import { Loader2, RefreshCw, AlertTriangle, Zap } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { buildWinRabaBoard, WR_LEAGUES } from "@/lib/winRaba";
import { settleObservations, recordObservations } from "@/lib/ensemble/observations";
import { recordChallengerObservations } from "@/lib/ensemble/rx21";
import { getEngineCalibration, getEngineWeights } from "@/lib/ensemble/store";
import { buildRunO, scanHealthOf } from "@/lib/runO";
import {
  recordRunOPicks, mirrorRunOSettlement, loadRunOPicks, loadRx21Enrichment, runoAnalytics,
} from "@/lib/runOLedger";
import ScanControls from "@/components/runo/ScanControls";
import TopBoards from "@/components/runo/TopBoards";
import AccaRunOSection from "@/components/runo/AccaRunOSection";
import WhyThesePicksPanel, { MarketEdgePanel } from "@/components/runo/WhyThesePicksPanel";
import { RiskFlagsPanel, DataHealthPanel, RejectedPanel } from "@/components/runo/RiskAndDataPanels";
import PerformanceDashboard from "@/components/runo/PerformanceDashboard";
import TrendCharts from "@/components/runo/TrendCharts";
import LearnedPanel from "@/components/runo/LearnedPanel";

// RUN O — the premium high-confidence prediction command center. A
// completely independent surface that READS the same verified RX-2.0
// infrastructure (ensemble board, immutable observations, global learning
// engine) without touching KALA, WIN RABA, BIG HAMMER, the rollover or any
// other prediction tab. Never forced: 0, 1 or 2 qualifying picks are all
// valid results — "NO QUALIFIED RUN O PICKS" is an honest outcome.
export default function RunO() {
  const [scan, setScan] = React.useState("idle");
  const [board, setBoard] = React.useState(null);
  const [windowKey, setWindowKey] = React.useState("today");
  const [session, setSession] = React.useState("all");
  const [progress, setProgress] = React.useState({ done: 0, total: WR_LEAGUES.length });
  const [enrichment, setEnrichment] = React.useState({});
  const [ledgerRows, setLedgerRows] = React.useState(null);
  const [insights, setInsights] = React.useState(null);

  const runo = React.useMemo(
    () => (board ? buildRunO(board, { windowKey, session }) : null),
    [board, windowKey, session]
  );
  const health = React.useMemo(
    () => (board && runo ? scanHealthOf(board, runo, enrichment) : null),
    [board, runo, enrichment]
  );
  const results = React.useMemo(() => {
    const m = {};
    (ledgerRows || []).forEach((r) => {
      const k = `${r.fixture_id}|${r.market_key}`;
      const prev = m[k];
      if (!prev || (r.prediction_version || 1) >= (prev.v || 1)) m[k] = { status: r.status, v: r.prediction_version || 1 };
    });
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.status]));
  }, [ledgerRows]);

  const loadSide = async () => {
    const rows = await loadRunOPicks().catch(() => []);
    setLedgerRows(rows || []);
    const ins = await base44.entities.GlobalLearningInsight.filter({}, "-updated_at", 30).catch(() => []);
    setInsights(ins || []);
  };

  const scanNow = async (force = false) => {
    setScan("scanning");
    try {
      const [calibration, learnedWeights] = await Promise.all([
        getEngineCalibration().catch(() => null),
        getEngineWeights().catch(() => null),
      ]);
      const b = await buildWinRabaBoard({
        force,
        calibration,
        learnedWeights,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setBoard(b);
      // Same immutable evidence infrastructure every section uses — idempotent.
      await recordObservations(b).catch(() => null);
      await recordChallengerObservations(b, calibration).catch(() => null);
      const enrich = await loadRx21Enrichment().catch(() => ({}));
      setEnrichment(enrich || {});
      // Record the RUN O daily board (full 5-day ranking) — immutable, versioned.
      const full = buildRunO(b, { windowKey: "5d", session: "all" });
      await recordRunOPicks(
        full.top8.map((p, i) => ({
          pick: p,
          rank: i + 1,
          correlation: (full.correlation || {})[`${p.fixtureId}|${p.marketKey}`] || "LOW",
        })),
        enrich
      ).catch(() => null);
      setScan("ready");
      loadSide();
    } catch {
      setScan("error");
    }
  };

  React.useEffect(() => {
    (async () => {
      await settleObservations().catch(() => null); // grade finished observations from verified results
      await mirrorRunOSettlement().catch(() => null); // RUN O rows mirror the authoritative settlement
      await scanNow(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="RUN O · RIDE X HIGH-CONFIDENCE PREDICTION COMMAND CENTER"
        title="RUN O"
        subtitle="The strongest-evidence individual predictions available worldwide — highest confidence, never a guarantee. If nothing qualifies, RUN O says so."
        action={
          <Button variant="outline" className="rounded-full" onClick={() => scanNow(true)} disabled={scan === "scanning"}>
            {scan === "scanning" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            FINAL PRE-KICKOFF REFRESH
          </Button>
        }
      />

      <ScanControls
        scan={scan}
        onScan={scanNow}
        windowKey={windowKey}
        setWindowKey={setWindowKey}
        session={session}
        setSession={setSession}
        progress={progress}
      />

      <div className="mt-4 space-y-4">
        {scan === "scanning" && !board && (
          <div className="rounded-3xl border border-border/60 bg-card/70 p-10 text-center space-y-3">
            <Zap className="w-8 h-8 text-primary mx-auto animate-pulse" />
            <p className="text-sm text-muted-foreground">
              SCANNING VERIFIED FIXTURES, ODDS, INJURIES AND LINEUPS ACROSS {progress.total} LEAGUES… {progress.done}/{progress.total}
            </p>
          </div>
        )}
        {scan === "error" && (
          <div className="rounded-3xl border border-rose-500/30 bg-card/70 p-8 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-sm font-semibold">DATA SOURCE TEMPORARILY UNAVAILABLE</p>
            <p className="text-xs text-muted-foreground">
              Check your connection and tap SCAN NOW — nothing is fabricated in the meantime.
            </p>
          </div>
        )}

        {board && runo && (
          <>
            <TopBoards runo={runo} results={results} enrichment={enrichment} />
            <AccaRunOSection top8={runo.top8} />
            <WhyThesePicksPanel picks={runo.top8} />
            <MarketEdgePanel picks={runo.top8} />
            <RiskFlagsPanel picks={runo.top8} />
            {health && <DataHealthPanel health={health} />}
            <RejectedPanel runo={runo} />
            <PerformanceDashboard rows={ledgerRows} loading={ledgerRows === null} />
            <TrendCharts rows={ledgerRows} loading={ledgerRows === null} />
            <LearnedPanel insights={insights} loading={insights === null} />
          </>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-6">
        RUN O is an intelligent high-confidence service, never a guarantee. Every selection is locked in before
        kickoff and graded only from the real final score. Missing information is always disclosed, never invented.
        RUN O tickets work with KALA → CASHOUT INTELLIGENCE — import a ticket there for a full cashout analysis.
        PAPER MODE by default: no real bets are ever placed.
      </p>
    </div>
  );
}