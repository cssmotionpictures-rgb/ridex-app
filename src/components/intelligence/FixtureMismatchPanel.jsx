import React from "react";
import { AlertTriangle, CheckCircle2, GitMerge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { ATHLETICS_SERIES_FIXTURES, FIXTURE_MISMATCH_STATEMENT } from "@/lib/globalLearning/fixtureIdentity";
import { readReconciliationSnapshot, executeFixtureReconciliation } from "@/lib/globalLearning/fixtureReconciliation";

const RECONCILE_BULLETS = [
  "keep Athletics 6–5 under espn-401816851 (7 Sept 2026)",
  "keep Athletics 2–0 under espn-401816866 (9 Sept 2026)",
  "regrade only records proven to carry the other fixture's result, using the existing settlement engine",
  "preserve every original association as immutable audit history",
  "never delete evidence and never touch unrelated fixtures",
];

// FIXTURE MISMATCH PANEL — TASK 47126. This case is a FALSE CONFLICT (same
// teams, different games), so the three score-resolution buttons are NOT
// shown here; the single action is RECONCILE FIXTURE IDENTITIES, guarded by
// the same two-step confirm: FIRST CLICK = ARM (fresh snapshot, zero writes),
// SECOND CLICK = EXECUTE (revalidated live; any drift aborts with zero
// writes), CANCEL = DISARM.
export default function FixtureMismatchPanel({ reconciled, isAdmin, me, onDone }) {
  const [armed, setArmed] = React.useState(false);
  const [armedSnapshot, setArmedSnapshot] = React.useState(null);
  const [arming, setArming] = React.useState(false);
  const [executing, setExecuting] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const arm = async () => {
    setArming(true);
    setResult(null);
    try {
      const snap = await readReconciliationSnapshot(base44);
      setArmedSnapshot(snap);
      setArmed(true);
    } catch {
      setResult({
        aborted: true,
        code: "PAUSED",
        message: "RECONCILIATION PAUSED — CURRENT FIXTURE STATE COULD NOT BE VERIFIED. Nothing was changed.",
      });
    }
    setArming(false);
  };

  const disarm = () => {
    setArmed(false);
    setArmedSnapshot(null);
  };

  const executeArmed = async () => {
    if (executing || !armed || !armedSnapshot) return;
    setExecuting(true);
    let res;
    try {
      res = await executeFixtureReconciliation({
        armedSnapshot,
        performedBy: me?.email || me?.id || "admin",
      });
    } catch (e) {
      res = {
        failed: true,
        step: "unexpected error",
        error: String(e?.message || e),
        message: "RECONCILIATION FAILED — NO PARTIAL RECONCILIATION WAS ACCEPTED. The audit-first record makes a retry safe.",
      };
    }
    disarm();
    setResult(res);
    setExecuting(false);
    if (res?.complete || res?.alreadyReconciled) onDone?.();
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-card/60 p-3.5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-extrabold tracking-wide inline-flex items-center gap-1.5">
            <GitMerge className="w-4 h-4 text-primary" /> FIXTURE ID MISMATCH
          </p>
          <p className="text-[10px] text-muted-foreground">FALSE CONFLICT — SAME TEAMS, DIFFERENT FIXTURES</p>
        </div>
        {reconciled ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-extrabold text-emerald-300">
            <CheckCircle2 className="w-3 h-3" /> STATUS: RECONCILED
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-extrabold text-amber-300">
            <AlertTriangle className="w-3 h-3" /> STATUS: RECONCILIATION REQUIRED
          </span>
        )}
      </div>

      <p className="text-[11px]">
        The two results are valid but belong to different Athletics vs Toronto Blue Jays games.{" "}
        <b>Both results are independently verified. They are different games.</b>
      </p>

      {/* VERIFIED EVIDENCE — the two separate games */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ATHLETICS_SERIES_FIXTURES.map((f) => (
          <div key={f.fixtureId} className="rounded-xl border border-border/60 bg-background/40 p-2.5 space-y-0.5">
            <p className="text-[10px] font-extrabold text-primary">SEPTEMBER {f.gameDate.slice(-2)} · {f.kickoff}</p>
            <p className="text-lg font-extrabold tracking-tight">Athletics {f.score[0]}–{f.score[1]} Toronto Blue Jays</p>
            <p className="text-[10px] text-muted-foreground">Fixture: {f.fixtureId}</p>
            <p className="text-[9px] text-muted-foreground">{f.evidence}</p>
          </div>
        ))}
      </div>

      {/* ACTIONS */}
      {!isAdmin ? (
        <div className="rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 space-y-1">
          <p className="text-[11px] font-extrabold text-muted-foreground">RECONCILIATION — ADMIN ONLY</p>
          <p className="text-[10px] text-muted-foreground">
            Correcting the fixture association regrades result, outcome and settlement records — only an admin can execute it.
          </p>
        </div>
      ) : reconciled ? (
        <p className="text-[10px] text-emerald-300 font-bold">
          Reconciliation complete — both fixtures carry their own verified result. No further action is needed.
        </p>
      ) : armed ? (
        <div className="rounded-xl border border-primary/50 bg-primary/10 p-3 space-y-2">
          <p className="text-[11px] font-extrabold text-primary">CONFIRM RECONCILIATION</p>
          <p className="text-[11px]">
            You are about to reconcile: <b>{FIXTURE_MISMATCH_STATEMENT}</b>
          </p>
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <p>This will:</p>
            {RECONCILE_BULLETS.map((b) => (
              <p key={b}>• {b}</p>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="rounded-full text-[10px] h-7 px-3" onClick={executeArmed} disabled={executing}>
              {executing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null} EXECUTE RECONCILIATION
            </Button>
            <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 px-3" onClick={disarm} disabled={executing}>
              CANCEL
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Both fixtures are re-read and revalidated at execute time — if anything changed since you armed the button, the
            reconciliation stops with zero writes.
          </p>
        </div>
      ) : (
        <>
          <Button size="sm" className="rounded-full text-[10px] h-7 px-3" onClick={arm} disabled={arming || executing}>
            {arming ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <GitMerge className="w-3 h-3 mr-1" />} RECONCILE FIXTURE IDENTITIES
          </Button>
          <p className="text-[10px] text-muted-foreground">
            FIRST CLICK = ARM · SECOND CLICK = EXECUTE · CANCEL disarms without changes. The three score-resolution buttons are
            intentionally NOT shown for this case — they are reserved for genuine same-fixture conflicting-result disputes.
          </p>
        </>
      )}

      {executing && (
        <p className="text-[10px] text-primary inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Executing — revalidating, auditing, then correcting associations…
        </p>
      )}

      {/* RESULT DISPLAY */}
      {result?.complete && (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 space-y-1">
          <p className="text-[11px] font-extrabold text-emerald-300">RECONCILIATION COMPLETE</p>
          <p className="text-[10px] text-muted-foreground">
            {result.correctedPredictions} prediction row(s) and {result.correctedOutcomes} outcome row(s) regraded under their own
            fixtures · {result.untouchedRows} row(s) verified correct and untouched · both results preserved.
          </p>
          {Array.isArray(result.verification?.checks) &&
            result.verification.checks.map((c) => (
              <p key={c.label} className={`text-[10px] ${c.pass ? "text-emerald-300" : "text-rose-300"}`}>
                • {c.label} — {c.pass ? "PASS" : "FAIL"} ({c.detail})
              </p>
            ))}
          {result.verification?.allPassed == null && (
            <p className="text-[10px] text-amber-300">{result.verification?.note}</p>
          )}
        </div>
      )}
      {result?.aborted && (
        <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 py-2 space-y-0.5">
          <p className="text-[11px] font-extrabold text-rose-300">{result.message}</p>
          {result.detail && <p className="text-[10px] text-rose-200/80">Reason: {result.detail}</p>}
          <p className="text-[10px] text-muted-foreground">ZERO writes were made.</p>
        </div>
      )}
      {result?.alreadyReconciled && <p className="text-[10px] text-emerald-300 font-bold">{result.message}</p>}
      {result?.failed && (
        <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 py-2 space-y-0.5">
          <p className="text-[11px] font-extrabold text-rose-300">RECONCILIATION FAILED — NO PARTIAL RECONCILIATION WAS ACCEPTED</p>
          <p className="text-[10px] text-muted-foreground">
            Failed at {result.step}: {result.error}. The audit-first record makes a retry safe and idempotent.
          </p>
        </div>
      )}
    </div>
  );
}