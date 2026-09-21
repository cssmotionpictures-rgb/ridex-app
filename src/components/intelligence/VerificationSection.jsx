import React from "react";
import { ShieldCheck, Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { verifySettlements } from "@/lib/globalLearning/verifyLedger";

// SETTLEMENT VERIFICATION (admin) — the automatic auditor that cross-references
// the day's settled results against the prediction ledger. Runs on its own when
// the section opens and on every window change; every settled row is re-graded
// from its stored real final score and cross-referenced across the observation
// ledger, the global ledger, the outcome ledger and the mirrored sections
// (RUN O, MONSTER). Discrepancies are reported, never silently corrected.

const WINDOWS = [
  [1, "TODAY"],
  [3, "3 DAYS"],
  [7, "7 DAYS"],
];

const SEVERITY_STYLE = {
  HIGH: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  MED: "border-amber-400/30 bg-amber-400/10 text-amber-300",
};

export default function VerificationSection() {
  const [days, setDays] = React.useState(1);
  const [report, setReport] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [running, setRunning] = React.useState(true);

  const run = React.useCallback(async (d) => {
    setRunning(true);
    try {
      const r = await verifySettlements({ days: d });
      setReport(r);
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setRunning(false);
  }, []);

  React.useEffect(() => {
    run(days);
  }, [days, run]);

  const high = report?.severityCounts?.HIGH || 0;
  const med = report?.severityCounts?.MED || 0;
  const readFailures = report?.readFailures || 0;

  return (
    <SectionCard
      title="SETTLEMENT VERIFICATION"
      icon={<ShieldCheck className="w-4 h-4 text-primary" />}
      sub="Automatically re-grades every settled result from its stored real final score and cross-references it across the observation ledger, the global ledger, the outcome ledger and the mirrored boards (RUN O, MONSTER). Mismatches are reported — never silently corrected."
      right={
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => run(days)} disabled={running}>
          {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Re-run
        </Button>
      }
    >
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {WINDOWS.map(([d, label]) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-full px-3.5 py-2 text-[11px] font-bold whitespace-nowrap min-h-[36px] inline-flex items-center transition-colors ${
              days === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {running && !report ? (
        <p className="text-xs text-muted-foreground">Reading the settled ledgers and re-grading the window…</p>
      ) : failed ? (
        <EmptyState>The ledgers could not be read right now — tap Re-run.</EmptyState>
      ) : !report ? null : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              label="ROWS CROSS-REFERENCED"
              value={report.checked}
              hint={`${report.breakdown.observations} observations · ${report.breakdown.globalLedger} global · ${report.breakdown.mirrors} mirrored`}
            />
            <Stat
              label="HIGH MISMATCHES"
              value={high}
              tone={high ? "text-rose-300" : "text-emerald-300"}
              hint="wrong grade, wrong status or wrong score"
            />
            <Stat label="MEDIUM FLAGS" value={med} tone={med ? "text-amber-300" : "text-emerald-300"} hint="missing ledger/outcome rows, unsettled mirrors" />
            <Stat
              label="VERDICT"
              value={
                report.checked === 0
                  ? readFailures
                    ? "PARTIAL READ"
                    : "NO DATA"
                  : report.allConsistent
                  ? "ACCURATE"
                  : "REVIEW"
              }
              tone={
                report.checked === 0
                  ? readFailures
                    ? "text-amber-300"
                    : ""
                  : report.allConsistent
                  ? "text-emerald-300"
                  : "text-rose-300"
              }
              hint={`window ${report.dateKey}${report.days > 1 ? ` · last ${report.days} days` : ""} · ${report.route === "server-assisted" ? "server-assisted read" : "direct read"}`}
            />
          </div>

          {readFailures > 0 && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-200">
                {readFailures} ledger layer{readFailures > 1 ? "s" : ""} could not be read right now (traffic
                throttle) — the cross-check ran on the layers it could reach and never presents a failed read as
                "nothing settled". Tap Re-run once traffic settles for the full audit.
              </p>
            </div>
          )}

          {report.checked === 0 ? (
            readFailures ? (
              <EmptyState>Not every ledger layer could be read yet — tap Re-run for the full audit.</EmptyState>
            ) : (
              <EmptyState>Nothing settled in this window yet — the auditor runs again automatically as results land.</EmptyState>
            )
          ) : report.allConsistent && readFailures === 0 ? (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
              <p className="text-[11px] text-emerald-200">
                EVERYTHING MARKED ACCURATELY — all {report.checked} settled rows re-graded from their stored real final
                scores and cross-referenced across every ledger layer with no discrepancies.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-extrabold flex items-center gap-1.5 text-rose-300">
                <AlertTriangle className="w-3.5 h-3.5" /> {report.mismatches.length} DISCREPANC{report.mismatches.length === 1 ? "Y" : "IES"} — REVIEW REQUIRED
              </p>
              <div className="rounded-2xl border border-border/60 bg-secondary/40 divide-y divide-border/40 max-h-72 overflow-y-auto">
                {report.mismatches.map((m, i) => (
                  <div key={i} className="px-3 py-2 flex items-start gap-2">
                    <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${SEVERITY_STYLE[m.severity] || ""}`}>
                      {m.severity} · {m.kind}
                    </span>
                    <p className="text-[11px] text-muted-foreground min-w-0">{m.summary}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                The auditor reports only — it never rewrites a settled record. Fix the source (usually by re-running a
                section sync or settlement mirroring) and re-run verification to confirm.
              </p>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}