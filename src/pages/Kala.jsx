import React from "react";
import { Loader2, RefreshCw, AlertTriangle, Brain } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { buildWinRabaBoard, WR_LEAGUES, WR_MODEL_VERSION } from "@/lib/winRaba";
import { settleEnginePredictions, recordEnginePicks, getEngineCalibration, getEngineWeights } from "@/lib/ensemble/store";
import { recordObservations, settleObservations, captureClosingOdds } from "@/lib/ensemble/observations";
import { readWithRetry } from "@/lib/throttledRead";
import { recordChallengerObservations, captureLineupConfirmations } from "@/lib/ensemble/rx21";
import { challengerSummary, championChallengerComparison } from "@/lib/ensemble/rx21Core";
import { getProviderHealth } from "@/lib/ensemble/providerHealth";
import ModelObservationsSection from "@/components/kala/ModelObservationsSection";
import { loadKalaSettings, loadTracked, saveTracked } from "@/lib/kala";
import { walkForward } from "@/lib/ensemble/backtest";
import { getOddsDiagnostics } from "@/lib/bookmakerOdds";
import { useAuth } from "@/lib/AuthContext";
import CommandCenter from "@/components/kala/CommandCenter";
import MasterPicks from "@/components/kala/MasterPicks";
import BigHammerSection from "@/components/kala/BigHammerSection";
import RolloverSection from "@/components/kala/RolloverSection";
import ScanSection from "@/components/kala/ScanSection";
import AccaLabSection from "@/components/kala/AccaLabSection";
import LiveSection from "@/components/kala/LiveSection";
import CashoutSection from "@/components/kala/CashoutSection";
import EdgeSection from "@/components/kala/EdgeSection";
import PerformanceSection from "@/components/kala/PerformanceSection";
import CalibrationSection from "@/components/kala/CalibrationSection";
import HistorySection from "@/components/kala/HistorySection";
import ModelHealthSection from "@/components/kala/ModelHealthSection";
import SettingsSection from "@/components/kala/SettingsSection";
import AuditSection from "@/components/kala/AuditSection";

// KALA — the intelligence command center. A completely new, independent tab
// that READS the RX-2.0 engine, its immutable EnginePrediction ledger and the
// verified live-score feed without touching any existing RIDE X tab, slip,
// ledger or prediction. Removable without damaging anything.
const SECTIONS = [
  ["command", "COMMAND CENTER"],
  ["picks", "MASTER PICKS"],
  ["hammer", "BIG HAMMER"],
  ["rollover", "5-DAY ROLLOVER"],
  ["morning", "MORNING SCAN"],
  ["evening", "EVENING SCAN"],
  ["acca", "ACCUMULATOR LAB"],
  ["live", "LIVE INTELLIGENCE"],
  ["cashout", "CASHOUT INTEL"],
  ["edge", "EDGE LAB"],
  ["perf", "PERFORMANCE"],
  ["calib", "CALIBRATION"],
  ["history", "HISTORY"],
  ["health", "MODEL HEALTH"],
  ["settings", "SETTINGS"],
];
const ADMIN_SECTIONS = [
  ["obs", "MODEL OBSERVATIONS"],
  ["audit", "AUDIT"],
];

export default function Kala() {
  const { user } = useAuth();
  const isAdmin = String(user?.role || "").toLowerCase() === "admin";
  const [section, setSection] = React.useState("command");
  const [board, setBoard] = React.useState(null);
  const [scan, setScan] = React.useState("idle");
  const [progress, setProgress] = React.useState({ done: 0, total: WR_LEAGUES.length });
  const [preds, setPreds] = React.useState([]);
  const [obs, setObs] = React.useState([]);
  const [settings, setSettings] = React.useState(null);
  const [basket, setBasket] = React.useState([]); // fixtureId|marketKey keys
  const [tracked, setTracked] = React.useState(loadTracked);

  // Secondary ledger reads — 429-aware: retry with backoff, keep the last good
  // data on screen, never blank a panel over a temporary throttle. The primary
  // scan and every prediction board are completely unaffected by these reads.
  const [ledgerThrottled, setLedgerThrottled] = React.useState(false);
  const [ledgerLoading, setLedgerLoading] = React.useState(true);
  const ledgerRetry = React.useRef(null);
  const flagThrottle = (e) => {
    if (!e?.isThrottle) return;
    setLedgerThrottled(true);
    clearTimeout(ledgerRetry.current);
    ledgerRetry.current = setTimeout(() => {
      loadPreds();
      loadObs();
    }, 45000);
  };

  const loadPreds = async () => {
    try {
      const rows = await readWithRetry(() =>
        base44.entities.EnginePrediction.filter({ model_version: WR_MODEL_VERSION }, "-recorded_at", 1000)
      );
      setPreds(rows || []);
      setLedgerThrottled(false);
    } catch (e) {
      flagThrottle(e); // keep the last good predictions — never []
    }
  };

  const loadObs = async () => {
    try {
      const rows = await readWithRetry(() =>
        base44.entities.KalaModelObservation.filter({}, "-recorded_at", 1000)
      );
      setObs(rows || []);
      setLedgerThrottled(false);
    } catch (e) {
      flagThrottle(e);
    }
  };

  // CHAMPION / CHALLENGER SPLIT — RX-2.0 rows keep their own pure statistics;
  // RX-2.1 challenger rows are counted separately (research only, never bets).
  const obs20 = React.useMemo(() => (obs || []).filter((r) => r.model_version !== "RX-2.1"), [obs]);
  const obs21 = React.useMemo(() => (obs || []).filter((r) => r.model_version === "RX-2.1"), [obs]);
  const challenger = React.useMemo(
    () => ({
      summary: challengerSummary(obs21),
      comparison: championChallengerComparison(obs20, obs21),
      health: getProviderHealth().find((p) => p.provider === "api-football") || null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obs20, obs21, scan]
  );

  const scanBoard = async (force = false) => {
    setScan("scanning");
    try {
      const [calibration, learnedWeights] = await Promise.all([
        getEngineCalibration().catch(() => null),
        getEngineWeights().catch(() => null),
      ]);
      const b = await buildWinRabaBoard({
        onProgress: (done, total) => setProgress({ done, total }),
        force,
        calibration,
        learnedWeights,
      });
      setBoard(b);
      // The engine's own immutable recorder — idempotent, never rewrites history.
      await recordEnginePicks(b).catch(() => null);
      // MODEL OBSERVATIONS — every analyzed candidate (qualified OR rejected)
      // recorded as a research record. This NEVER lowers the qualification
      // gate and never manufactures selections.
      await recordObservations(b).catch(() => null);
      // RX-2.1 CHALLENGER — injury + lineup intelligence recorded in parallel
      // on the SAME candidates. Separate research rows; RX-2.0 (champion)
      // boards and ledgers untouched. Promotion only on out-of-sample evidence.
      await recordChallengerObservations(b, calibration).catch(() => null);
      await loadPreds();
      await loadObs();
      setScan("ready");
    } catch {
      setScan("error");
    } finally {
      setLedgerLoading(false);
    }
  };

  React.useEffect(() => {
    // PRIMARY FIRST — the board scan never waits on secondary ledger reads;
    // settlement and settings run in the background so their 429 retries can
    // never delay or blank the prediction surfaces.
    scanBoard();
    (async () => {
      await settleEnginePredictions().catch(() => null); // grade finished games from real results
      await settleObservations().catch(() => null); // grade research observations from real results
      await captureClosingOdds().catch(() => null); // pre-kickoff closing-price snapshots (never post-kickoff, never fabricated)
      await captureLineupConfirmations().catch(() => null); // confirmed lineups → NEW immutable RX-2.1 snapshot (:v2), never a rewrite
      await loadKalaSettings().then(setSettings).catch(() => {});
      await loadPreds();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => () => clearTimeout(ledgerRetry.current), []);

  // CLOSING-CAPTURE HEARTBEAT — while KALA is open, keep settling finished
  // observations and capturing pre-kickoff closing prices every 10 minutes,
  // so the closing price is effectively T-60/T-30/T-15/closest at real
  // visit frequency. No scheduler on this plan; nothing is fabricated — a
  // failed capture is recorded, a missing price stays missing.
  React.useEffect(() => {
    let busy = false;
    const beat = async () => {
      if (busy || scan === "scanning") return;
      busy = true;
      try {
        await settleObservations().catch(() => null);
        await captureClosingOdds().catch(() => null);
        await captureLineupConfirmations().catch(() => null);
        await loadObs();
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(beat, 10 * 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleBasket = (p) => {
    const k = `${p.fixtureId}|${p.marketKey}`;
    setBasket((b) => (b.includes(k) ? b.filter((x) => x !== k) : [...b, k]));
  };
  const toggleTrack = (p) => {
    setTracked((t) => {
      const next = t.includes(p.fixtureId) ? t.filter((x) => x !== p.fixtureId) : [...t, p.fixtureId];
      saveTracked(next);
      return next;
    });
  };

  // Latest ledger status per fixture+market — statuses shown on every board card.
  const results = {};
  (preds || []).forEach((r) => {
    const k = `${r.fixture_id}|${r.market_key}`;
    const prev = results[k];
    if (!prev || (r.prediction_version || 1) >= (prev.version || 1)) {
      results[k] = { status: r.status, version: r.prediction_version || 1 };
    }
  });
  const resultStatus = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.status]));

  const allPicks = board ? board.days.flatMap((d) => d.all) : [];
  // Engine audit inputs — walk-forward backtest over the settled ledger and
  // the live odds-transport diagnostics (admin-only AUDIT section).
  const backtest = React.useMemo(() => walkForward(preds), [preds]);
  const oddsDiag = React.useMemo(() => getOddsDiagnostics(), [scan]);
  const sections = isAdmin ? [...SECTIONS, ...ADMIN_SECTIONS] : SECTIONS;
  const status =
    scan !== "ready" ? "limited" :
    board?.oddsStatus && !["ok", "partial"].includes(board.oddsStatus) ? "limited" :
    (board?.report?.qualifying || 0) > 0 ? "active" : "noedge";

  return (
    <div>
      <PageHeader
        eyebrow="KALA · GLOBAL SPORTS INTELLIGENCE"
        title="KALA Command Center"
        subtitle="KALA does not need to predict every game. KALA identifies the games where the evidence is strongest and rejects everything else. NO BET IS A VALID MODEL DECISION."
        action={
          <Button variant="outline" className="rounded-full" onClick={() => scanBoard(true)} disabled={scan === "scanning"}>
            {scan === "scanning" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Final pre-kickoff refresh
          </Button>
        }
      />

      {/* Sticky KALA section navigation */}
      <div className="sticky top-[7.5rem] lg:top-16 z-40 -mx-1 px-1 py-2 bg-background/95 backdrop-blur-sm">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar scroll-pl-1">
          {sections.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`rounded-full px-3.5 py-2 text-[11px] font-bold whitespace-nowrap min-h-[36px] inline-flex items-center transition-colors ${
                section === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {key === "hammer" ? "🔨 " : key === "morning" ? "☀️ " : key === "evening" ? "🌙 " : ""}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {ledgerLoading && !ledgerThrottled && (
          <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-2 text-[11px] text-muted-foreground font-semibold">
            Loading ledger… predictions below are unaffected.
          </div>
        )}
        {ledgerThrottled && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-300 font-semibold">
            {preds.length || obs.length
              ? "Refreshing…"
              : "Ledger temporarily unavailable — retrying. Prediction boards are unaffected."}
          </div>
        )}
        {scan === "scanning" && !board && (
          <div className="rounded-3xl border border-border/60 bg-card/70 p-10 text-center space-y-3">
            <Brain className="w-8 h-8 text-primary mx-auto animate-pulse" />
            <p className="text-sm text-muted-foreground">
              SCANNING VERIFIED FIXTURES ACROSS {progress.total} LEAGUES… {progress.done}/{progress.total}
            </p>
          </div>
        )}
        {scan === "error" && (
          <div className="rounded-3xl border border-rose-500/30 bg-card/70 p-8 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-sm font-semibold">DATA SOURCE TEMPORARILY UNAVAILABLE</p>
            <p className="text-xs text-muted-foreground">Check your connection and tap the refresh button — nothing is fabricated in the meantime.</p>
          </div>
        )}

        {board && (
          <>
            {section === "command" && <CommandCenter board={board} preds={preds} status={status} />}
            {section === "picks" && (
              <MasterPicks
                picks={allPicks}
                results={resultStatus}
                settings={settings?.values}
                basket={basket}
                onToggleBasket={toggleBasket}
                tracked={tracked}
                onToggleTrack={toggleTrack}
              />
            )}
            {section === "hammer" && <BigHammerSection picks={board.bigHammer} results={resultStatus} />}
            {section === "rollover" && <RolloverSection board={board} results={resultStatus} />}
            {section === "morning" && <ScanSection session="morning" picks={allPicks} results={resultStatus} />}
            {section === "evening" && <ScanSection session="evening" picks={allPicks} results={resultStatus} />}
            {section === "acca" && <AccaLabSection board={board} settings={settings?.values} results={resultStatus} />}
            {section === "live" && <LiveSection preds={preds} />}
            {section === "cashout" && <CashoutSection preds={preds} settings={settings?.values} />}
            {section === "edge" && <EdgeSection picks={allPicks} preds={preds} />}
            {section === "perf" && <PerformanceSection preds={preds} throttled={ledgerThrottled} />}
            {section === "calib" && <CalibrationSection preds={preds} />}
            {section === "history" && <HistorySection preds={preds} throttled={ledgerThrottled} />}
            {section === "health" && <ModelHealthSection preds={preds} board={board} />}
            {section === "settings" && (
              <SettingsSection
                settings={settings}
                onSaved={(values) => setSettings((s) => ({ ...s, values }))}
              />
            )}
            {section === "obs" && isAdmin && (
              <ModelObservationsSection obs={obs20} promotionEligible={backtest?.promotion?.eligible} challenger={challenger} />
            )}
            {section === "audit" && isAdmin && (
              <AuditSection board={board} preds={preds} obs={obs20} backtest={backtest} diag={oddsDiag} challenger={challenger} />
            )}
          </>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-6">
        KALA is a prediction-intelligence system, not a guarantee engine. Every probability, score and edge comes from real calculations on verified data — model estimates are always labeled, and missing data is disclosed, never invented. PAPER MODE by default: ₦1,000 hypothetical stake, no real bets.
      </p>
    </div>
  );
}