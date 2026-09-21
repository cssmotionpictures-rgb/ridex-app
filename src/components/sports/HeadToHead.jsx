import React, { useState } from "react";
import { Search, Swords, Loader2 } from "lucide-react";
import {
  analyzeMatch,
  getAccumulator,
  addMatchToAccumulator,
  removeMatch,
  clearAccumulator,
} from "@/lib/footballValueEngine";
import { POPULAR_TEAMS } from "@/lib/footballH2h";
import AnalysisPanel from "@/components/sports/h2h/AnalysisPanel";
import AutoSlip from "@/components/sports/h2h/AutoSlip";

// REAL FOOTBALL VALUE ENGINE — head-to-head tab. Real API-Football data only:
// last-5 H2H, last-8 form, injuries, the API prediction and REAL bookmaker
// odds. The Poisson model estimates probabilities, compares them against the
// bookmaker's implied probability, and qualifies at most TWO compatible picks
// per match. Nothing is ever fabricated.
export default function HeadToHead() {
  const [a, setA] = useState("Arsenal");
  const [b, setB] = useState("Liverpool");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [entries, setEntries] = useState(getAccumulator());

  const run = async () => {
    if (!a.trim() || !b.trim()) return;
    setLoading(true);
    setErr("");
    setAnalysis(null);
    try {
      const res = await analyzeMatch(a, b);
      if (res.notFound) {
        setErr(`Couldn't find ${res.notFound.a ? `"${a}"` : ""} ${res.notFound.b ? `"${b}"` : ""} in API-Football. Try the full team name.`);
      } else {
        setAnalysis(res);
      }
    } catch (e) {
      setErr(
        e?.serviceDown
          ? "The free API-Football quota is used up for the moment (it resets daily) or the service is rate-limiting. Cached data still serves where available — please try again later."
          : "Live stats are temporarily unavailable — please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Swords className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Head-to-Head Value Engine</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Real API-Football data — last-5 H2H, last-8 form, goals scored/conceded, injuries, corners, shots & possession from the last
          meeting, the official API prediction and REAL bookmaker odds. The model only qualifies picks that carry an edge; weak
          selections are rejected, never faked.
        </p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <input
            value={a}
            onChange={(e) => setA(e.target.value)}
            list="h2h-teams"
            placeholder="Team A"
            className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm"
          />
          <span className="text-primary font-extrabold text-sm">VS</span>
          <input
            value={b}
            onChange={(e) => setB(e.target.value)}
            list="h2h-teams"
            placeholder="Team B"
            className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm"
          />
          <datalist id="h2h-teams">
            {POPULAR_TEAMS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <button
          onClick={run}
          disabled={loading || !a.trim() || !b.trim()}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground font-semibold py-2.5 text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? "Scanning real fixture data…" : "Analyze Fixture"}
        </button>
      </div>

      {err && <p className="text-sm text-red-400 text-center">{err}</p>}

      {loading && (
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-10 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm">Deep-scanning H2H · form · injuries · bookmaker odds · API prediction…</p>
          <p className="text-[11px] text-muted-foreground/70">Real data only — the first scan paces API calls to respect the free quota, so it can take up to a minute.</p>
        </div>
      )}

      {analysis && (
        <AnalysisPanel
          analysis={analysis}
          onAdd={(an) => setEntries(addMatchToAccumulator(an))}
        />
      )}

      <AutoSlip
        manualEntries={entries}
        onRemove={(id) => setEntries(removeMatch(id))}
        onClear={() => setEntries(clearAccumulator())}
      />
    </div>
  );
}