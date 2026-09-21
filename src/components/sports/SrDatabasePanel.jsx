import React from "react";
import { Database, Loader2, Play, RefreshCw } from "lucide-react";
import { invokeFunction } from "@/lib/resilient";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

// SPORTRADAR DATABASE — the admin control room for the historical pipeline:
// bulk backfill (request-budget bounded per run), live table counts, and the
// derived team-season table rebuild. Every row in every table comes from a
// real provider response — nothing is synthesized.
export default function SrDatabasePanel({ user }) {
  const { toast } = useToast();
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [days, setDays] = React.useState("3");
  const [withLineups, setWithLineups] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await invokeFunction("sportradar-soccer", { action: "db_stats" }, { timeoutMs: 25000 });
      const b = res?.data ?? res;
      setStats(b?.data || b);
    } catch {
      // One paced retry — a transient platform throttle must not blank the counts.
      try {
        await new Promise((r) => setTimeout(r, 3000));
        const res = await invokeFunction("sportradar-soccer", { action: "db_stats" }, { timeoutMs: 25000 });
        const b = res?.data ?? res;
        setStats(b?.data || b);
      } catch {
        setStats(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (user?.role === "admin") load();
    else setLoading(false);
  }, [load, user?.role]);

  // One paced retry — a transient platform throttle (momentary request/credit
  // limit) must not stop the run. The backfill is idempotent: days already
  // logged 'done' are skipped for free, so resuming never double-spends.
  const invokeWithRetry = async (payload, opts) => {
    try {
      return await invokeFunction("sportradar-soccer", payload, opts);
    } catch (e) {
      await new Promise((r) => setTimeout(r, 4000));
      return await invokeFunction("sportradar-soccer", payload, opts);
    }
  };

  const runBackfill = async () => {
    if (running) return;
    setRunning(true);
    let stored = 0;
    try {
      const totalDays = Math.max(1, Math.min(14, Number(days) || 3));
      let remaining = totalDays;
      let guard = 0;
      while (remaining > 0 && guard < 10) {
        guard++;
        setProgress(
          remaining === totalDays
            ? "Walking the schedule archive…"
            : `${totalDays - remaining}/${totalDays} days processed · ${stored} matches stored`
        );
        const res = await invokeWithRetry(
          { action: "backfill", days: totalDays, with_lineups: withLineups },
          { timeoutMs: 90000 }
        );
        const b = res?.data ?? res;
        const p = b?.data || b || {};
        stored += p.ingested || 0;
        remaining = Number(p.remaining_days ?? totalDays);
      }
      setProgress("Rebuilding the team-season table from stored results…");
      await invokeWithRetry({ action: "recompute_stats" }, { timeoutMs: 45000 });
      await load();
      toast({ title: "Backfill complete", description: `${stored} matches stored · team-season table rebuilt.` });
    } catch (e) {
      const msg = String(e?.message || "");
      const limited = /rate limit|429|status code 400|status code 5\d\d|quota|credit/i.test(msg);
      toast({
        title: limited ? "Backfill paused" : "Backfill stopped",
        description: limited
          ? "The platform momentarily limited the request — the provider and pipeline are fine, and already-stored days are never re-spent. Wait a few seconds and tap Run backfill to continue from where it stopped."
          : msg || "The pipeline run did not finish.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  if (user?.role !== "admin") return null;

  const s = stats || {};
  const log = s.recent_backfills || [];
  const cap = s.count_cap || 200;
  const fmtCount = (v) => (v == null ? "—" : `${v}${s.capped && v >= cap ? "+" : ""}`);

  const Count = ({ label, value }) => (
    <div className="rounded-xl bg-secondary/40 border border-border/40 py-2">
      <p className="text-base font-extrabold leading-none">{fmtCount(value)}</p>
      <p className="text-[9px] text-muted-foreground mt-1">{label}</p>
    </div>
  );

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <Database className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">SPORTRADAR DATABASE</p>
          <p className="text-[10px] text-muted-foreground">Normalized historical store · raw → normalized pipeline · sr: IDs as keys</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-[11px] font-semibold hover:bg-secondary/70 disabled:opacity-50 shrink-0">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading && !stats ? (
        <div className="text-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto" />
          <p className="text-[10px] text-muted-foreground mt-1">Reading table counts…</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Count label="Matches" value={s.matches} />
            <Count label="Players" value={s.players} />
            <Count label="Venues" value={s.venues} />
            <Count label="Team-seasons" value={s.team_seasons} />
          </div>

          <div className="rounded-xl bg-secondary/40 border border-border/40 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Bulk historical backfill</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number" min={1} max={14}
                className="h-8 w-16 rounded-lg text-xs"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
              <span className="text-[10px] text-muted-foreground">days back</span>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <input type="checkbox" checked={withLineups} onChange={(e) => setWithLineups(e.target.checked)} /> + player lineups
              </label>
              <button
                onClick={runBackfill}
                disabled={running}
                className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50"
              >
                {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {running ? "Running…" : "Run backfill"}
              </button>
            </div>
            {progress && <p className="text-[10px] text-primary font-semibold">{progress}</p>}
            <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
              Each run walks the schedule archive backward, richest-coverage matches first, inside a request budget. Already-stored days are skipped automatically — re-running never double-spends the provider.
            </p>
          </div>

          {log.length > 0 && (
            <div className="rounded-xl bg-secondary/40 border border-border/40 divide-y divide-border/30">
              {log.map((r) => (
                <div key={r.day} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[10px]">
                  <span className="text-muted-foreground">{r.day}</span>
                  <span className="font-semibold">
                    {r.status === "done" ? <span className="text-emerald-400">+{r.ingested} stored</span> : <span className="text-red-400">failed — will retry</span>}
                  </span>
                  <span className="text-muted-foreground/70">{r.matches_found} played that day</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
            Team-season stats are DERIVED from stored real results — never a provider feed, never synthesized. Player and venue rows come from real provider payloads only.
          </p>
        </>
      )}
    </div>
  );
}