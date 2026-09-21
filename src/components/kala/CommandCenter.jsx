import React from "react";
import { Activity, ShieldAlert, CircleDot, Eye, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stat, SectionCard } from "@/components/kala/Bits";
import { kalaAnalytics, sampleLabel } from "@/lib/kala";

const STATUS = {
  active: { label: "🟢 ACTIVE", cls: "text-emerald-300", note: "Engine scanned, qualifying picks on the board." },
  limited: { label: "🟡 LIMITED DATA", cls: "text-amber-300", note: "The odds provider is unavailable — picks shown are model-only estimates, honestly labeled." },
  noedge: { label: "🔴 NO QUALIFYING EDGE", cls: "text-rose-300", note: "The engine scanned and rejected everything today. NO BET IS A VALID MODEL DECISION." },
};

// KALA COMMAND CENTER — the dashboard. Every number is real: from the board's
// scan report and the immutable EnginePrediction ledger.
export default function CommandCenter({ board, preds, status }) {
  const [showRejections, setShowRejections] = React.useState(false);
  const report = board?.report || {};
  const st = STATUS[status] || STATUS.noedge;
  const a = kalaAnalytics(preds);

  const open = preds.filter((r) => r.status === "open");
  const now = Date.now();
  const pending = open.filter((r) => r.kickoff && new Date(r.kickoff).getTime() > now);
  const live = open.filter(
    (r) => r.kickoff && new Date(r.kickoff).getTime() <= now && new Date(r.kickoff).getTime() > now - 5 * 3600000
  );
  const priced = preds.length ? Math.round((preds.filter((r) => (r.market_odds || 0) > 1).length / preds.length) * 100) : null;

  const rejectionCounts = {};
  (board?.rejected || []).forEach((r) => {
    rejectionCounts[r.reason] = (rejectionCounts[r.reason] || 0) + 1;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border/60 bg-card p-5">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">KALA INTELLIGENCE STATUS</p>
        <p className={`text-2xl font-extrabold mt-1 ${st.cls}`}>{st.label}</p>
        <p className="text-xs text-muted-foreground mt-1.5">{st.note}</p>
        <p className="text-[10px] text-muted-foreground mt-2">
          MODEL: KALA-MASTER-1.0 · core ensemble RX-2.0 · {report.scannedAt ? `scanned ${new Date(report.scannedAt).toLocaleString("en-NG")}` : "scan pending"}
        </p>
      </div>

      <SectionCard
        title="KALA MASTER SIGNAL"
        icon={<CircleDot className="w-4 h-4 text-primary" />}
        sub="The engine identifies the games where the evidence is strongest and rejects everything else."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="QUALIFYING PICKS" value={report.qualifying ?? 0} tone="text-primary" />
          <Stat label="ELITE / ULTRA" value={(report.grades?.ELITE || 0) + (report.grades?.["ULTRA ELITE"] || 0)} />
          <Stat label="STRONG" value={report.grades?.STRONG || 0} />
          <Stat label="QUALIFYING TIER" value={report.grades?.QUALIFYING || 0} />
          <Stat label="BIG HAMMER" value={report.bigHammer ?? 0} hint="3.00+ qualifiers" />
          <Stat label="REJECTED" value={report.rejected ?? 0} tone="text-rose-300" />
          <Stat label="FIXTURES SCANNED" value={report.fixturesScanned ?? 0} />
          <Stat label="MARKETS SCANNED" value={report.marketsScanned ?? 0} />
        </div>
      </SectionCard>

      <SectionCard title="TODAY · LEDGER" icon={<Activity className="w-4 h-4 text-primary" />}
        sub="Live counts from the permanent prediction ledger — recorded pre-kickoff, graded from real results.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="PENDING PREDICTIONS" value={pending.length} />
          <Stat label="LIVE / AWAITING RESULT" value={live.length} />
          <Stat label="WINS" value={a.won} tone="text-emerald-300" />
          <Stat label="LOSSES" value={a.graded - a.won} tone="text-rose-300" />
          <Stat label="CURRENT STREAK" value={a.streak ? `${a.streak}W` : "—"} hint={a.graded ? sampleLabel(a.graded) : "no settled picks yet"} />
          <Stat label="MODEL HEALTH" value={a.graded ? (a.calErr != null && Math.abs(a.calErr) <= 10 ? "OK" : "WARNING") : "NO DATA"} hint={a.brier != null ? `Brier ${a.brier}` : undefined} />
          <Stat label="DATA QUALITY" value={priced != null ? `${priced}% priced` : "—"} hint="share of recorded picks carrying a real bookmaker price" />
          <Stat label="WIN RATE" value={a.winRate != null ? `${a.winRate}%` : "—"} hint={a.graded ? `${a.graded} graded · ${a.sample}` : undefined} />
        </div>
      </SectionCard>

      <SectionCard
        title={`KALA REJECTED: ${report.rejected ?? 0} OPPORTUNITIES`}
        icon={<ShieldAlert className="w-4 h-4 text-rose-300" />}
        sub="A serious model demonstrates that it rejects bad opportunities rather than constantly generating bets."
        right={
          <Button size="sm" variant="outline" className="rounded-full h-7 px-3 text-[11px]" onClick={() => setShowRejections((v) => !v)}>
            <Eye className="w-3 h-3 mr-1" /> {showRejections ? "HIDE" : "VIEW"} REJECTIONS
          </Button>
        }
      >
        {!showRejections ? (
          <p className="text-xs text-muted-foreground">Open VIEW REJECTIONS to see exactly why the engine said no.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(rejectionCounts).map(([reason, n]) => (
                <span key={reason} className="text-[10px] px-2 py-1 rounded-full border border-border bg-secondary/60 text-muted-foreground">
                  {reason}: <b className="text-foreground">{n}</b>
                </span>
              ))}
            </div>
            <div className="max-h-72 overflow-y-auto noir-scrollbar space-y-1.5 pr-1">
              {(board?.rejected || []).slice(0, 200).map((r, i) => (
                <div key={i} className="flex items-start justify-between gap-2 rounded-xl bg-secondary/40 px-3 py-2">
                  <p className="text-[11px] min-w-0">
                    <span className="font-semibold truncate block">{r.home} vs {r.away} — {r.market}</span>
                    <span className="text-muted-foreground">WHY KALA REJECTED: {r.reason}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="STRUCTURAL DATA DISCLOSURE" icon={<HeartPulse className="w-4 h-4 text-primary" />}
        sub="What the engine does NOT have — disclosed, never guessed:">
        <ul className="text-xs text-muted-foreground space-y-1">
          {(report.unavailableData || []).map((d, i) => <li key={i}>• {d}</li>)}
        </ul>
      </SectionCard>
    </div>
  );
}