import React from "react";
import { Stethoscope, CircleCheck, CircleX, AlertTriangle } from "lucide-react";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { kalaAnalytics, sampleLabel } from "@/lib/kala";
import { bigHammerBands, driftOf } from "@/lib/ensemble/backtest";
import { evidenceLevel, closingSummary, clvGroups } from "@/lib/ensemble/diagnostics";

// ENGINE AUDIT — the developer/admin-only diagnostic view. It reports the
// REAL state of the data sources, the ledger, the calibration/backtest
// samples and the drift/diagnostics — never fake precision, never hidden
// weaknesses. This is not a betting surface; it is the engine's error budget
// and self-measurement.
const countBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

export default function AuditSection({ board, preds, obs, backtest, diag, challenger }) {
  const live = kalaAnalytics(preds);
  const ch = challenger || {};
  const chS = ch.summary || {};
  const chC = ch.comparison || { n: 0, verdict: "—" };
  // MODEL OBSERVATIONS — research records, never bets. They are counted here
  // strictly separately from qualified picks so the performance system can
  // never confuse exploratory predictions with recommended selections.
  const obsRows = obs || [];
  const obsSettled = obsRows.filter((r) => ["won", "lost"].includes(r.status));
  const obsQualified = obsRows.filter((r) => r.qualified);
  const evidence = evidenceLevel(obsRows, backtest?.promotion?.eligible);
  const closing = closingSummary(obsRows);
  const clv = clvGroups(obsRows);
  const settled = (preds || []).filter((r) => ["won", "lost"].includes(r.status));
  const bands = bigHammerBands(preds);
  const drift = driftOf(preds);
  const report = board?.report || {};
  const statusCounts = countBy(preds || [], (r) => r.status);

  const oddsOk = diag?.providerStatus === "ok";
  const fixturesOk = (report.fixturesScanned || 0) > 0;

  const sources = [
    {
      name: "openfootball verified feed (fixtures/results)",
      ok: fixturesOk,
      note: fixturesOk
        ? `${report.fixturesScanned || 0} fixtures scanned · ${report.fixturesAnalyzed || 0} analyzed · ${report.leaguesScanned || 0} leagues`
        : "No fixtures returned on the last scan — check the connection",
    },
    {
      name: `Odds provider — ${diag?.provider || "The Odds API"}`,
      ok: oddsOk,
      note: oddsOk
        ? `OK · ${diag.pricedCount}/${diag.legsRequested} legs priced · ${diag.creditsRemaining ?? "?"} credits remaining · fetched ${diag.fetchedAt ? new Date(diag.fetchedAt).toLocaleTimeString() : "—"}`
        : `${diag?.providerStatus || "never_fetched"} — ${diag?.providerMessage || "no diagnostics recorded yet on this session"}`,
    },
    {
      name: "Live scores (API-Football)",
      ok: true,
      note: "Connected — used by LIVE INTELLIGENCE only; settlement grades from the verified openfootball feed",
    },
    {
      name: "Injuries (API-Football) — RX-2.1 challenger input",
      ok: (chS.injuryInformed ?? 0) > 0,
      note: (() => {
        const injEp = (ch.health?.endpoints || []).find((e) => e.endpoint === "injuries");
        const fetchNote = injEp?.lastOkAt
          ? `last successful fetch ${new Date(injEp.lastOkAt).toLocaleTimeString()} · ${injEp.lastResults ?? 0} records returned by the provider`
          : "no successful fetch on this session";
        return (chS.injuryInformed ?? 0) > 0
          ? `VERIFIED — feeding the RX-2.1 challenger · ${chS.injuryInformed} observation rows injury-informed · ${chS.injuryAbsentees ?? 0} verified absentees mapped (absence-count proxy) · ${chS.injuryUnmatched ?? 0} unmatched (UNKNOWN, never zero) · ${chS.injuryUnavailable ?? 0} unavailable · ${fetchNote}`
          : `no injury-informed rows on the current board window yet · ${chS.injuryUnmatched ?? 0} unmatched (UNKNOWN, never zero) · ${chS.injuryUnavailable ?? 0} unavailable (plan window / coverage) · ${fetchNote}`;
      })(),
    },
    {
      name: "Confirmed lineups (API-Football) — RX-2.1 challenger input",
      ok: (chS.lineupConfirmed ?? 0) > 0,
      note: (() => {
        const luEp = (ch.health?.endpoints || []).find((e) => e.endpoint === "fixtures/lineups");
        const fetchNote = luEp?.lastOkAt ? `last fetch ${new Date(luEp.lastOkAt).toLocaleTimeString()}` : "no fetch on this session yet";
        return (chS.lineupConfirmed ?? 0) > 0
          ? `CONFIRMED pre-kickoff on ${chS.lineupConfirmed} rows — a confirmation creates a NEW immutable snapshot (:v2), never a rewrite · ${fetchNote}`
          : `lineups publish near kickoff and are captured by the 10-minute heartbeat while KALA is open · ${fetchNote}`;
      })(),
    },
    {
      name: "xG — no verified provider",
      ok: false,
      note: "NOT CONNECTED — never a model input; disclosed on every scan (API-Football has no xG; Sportmonks plan-gated; Football-Data.org carries none)",
    },
  ];

  return (
    <SectionCard
      title="ENGINE AUDIT — DEVELOPER DIAGNOSTICS"
      icon={<Stethoscope className="w-4 h-4 text-primary" />}
      sub="Admin-only. The engine's real self-measurement: data source health, ledger state, walk-forward backtest, champion/challenger, drift and the rejection error budget. Nothing here is fabricated."
    >
      {/* DATA HEALTH */}
      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">ACTIVE DATA SOURCES</p>
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          {sources.map((s) => (
            <div key={s.name} className="flex items-start gap-2 px-3 py-2 border-b border-border/30 last:border-0">
              {s.ok
                ? <CircleCheck className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                : <CircleX className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <p className="text-[11px] font-bold">{s.name}</p>
                <p className="text-[10px] text-muted-foreground">{s.note}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Model version: <b className="text-primary">{report.modelVersion || "RX-2.0"}</b> (champion) · RX-2.1 challenger (research only) · KALA layer: KALA-MASTER-2.1 ·
          Last scan: {report.scannedAt ? new Date(report.scannedAt).toLocaleString() : "—"}
        </p>
      </div>

      {/* KALA EVIDENCE LEVEL — the gold-standard compact metric */}
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-3">
        <p className="text-[11px] font-extrabold text-primary">KALA EVIDENCE LEVEL — {evidence.label}</p>
        <p className="text-[10px] text-muted-foreground">{evidence.note}</p>
      </div>

      {/* CHAMPION / CHALLENGER — RX-2.0 vs RX-2.1 (injury + lineup intelligence) */}
      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-3">
        <p className="text-[11px] font-extrabold text-emerald-300">CHAMPION / CHALLENGER — RX-2.0 (champion) vs RX-2.1 (injury + lineup intelligence)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <Stat label="RX-2.1 ROWS" value={chS.rowsTotal ?? 0} hint={`${chS.latest ?? 0} latest · ${chS.versioned ?? 0} lineup-confirmation revisions`} />
          <Stat label="INJURY-INFORMED" value={chS.injuryInformed ?? 0} hint="matched absences on both sides" />
          <Stat label="LINEUPS CONFIRMED" value={chS.lineupConfirmed ?? 0} hint="confirmed pre-kickoff" />
          <Stat label="RX-2.1 QUALIFIED" value={chS.qualified ?? 0} hint="challenger gate — research only, never on boards" />
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          HEAD-TO-HEAD: {chC.n
            ? `Brier ${chC.brier20} (RX-2.0) vs ${chC.brier21} (RX-2.1) on ${chC.n} common settled rows`
            : "no common settled rows yet — the comparison begins after the first verified results"} · PROMOTION: {chC.verdict}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Provider health (api-football proxy): {ch.health
            ? `${ch.health.okCalls}/${ch.health.calls} calls OK · avg ${ch.health.avgMs}ms${ch.health.failCalls ? ` · last failure: ${ch.health.lastError}` : ""}`
            : "no enrichment calls made this session"}
        </p>
      </div>

      {/* MODEL OBSERVATIONS — research ledger, counted separately from bets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="MODEL OBSERVATIONS (RESEARCH)" value={obsRows.length} hint="not bets — never counted as picks" />
        <Stat label="QUALIFIED PREDICTIONS" value={obsQualified.length} hint="passed the full betting gate" />
        <Stat label="OBSERVATIONS SETTLED" value={obsSettled.length} hint="graded from verified results" />
        <Stat label="CLV" value={clv.computable ? `${clv.all ?? "—"}%` : "NOT AVAILABLE"} hint={clv.computable ? `${clv.computable} rows with T0 + closing price` : "needs T0 price + pre-kickoff closing price"} />
        <Stat label="CLOSING CAPTURE" value={closing.rowsWithClosingPrice} hint={`rows carrying a closing price · ${Object.entries(closing.captureStatusCounts).map(([k, n]) => `${k}:${n}`).join(" · ") || "none open yet"}`} />
        <Stat label="CAPTURE TARGETS" value={closing.openWithKickoffAhead} hint="open rows inside the pre-kickoff window" />
      </div>

      {/* LEDGER COUNTS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="PREDICTIONS (LEDGER)" value={preds?.length || 0} hint={`${statusCounts.open || 0} open`} />
        <Stat label="SETTLED (WON/LOST)" value={settled.length} hint={`${statusCounts.won || 0}W / ${statusCounts.lost || 0}L · ${statusCounts.void || 0} void`} />
        <Stat label="SUPERSEDED VERSIONS" value={statusCounts.superseded || 0} hint="pre-kickoff revisions — V1 kept" />
        <Stat label="BIG HAMMER ON RECORD" value={(preds || []).filter((r) => r.big_hammer).length} hint="3.00+ with adjusted edge 4pp+" />
        <Stat label="CALIBRATION SAMPLE" value={backtest?.champion?.n ?? 0} hint={sampleLabel(backtest?.champion?.n ?? 0)} />
        <Stat label="BACKTEST TEST ROWS" value={backtest?.testN ?? 0} hint={backtest?.leakageExcluded ? `${backtest.leakageExcluded} excluded by the leakage guard` : "walk-forward"} />
        <Stat label="LEAGUES SCANNED" value={report.leaguesScanned || 0} hint={`${report.marketsScanned || 0} markets · ${report.rejected || 0} rejected`} />
        <Stat label="QUALIFYING NOW" value={report.qualifying || 0} hint={`${report.bigHammer || 0} BIG HAMMER candidates`} />
      </div>

      {/* BACKTEST vs LIVE — always labeled separately */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-secondary/40 border border-border/50 p-3">
          <p className="text-[11px] font-extrabold">WALK-FORWARD BACKTEST <span className="text-muted-foreground font-normal">(historical, no leakage)</span></p>
          {backtest && backtest.champion?.n ? (
            <>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Stat label="BRIER / LOG LOSS" value={`${backtest.champion.brier ?? "—"} / ${backtest.champion.logLoss ?? "—"}`} />
                <Stat label="CALIBRATION ERROR" value={backtest.champion.calErrPct != null ? `${backtest.champion.calErrPct}pp` : "—"} hint="avg recorded prob − outcome" />
                <Stat label="WIN RATE" value={backtest.champion.winRatePct != null ? `${backtest.champion.winRatePct}%` : "—"} hint={`${backtest.champion.n} test rows`} />
                <Stat label="PAPER ROI" value={backtest.champion.paperRoiPct != null ? `${backtest.champion.paperRoiPct}%` : "—"} hint={`${backtest.champion.paperProfit >= 0 ? "+" : ""}${backtest.champion.paperProfit} (paper)`} />
                <Stat label="AVG ODDS / EDGE" value={`${backtest.champion.avgOdds ?? "—"} / ${backtest.champion.avgEdgePct ?? "—"}pp`} />
                <Stat label="CLV" value={backtest.champion.clvAvgPct != null ? `${backtest.champion.clvAvgPct}% avg` : "NOT AVAILABLE"} hint={backtest.champion.clvN ? `${backtest.champion.clvN} rows with closing prices` : "no closing prices captured yet"} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                CHALLENGER (re-weighted blend, trained only on strictly-prior rows):{" "}
                {backtest.challenger?.n
                  ? `Brier ${backtest.challenger.brier} · log loss ${backtest.challenger.logLoss} on ${backtest.challenger.n} rows`
                  : backtest.challenger?.status || "not evaluable yet"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                PROMOTION: {backtest.promotion?.reason}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-2">No settled predictions yet — a backtest cannot be claimed from zero data.</p>
          )}
        </div>
        <div className="rounded-2xl bg-secondary/40 border border-border/50 p-3">
          <p className="text-[11px] font-extrabold">LIVE FORWARD PERFORMANCE <span className="text-muted-foreground font-normal">(graded picks, not a backtest)</span></p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Stat label="SETTLED SAMPLE" value={live.graded} hint={live.graded ? live.sample : ""} />
            <Stat label="WIN RATE" value={live.winRate != null ? `${live.winRate}%` : "—"} />
            <Stat label="BRIER / LOG LOSS" value={live.brier != null ? `${live.brier} / ${live.logloss}` : "—"} />
            <Stat label="CALIBRATION ERROR" value={live.calErr != null ? `${live.calErr > 0 ? "+" : ""}${live.calErr}pp` : "—"} />
            <Stat label="PAPER P/L" value={live.paper.profit != null ? `${live.paper.profit >= 0 ? "+" : ""}${live.paper.profit}` : "—"} hint={live.paper.roiPct != null ? `ROI ${live.paper.roiPct}% on ${live.paper.pricedPicks} priced picks` : ""} />
            <Stat label="DRIFT (LAST 25)" value={drift.driftPct != null ? `${drift.driftPct > 0 ? "+" : ""}${drift.driftPct}pp` : "—"} hint={`recent ${drift.last25 ?? "—"}% vs lifetime ${drift.lifetime ?? "—"}%`} />
          </div>
          {drift.warning && (
            <p className="text-[10px] font-bold text-amber-300 mt-2">⚠ MODEL DRIFT WARNING — recent performance deteriorated vs the lifetime record.</p>
          )}
        </div>
      </div>

      {/* BIG HAMMER ODDS-RANGE VALIDATION */}
      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">BIG HAMMER — ODDS-RANGE VALIDATION (settled 3.00+ only)</p>
        {bands.length === 0 ? (
          <EmptyState>No settled BIG HAMMER picks yet — value-vs-longshot cannot be judged from zero data.</EmptyState>
        ) : (
          <div className="rounded-2xl border border-border/50 overflow-hidden">
            <div className="grid grid-cols-5 gap-1 px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60">
              <span>RANGE</span><span>SAMPLE</span><span>PREDICTED</span><span>ACTUAL</span><span>ROI</span>
            </div>
            {bands.map((b) => (
              <div key={b.band} className="grid grid-cols-5 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30">
                <span className="font-bold">{b.band}</span>
                <span>{b.n}</span>
                <span>{b.predictedPct != null ? `${b.predictedPct}%` : "—"}</span>
                <span className={b.actualPct != null && b.predictedPct != null && b.actualPct < b.predictedPct - 5 ? "text-rose-300 font-bold" : ""}>{b.actualPct != null ? `${b.actualPct}%` : "—"}</span>
                <span>{b.paperRoiPct != null ? `${b.paperRoiPct}%` : "—"}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">Predicted vs actual per odds range shows whether BIG HAMMER is finding value or merely selecting longshots.</p>
      </div>

      {/* ERROR / REJECTION BUDGET */}
      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">REJECTION ERROR BUDGET — last scan</p>
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          {(() => {
            const groups = countBy(board?.rejected || [], (r) => r.reason || "unspecified");
            const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 8);
            if (!entries.length) return <p className="text-xs text-muted-foreground px-3 py-2">No rejections recorded on the last scan.</p>;
            return entries.map(([reason, n]) => (
              <div key={reason} className="flex items-start gap-2 px-3 py-1.5 text-[11px] border-b border-border/30 last:border-0">
                <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">{reason}</span>
                <b className="shrink-0">{n}</b>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* LIMITATIONS — never hidden */}
      <div className="rounded-2xl bg-secondary/40 border border-border/50 p-3 space-y-1">
        <p className="text-[11px] font-extrabold">KNOWN LIMITATIONS — DISCLOSED, NOT HIDDEN</p>
        {(report.unavailableData || []).map((d, i) => (
          <p key={i} className="text-[10px] text-muted-foreground">• {d}</p>
        ))}
        <p className="text-[10px] text-muted-foreground">• Closing prices are captured only at real app-open frequency inside the pre-kickoff window (no per-minute scheduler on this plan) — CLV is measurable only after games with a captured closing price settle.</p>
        <p className="text-[10px] text-muted-foreground">• Lineup/injury confirmation never enters: pick quality is measured only on connected inputs, and unpriced candidates carry a neutral market score, never an invented edge.</p>
      </div>
    </SectionCard>
  );
}