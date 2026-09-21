import React from "react";
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, WifiOff, Radio } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import {
  rankAndSelect, normalizeCandidate, segmentEvidenceMap, deriveThresholds,
  modelHealthOf, regimeOf, SURE_WIN_PROBABILITY, SURE_WIN_MAX_PICKS,
} from "@/lib/globalLearning/selectionEngine";
import {
  boardStateOf, snapshotRowOf, missingSnapshots, sportOf, resultsStatsOf, lagosDateKeyOf,
} from "@/lib/globalLearning/sureWinBoard";
import SureWinCard from "@/components/surewins/SureWinCard";
import SureWinIntelStrip from "@/components/surewins/SureWinIntelStrip";
import SureWinResults from "@/components/surewins/SureWinResults";

const SETTLED_STATUSES = ["won", "lost", "void", "cancelled"];
const REALTIME_DEBOUNCE_MS = 3000;        // event-driven recompute, debounced
const FALLBACK_TTL_MS = 5 * 60 * 1000;    // conservative fallback refresh, never a polling loop

// SURE WIN — the engine's high-confidence board. Entry requirement: ≥83%
// calibrated probability AND a pass through the full Selection Intelligence
// gate, ranked by composite evidence quality, capped at 20 picks. NO PICK
// over a weak pick. LIVE: candidate events drive refreshes automatically;
// a failed read is a DATA ERROR, never a fake empty board. Every published
// pick is snapshotted immutably on first publication. 83%+ is a standard,
// never a guarantee.
export default function SureWins() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [board, setBoard] = React.useState(null);
  const [results, setResults] = React.useState(null);
  const [lastLoadedAt, setLastLoadedAt] = React.useState(0);
  const [dateFilter, setDateFilter] = React.useState("today");
  const [sportFilter, setSportFilter] = React.useState("all");
  const [, forceTick] = React.useState(0);

  // Intelligence context (learning report, model-health inputs, settled join)
  // is expensive to read — cached and refreshed only on mount/TTL, so an
  // event-driven board refresh re-reads just the candidate pool + snapshots.
  const ctxCacheRef = React.useRef(null);
  // Probe row from the last verifiably NON-EMPTY pool read — a pool that
  // suddenly reads EMPTY is verified against this row before being believed:
  // row still open → the empty read was a throttled failure (DATA ERROR, last
  // board kept); row settled/gone → the departure is genuine. A throttled
  // empty read is NEVER reported as NO GAMES.
  const probeRef = React.useRef(null);

  const readPool = () => Promise.allSettled([
    base44.entities.EnginePrediction.filter({ status: "open" }, "kickoff", 200),
    base44.entities.MonsterPick.filter({ status: "open" }, "kickoff", 200),
  ]);

  const load = React.useCallback(async ({ full = true } = {}) => {
    setLoading(true);
    const now = Date.now();
    const needCtx = full || !ctxCacheRef.current || ctxCacheRef.current.expiresAt <= now;
    const [poolRes, snapsRes, ctxRes] = await Promise.allSettled([
      readPool(),
      base44.entities.SureWinBoardSnapshot.filter({}, "-published_at", 500),
      needCtx ? Promise.allSettled([
        base44.entities.LearningCycleReport.filter({ registry_key: "learning-cycle-latest" }, null, 1),
        base44.entities.LearningEvent.filter({}, "-counted_at", 200),
        base44.entities.ActiveModel.filter({ registry_key: "active-model" }, null, 1),
        base44.entities.EnginePrediction.filter({}, "-updated_date", 400),
        base44.entities.MonsterPick.filter({}, "-updated_date", 400),
      ]) : Promise.resolve(null),
    ]);
    const [preds, monsters] = poolRes.status === "fulfilled" ? poolRes.value : [{ status: "rejected" }, { status: "rejected" }];
    const predOk = preds.status === "fulfilled";
    const monsterOk = monsters.status === "fulfilled";
    if (!predOk && !monsterOk) {
      setError(true); // honest DATA_ERROR — a failed read is never an empty board
      setLoading(false);
      return;
    }
    // THROTTLE GUARD — the pool just read EMPTY but verifiably held candidates
    // minutes ago. Re-read once; if still empty, verify against the probe row
    // before believing the emptiness.
    let predRows = predOk ? preds.value : [];
    let monsterRows = monsterOk ? monsters.value : [];
    const poolReadEmpty = !(predRows || []).length && !(monsterRows || []).length;
    if (poolReadEmpty && probeRef.current && now - probeRef.current.at < 10 * 60000) {
      await new Promise((r) => setTimeout(r, 2000));
      const retry = await readPool().catch(() => null);
      if (retry) {
        const [rp, rm] = retry;
        if (rp.status === "fulfilled") predRows = rp.value || [];
        if (rm.status === "fulfilled") monsterRows = rm.value || [];
      }
      if (!(predRows || []).length && !(monsterRows || []).length) {
        // still empty — verify the probe row directly (row gone = genuinely
        // departed from the pool; row still open = the empty read was false)
        let verdict = "departed";
        try {
          const row = await base44.entities[probeRef.current.entity].get(probeRef.current.id).catch(() => null);
          if (row && row.status === "open") verdict = "still_open";
        } catch { /* probe read itself failed — the departure stands */ }
        if (verdict !== "departed") {
          // the pool's emptiness cannot be confirmed — treat as a read failure,
          // keep the last verified board, never claim NO GAMES
          setError(true);
          setLoading(false);
          return;
        }
        probeRef.current = null; // the candidate verifiably left the pool — the empty read is genuine
      }
    }
    if (needCtx && ctxRes.status === "fulfilled" && Array.isArray(ctxRes.value)) {
      const [reports, events, registry, settledPreds, settledMonsters] = ctxRes.value;
      const settledByFM = new Map();
      const addSettled = (rows) => (rows || [])
        .filter((x) => SETTLED_STATUSES.includes(x.status))
        .forEach((x) => {
          const k = `${x.fixture_id}|${x.market_key}`;
          if (!settledByFM.has(k)) settledByFM.set(k, x.status);
        });
      if (settledPreds.status === "fulfilled") addSettled(settledPreds.value);
      if (settledMonsters.status === "fulfilled") addSettled(settledMonsters.value);
      ctxCacheRef.current = {
        report: reports.status === "fulfilled" ? reports.value?.[0] : null,
        reg: registry.status === "fulfilled" ? registry.value?.[0] : null,
        settled: (events.status === "fulfilled" ? events.value : []) || [],
        settledByFM,
        expiresAt: now + 10 * 60000,
      };
    }
    try {
      const { report, reg, settled, settledByFM } = ctxCacheRef.current || { report: null, reg: null, settled: [], settledByFM: new Map() };
      const health = modelHealthOf(settled);
      let driftVerdict = reg?.drift_status || "";
      if (!driftVerdict && report?.drift_json) {
        try { driftVerdict = JSON.parse(report.drift_json).verdict || ""; } catch { driftVerdict = ""; }
      }
      const regime = regimeOf({ driftVerdict, healthVerdict: health.verdict });
      const ctx = {
        now: Date.now(),
        segments: segmentEvidenceMap(report),
        thresholds: deriveThresholds(report),
        regime,
        health,
      };
      const pool = new Map();
      const add = (rows, source) =>
        (rows || []).forEach((row) => {
          const c = normalizeCandidate(row, source);
          const k = `${c.fixture_id}|${c.market_key}`;
          if (!pool.has(k) || c.calibrated > pool.get(k).calibrated) pool.set(k, c);
        });
      add(predRows, "engine");
      add(monsterRows, "monster");
      if (pool.size) {
        const probeRow = (predRows || [])[0] || (monsterRows || [])[0];
        probeRef.current = probeRow
          ? { entity: (predRows || [])[0] ? "EnginePrediction" : "MonsterPick", id: probeRow.id, at: Date.now() }
          : probeRef.current;
      }
      const { picks, stats } = rankAndSelect([...pool.values()], ctx);
      stats.poolReads = `${predOk ? "engine ok" : "engine read failed"} · ${monsterOk ? "monster ok" : "monster read failed"}`;

      // IMMUTABLE BOARD SNAPSHOTS — first publish wins; existing rows are never rewritten
      const snapshots = snapsRes.status === "fulfilled" ? snapsRes.value || [] : null;
      let published = 0;
      if (picks.length && snapshots) {
        const missing = missingSnapshots(snapshots.map((s) => s.snapshot_key), picks.map(snapshotRowOf));
        for (let i = 0; i < missing.length; i += 100) {
          await base44.entities.SureWinBoardSnapshot.bulkCreate(missing.slice(i, i + 100));
        }
        published = missing.length;
      }

      setBoard({
        picks,
        stats,
        published,
        poolEmpty: pool.size === 0,
        partial: predOk !== monsterOk,
        intel: {
          champion: reg?.champion_version || "RX-2.0",
          challenger: reg?.challenger_version || "RX-2.1",
          promotionStatus: reg?.promotion_status || "",
          healthShort: health.verdict.split("—")[0].trim(),
          healthVerdict: health.verdict,
          regime,
          stats,
          thresholdBasis: ctx.thresholds.derivedFrom,
        },
      });
      setResults(resultsStatsOf(snapshots || [], settledByFM));
      setError(false);
      setLastLoadedAt(Date.now());
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  // Mount + LIVE refresh: candidate events drive a debounced recompute; a
  // conservative TTL fallback covers missed events. Never a tight poll.
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    let t = null;
    const schedule = () => { clearTimeout(t); t = setTimeout(() => load({ full: false }), REALTIME_DEBOUNCE_MS); };
    const unsubs = [base44.entities.EnginePrediction, base44.entities.MonsterPick]
      .map((E) => E.subscribe(() => schedule()));
    const ttl = setInterval(load, FALLBACK_TTL_MS);
    const minute = setInterval(() => forceTick((n) => n + 1), 60000); // keeps the STALE badge honest
    return () => {
      clearTimeout(t); clearInterval(ttl); clearInterval(minute);
      unsubs.forEach((u) => { try { u(); } catch { /* already unsubscribed */ } });
    };
  }, [load]);

  const todayKey = lagosDateKeyOf(new Date().toISOString());
  const tomorrowKey = lagosDateKeyOf(new Date(Date.now() + 86400000).toISOString());
  const allPicks = board?.picks || [];
  const picksForDate = allPicks.filter((p) => {
    const k = lagosDateKeyOf(p.candidate.kickoff) || p.candidate.lagos_date_key;
    if (dateFilter === "today") return k === todayKey;
    if (dateFilter === "tomorrow") return k === tomorrowKey;
    return true;
  });
  const sportsPresent = [...new Set(picksForDate.map((p) => sportOf(p.candidate)))];
  const activeSport = sportsPresent.includes(sportFilter) ? sportFilter : "all";
  const visiblePicks = activeSport === "all"
    ? picksForDate
    : picksForDate.filter((p) => sportOf(p.candidate) === activeSport);
  const state = board
    ? boardStateOf({ poolFailed: error, poolEmpty: board.poolEmpty, picksCount: visiblePicks.length, lastLoadedAt, now: Date.now() })
    : (loading ? "LOADING" : "DATA_ERROR");
  const dateLabel = dateFilter === "today" ? "TODAY'S" : dateFilter === "tomorrow" ? "TOMORROW'S" : "UPCOMING";
  const chip = (active) => `px-3 py-1 rounded-full text-[10px] font-bold border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground"}`;

  return (
    <div className="monster-bg min-h-[60vh] rounded-3xl p-4 sm:p-6 -mx-5 sm:mx-0 lg:p-8">
      <PageHeader
        eyebrow="RIDE X · SELECTION INTELLIGENCE"
        title="SURE WINS"
        subtitle={`83%+ High-Confidence Picks — up to ${SURE_WIN_MAX_PICKS} games that pass ${Math.round(SURE_WIN_PROBABILITY * 100)}% calibrated probability AND the full quality gate. 83%+ is the model's calibrated probability threshold and is not a guarantee of the result. No prediction is certain.`}
        action={
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold mtext-green">
              <Radio className="w-3 h-3 animate-pulse" /> LIVE
            </span>
            <Button variant="outline" size="sm" className="rounded-full bg-black/30 border-white/10" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Refresh
            </Button>
          </div>
        }
      />

      {state === "LOADING" && (
        <div className="mglass rounded-3xl p-10 text-center space-y-3 mt-4">
          <Loader2 className="w-7 h-7 mtext-cyan mx-auto animate-spin" />
          <p className="text-xs font-bold">Scoring every open candidate through the selection gate…</p>
        </div>
      )}

      {state === "DATA_ERROR" && !board && (
        <div className="mglass rounded-3xl p-8 text-center mt-4 space-y-2 border border-red-500/30">
          <WifiOff className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm font-extrabold text-red-300">BOARD DATA UNAVAILABLE — RETRYING</p>
          <p className="text-xs text-muted-foreground">The candidate pool could not be read. This is a data problem, not an empty board — nothing is invented. A retry runs automatically; use Refresh to try immediately.</p>
        </div>
      )}

      {board && (
        <div className="mt-4 space-y-4">
          {error && (
            <div className="mglass rounded-2xl p-3 flex items-center gap-2 border border-red-500/30">
              <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-[11px] font-bold text-red-300">BOARD DATA UNAVAILABLE — RETRYING. The last verified board is shown below; nothing is invented.</p>
            </div>
          )}
          {state === "STALE" && (
            <p className="flex items-center gap-1.5 text-[10px] text-amber-300 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> STALE — the last verified refresh was over 10 minutes ago; a live refresh is running.
            </p>
          )}
          {board.partial && (
            <p className="flex items-center gap-1.5 text-[10px] text-amber-300 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> PARTIAL DATA — one candidate source could not be read this pass ({board.intel.stats.poolReads}). The board shows only verified reads.
            </p>
          )}

          <SureWinIntelStrip intel={board.intel} />

          <div className="flex flex-wrap gap-2">
            {[["today", "TODAY"], ["tomorrow", "TOMORROW"], ["upcoming", "UPCOMING"]].map(([k, label]) => (
              <button key={k} onClick={() => setDateFilter(k)} className={chip(dateFilter === k)}>{label}</button>
            ))}
          </div>
          {picksForDate.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSportFilter("all")} className={chip(activeSport === "all")}>ALL</button>
              {sportsPresent.map((s) => (
                <button key={s} onClick={() => setSportFilter(s)} className={chip(activeSport === s)}>{s.toUpperCase()}</button>
              ))}
            </div>
          )}

          <p className="text-sm font-extrabold">
            {dateLabel} SURE WIN — {picksForDate.length} qualifying {picksForDate.length === 1 ? "game" : "games"}
          </p>

          {state === "NO_CANDIDATES" ? (
            <div className="mglass rounded-3xl p-10 text-center space-y-2">
              <ShieldCheck className="w-8 h-8 mtext-green mx-auto" />
              <p className="text-sm font-extrabold">NO GAMES PASS TODAY</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                The open candidate pool is currently empty — the engine would rather show nothing than manufacture a pick.
              </p>
            </div>
          ) : visiblePicks.length === 0 ? (
            <div className="mglass rounded-3xl p-10 text-center space-y-2">
              <ShieldCheck className="w-8 h-8 mtext-green mx-auto" />
              <p className="text-sm font-extrabold">NO SURE WIN PICKS RIGHT NOW</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {board.stats.seen} candidate{board.stats.seen === 1 ? "" : "s"} evaluated — none met the {Math.round(SURE_WIN_PROBABILITY * 100)}% floor plus the full quality gate for this filter.
              </p>
              {(board.stats.rejectionReasons || []).slice(0, 4).map((r) => (
                <p key={r.label} className="text-[10px] text-muted-foreground leading-snug">· {r.count} × {r.label}</p>
              ))}
              {picksForDate.length === 0 && allPicks.length > 0 && (
                <p className="text-[10px] text-amber-300 font-semibold">No qualifying games for this date — check TOMORROW or UPCOMING.</p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visiblePicks.map((p) => (
                <SureWinCard key={`${p.candidate.fixture_id}|${p.candidate.market_key}`} pick={p} />
              ))}
            </div>
          )}

          <SureWinResults results={results} />

          <p className="text-[10px] text-muted-foreground leading-snug border-t border-white/5 pt-3">
            HONEST DISCLOSURE — {Math.round(SURE_WIN_PROBABILITY * 100)}% calibrated confidence is an entry standard, not a promise. Every number on this board was recorded before kickoff and is graded from verified results. Probability is never certainty: even an 83% selection loses roughly one time in six. Never stake what you cannot afford to lose.
            {board.published > 0 && ` ${board.published} new immutable board snapshot${board.published === 1 ? "" : "s"} published this refresh (audit trail, never rewritten).`}
          </p>
        </div>
      )}
    </div>
  );
}