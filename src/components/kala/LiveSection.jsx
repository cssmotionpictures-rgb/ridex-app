import React from "react";
import { Radio } from "lucide-react";
import { fetchLiveFixtures, fetchFixtureAlerts, matchStatusLabel } from "@/lib/liveFootballScores";
import { EmptyState, SectionCard, ResultBadge } from "@/components/kala/Bits";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sameTeam = (a, b) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

// LIVE INTELLIGENCE — real live scores matched against the immutable pre-match
// predictions. PRE-MATCH MODEL and LIVE data are clearly distinguished; the
// original prediction is never overwritten. No live-probability feed exists,
// so no live model numbers are invented.
export default function LiveSection({ preds }) {
  const [live, setLive] = React.useState(null);
  const [alerts, setAlerts] = React.useState({});
  const [error, setError] = React.useState(false);

  const openNow = (preds || []).filter((r) => r.status === "open");

  React.useEffect(() => {
    let alive = true;
    fetchLiveFixtures()
      .then(async (fx) => {
        if (!alive) return;
        setLive(fx.filter((m) => m.status === "live"));
        setError(false);
      })
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);

  // Card / goal events for the user's live tracked matches (max 3 — no quota burn).
  const matched = (live || []).filter((m) =>
    openNow.some((r) => (sameTeam(m.home, r.home) && sameTeam(m.away, r.away)) || (sameTeam(m.home, r.away) && sameTeam(m.away, r.home)))
  );
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      for (const m of matched.slice(0, 3)) {
        try { out[m.id] = (await fetchFixtureAlerts(m.id)).slice(-6); } catch { /* provider hiccup — honest omission */ }
      }
      if (alive) setAlerts((prev) => ({ ...prev, ...out }));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.length]);

  const predsFor = (m) =>
    openNow.filter(
      (r) => (sameTeam(m.home, r.home) && sameTeam(m.away, r.away)) || (sameTeam(m.home, r.away) && sameTeam(m.away, r.home))
    );

  return (
    <SectionCard
      title="LIVE INTELLIGENCE"
      icon={<Radio className="w-4 h-4 text-primary animate-pulse" />}
      sub="Live scores from the verified live feed, matched against KALA's immutable pre-match predictions. PRE-MATCH MODEL is distinguished from live data — the prediction is never overwritten."
    >
      {error ? (
        <EmptyState>DATA SOURCE TEMPORARILY UNAVAILABLE — live scores could not be fetched. Nothing is fabricated.</EmptyState>
      ) : live == null ? (
        <p className="text-xs text-muted-foreground">Fetching live fixtures…</p>
      ) : matched.length === 0 ? (
        <EmptyState>No live matches among KALA's open predictions right now.</EmptyState>
      ) : (
        <div className="space-y-3">
          {matched.map((m) => (
            <div key={m.id} className="rounded-2xl border border-border/60 bg-secondary/30 p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground truncate">{m.league}</p>
                  <p className="text-sm font-bold truncate">{m.home} {m.hs ?? 0} — {m.as ?? 0} {m.away}</p>
                  <p className="text-[11px] text-primary font-bold">{matchStatusLabel(m)} · LIVE</p>
                </div>
              </div>
              {predsFor(m).map((r) => (
                <div key={r.id} className="rounded-xl bg-background/50 px-3 py-2">
                  <p className="text-[11px] font-semibold">{r.market_label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    PRE-MATCH MODEL: {Math.round((r.calibrated_probability || 0) * 100)}% · recorded {new Date(r.recorded_at).toLocaleString("en-NG")} — immutable
                  </p>
                  <ResultBadge status={r.status} />
                </div>
              ))}
              {(alerts[m.id] || []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {alerts[m.id].map((a) => (
                    <span key={a.id} className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-secondary/60 text-muted-foreground">
                      {a.minute}' {a.type === "goal" ? "⚽" : a.type === "redcard" ? "🟥" : a.type === "penalty" ? "⚽ P" : "🟨"} {a.player || a.team}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            LIVE MODEL: unavailable — no verified live-probability feed is connected, so KALA shows real live scores only and invents no live numbers.
          </p>
        </div>
      )}
    </SectionCard>
  );
}