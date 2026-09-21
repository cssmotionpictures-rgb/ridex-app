import React from "react";
import { Loader2, RefreshCw, ServerCog } from "lucide-react";
import { fetchProviderStatus } from "@/providers/injuries/apiFootballInjuries";
import { providerStatusLabel } from "@/lib/resilient";
import ProviderKeyManager from "@/components/sports/ProviderKeyManager";
import testStatus from "@/lib/testStatus.json";

// PROVIDER STATUS DASHBOARD — exactly which data feeds are live, degraded,
// offline or not configured, plus the automated test suite's latest result.
// Nothing is reported as CONNECTED that has not actually answered a probe.
//
// Independent of the prediction board: it runs its own bounded probe with its
// own Retry, so a board outage never hides provider diagnostics and vice versa.
// Status semantics: CONNECTED (successful recent request) / DEGRADED
// (responds but slowly) / OFFLINE (unavailable or not configured) / UNKNOWN
// (not checked yet). A missing OPTIONAL provider key (e.g. Sportradar) maps
// to OFFLINE — it can never break the panel or the app.

const STATUS_CLASS = {
  CONNECTED: "bg-emerald-500/15 text-emerald-400",
  DEGRADED: "bg-amber-500/15 text-amber-400",
  OFFLINE: "bg-red-500/15 text-red-400",
  // legacy raw values kept for safety
  ONLINE: "bg-emerald-500/15 text-emerald-400",
  AVAILABLE: "bg-emerald-500/15 text-emerald-400",
  ACTIVE: "bg-emerald-500/15 text-emerald-400",
  PASS: "bg-emerald-500/15 text-emerald-400",
  ERROR: "bg-amber-500/15 text-amber-400",
  FAIL: "bg-red-500/15 text-red-400",
  UNKNOWN: "bg-secondary text-muted-foreground",
  INACTIVE: "bg-secondary text-muted-foreground/70",
};

function StatusPill({ label }) {
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[label] || STATUS_CLASS.UNKNOWN}`}>
      {label}
    </span>
  );
}

function Row({ name, status }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/30 border border-border/40">
      <p className="text-[10px] font-semibold truncate">{name}</p>
      <StatusPill label={status} />
    </div>
  );
}

export default function ProviderStatusPanel() {
  const [status, setStatus] = React.useState(null);
  const [probeId, setProbeId] = React.useState(0);
  const [probing, setProbing] = React.useState(true);
  const [elapsedMs, setElapsedMs] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    const started = Date.now();
    setProbing(true);
    fetchProviderStatus()
      .then((s) => {
        if (live) {
          setStatus(s);
          setElapsedMs(Date.now() - started);
        }
      })
      .catch(() => {
        if (live) setStatus({ status: "error" });
      })
      .finally(() => {
        if (live) setProbing(false);
      });
    return () => {
      live = false;
    };
  }, [probeId]);

  const p = status?.providers;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <ServerCog className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">PROVIDER STATUS</p>
          <p className="text-[10px] text-muted-foreground">Live probe of every data feed — CONNECTED means the provider actually answered</p>
        </div>
        <button
          onClick={() => setProbeId((n) => n + 1)}
          disabled={probing}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-[10px] font-semibold hover:bg-secondary/70 disabled:opacity-50 shrink-0"
        >
          {probing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Retry
        </button>
      </div>

      {!status ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Probing providers…
        </div>
      ) : status.status === "error" ? (
        <div className="space-y-2">
          <p className="text-[11px] text-amber-400">Provider status probe unavailable right now — every feed shows UNKNOWN until a probe succeeds. This never affects the board, slips or odds tabs.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div>
            <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mb-1">FOOTBALL DATA</p>
            <div className="space-y-1">
              <Row name="Sportmonks" status={providerStatusLabel(p?.footballData?.sportmonks, elapsedMs)} />
              <Row name="Sportradar" status={providerStatusLabel(p?.footballData?.sportradar, elapsedMs)} />
              <Row name="API-Football" status={providerStatusLabel(p?.footballData?.apiFootball, elapsedMs)} />
            </div>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mb-1">BOOKMAKER ODDS</p>
            <div className="space-y-1">
              <Row name="The Odds API" status={providerStatusLabel(p?.bookmakerOdds?.theOddsApi, elapsedMs)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Row
              name="INJURIES"
              status={
                p?.injuries?.startsWith("UNKNOWN") || !p?.injuries
                  ? "UNKNOWN"
                  : providerStatusLabel(p.injuries === "AVAILABLE" || p.injuries === "ACTIVE" ? "ONLINE" : p.injuries, elapsedMs)
              }
            />
            <Row
              name="LINEUPS"
              status={
                p?.lineups?.startsWith("UNKNOWN") || !p?.lineups
                  ? "UNKNOWN"
                  : providerStatusLabel(p.lineups === "PROBABLE" || p.lineups === "CONFIRMED" ? "ONLINE" : p.lineups, elapsedMs)
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Row name="ODDS HISTORY" status={providerStatusLabel(p?.oddsHistory, elapsedMs)} />
            <Row name="TESTS" status={testStatus?.status === "PASS" ? "CONNECTED" : testStatus?.status || "UNKNOWN"} />
          </div>
          <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
            Injuries and lineups are probed on demand from each leg's detail — open any leg to fetch its live context. Odds history activates once the odds feed has been polled twice.
            Sportradar is optional: without its key the feed simply shows OFFLINE — nothing else is affected.
            {status.checkedAt ? <> Checked {new Date(status.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</> : null}
            {testStatus?.updatedAt ? <> Tests last ran {testStatus.updatedAt}.</> : null}
          </p>
        </div>
      )}

      <ProviderKeyManager />
    </div>
  );
}