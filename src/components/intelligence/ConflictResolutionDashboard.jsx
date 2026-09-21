import React from "react";
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, ShieldCheck, UserCheck } from "lucide-react";
import { SectionCard } from "@/components/kala/Bits";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { CONFLICT_FIXTURE } from "@/lib/globalLearning/conflictResolution";
import { ATHLETICS_SERIES_FIXTURES } from "@/lib/globalLearning/fixtureIdentity";
import ConflictTrendChart from "./ConflictTrendChart";
import FixtureMismatchPanel from "./FixtureMismatchPanel";
import DisputeRowReview from "./DisputeRowReview";

const SETTLED = ["won", "lost", "void", "push", "cancelled"];
const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " WAT"
    : "—";

// SETTLEMENT CONFLICT REVIEW — Athletics vs Toronto Blue Jays. TASK 47126
// RECLASSIFIED this case: it is a FALSE CONFLICT (FIXTURE ID MISMATCH) — the
// 6–5 (7 Sept, espn-401816851) and 2–0 (9 Sept, espn-401816866) results are
// BOTH CORRECT and belong to DIFFERENT games of the same series. The three
// score-resolution buttons are intentionally NOT shown for this case; the
// single admin action is RECONCILE FIXTURE IDENTITIES (two-step confirm,
// live revalidation, audit-first, idempotent).
export default function ConflictResolutionDashboard({ bgSync = "idle" }) {
  const [state, setState] = React.useState("loading");
  const [preds, setPreds] = React.useState([]);
  const [outcomes, setOutcomes] = React.useState([]);
  const [resolutions, setResolutions] = React.useState([]);
  const [reconciliations, setReconciliations] = React.useState([]);
  const [me, setMe] = React.useState(null);

  const load = React.useCallback(async () => {
    setState("loading");
    try {
      const [p, o, r, rec] = await Promise.all([
        base44.entities.GlobalPredictionLedger.filter({ fixture_id: CONFLICT_FIXTURE.fixtureId }, "created_date", 1000),
        base44.entities.GlobalOutcomeLedger.filter({ global_prediction_id: CONFLICT_FIXTURE.gid }, "created_date", 100),
        base44.entities.ConflictResolutionRecord.filter({}, "-created_date", 100),
        base44.entities.FixtureReconciliationRecord.filter({}, "-created_date", 10),
      ]);
      setPreds(Array.isArray(p) ? p : []);
      setOutcomes(Array.isArray(o) ? o : []);
      setResolutions(Array.isArray(r) ? r : []);
      setReconciliations(Array.isArray(rec) ? rec : []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    base44.auth.me().then((u) => setMe(u)).catch(() => setMe(null));
  }, []);

  const settledRows = preds.filter((r) => SETTLED.includes(r.status));
  const openCount = preds.length - settledRows.length;
  const evidences = [];
  for (const r of settledRows) {
    const e = evidences.find((x) => x.verification === (r.verification || "none") && x.home === r.actual_home && x.away === r.actual_away);
    if (e) { e.rows++; continue; }
    evidences.push({ verification: r.verification || "none", home: r.actual_home, away: r.actual_away, source: r.result_source, settledAt: r.settled_at, status: r.status, rows: 1 });
  }
  const reconciled = reconciliations.some((r) => r.status === "CONFIRMED");
  const misgradedRows = settledRows.filter(
    (r) => r.verification !== "verified_provider" || Number(r.actual_home) !== 2 || Number(r.actual_away) !== 0
  ).length;

  const chartRecords = [
    ...resolutions,
    ...reconciliations.map((r) => ({ ...r, confirmed_at: r.performed_at || r.confirmed_at })),
  ];

  return (
    <SectionCard
      title="SETTLEMENT CONFLICT REVIEW — ATHLETICS VS TORONTO BLUE JAYS"
      icon={<FileSearch className="w-4 h-4 text-primary" />}
      sub={`MLB · ${CONFLICT_FIXTURE.fixtureId} · ${CONFLICT_FIXTURE.disputedDate} · ${CONFLICT_FIXTURE.market} — RECLASSIFIED: FIXTURE ID MISMATCH (false conflict — same teams, different games).`}
    >
      {/* LIVE STATUS */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-bold">{preds.length} LEDGER ROWS</span>
        <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-bold">{settledRows.length} SETTLED</span>
        <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-bold">{openCount} OPEN COPIES</span>
        <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-bold">{outcomes.length} OUTCOME ROWS</span>
        {state === "ready" && (
          reconciled ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-extrabold text-emerald-300">
              <CheckCircle2 className="w-3 h-3" /> FIXTURE IDENTITIES RECONCILED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-extrabold text-amber-300">
              <AlertTriangle className="w-3 h-3" /> FIXTURE ID MISMATCH — RECONCILIATION REQUIRED
            </span>
          )
        )}
      </div>

      {/* SYNCING STATE — background reconciliations / ledger updates are always visible */}
      {(bgSync === "syncing" || bgSync === "failed") && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${
            bgSync === "syncing" ? "border-sky-400/40 bg-sky-400/10 text-sky-300" : "border-amber-400/40 bg-amber-400/10 text-amber-300"
          }`}
        >
          {bgSync === "syncing" && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 mt-0.5" />}
          <p className="text-[11px] font-extrabold tracking-wide leading-relaxed">
            {bgSync === "syncing"
              ? "SYNCING — BACKGROUND RECONCILIATION / LEDGER UPDATE IN PROGRESS. The figures below refresh automatically when the update completes; the last verified data stays visible meanwhile."
              : "PARTIAL — BACKGROUND UPDATE WAS INTERRUPTED · LAST VERIFIED DATA RETAINED. Tap “Sync all sections” at the top to force a full refresh."}
          </p>
        </div>
      )}

      {state === "loading" && (
        <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the live fixture rows…</p>
      )}
      {state === "error" && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-400/30 bg-rose-400/5 px-3 py-2">
          <p className="text-[11px] text-rose-200">Live read failed — retry shortly. Nothing was changed.</p>
          <Button variant="outline" className="rounded-full h-7 px-3 text-[10px]" onClick={load}>RETRY</Button>
        </div>
      )}

      {state === "ready" && (
        <>
          {/* KEY FINDING — FALSE CONFLICT */}
          <div className="rounded-2xl border border-amber-400/50 bg-amber-400/10 p-3.5 space-y-2.5">
            <p className="text-[11px] font-extrabold tracking-wide text-amber-300 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> KEY FINDING — FALSE CONFLICT: SAME TEAMS, DIFFERENT FIXTURES
            </p>
            <p className="text-[11px]">
              The two results are valid but belong to different Athletics vs Toronto Blue Jays games. This is NOT a 6–5 vs 2–0
              score dispute — it is a <b>fixture-ID collision</b>: the user import attached the 7 September result (6–5,
              espn-401816851) to the 9 September fixture (espn-401816866).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 space-y-1">
                <p className="text-[10px] font-extrabold text-emerald-300 inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> SEPTEMBER 7 — espn-401816851
                </p>
                <p className="text-2xl font-extrabold tracking-tight">6–5</p>
                <p className="text-[10px] text-muted-foreground">
                  Athletics walk-off win · MLB official video · kickoff {ATHLETICS_SERIES_FIXTURES[0].kickoff} — the correct home of the 6–5 evidence.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 space-y-1">
                <p className="text-[10px] font-extrabold text-emerald-300 inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> SEPTEMBER 9 — espn-401816866
                </p>
                <p className="text-2xl font-extrabold tracking-tight">2–0</p>
                <p className="text-[10px] text-muted-foreground">
                  Athletics win · MLB official game story + Reuters · kickoff {ATHLETICS_SERIES_FIXTURES[1].kickoff} — the disputed fixture's authoritative result.
                </p>
              </div>
            </div>
            <p className="text-[11px] font-bold text-amber-200">
              Both results are independently verified. They are different games. The correct fix is to RECONCILE the fixture
              identities — not to confirm one score over the other.
            </p>
          </div>

          {/* ROW-LEVEL PROVENANCE — what currently sits on the 9 Sept fixture */}
          {settledRows.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-extrabold">
                ROW-LEVEL PROVENANCE — {settledRows.length} SETTLED ROW{settledRows.length === 1 ? "" : "S"} ON espn-401816866
                {misgradedRows > 0 && !reconciled ? ` · ${misgradedRows} ROW(S) CARRY THE OTHER FIXTURE'S RESULT` : ""}
              </p>
              <div className="rounded-xl border border-border/60 divide-y divide-border/40">
                {settledRows.slice(0, 12).map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-[10px]">
                    <span className="font-mono text-muted-foreground">…{String(r.global_prediction_id || r.id).slice(-14)}</span>
                    <span className="font-bold">{r.actual_home}–{r.actual_away}</span>
                    <span className={r.verification === "user_supplied" ? "text-amber-300 font-bold" : "text-emerald-300 font-bold"}>{(r.verification || "none").toUpperCase()}</span>
                    <span className="text-muted-foreground truncate max-w-[45%]">{r.result_source || "no source"}</span>
                    <span className="text-muted-foreground whitespace-nowrap ml-auto">{fmt(r.settled_at)}</span>
                  </div>
                ))}
                {settledRows.length > 12 && (
                  <p className="px-3 py-1.5 text-[10px] text-muted-foreground">+ {settledRows.length - 12} more rows</p>
                )}
              </div>
            </div>
          )}

          {/* DATA ACCURACY TREND — resolved vs pending disputes, last month */}
          <ConflictTrendChart records={chartRecords} livePending={!reconciled ? 1 : 0} />

          {/* FIXTURE MISMATCH PANEL — reclassify + reconcile (two-step admin confirmation) */}
          <FixtureMismatchPanel reconciled={reconciled} isAdmin={me?.role === "admin"} me={me} onDone={load} />

          {/* DISPUTE ROW REVIEW — instant per-row approve/discard on every row in dispute */}
          <DisputeRowReview isAdmin={me?.role === "admin"} me={me} />
        </>
      )}
    </SectionCard>
  );
}