import React from "react";
import { CalendarDays, Loader2, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { invokeFunction } from "@/lib/resilient";

// FULL MATCH CALENDAR — every scheduled game the live provider returns for
// the next 7 days, grouped by competition with local kickoff times, live
// scores and final results. This is the COMPLETE schedule (all leagues,
// not just the engine's tracked competitions) — real provider data,
// never invented.

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LABELS = ["TODAY", "TOMORROW", "DAY 3", "DAY 4", "DAY 5", "DAY 6", "DAY 7"];

function dateKeyOf(offset) {
  return new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
}

function timeOf(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function StatusChip({ ev }) {
  if (ev.status === "live") {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[9px] font-bold">
        <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
        LIVE {ev.home_score}-{ev.away_score}
      </span>
    );
  }
  if (ev.status === "ended" || ev.status === "closed") {
    return (
      <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground text-[9px] font-bold">
        FT {ev.home_score}-{ev.away_score}
      </span>
    );
  }
  if (ev.status === "postponed" || ev.status === "delayed") {
    return (
      <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[9px] font-bold">
        {String(ev.status).toUpperCase()}
      </span>
    );
  }
  return null;
}

export default function MatchCalendarView() {
  const [dayIdx, setDayIdx] = React.useState(0);
  const [cache, setCache] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const cacheRef = React.useRef({});

  const dateKey = dateKeyOf(dayIdx);
  const events = cache[dateKey] || null;

  const load = React.useCallback(async (key, force = false) => {
    if (!force && cacheRef.current[key]) return;
    setLoading(true);
    setError(null);
    try {
      const res = await invokeFunction("sportradar-soccer", { action: "schedule", date: key }, { timeoutMs: 25000 });
      const body = res?.data ?? res;
      const evs = body?.data?.events || body?.events || [];
      cacheRef.current[key] = evs;
      setCache((prev) => ({ ...prev, [key]: evs }));
    } catch (e) {
      setError("Could not load the schedule right now — the live provider did not respond. Tap retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(dateKey);
  }, [dateKey, load]);

  const q = query.trim().toLowerCase();
  const filtered = (events || []).filter(
    (e) => !q || `${e.home} ${e.away} ${e.competition}`.toLowerCase().includes(q)
  );

  // Group by competition — the full day's board, every league that plays.
  const groups = React.useMemo(() => {
    const map = {};
    for (const e of filtered) {
      const comp = e.competition || "Other competitions";
      (map[comp] = map[comp] || []).push(e);
    }
    return Object.entries(map)
      .map(([competition, evs]) => ({ competition, evs: evs.slice().sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff))) }))
      .sort((a, b) => a.competition.localeCompare(b.competition));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">FULL MATCH CALENDAR</p>
            <p className="text-[10px] text-muted-foreground">
              Every scheduled game for the next 7 days — all leagues, live provider data, never a guess.
            </p>
          </div>
          <button
            onClick={() => load(dateKey, true)}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-[11px] font-semibold hover:bg-secondary/70 disabled:opacity-50 shrink-0"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {DAY_LABELS.map((label, i) => {
            const key = dateKeyOf(i);
            const count = cache[key]?.length;
            return (
              <button
                key={label}
                onClick={() => setDayIdx(i)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${
                  i === dayIdx ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {label} {key.slice(5)}
                {count != null && <span className={`ml-1 ${i === dayIdx ? "" : "text-primary"}`}>{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team or league…"
            className="h-9 rounded-xl text-xs pl-8"
          />
        </div>

        {events && (
          <p className="text-[10px] text-muted-foreground">
            <span className="text-foreground font-semibold">{events.length.toLocaleString()}</span> scheduled games
            {" "}· <span className="text-foreground font-semibold">{groups.length}</span> competitions
            {q && filtered.length !== events.length && <> · {filtered.length} matching "{query}"</>}
            {" "}· {dateKey} · times shown in your local timezone
          </p>
        )}
      </div>

      {loading && !events ? (
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
          <p className="text-[11px] text-muted-foreground mt-2">Loading the full {dateKey} schedule from the live provider…</p>
        </div>
      ) : error && !events ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-6 text-center">
          <p className="text-xs font-bold text-amber-400">SCHEDULE UNAVAILABLE RIGHT NOW</p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">{error}</p>
          <button onClick={() => load(dateKey, true)} disabled={loading} className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Retry
          </button>
        </div>
      ) : events && !events.length ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-5 text-center">
          <p className="text-sm font-bold text-amber-400">NO GAMES SCHEDULED THIS DAY</p>
          <p className="text-[11px] text-muted-foreground mt-1">The provider lists no fixtures for {dateKey}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(({ competition, evs }) => (
            <div key={competition} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="px-3 py-2 bg-secondary/50 border-b border-border/40 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold truncate">{competition}</p>
                <span className="text-[9px] text-muted-foreground shrink-0">{evs.length} games</span>
              </div>
              <div className="divide-y divide-border/30">
                {evs.map((e) => (
                  <div key={e.event_id} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                    <span className="w-11 shrink-0 text-muted-foreground font-semibold">{timeOf(e.kickoff)}</span>
                    <span className="flex-1 min-w-0 truncate">
                      <span className="font-semibold">{e.home}</span>
                      <span className="text-muted-foreground"> vs </span>
                      <span className="font-semibold">{e.away}</span>
                    </span>
                    <StatusChip ev={e} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!groups.length && (
            <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-5 text-center">
              <p className="text-xs font-bold text-amber-400">NO MATCHES FOR THIS SEARCH</p>
              <p className="text-[11px] text-muted-foreground mt-1">Try a different team or league name.</p>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
        Full worldwide schedule from the live provider — kickoff times and scores update as matches are played. Coverage is set by the provider, never invented.
      </p>
    </div>
  );
}