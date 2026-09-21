import React from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Loader2, Play, ShieldCheck, XCircle } from "lucide-react";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { getActiveModel } from "@/lib/globalLearning/activeModel";

// SELF-LEARNING LOOP — LEARNING CENTER. Shows the ACTUAL state of the
// learning chain from the database: observations, counted learning events,
// feature evidence, calibration, chronological model evaluation, promotion
// gate, active model and drift. Never displays "learning complete" unless
// the whole chain genuinely executed — reporting and learning are never
// confused here.

const STAGE_STYLE = {
  COMPLETE: "text-emerald-300",
  PARTIAL: "text-amber-300",
  BLOCKED: "text-rose-300",
  "NOT IMPLEMENTED": "text-rose-300",
};

const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " WAT"
    : "—";

const parseJson = (v, fb) => {
  try {
    const p = typeof v === "string" ? JSON.parse(v) : v;
    return p ?? fb;
  } catch {
    return fb;
  }
};

const StageRow = ({ stage, status, detail }) => (
  <div className="flex items-start gap-2.5 px-3 py-1.5 text-[11px]">
    <span className={`font-extrabold w-[74px] shrink-0 ${STAGE_STYLE[status] || ""}`}>{status}</span>
    <div className="min-w-0">
      <p className="font-bold leading-tight">{stage}</p>
      {detail && <p className="text-muted-foreground text-[10px] leading-snug mt-0.5">{detail}</p>}
    </div>
  </div>
);

const DecisionBanner = ({ ok, title, children }) => (
  <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${ok ? "border-emerald-400/40 bg-emerald-400/5" : "border-amber-400/40 bg-amber-400/10"}`}>
    {ok ? <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />}
    <div className="min-w-0">
      <p className={`text-[11px] font-extrabold tracking-wide ${ok ? "text-emerald-300" : "text-amber-300"}`}>{title}</p>
      <p className="text-[10px] leading-relaxed mt-1">{children}</p>
    </div>
  </div>
);

export default function LearningCenterSection() {
  const [report, setReport] = React.useState(null);
  const [active, setActive] = React.useState(null);
  const [me, setMe] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [runResult, setRunResult] = React.useState(null);
  const [loadError, setLoadError] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [rep, am] = await Promise.allSettled([
        base44.entities.LearningCycleReport.filter({ registry_key: "learning-cycle-latest" }, "-created_date", 1),
        base44.entities.ActiveModel.filter({ registry_key: "active-model" }, "-created_date", 1),
      ]);
      setReport(rep.status === "fulfilled" ? rep.value?.[0] || null : null);
      setActive(am.status === "fulfilled" ? am.value?.[0] || null : null);
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
    base44.auth.me().then((u) => setMe(u)).catch(() => setMe(null));
  }, [load]);

  const runCycle = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await base44.functions.invoke("learning-cycle", {});
      setRunResult(res?.data || null);
      await load();
    } catch (e) {
      setRunResult({ ok: false, error: String(e?.message || e) });
    }
    setRunning(false);
  };

  const isAdmin = me?.role === "admin";
  const chain = parseJson(report?.chain_health_json, []);
  const calib = parseJson(report?.calibration_json, {});
  const evaluation = parseJson(report?.evaluation_json, {});
  const promotion = parseJson(report?.promotion_json, {});
  const drift = parseJson(report?.drift_json, {});
  const noPick = parseJson(report?.no_pick_json, {});
  const skipped = parseJson(report?.skipped_json, []);
  const evidence = parseJson(report?.feature_evidence_json, []);
  const activeModel = active || { champion_version: "—", challenger_version: "—", promotion_status: "—" };

  return (
    <SectionCard
      title="SELF-LEARNING LOOP — LEARNING CENTER"
      icon={<BrainCircuit className="w-4 h-4 text-primary" />}
      sub="The real state of the learning chain, read from the database — never from design intent. The cycle runs server-side: learning never depends on a browser staying open."
      right={
        isAdmin ? (
          <Button variant="outline" className="rounded-full h-8 px-3 text-[10px]" onClick={runCycle} disabled={running || loading}>
            {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
            RUN LEARNING CYCLE
          </Button>
        ) : null
      }
    >
      {loading && (
        <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the learning state…
        </p>
      )}
      {loadError && <EmptyState>Learning state read failed — retry shortly. Nothing was changed.</EmptyState>}

      {!loading && !report && (
        <EmptyState>
          No learning cycle has run yet. {isAdmin ? "Tap RUN LEARNING CYCLE to process the settled evidence for the first time." : "An administrator can run the first cycle."}
        </EmptyState>
      )}

      {!loading && report && (
        <>
          {/* LIVE STATUS */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-bold">
              LAST CYCLE {fmt(report.last_ran_at)}
            </span>
            <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-bold">
              {report.runs_count} RUN{report.runs_count === 1 ? "" : "S"}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${
              report.status === "completed" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-rose-400/40 bg-rose-400/10 text-rose-300"
            }`}>
              <CheckCircle2 className="w-3 h-3" /> {String(report.status || "").toUpperCase()}
            </span>
            <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-bold">
              {report.events_created} NEW EVENTS THIS RUN (0 on a re-run = idempotent)
            </span>
          </div>

          {/* HONEST STATE BANNER — never claims completion without evidence */}
          <DecisionBanner
            ok={false}
            title={
              promotion.changelog_decision === "PROMOTED"
                ? "VALIDATED MODEL PROMOTED — FUTURE PREDICTIONS USE THE NEW CHAMPION"
                : "LEARNING LOOP ACTIVE — MODEL UPDATE NOT YET PROMOTED · MORE VERIFIED OUTCOMES REQUIRED"
            }
          >
            {promotion.reason || "The promotion gate has not run yet."} No prediction is ever guaranteed — the engine's job is calibration and ruthless abstention, and it prefers NO PICK to a weak pick.
          </DecisionBanner>

          {/* COUNTS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="LEARNING EVENTS COUNTED" value={`${report.events_total} / ${report.eligible}`} hint="one per eligible settled selection" />
            <Stat label="WINS / LOSSES TRAINED" value={`${report.wins} W / ${report.losses} L`} hint="VOID/PUSH never train" />
            <Stat label="INSIGHTS (EVIDENCE-GATED)" value={report.insights_upserted} hint="10+ sample & material gap only" />
            <Stat
              label="NO-PICK RATE"
              value={noPick.no_pick_rate_pct != null ? `${noPick.no_pick_rate_pct}%` : "—"}
              hint={`${noPick.rejected_no_pick || 0} of ${noPick.candidates_evaluated || 0} candidates rejected`}
            />
          </div>

          {skipped.length > 0 && (
            <div className="rounded-xl border border-border/60 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-extrabold">SKIPPED OUTCOMES — REPORTED, NEVER FORCED</p>
              {skipped.slice(0, 6).map((s, i) => (
                <p key={i} className="text-[10px] text-muted-foreground">
                  …{String(s.id || "").slice(-16)} — {s.reason}
                </p>
              ))}
            </div>
          )}

          {/* CHAIN HEALTH */}
          <div className="rounded-xl border border-border/60 divide-y divide-border/40">
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-extrabold">
              LEARNING-CHAIN HEALTH CHECK — {chain.filter((c) => c.status === "COMPLETE").length}/{chain.length} COMPLETE
            </p>
            {chain.map((c) => (
              <StageRow key={c.stage} stage={c.stage} status={c.status} detail={c.detail} />
            ))}
          </div>

          {/* CALIBRATION */}
          <div className="rounded-xl border border-border/60 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-extrabold">CALIBRATION — MEASURED, NOT ASSUMED</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="SAMPLE" value={calib.n ?? "—"} />
              <Stat label="BRIER" value={calib.brier ?? "—"} />
              <Stat label="LOG LOSS" value={calib.logloss ?? "—"} />
              <Stat label="CALIB. ERROR (ECE)" value={calib.ece_pp != null ? `${calib.ece_pp}pp` : "—"} />
            </div>
            <p className="text-[10px] font-bold text-amber-300">{calib.status}</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{calib.note}</p>
            {Array.isArray(calib.buckets) && calib.buckets.some((b) => b.n) && (
              <div className="rounded-lg border border-border/40 divide-y divide-border/30">
                {calib.buckets.map((b) => (
                  <div key={b.bucket} className="flex items-center gap-3 px-2.5 py-1 text-[10px]">
                    <span className="font-bold w-16">{b.bucket}</span>
                    <span className="text-muted-foreground">n={b.n}</span>
                    <span className="text-muted-foreground ml-auto">predicted {b.avg_predicted_pct}%</span>
                    <span className="font-bold">observed {b.actual_pct != null ? `${b.actual_pct}%` : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MODEL EVALUATION + PROMOTION */}
          <div className="rounded-xl border border-border/60 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-extrabold">
              CHRONOLOGICAL MODEL EVALUATION — OLDER = TRAIN, NEWER = OOS (ZERO LEAKAGE)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="TRAIN / OOS" value={`${evaluation.train_n ?? "—"} / ${evaluation.oos_n ?? "—"}`} hint="70/30 chronological split" />
              <Stat label="ACTIVE CHAMPION" value={activeModel.champion_version} hint={`since ${fmt(activeModel.champion_since)}`} />
              <Stat label="CHALLENGER" value={activeModel.challenger_version} hint="recording in parallel" />
              <Stat label="PROMOTION DECISION" value={promotion.changelog_decision || "—"} hint={`min ${promotion.min_oos_sample ?? 50} OOS events`} />
            </div>
            {Object.keys(evaluation.models_all || {}).length > 0 && (
              <div className="rounded-lg border border-border/40 divide-y divide-border/30">
                {Object.entries(evaluation.models_all).map(([model, m]) => (
                  <div key={model} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-[10px]">
                    <span className="font-extrabold">{model}</span>
                    <span className="text-muted-foreground">settled {m.n}</span>
                    <span className="text-muted-foreground">hit {m.hit_rate_pct ?? "—"}%</span>
                    <span className="text-muted-foreground">Brier {m.brier ?? "—"}</span>
                    <span className="text-muted-foreground">log loss {m.logloss ?? "—"}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground leading-relaxed">{evaluation.method}</p>
          </div>

          {/* DRIFT + NO-PICK */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-extrabold">DRIFT MONITOR</p>
              <p className="text-[11px] font-bold text-amber-300 mt-1">{drift.verdict}</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">{drift.note}</p>
            </div>
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-extrabold">NO-PICK INTELLIGENCE</p>
              <p className="text-[11px] font-bold mt-1">
                {noPick.rejected_no_pick ?? 0} candidates rejected · {noPick.qualified ?? 0} qualified
              </p>
              <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">{noPick.note}</p>
            </div>
          </div>

          {/* FEATURE EVIDENCE — compact summary */}
          {evidence.length > 0 && (
            <div className="rounded-xl border border-border/60 p-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-extrabold">
                FEATURE EVIDENCE — {evidence.length} SEGMENTS EVALUATED (WINS AND LOSSES BOTH TRAIN)
              </p>
              {evidence
                .filter((r) => r.sample >= 3)
                .slice(0, 12)
                .map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-2.5 px-1 text-[10px]">
                    <span className="font-bold min-w-[110px]">
                      {r.dim}: {r.value}
                    </span>
                    <span className="text-muted-foreground">n={r.sample}</span>
                    <span className="text-muted-foreground">predicted {r.expected_pct}%</span>
                    <span className="font-bold">observed {r.actual_pct}%</span>
                    <span
                      className={`ml-auto font-extrabold ${
                        r.verdict === "OVERCONFIDENT" ? "text-amber-300" : r.verdict === "UNDERCONFIDENT" ? "text-sky-300" : r.verdict === "WELL CALIBRATED" ? "text-emerald-300" : "text-muted-foreground"
                      }`}
                    >
                      {r.verdict}
                    </span>
                  </div>
                ))}
              <p className="text-[10px] text-muted-foreground">
                Segments under 5 samples are stored as INSUFFICIENT SAMPLE — reported, never forced into a conclusion.
              </p>
            </div>
          )}
        </>
      )}

      {/* RUN RESULT */}
      {running && (
        <p className="text-[11px] text-sky-300 inline-flex items-center gap-1.5 font-bold">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> LEARNING CYCLE RUNNING SERVER-SIDE — events, evidence, calibration, evaluation, promotion gate…
        </p>
      )}
      {runResult && (
        <div className={`rounded-xl border px-3 py-2.5 ${runResult.ok ? "border-emerald-400/40 bg-emerald-400/5" : "border-rose-400/40 bg-rose-400/10"}`}>
          <p className={`text-[11px] font-extrabold ${runResult.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {runResult.ok ? (
              <>
                CYCLE COMPLETE — {runResult.events_created} NEW EVENT{runResult.events_created === 1 ? "" : "S"} · {runResult.events_total} TOTAL COUNTED · {runResult.wins}W/{runResult.losses}L · {runResult.evaluation?.decision}
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 inline mr-1" /> CYCLE FAILED — {runResult.error}
              </>
            )}
          </p>
          {runResult.ok && <p className="text-[10px] text-muted-foreground mt-1">Re-running changes nothing — the same result is counted exactly once.</p>}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        This center reports learning, not analytics: a Google Sheet, a dashboard chart or an insight row is never treated as model
        improvement. Only a challenger that beats the champion on chronological out-of-sample evidence can be promoted — and with 18
        settled events the honest state is {activeModel.promotion_status}.
      </p>
    </SectionCard>
  );
}