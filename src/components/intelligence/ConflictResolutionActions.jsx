import React from "react";
import { AlertTriangle, CheckCircle2, Gavel, Loader2, ShieldCheck, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { CONFLICT_FIXTURE, RESOLUTION_CHOICES, executeConflictResolution, readConflictSnapshot } from "@/lib/globalLearning/conflictResolution";

const ARM_BULLETS = [
  "make this result canonical",
  "regrade the affected prediction with the existing settlement engine (never a manual WIN/LOSS)",
  "preserve the conflicting evidence verbatim in the resolution record",
  "archive only verified duplicate copies, each with an immutable audit entry",
  "create an immutable resolution audit record",
];

// RESOLUTION CARD — spec-exact two-step confirmation. FIRST CLICK = ARM (a
// fresh conflict snapshot is taken), SECOND CLICK = EXECUTE (the snapshot is
// re-read and revalidated server-side first — any drift aborts with ZERO
// writes), CANCEL = DISARM WITHOUT CHANGES. The real resolution is only ever
// executed from the second press.
export default function ConflictResolutionActions({ conflictOpen, isAdmin, me, onDone }) {
  const [armed, setArmed] = React.useState("");
  const [armedSnapshot, setArmedSnapshot] = React.useState(null);
  const [arming, setArming] = React.useState(false);
  const [executing, setExecuting] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const armChoice = async (key) => {
    setArming(true);
    setResult(null);
    try {
      const snap = await readConflictSnapshot(base44, CONFLICT_FIXTURE);
      setArmedSnapshot(snap);
      setArmed(key);
    } catch {
      setResult({
        aborted: true,
        code: "PAUSED",
        message: "RESOLUTION PAUSED — CURRENT CONFLICT COULD NOT BE VERIFIED. Nothing was changed.",
      });
    }
    setArming(false);
  };

  const disarm = () => {
    setArmed("");
    setArmedSnapshot(null);
  };

  const executeArmed = async () => {
    if (executing || !armed || !armedSnapshot) return;
    setExecuting(true);
    let res;
    try {
      res = await executeConflictResolution({
        choiceKey: armed,
        armedSnapshot,
        confirmedBy: me?.email || me?.id || "admin",
      });
    } catch (e) {
      res = {
        failed: true,
        step: "unexpected error",
        error: String(e?.message || e),
        message: "RESOLUTION FAILED — NO PARTIAL RESOLUTION WAS ACCEPTED. The audit-first record makes a retry safe.",
      };
    }
    disarm();
    setResult(res);
    setExecuting(false);
    if (res?.complete || res?.alreadyResolved) onDone?.();
  };

  const armedChoice = armed ? RESOLUTION_CHOICES[armed] : null;

  return (
    <div className="rounded-2xl border border-primary/30 bg-card/60 p-3.5 space-y-3">
      {/* CONFLICT CARD HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-extrabold tracking-wide inline-flex items-center gap-1.5">
            <Gavel className="w-4 h-4 text-primary" /> {CONFLICT_FIXTURE.home.toUpperCase()} VS {CONFLICT_FIXTURE.away.toUpperCase()}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Fixture: {CONFLICT_FIXTURE.fixtureId} · {CONFLICT_FIXTURE.league} · {CONFLICT_FIXTURE.disputedDate} · {CONFLICT_FIXTURE.market}
          </p>
        </div>
        {conflictOpen ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-400/10 px-2.5 py-1 text-[10px] font-extrabold text-rose-300">
            <AlertTriangle className="w-3 h-3" /> STATUS: REVIEW
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-extrabold text-emerald-300">
            <CheckCircle2 className="w-3 h-3" /> STATUS: RESOLVED
          </span>
        )}
      </div>

      {/* EVIDENCE SUMMARY */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-2.5 space-y-0.5">
          <p className="text-[10px] font-extrabold text-emerald-300 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Provider
          </p>
          <p className="text-lg font-extrabold tracking-tight">{CONFLICT_FIXTURE.verifiedScore.home}–{CONFLICT_FIXTURE.verifiedScore.away}</p>
          <p className="text-[9px] text-muted-foreground">ESPN verified feed</p>
        </div>
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-2.5 space-y-0.5">
          <p className="text-[10px] font-extrabold text-amber-300 inline-flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" /> User
          </p>
          <p className="text-lg font-extrabold tracking-tight">{CONFLICT_FIXTURE.userImportedScore.home}–{CONFLICT_FIXTURE.userImportedScore.away}</p>
          <p className="text-[9px] text-muted-foreground">user import — attached to {CONFLICT_FIXTURE.importSourceFixtureId}</p>
        </div>
      </div>

      {/* ACTIONS */}
      {!isAdmin ? (
        <div className="rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 space-y-1">
          <p className="text-[11px] font-extrabold text-muted-foreground">RESOLUTION — ADMIN ONLY</p>
          <p className="text-[10px] text-muted-foreground">
            Confirming a score or voiding would modify result, outcome, prediction and learning records — only an admin can execute a
            resolution, and only after the fixture-association error ({CONFLICT_FIXTURE.importSourceFixtureId} → {CONFLICT_FIXTURE.fixtureId})
            is confirmed. No automatic settlement correction ever runs.
          </p>
        </div>
      ) : !conflictOpen ? (
        <p className="text-[10px] text-emerald-300 font-bold">
          No dispute pending — one canonical record remains. No resolution action is needed.
        </p>
      ) : armedChoice ? (
        <div className="rounded-xl border border-primary/50 bg-primary/10 p-3 space-y-2">
          <p className="text-[11px] font-extrabold text-primary">CONFIRM RESOLUTION</p>
          <p className="text-[11px]">
            You are about to confirm: <b>{armedChoice.confirmLine}</b>
          </p>
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <p>This will:</p>
            {ARM_BULLETS.map((b) => (
              <p key={b}>• {b}</p>
            ))}
            {armedChoice.key === "void" && <p>• award no WIN, no LOSS and no PUSH — the result counts toward nothing</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="rounded-full text-[10px] h-7 px-3" onClick={executeArmed} disabled={executing}>
              {executing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null} EXECUTE RESOLUTION
            </Button>
            <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 px-3" onClick={disarm} disabled={executing}>
              CANCEL
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            The conflict is re-read and revalidated at execute time — if anything changed since you armed the button, the resolution
            stops with zero writes.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {Object.values(RESOLUTION_CHOICES).map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={arming || executing}
                onClick={() => armChoice(c.key)}
                className="rounded-xl border border-border bg-secondary/50 hover:border-primary/50 px-3 py-2 text-[10px] font-extrabold text-left leading-snug transition-colors disabled:opacity-50"
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            FIRST CLICK = ARM · SECOND CLICK = EXECUTE · CANCEL disarms without changes. {RESOLUTION_CHOICES.espn.note}
          </p>
        </>
      )}

      {executing && (
        <p className="text-[10px] text-primary inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Executing — revalidating, auditing, then archiving…
        </p>
      )}

      {/* RESULT DISPLAY */}
      {result?.complete && (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 space-y-1">
          <p className="text-[11px] font-extrabold text-emerald-300">RESOLUTION COMPLETE — {result.confirmed}</p>
          <p className="text-[10px] text-muted-foreground">
            Settlement <b className="text-foreground">{String(result.status).toUpperCase()}</b> calculated by the settlement engine ·{" "}
            {result.archivedPredictions} duplicate prediction row(s) and {result.archivedOutcomes} duplicate outcome row(s) archived with a
            full audit trail.
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
      {result?.alreadyResolved && (
        <p className="text-[10px] text-emerald-300 font-bold">{result.message}</p>
      )}
      {result?.failed && (
        <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 py-2 space-y-0.5">
          <p className="text-[11px] font-extrabold text-rose-300">RESOLUTION FAILED — NO PARTIAL RESOLUTION WAS ACCEPTED</p>
          <p className="text-[10px] text-muted-foreground">
            Failed at {result.step}: {result.error}. The audit-first record makes a retry safe and idempotent.
          </p>
        </div>
      )}
    </div>
  );
}