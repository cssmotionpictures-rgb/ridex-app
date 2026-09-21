import React from "react";
import { AlertTriangle, Database, Ban } from "lucide-react";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { riskFlagsOf } from "@/lib/runO";

// RISK FLAGS · DATA HEALTH · REJECTED RUN O CANDIDATES — the transparency
// panels. Everything is disclosed; nothing is fabricated.

export function RiskFlagsPanel({ picks }) {
  const withFlags = (picks || [])
    .map((p) => ({ p, flags: riskFlagsOf(p) }))
    .filter((x) => x.flags.length);
  return (
    <SectionCard
      title="RISK FLAGS"
      icon={<AlertTriangle className="w-4 h-4 text-amber-300" />}
      sub="Every recorded risk on the current RUN O board — disclosed, never hidden."
    >
      {withFlags.length ? (
        <div className="space-y-2">
          {withFlags.slice(0, 8).map(({ p, flags }) => (
            <div key={`${p.fixtureId}-${p.marketKey}`} className="rounded-2xl border border-border/60 bg-secondary/40 p-3">
              <p className="text-xs font-bold truncate">{p.home} vs {p.away} — {p.marketLabel}</p>
              <ul className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                {flags.slice(0, 4).map((f, i) => <li key={i}>• {f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>No risk flags recorded on the current RUN O board.</EmptyState>
      )}
    </SectionCard>
  );
}

export function DataHealthPanel({ health }) {
  return (
    <SectionCard
      title="DATA HEALTH"
      icon={<Database className="w-4 h-4 text-primary" />}
      sub="Honest scan summary — missing providers are disclosed, never guessed."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="FIXTURES SCANNED" value={health.fixturesScanned} />
        <Stat label="CANDIDATES ANALYZED" value={health.candidatesAnalyzed} />
        <Stat label="PRE-QUALIFIED" value={health.engineQualified} hint={`${health.engineRejected} did not meet the quality standard`} />
        <Stat label="RUN O QUALIFIED" value={health.runoQualified} hint={`${health.runoRejected} below the full standard · pool ${health.runoPool}`} />
        <Stat label="LIVE MARKET DATA" value={String(health.oddsStatus).toUpperCase()} />
        <Stat label="INJURY COVERAGE" value={`${health.injuryCoverage}/${health.enrichmentCandidates}`} hint="fixtures with confirmed injury updates" />
        <Stat label="LINEUP COVERAGE" value={`${health.lineupCoverage}/${health.enrichmentCandidates}`} hint="fixtures with lineup information" />
      </div>
      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1">SOME LIVE DATA CURRENTLY UNAVAILABLE — DISCLOSED</p>
        <ul className="text-[11px] text-muted-foreground space-y-0.5">
          {(health.unavailableData || []).map((d, i) => <li key={i}>• {d}</li>)}
        </ul>
      </div>
    </SectionCard>
  );
}

export function RejectedPanel({ runo }) {
  const list = (runo?.rejected || []).slice(0, 10);
  return (
    <SectionCard
      title="REJECTED RUN O CANDIDATES"
      icon={<Ban className="w-4 h-4 text-rose-300" />}
      sub="Strong candidates that did not meet every RUN O standard — never shown as RUN O picks."
    >
      {list.length ? (
        <div className="space-y-2">
          {list.map(({ pick }, i) => (
            <div key={`${pick.fixtureId}-${pick.marketKey}-${i}`} className="rounded-2xl border border-border/60 bg-secondary/40 p-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{pick.home} vs {pick.away}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {pick.league} · {pick.marketLabel} · score {Math.round(pick.masterScore ?? pick.score ?? 0)}
                </p>
              </div>
              <p className="text-[10px] text-rose-300 shrink-0 max-w-[45%] text-right">DID NOT MEET THE FULL STANDARD</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>No candidates were refused by the RUN O standard in this window.</EmptyState>
      )}
      <p className="text-[10px] text-muted-foreground">
        Every refused candidate is still tracked against its real result, so the RUN O standard keeps improving from evidence.
      </p>
    </SectionCard>
  );
}