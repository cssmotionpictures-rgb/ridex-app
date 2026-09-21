import React from "react";
import { Loader2, RefreshCw, Activity, Settings2, AlertTriangle } from "lucide-react";
import PredictionCard from "@/components/sports/PredictionCard";
import { buildClientBoard } from "@/lib/clientPredictionBoard";
import { invokeFunction, createRequestGuard, SLOW_PROVIDER_TIMEOUT_MS, SLOW_NOTICE_MS } from "@/lib/resilient";
import SectionErrorBoundary from "@/components/sports/SectionErrorBoundary";
import EngineAdminPanel from "@/components/sports/EngineAdminPanel";
import RolloverCalculator from "@/components/sports/RolloverCalculator";
import PickHistory from "@/components/sports/PickHistory";
import PickCalendarSync from "@/components/sports/PickCalendarSync";
import SpecialSlipBatches from "@/components/sports/SpecialSlipBatches";
import BasketballSlipBatches from "@/components/sports/BasketballSlipBatches";
import MultiSportSlipBatches from "@/components/sports/MultiSportSlipBatches";
import MarketSlipSections from "@/components/sports/MarketSlipSections";
import RealOddsAccumulator from "@/components/sports/RealOddsAccumulator";
import BankuSlip from "@/components/sports/BankuSlip";
import KalaSlip from "@/components/sports/KalaSlip";
import ValueAlertsPanel from "@/components/sports/ValueAlertsPanel";
import BankuHistory from "@/components/sports/BankuHistory";
import ProviderStatusPanel from "@/components/sports/ProviderStatusPanel";
import EngineAccuracy from "@/components/sports/EngineAccuracy";
import { recordPicks } from "@/lib/pickLedger";

const DAY_LABELS = ["TODAY", "TOMORROW", "DAY 3", "DAY 4", "DAY 5", "DAY 6", "DAY 7"];
const REFRESH_MS = 6 * 60 * 60 * 1000; // auto-update at least every 6 hours

// THE 80% CONFIDENCE BAR — the same verified bar KALA uses. The board only
// SHOWS picks at or above it; anything below stays off the board. The engine
// never pads a session with weaker picks, so a quiet session is an honest one.
const CONFIDENCE_BAR = 0.8;
const gated = (picks) => (picks || []).filter((p) => (Number(p.probability) || 0) >= CONFIDENCE_BAR);

// Every pick the board shows is recorded in the accuracy ledger so it can be
// graded later against the real final score (see the Accuracy tab).
const recordBoard = (b) => {
  try {
    const picks = (b?.days || []).flatMap((d) => [
      ...(d.morning?.picks || []),
      ...(d.evening?.picks || []),
    ]);
    if (picks.length) recordPicks(picks);
  } catch {}
};

function hhmm(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function SessionBlock({ title, picks }) {
  const qualified = gated(picks);
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">{title}</p>
      {qualified.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-5 text-center">
          <p className="text-sm font-bold text-amber-400">NO QUALIFYING PICK — 80% CONFIDENCE BAR NOT MET</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Nothing on this slate cleared the 80% model-confidence bar. The engine never manufactures or pads a pick — a quiet session is an honest one.
          </p>
        </div>
      ) : (
        qualified.map((p) => <PredictionCard key={p.fixtureId} pick={p} />)
      )}
    </div>
  );
}

// Inline board status card — the loading/timeout state lives INSIDE the board
// view, so the page shell, tabs and every other section keep working while
// the board's own data resolves. Never an indefinite full-page spinner.
function BoardStatusCard({ phase, slow, onRetry, refreshing }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card px-4 py-8 flex flex-col items-center gap-3 text-center">
      {phase === "loading" ? (
        <>
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm font-semibold">Loading real football data…</p>
          {slow ? (
            <p className="text-[11px] text-amber-400 max-w-sm leading-relaxed">
              Data providers are taking longer than usual. The board, slips and real odds below stay live — the 7-day board appears the moment the scan responds.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Fixtures · league tables · form · odds · ensemble · calibration</p>
          )}
        </>
      ) : (
        <>
          <AlertTriangle className="w-6 h-6 text-amber-400" />
          <p className="text-sm font-bold text-amber-400">BOARD DATA UNAVAILABLE RIGHT NOW</p>
          <p className="text-[11px] text-muted-foreground max-w-sm leading-relaxed">
            Some data sources are taking too long or are unreachable, so no board is shown — the engine never invents picks.
            The High-Odds Slips, Real Odds and Provider Status tabs each load their own data independently and stay fully usable.
          </p>
          <button
            onClick={onRetry}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Retry
          </button>
        </>
      )}
    </div>
  );
}

// 7-day prediction board — morning + evening top 4 from the model engine.
// All data comes from the server-side engine (real fixtures, real tables,
// real odds when available). Nothing here is fabricated.
//
// RESILIENCE: the shell and every tab render immediately; the board's data
// loads in the background under a hard 20s ceiling with a stale-response
// guard, one scan at a time. A slow or dead provider degrades only the board
// card — never the page.
export default function PredictionBoard({ user }) {
  const [board, setBoard] = React.useState(null);
  const [phase, setPhase] = React.useState("loading"); // loading | ready | failed
  const [slow, setSlow] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [dayIdx, setDayIdx] = React.useState(0);
  const [adminOpen, setAdminOpen] = React.useState(false);
  const [view, setView] = React.useState("board");
  const guard = React.useRef(createRequestGuard());
  const inFlight = React.useRef(false);

  const load = React.useCallback(async (force = false) => {
    // One scan at a time — the auto-refresh and the Retry button can never
    // stack overlapping requests or duplicate polling loops.
    if (inFlight.current) return;
    inFlight.current = true;
    const token = guard.current.begin();
    if (force) setRefreshing(true);
    setSlow(false);
    setPhase("loading");
    const slowTimer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);

    // ?engine=local forces the credit-free in-browser engine (also used automatically as fallback).
    const localOnly = new URLSearchParams(window.location.search).get("engine") === "local";
    let data = null;
    try {
      if (!localOnly) {
        try {
          const res = await invokeFunction("prediction-board", { action: force ? "refresh" : "board" }, { timeoutMs: SLOW_PROVIDER_TIMEOUT_MS });
          data = res?.data ?? res;
        } catch {
          // Backend slow/unreachable → in-browser fallback, bounded to 20s itself.
          try {
            data = await buildClientBoard();
          } catch {
            /* both paths failed — handled below */
          }
        }
      } else {
        try {
          data = await buildClientBoard();
        } catch {
          /* handled below */
        }
      }

      // A response from an older request never overwrites newer data.
      if (!guard.current.isCurrent(token)) return;

      if (data && !data.sourceDown) {
        setBoard(data);
        setPhase("ready");
        recordBoard(data);
      } else {
        setPhase("failed");
      }
    } finally {
      clearTimeout(slowTimer);
      inFlight.current = false;
      if (guard.current.isCurrent(token)) setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    // load() self-guards in-flight requests, so this interval can never
    // create overlapping scans.
    const id = setInterval(() => load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const boardReady = phase === "ready" && board && !board.sourceDown;
  const minProb = board?.config?.minProbability || 0.72;
  const f = board?.funnel || {};
  const totalPicks = boardReady
    ? (board.days || []).reduce((s, d) => s + gated(d.morning?.picks).length + gated(d.evening?.picks).length, 0)
    : 0;
  const day = board?.days?.[dayIdx] || { morning: { picks: [] }, evening: { picks: [] } };
  const perf = board?.performance;
  const updatedAt = board ? hhmm(board.updatedAt) : "";
  const allOpenPicks = boardReady
    ? gated((board.days || []).flatMap((d) => [...(d.morning?.picks || []), ...(d.evening?.picks || [])]))
    : [];

  return (
    <div className="space-y-4">
      {/* The shell + tabs render IMMEDIATELY — every view below loads its own
          data independently and a slow board never blocks any of them. */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setView("board")}
          className={`flex-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${view === "board" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
        >
          7-Day Board
        </button>
        <button
          onClick={() => setView("slips")}
          className={`flex-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${view === "slips" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
        >
          High-Odds Slips
        </button>
        <button
          onClick={() => setView("banku")}
          className={`flex-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${view === "banku" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
        >
          BANKu
        </button>
        <button
          onClick={() => setView("realodds")}
          className={`flex-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${view === "realodds" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
        >
          Real Odds
        </button>
        <button
          onClick={() => setView("history")}
          className={`flex-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${view === "history" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
        >
          Pick History
        </button>
        <button
          onClick={() => setView("accuracy")}
          className={`flex-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${view === "accuracy" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
        >
          Accuracy
        </button>
      </div>

      {view === "history" ? (
        <SectionErrorBoundary>
          <PickHistory />
        </SectionErrorBoundary>
      ) : view === "accuracy" ? (
        <SectionErrorBoundary>
          <EngineAccuracy />
        </SectionErrorBoundary>
      ) : view === "banku" ? (
        // BANKu — the morning 15-drop (today's games first, next-day verified
        // fill when today runs short) plus KALA — the daily verified 10 whose
        // every leg carries a REAL 2.50+ bookmaker quote (80%+ bar on top).
        // Both draw from the same verified, scrutinized pools.
        <div className="space-y-6">
          <SectionErrorBoundary>
            <BankuSlip />
          </SectionErrorBoundary>
          <SectionErrorBoundary>
            <KalaSlip />
          </SectionErrorBoundary>
          <SectionErrorBoundary>
            <BankuHistory />
          </SectionErrorBoundary>
        </div>
      ) : view === "realodds" ? (
        // REAL ODDS — this tab shows ONLY the real-prices accumulator: live
        // bookmaker prices fetched from the odds provider, model estimates
        // clearly separated, never confused — plus the live provider
        // diagnostics panel underneath. Both load independently of the board.
        <div className="space-y-4">
          <SectionErrorBoundary>
            <RealOddsAccumulator />
          </SectionErrorBoundary>
          <SectionErrorBoundary>
            <ProviderStatusPanel />
          </SectionErrorBoundary>
        </div>
      ) : view === "slips" ? (
        // HIGH-ODDS SLIPS — this tab shows ONLY the accumulator slips, so
        // every tab click shows exactly what its label says. Each component
        // scans its own verified data — none depends on the board.
        <div className="space-y-4">
          <SectionErrorBoundary>
            <SpecialSlipBatches picks={board?.slipPool?.length ? board.slipPool : allOpenPicks} />
          </SectionErrorBoundary>
          <SectionErrorBoundary>
            <BasketballSlipBatches />
          </SectionErrorBoundary>
          <SectionErrorBoundary>
            <MultiSportSlipBatches />
          </SectionErrorBoundary>
          <SectionErrorBoundary>
            <MarketSlipSections />
          </SectionErrorBoundary>
        </div>
      ) : (
        <>
          {/* BOARD VIEW — the board's own data loads inline; the rest of the
              page was already rendered and interactive above. */}
          <SectionErrorBoundary>
            <ValueAlertsPanel />
          </SectionErrorBoundary>

          {!boardReady && <BoardStatusCard phase={phase} slow={slow} onRetry={() => load(true)} refreshing={refreshing} />}

          {boardReady && (
            <>
              <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Activity className="w-4 h-4 text-primary shrink-0" />
                    <p className="font-bold text-sm">MODEL ENGINE</p>
                    {board.inBrowser ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> IN-BROWSER · NO CREDITS USED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE DATA
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => load(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-[11px] font-semibold hover:bg-secondary/70 disabled:opacity-50"
                  >
                    {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/70">LAST UPDATED: {updatedAt} · {board.timezone} · {board.leaguesWithData}/{board.leaguesScanned} competitions reporting</p>
                <div className="rounded-xl bg-secondary/50 px-3 py-2 text-[10px] text-muted-foreground leading-relaxed">
                  Matches scanned <span className="text-foreground font-semibold">{f.available || 0}</span>
                  {" "}· passed data filter <span className="text-foreground font-semibold">{f.dataPass || 0}</span>
                  {" "}· passed model agreement <span className="text-foreground font-semibold">{f.agreementPass || 0}</span>
                  {" "}· passed {Math.round(minProb * 100)}% probability <span className="text-foreground font-semibold">{f.probabilityPass || 0}</span>
                  {" "}· qualified <span className="text-primary font-semibold">{f.qualityPass || 0}</span>
                  {" "}→ shown on board: <span className="text-primary font-semibold">{totalPicks} picks</span> — every pick clears the 80% confidence bar
                  {f.crossValidated ? <> · cross-validated <span className="text-foreground font-semibold">{f.crossValidated}</span> by 2+ providers</> : null}
                </div>
                {board.providers && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Object.entries(board.providers).map(([k, p]) => (
                      <span key={k} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-semibold ${
                        p.status === "ONLINE" ? "border-emerald-500/30 text-emerald-400"
                        : p.status === "DISABLED" ? "border-border/60 text-muted-foreground/50"
                        : p.status === "UNKNOWN" ? "border-border/60 text-muted-foreground"
                        : "border-amber-500/30 text-amber-400"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          p.status === "ONLINE" ? "bg-emerald-400"
                          : p.status === "DISABLED" || p.status === "UNKNOWN" ? "bg-muted-foreground/40"
                          : "bg-amber-400"
                        }`} />
                        {p.label || k} {p.status}
                      </span>
                    ))}
                  </div>
                )}
                {perf && perf.samples > 0 ? (
                  <p className="text-[10px] text-muted-foreground">
                    Historical model performance: <span className="text-emerald-400 font-semibold">
                      {perf.wins}/{perf.decided} settled picks won ({Math.round((perf.hitRate || 0) * 100)}%)
                    </span>
                    {perf.brierAvg != null && <> · Brier {perf.brierAvg.toFixed(3)}</>}
                    {perf.logLossAvg != null && <> · log loss {perf.logLossAvg.toFixed(3)}</>}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground/70">Calibration: collecting settled results — accuracy shown once matches finish.</p>
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {(board.days || []).map((d, i) => (
                  <button
                    key={d.dateKey}
                    onClick={() => setDayIdx(i)}
                    className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${i === dayIdx ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                  >
                    {DAY_LABELS[i]} {gated(d.morning.picks).length + gated(d.evening.picks).length > 0 && (
                      <span className={`ml-1 ${i === dayIdx ? "" : "text-primary"}`}>{gated(d.morning.picks).length + gated(d.evening.picks).length}</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="space-y-5">
                <SessionBlock title={`Morning — ${day.dateKey}`} picks={day.morning.picks} />
                <SessionBlock title={`Evening — ${day.dateKey}`} picks={day.evening.picks} />
              </div>

              <SectionErrorBoundary>
                <PickCalendarSync picks={allOpenPicks} />
              </SectionErrorBoundary>
            </>
          )}
        </>
      )}

      <SectionErrorBoundary>
        <RolloverCalculator />
      </SectionErrorBoundary>

      <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
        Model probabilities, never guarantees. Picks lock at kickoff and settle against the real result
        (WIN / LOSS / VOID) to keep the engine calibrated. No pick is published when model confidence is too low.
        {board?.notes ? <> {board.notes}</> : null}
      </p>

      {user?.role === "admin" && (
        <div className="pt-1">
          <button
            onClick={() => setAdminOpen(!adminOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="w-3.5 h-3.5" /> {adminOpen ? "Hide" : "Open"} engine admin dashboard
          </button>
          {adminOpen && <EngineAdminPanel onChanged={() => load(true)} />}
        </div>
      )}
    </div>
  );
}