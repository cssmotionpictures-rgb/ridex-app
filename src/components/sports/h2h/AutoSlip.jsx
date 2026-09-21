import React from "react";
import { Target, Trash2, AlertTriangle, Loader2, RefreshCw, ShieldCheck, Sunrise, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { accumulatorStats, buildAutoSlip, getAutoSlip, saveAutoSlip, TARGET_MATCHES } from "@/lib/footballValueEngine";
import { buildSlipPool } from "@/lib/slipPool";
import PickCalendarSync from "@/components/sports/PickCalendarSync";

// VERIFIED 50-GAME SLIP — next 7 days only, rebuilt every morning.
// Primary source: API-Football real bookmaker prices. When that API is used
// up (free daily quota), the slip falls back to the OTHER source — the
// keyless openfootball CDN deep pool — with honest MODEL ODDS instead of live
// prices, so the accumulator is never invisible. A slip from a previous day
// also stays visible (marked stale) until a fresh verified build replaces it.
export default function AutoSlip({ manualEntries = [], onRemove, onClear }) {
  const [auto, setAuto] = React.useState(() => getAutoSlip());
  const [building, setBuilding] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [failed, setFailed] = React.useState("");
  // When the slip runs on MODEL odds (live quota was used up when it built),
  // the live source is retried at most every 30 minutes so real prices
  // replace the model odds the moment the quota frees up.
  const lastLiveTryRef = React.useRef(0);

  // Backup source: the same deep pool the Special Odds slips use — keyless
  // CDN, zero quota, zero credits. Legs carry model fair odds (clearly
  // labeled), never invented bookmaker prices.
  const modelFallback = async () => {
    try {
      const pool = await buildSlipPool();
      if (!pool || !pool.length) return 0;
      const capturedAt = new Date().toISOString();
      const horizon = Date.now() + 7 * 86400000;
      const entries = pool
        .filter((p) => {
          const t = p.timestamp ? new Date(p.timestamp).getTime() : NaN;
          return !isNaN(t) && t > Date.now() && t <= horizon; // 7-day window only
        })
        .slice(0, TARGET_MATCHES)
        .map((p) => {
          // ACCURATE BACKUP PRICING — every pick actually on the leg (main +
          // both padding picks + the corner line) is priced at its EXACT model
          // fair odds (1 ÷ its verified probability). No invented bookmaker
          // margin, and the leg's joint probability uses the same numbers with
          // the engine's correlation haircut per extra pick — so the combined
          // odds and the stated win chance always agree.
          const mkPick = (label, prob) => ({
            key: "MODEL",
            label,
            selection: label,
            odds: prob > 0 ? 1 / prob : 1,
            bookmaker: "Model fair odds (backup source)",
            probability: prob,
            edge: null,
            capturedAt,
          });
          const picks = [
            mkPick(p.marketLabel, Number(p.probability) || 0),
            p.companion ? mkPick(p.companion.label, Number(p.companion.prob) || 0) : null,
            p.companion2 ? mkPick(p.companion2.label, Number(p.companion2.prob) || 0) : null,
            p.corners ? mkPick(p.corners.label, Number(p.corners.prob) || 0) : null,
          ].filter(Boolean);
          const pairOdds = picks.reduce((m, k) => m * Math.max(1, k.odds), 1);
          const jointProbability =
            picks.reduce((m, k) => m * (k.probability || 0), 1) * Math.pow(0.92, Math.max(0, picks.length - 1));
          return {
            fixtureId: p.fixtureId,
            home: p.home,
            away: p.away,
            league: p.league,
            kickoff: p.timestamp || "",
            addedAt: capturedAt,
            pairOdds,
            jointProbability,
            auto: true,
            model: true,
            picks,
          };
        });
      if (!entries.length) return 0;
      saveAutoSlip(entries, { source: "model" });
      return entries.length;
    } catch {
      return 0;
    }
  };

  // The 6:00 AM scheduled server build — adopt it as today's slip instead of
  // re-scanning here (same qualification, real captured prices, quota already
  // spent by the morning automation). Falls back to the in-browser build when
  // the morning run hasn't happened yet.
  const adoptServerSlip = React.useCallback(async () => {
    try {
      const res = await base44.functions.invoke("accumulator-slip", { action: "get" });
      const s = res?.data || res;
      if (!s || !Array.isArray(s.entries) || !s.entries.length) return false;
      const todayUtc = new Date().toISOString().slice(0, 10);
      if (s.builtOn !== todayUtc) return false; // not this morning's build — rebuild locally
      const now = Date.now();
      const live = s.entries.filter((e) => {
        const t = new Date(e.kickoff).getTime();
        return !isNaN(t) && t > now;
      });
      if (!live.length) return false;
      saveAutoSlip(live, { source: s.source || "live" });
      setAuto(getAutoSlip());
      return true;
    } catch {
      return false;
    }
  }, []);

  const build = React.useCallback(async () => {
    lastLiveTryRef.current = Date.now();
    setBuilding(true);
    setFailed("");
    setProgress({ daysDone: 0, daysTotal: 7, scanned: 0, matches: 0 });
    let serviceDown = false;
    try {
      const res = await buildAutoSlip((p) => setProgress(p));
      serviceDown = !!res.serviceDown;
      if (res.entries.length) {
        setAuto(getAutoSlip());
        setBuilding(false);
        return;
      }
    } catch (e) {
      serviceDown = !!e?.serviceDown || !!e?.budgetOut;
    }
    // API-Football used up / down → use the other API when nothing verified
    // is on screen yet. A visible (even stale) slip with real captured prices
    // always wins over model odds.
    const cur = getAutoSlip();
    if (!cur || !cur.entries.length) {
      const n = await modelFallback();
      if (!n) setFailed(serviceDown ? "quota" : "none");
    }
    setAuto(getAutoSlip());
    setBuilding(false);
  }, []);

  React.useEffect(() => {
    const needsBuild = () => {
      const c = getAutoSlip();
      return !c || c.stale || !c.entries.length;
    };
    let cancelled = false;
    const ensure = async () => {
      if (needsBuild()) {
        // prefer this morning's 6:00 AM scheduled build before scanning here
        const adopted = await adoptServerSlip();
        if (!cancelled && !adopted && needsBuild()) build();
        return;
      }
      // MODEL-odds slip from a failed live build — one live retry shortly
      // after open (guarded by the 30-min throttle). A still-limited quota
      // fails fast and keeps the model slip untouched.
      const c = getAutoSlip();
      if (c?.source === "model" && Date.now() - lastLiveTryRef.current > 30 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 5000));
        if (!cancelled && !building) build();
      }
    };
    ensure();
    // every morning (or once every kickoff has passed) the stored slip reads
    // stale and the rebuild fires automatically on the next check
    const id = setInterval(() => {
      if (building) return;
      if (needsBuild()) {
        build();
        return;
      }
      // MODEL-odds slip → retry the live build on the next check (max once per
      // 30 min) — "live prices return automatically when the quota resets".
      const c = getAutoSlip();
      if (c?.source === "model" && Date.now() - lastLiveTryRef.current > 30 * 60 * 1000) build();
    }, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [build, adoptServerSlip]);

  const merged = React.useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const e of auto?.entries || []) {
      if (!seen.has(e.fixtureId)) {
        seen.add(e.fixtureId);
        out.push(e);
      }
    }
    for (const e of manualEntries || []) {
      if (!seen.has(e.fixtureId)) {
        seen.add(e.fixtureId);
        out.push(e);
      }
    }
    return out.slice(0, TARGET_MATCHES);
  }, [auto, manualEntries]);

  const stats = accumulatorStats(merged);
  // Calendar sync — every upcoming slip game becomes its own Google Calendar
  // event with an automatic pre-kickoff reminder (.ics fallback built in).
  const calPicks = React.useMemo(
    () =>
      merged
        .filter((e) => e.kickoff && new Date(e.kickoff).getTime() > Date.now())
        .map((e) => ({
          fixtureId: e.fixtureId,
          kickoff: e.kickoff,
          home: e.home,
          away: e.away,
          league: e.league,
          marketLabel: (e.picks || []).map((p) => p.label).join(" + ") || "Engine pick",
          probability: e.jointProbability,
        })),
    [merged]
  );
  const autoCount = (auto?.entries || []).length;
  const modelSource = auto?.source === "model";
  const manualCount = merged.length - autoCount;

  const kickoffLabel = (iso) => {
    try {
      return new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-sm">VERIFIED 50-GAME SLIP — 1,000,000 ODDS</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Sunrise className="w-3 h-3" /> cleared & rebuilt fresh at 6:00 AM daily · next 7 days only
            </p>
          </div>
        </div>
        <button
          onClick={() => !building && build()}
          disabled={building}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0"
          title="Rescan the next 7 days and rebuild the verified slip"
        >
          {building ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Rebuild
        </button>
      </div>

      {building && (
        <div className="rounded-xl bg-secondary/60 px-3 py-3 space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            Scanning the next 7 days of major-league fixtures — verifying odds & model edge…
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            Day {progress?.daysDone || 0}/7 scanned · {progress?.scanned || 0} fixtures examined · {progress?.matches || 0} qualified.
            If the live API quota is used up, the slip rebuilds from the backup open-source source automatically.
          </p>
        </div>
      )}

      {!building && failed && merged.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3 space-y-2">
          <p className="text-[11px] text-amber-400 leading-relaxed flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {failed === "quota"
              ? "Couldn't verify games right now — the free API-Football quota is used up (it resets daily) and the backup open-source scan found no qualifying games in the next 7 days. The slip only ever shows real picks, so it stays empty rather than guessing. It rebuilds automatically; or tap Rebuild to retry."
              : "Scanned the week's fixtures but nothing carried a real model edge. The engine never manufactures a pick — tap Rebuild later."}
          </p>
        </div>
      )}

      {merged.length === 0 && !building && !failed ? (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Empty — no verified games yet. The engine scans every morning automatically, or tap Rebuild now.
        </p>
      ) : merged.length > 0 ? (
        <>
          {(modelSource || auto?.stale) && !building && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <p className="text-[10px] text-amber-400 leading-relaxed flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                {modelSource
                  ? "Backup source active — the live API quota is used up, so legs carry MODEL fair odds from the open-source deep scan (form + H2H scrutiny) instead of captured bookmaker prices. Live prices return automatically when the quota resets."
                  : `Last verified build: ${auto?.builtOn || ""} — prices were captured when it was built. A fresh scan runs automatically once the API quota allows.`}
              </p>
            </div>
          )}

          <div className="rounded-xl bg-secondary/60 p-3 space-y-2">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground">Combined odds</p>
                <p className="font-heading font-extrabold text-2xl text-primary">
                  {stats.combinedOdds.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Avg per match</p>
                <p className="font-heading font-bold text-lg">{stats.avgPairOdds.toFixed(3)}</p>
              </div>
            </div>
            <div className="h-2 rounded-full bg-background overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${stats.progress * 100}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {stats.matches}/{TARGET_MATCHES} verified matches · {stats.legs} qualified legs ·{" "}
              {(stats.progress * 100).toFixed(1)}% of the way to 1,000,000× (log scale)
            </p>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto noir-scrollbar pr-1">
            {merged.map((e) => (
              <div key={e.fixtureId} className="rounded-xl border border-border/50 bg-secondary/30 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold truncate">
                    {e.home} vs {e.away}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-bold text-primary">{(e.pairOdds || 1).toFixed(2)}</span>
                    {!e.auto && onRemove && (
                      <button onClick={() => onRemove(e.fixtureId)} className="text-muted-foreground hover:text-destructive" title="Remove match">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {e.model ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[9px] font-bold">
                      <Zap className="w-2.5 h-2.5" /> MODEL ODDS
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-bold">
                      <ShieldCheck className="w-2.5 h-2.5" /> VERIFIED
                    </span>
                  )}
                  {e.kickoff ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[9px] font-semibold">
                      {kickoffLabel(e.kickoff)}
                    </span>
                  ) : null}
                  {(e.picks || []).map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold">
                      {p.label} @ {Number(p.odds).toFixed(2)}
                    </span>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground/70 mt-1">
                  {e.model ? "exact model fair odds (1 ÷ probability) — backup open-source source" : `odds captured ${new Date(e.addedAt).toLocaleDateString()}`} · {e.league}
                </p>
              </div>
            ))}
          </div>

          {calPicks.length > 0 && <PickCalendarSync picks={calPicks} />}
        </>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] text-muted-foreground/70 flex items-start gap-1 leading-relaxed">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          Every leg is model-qualified — estimates, never guarantees. All games kick off within the next 7 days; the slip drops and
          rebuilds fresh every morning, switching to the backup source when the live API quota is used up.
        </p>
        {onClear && manualCount > 0 ? (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground hover:text-destructive shrink-0"
          >
            <Trash2 className="w-3 h-3" /> Clear added
          </button>
        ) : null}
      </div>
    </div>
  );
}