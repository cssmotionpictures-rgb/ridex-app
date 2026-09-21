import React from "react";
import { Loader2, AlertTriangle, Flame } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { base44 } from "@/api/base44Client";
import { buildWinRabaBoard, WR_LEAGUES } from "@/lib/winRaba";
import { lagosTodayKey } from "@/lib/lagosTime";
import { settleObservations, recordObservations } from "@/lib/ensemble/observations";
import { recordChallengerObservations } from "@/lib/ensemble/rx21";
import { getEngineCalibration, getEngineWeights } from "@/lib/ensemble/store";
import { buildMonster, MONSTER_WINDOWS } from "@/lib/monsterBoard";
import { recordMonsterPicks, mirrorMonsterSettlement } from "@/lib/monsterBoardLedger";
import { readWithRetry } from "@/lib/throttledRead";
import MonsterControls from "@/components/monsterboard/MonsterControls";
import MonsterDailyBoard from "@/components/monsterboard/MonsterDailyBoard";
import MonsterTicketSection from "@/components/monsterboard/MonsterTicketSection";
import MonsterPerformance from "@/components/monsterboard/MonsterPerformance";
import MonsterLearning from "@/components/monsterboard/MonsterLearning";
import MonsterHistory from "@/components/monsterboard/MonsterHistory";

// MONSTER — the daily intelligent sports selection board. A standalone surface
// that READS the same verified engine infrastructure every prediction tab
// uses, without touching KALA, WIN RABA, RUN O, BIG HAMMER or the rollover.
// The drop is AUTOMATIC (built on open, refreshed as the Lagos day rolls
// over); REFRESH MONSTER is only an additional manual action. Never forced:
// 0 qualified selections is an honest outcome — "NO QUALIFIED MONSTER PICKS
// TODAY" beats 13 weak ones.
export default function Monster() {
  const [scan, setScan] = React.useState("idle");
  const [board, setBoard] = React.useState(null);
  const [windowKey, setWindowKey] = React.useState("today"); // TODAY is the default
  const [session, setSession] = React.useState("all");
  const [progress, setProgress] = React.useState({ done: 0, total: WR_LEAGUES.length });
  const [ledgerRows, setLedgerRows] = React.useState(null);
  const [insights, setInsights] = React.useState(null);

  const monster = React.useMemo(
    () => (board ? buildMonster(board, { windowKey, session }) : null),
    [board, windowKey, session]
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

  // Latest non-superseded version per fixture+market — the history record.
  const historyRows = React.useMemo(() => {
    const m = {};
    (ledgerRows || []).filter((r) => r.status !== "superseded").forEach((r) => {
      const k = `${r.fixture_id}|${r.market_key}`;
      const prev = m[k];
      if (!prev || (r.prediction_version || 1) >= (prev.v || 1)) m[k] = { row: r, v: r.prediction_version || 1 };
    });
    return Object.values(m).map((x) => x.row);
  }, [ledgerRows]);

  const windowLabel = (MONSTER_WINDOWS.find((w) => w.key === windowKey) || {}).label || "TODAY";

  // Secondary ledger reads — 429-aware: retry with backoff, keep the last good
  // data on screen while retrying, and never blank a panel over a temporary
  // throttle. The primary board above is completely unaffected by these reads.
  const [sideThrottled, setSideThrottled] = React.useState(false);
  const sideRetry = React.useRef(null);
  const loadSide = async () => {
    for (const [read, apply] of [
      [() => base44.entities.MonsterPick.filter({}, "-recorded_at", 1000), (rows) => setLedgerRows(rows || [])],
      [() => base44.entities.GlobalLearningInsight.filter({}, "-updated_at", 30), (ins) => setInsights(ins || [])],
    ]) {
      try {
        apply(await readWithRetry(read));
        setSideThrottled(false);
      } catch (e) {
        if (e?.isThrottle) {
          setSideThrottled(true); // last good data stays on screen — never []
          clearTimeout(sideRetry.current);
          sideRetry.current = setTimeout(loadSide, 45000);
        }
      }
    }
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
      // Record every day's board of the window — immutable, versioned, idempotent.
      const perDay = [];
      (b.days || []).forEach((d) => {
        const m = buildMonster(b, { windowKey: d.dateKey, session: "all" });
        m.board.forEach((p, i) =>
          perDay.push({
            pick: p,
            rank: i + 1,
            correlation: (m.correlation || {})[`${p.fixtureId}|${p.marketKey}`] || "LOW",
          })
        );
      });
      await recordMonsterPicks(perDay).catch(() => null);
      setScan("ready");
      loadSide();
    } catch (err) {
      console.error("[MONSTER] daily drop build failed:", err?.message || err, err);
      setScan("error");
    }
  };

  // AUTOMATIC DAILY OPERATION — the board builds itself on open, settles
  // finished observations, mirrors the verified settlement onto MONSTER rows
  // and rebuilds automatically when the Lagos day rolls over.
  const scanRef = React.useRef(() => {});
  scanRef.current = scanNow;
  const dayRef = React.useRef(lagosTodayKey());

  React.useEffect(() => {
    // Secondary settlement runs in the BACKGROUND — its 429 retries never
    // delay the primary board scan below.
    (async () => {
      await settleObservations().catch(() => null); // grade finished observations from verified results
      await mirrorMonsterSettlement().catch(() => null); // MONSTER mirrors the authoritative settlement
    })();
    scanNow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => () => clearTimeout(sideRetry.current), []);

  React.useEffect(() => {
    const iv = setInterval(() => {
      const k = lagosTodayKey();
      if (k !== dayRef.current) {
        dayRef.current = k;
        scanRef.current(true); // new Lagos day — a new board, the old one stays in history
      }
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="MONSTER · RIDE X DAILY INTELLIGENT SPORTS SELECTIONS"
        title="MONSTER"
        subtitle="Today's Intelligent Selections — the day's strongest qualified picks, produced automatically by the RIDE X Intelligent Engine. Never a guarantee: if nothing qualifies, MONSTER says so."
      />

      <MonsterControls
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
            <Flame className="w-8 h-8 text-primary mx-auto animate-pulse" />
            <p className="text-sm text-muted-foreground">
              BUILDING TODAY'S DROP — VERIFIED FIXTURES AND LIVE MARKET PRICES ACROSS {progress.total} LEAGUES…{" "}
              {progress.done}/{progress.total}
            </p>
          </div>
        )}
        {scan === "error" && (
          <div className="rounded-3xl border border-rose-500/30 bg-card/70 p-8 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-sm font-semibold">RELIABLE SELECTIONS ARE TEMPORARILY UNAVAILABLE</p>
            <p className="text-xs text-muted-foreground">
              Check your connection and tap REFRESH MONSTER — nothing is fabricated in the meantime.
            </p>
          </div>
        )}

        {board && monster && (
          <>
            <MonsterDailyBoard monster={monster} results={results} windowLabel={windowLabel} />
            <MonsterTicketSection board={monster.board} />
            <MonsterPerformance rows={ledgerRows} loading={ledgerRows === null} throttled={sideThrottled} />
            <MonsterLearning insights={insights} loading={insights === null} throttled={sideThrottled} />
            <MonsterHistory rows={historyRows} todayKey={lagosTodayKey()} loading={ledgerRows === null} throttled={sideThrottled} />
          </>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-6">
        MONSTER is an intelligent daily selection service — never a guarantee. The board is produced automatically by
        the RIDE X Intelligent Engine, locked in before kickoff and graded only from the real final score. No
        selection is ever forced and missing information is always disclosed, never invented. Daily "MONSTER IS LIVE"
        notifications are not yet available in RIDE X. PAPER MODE: no real bets are ever placed.
      </p>
    </div>
  );
}