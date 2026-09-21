import React from "react";
import { CalendarDays, Trophy, Goal, Newspaper } from "lucide-react";
import FixturesList from "./FixturesList";
import LeagueStandings from "./LeagueStandings";
import PlayerStats from "./PlayerStats";
import FootballNews from "./FootballNews";

// Stats Hub — real API-FOOTBALL data (fixtures, standings, player stats) +
// live football news, all routed through zero-credit cached proxy functions.
export default function StatsHub() {
  const [sub, setSub] = React.useState("fixtures");
  const subs = [
    { k: "fixtures", l: "Fixtures", icon: CalendarDays },
    { k: "tables", l: "Tables", icon: Trophy },
    { k: "scorers", l: "Top Scorers", icon: Goal },
    { k: "news", l: "News", icon: Newspaper },
  ];
  return (
    <div>
      <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
        {subs.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.k}
              onClick={() => setSub(s.k)}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${sub === s.k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="w-4 h-4" /> {s.l}
            </button>
          );
        })}
      </div>

      {sub === "fixtures" && <FixturesList />}
      {sub === "tables" && <LeagueStandings />}
      {sub === "scorers" && <PlayerStats />}
      {sub === "news" && <FootballNews />}
    </div>
  );
}