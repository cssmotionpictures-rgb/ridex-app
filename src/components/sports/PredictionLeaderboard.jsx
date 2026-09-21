import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Crown } from "lucide-react";

export default function PredictionLeaderboard() {
  const [rows, setRows] = React.useState([]);
  const [clubs, setClubs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const [preds, clubList] = await Promise.all([
          base44.entities.MatchPrediction.list("-created_date", 500),
          base44.entities.FootballClub.list("-fans_count", 50),
        ]);
        const byUser = {};
        (preds || []).forEach((p) => {
          if (!byUser[p.user_id]) byUser[p.user_id] = { name: p.user_name, points: 0 };
          byUser[p.user_id].points += p.points || 0;
        });
        setRows(Object.values(byUser).sort((a, b) => b.points - a.points).slice(0, 10));
        const byClub = {};
        (preds || []).forEach((p) => {
          if (!p.club_id) return;
          if (!byClub[p.club_id]) byClub[p.club_id] = { name: p.club_name, points: 0 };
          byClub[p.club_id].points += p.points || 0;
        });
        setClubs(Object.values(byClub).sort((a, b) => b.points - a.points).slice(0, 5));
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Crown className="w-4 h-4 text-primary" /> Top predictors</h3>
        {rows.length === 0 ? <p className="text-xs text-muted-foreground">No predictions yet.</p> : (
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 truncate"><span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{i + 1}</span> <span className="truncate">{r.name}</span></span>
                <span className="font-semibold ml-2">{r.points} pts</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Club standings</h3>
        {clubs.length === 0 ? <p className="text-xs text-muted-foreground">Pick a club to feature here.</p> : (
          <ol className="space-y-2">
            {clubs.map((c, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 truncate"><span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{i + 1}</span> <span className="truncate">{c.name}</span></span>
                <span className="font-semibold ml-2">{c.points} pts</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}