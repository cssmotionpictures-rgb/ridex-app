import React from "react";
import { Brain, Loader2, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { invokeFunction } from "@/lib/resilient";

function shiftDate(dateStr, delta) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// PHASE 3 MODEL — predictions computed ONLY from the stored Sportradar
// database (shrunk Poisson). PASS is a mandatory professional outcome when
// stored history is insufficient. Probabilities are model estimates — never
// bookmaker odds, never win guarantees.
// Day-keyed result cache — a computed day is reused for 10 minutes (the same
// TTL the backend keeps the schedule), so switching tabs never refires the
// request and the model never pays the provider twice for the same day.
const CACHE_TTL_MS = 10 * 60 * 1000;
const dayCache = new Map();

export default function SrModelPredictions({ user }) {
  const [date, setDate] = React.useState(() => shiftDate(new Date().toISOString().slice(0, 10), 1));
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async (d, force = false) => {
    const hit = dayCache.get(d);
    if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setData(hit.data);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // The provider call serializes at ~1 req/s with its own bounded retries,
      // so a slow-provider run can take up to ~35s server-side — the timeout
      // here covers that worst case instead of cutting a healthy run short.
      const res = await invokeFunction("sportradar-soccer", { action: "predict", date: d }, { timeoutMs: 45000, retries: 2, retryDelayMs: 4000 });
      const b = res?.data ?? res;
      if (b?.success === false || b?.error) {
        setError("The model could not run right now — the data provider is unreachable. Tap Refresh to try again.");
        setData(null);
        return;
      }
      const payload = b?.data || b;
      setData(payload);
      if (payload?.fixtures) dayCache.set(d, { at: Date.now(), data: payload });
    } catch {
      setError("The model could not run right now — the data provider is unreachable. Tap Refresh to try again.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (user?.role === "admin") load(date);
  }, [load, date, user?.role]);

  if (user?.role !== "admin") return null;

  const fixtures = data?.fixtures || [];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">PHASE 3 MODEL — DATABASE PREDICTIONS</p>
          <p className="text-[10px] text-muted-foreground">Shrunk-Poisson engine over the stored historical database · honest PASS when data is insufficient</p>
        </div>
        <button onClick={() => load(date, true)} disabled={loading} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-[11px] font-semibold hover:bg-secondary/70 disabled:opacity-50 shrink-0">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setDate((d) => shiftDate(d, -1))} className="p-1.5 rounded-full bg-secondary hover:bg-secondary/70" aria-label="Previous day">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <p className="text-[11px] font-semibold">{date}</p>
        <button onClick={() => setDate((d) => shiftDate(d, 1))} className="p-1.5 rounded-full bg-secondary hover:bg-secondary/70" aria-label="Next day">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading && (
        <div className="text-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto" />
          <p className="text-[10px] text-muted-foreground mt-1">Computing from stored results…</p>
        </div>
      )}

      {error && <p className="text-[11px] text-amber-400">{error}</p>}

      {!loading && !error && data && (
        <>
          <p className="text-[10px] text-muted-foreground">
            {data.predicted} predicted · {data.passed} passed (insufficient history) · {data.model?.history_rows || 0} stored results · {data.model?.seasons_with_history || 0} season(s)
          </p>
          {fixtures.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2">No scheduled fixtures found for this date.</p>
          ) : (
            <div className="space-y-1.5">
              {fixtures.map((f) => (
                <div key={f.event_id} className="rounded-xl bg-secondary/40 border border-border/40 px-3 py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate">{f.home_name} vs {f.away_name}</p>
                    <p className="text-[9px] text-muted-foreground truncate">
                      {f.competition} · {f.kickoff ? new Date(f.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      {f.decision === "PASS" ? ` · ${f.reason}` : ` · ${f.data_quality} data · q${f.quality_score}`}
                    </p>
                  </div>
                  {f.decision === "PREDICT" ? (
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-bold text-primary">{Math.round(f.pick_probability * 100)}% {f.pick_label}</p>
                      <p className="text-[9px] text-muted-foreground">xG {f.lambda_home}–{f.lambda_away}</p>
                    </div>
                  ) : (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[9px] font-bold border border-border/50">PASS</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
            Probabilities are MODEL ESTIMATES computed from stored Sportradar results only — not bookmaker odds and not guarantees. Quality score measures data coverage, never win likelihood. 18+, play responsibly.
          </p>
        </>
      )}
    </div>
  );
}