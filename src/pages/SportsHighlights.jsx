import React from "react";
import PageHeader from "@/components/shared/PageHeader";
import HighlightsGrid from "@/components/sports/HighlightsGrid";
import { LEAGUES } from "@/lib/sportsSources";

const HIGHLIGHT_LEAGUES = ["All", "Premier League", "Champions League", "La Liga", "Bundesliga", "Serie A"];

export default function SportsHighlights() {
  const [league, setLeague] = React.useState("All");
  return (
    <div>
      <PageHeader eyebrow="🎥 Highlights" title="Match Highlights" subtitle="Latest football highlights, powered by the free ScoreBat video API." />
      <div className="flex gap-2 mb-6 flex-wrap">
        {HIGHLIGHT_LEAGUES.map((l) => (
          <button key={l} onClick={() => setLeague(l)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${league === l ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      <HighlightsGrid league={league} />
      <p className="text-center text-[11px] text-muted-foreground mt-6">Highlights via ScoreBat free API · free plan includes ScoreBat branding</p>
    </div>
  );
}