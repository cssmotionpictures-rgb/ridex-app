import React from "react";
import { Snowflake } from "lucide-react";

// Shown when a Stats Hub section can't load in-browser. The major domestic
// leagues (Premier League, La Liga, Bundesliga, Serie A, Ligue 1) now load
// fully in-browser via openfootball; anything still needing the stats server
// (player scorers, Champions League tables) is paused while the workspace is
// out of integration credits — it resets at the next billing cycle (2026-09-01).
export default function StatsUnavailableNotice({ error }) {
  return (
    <div className="text-center py-8 px-4 rounded-2xl border border-amber-500/25 bg-amber-500/5">
      <Snowflake className="w-7 h-7 mx-auto mb-2 text-amber-400/90" />
      <p className="text-sm font-semibold text-amber-300">Not available in-browser yet</p>
      <p className="text-xs text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
        This part needs the stats server, which is paused while the workspace is out of
        integration credits — it resets on 2026-09-01. Standings and fixtures for the
        <span className="text-foreground/80"> Premier League, La Liga, Bundesliga, Serie A
        and Ligue 1</span> now load fully in-browser — pick one above.
      </p>
      {error && <p className="text-[10px] text-muted-foreground/60 mt-2 break-words">{error}</p>}
    </div>
  );
}