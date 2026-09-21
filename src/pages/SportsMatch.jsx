import React from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import MatchStream from "@/components/sports/MatchStream";
import { Loader2, ArrowLeft } from "lucide-react";

export default function SportsMatch() {
  const { id } = useParams();
  const [match, setMatch] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    base44.entities.LiveMatch.get(id).then(setMatch).catch(() => setMatch(null)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading match…</div>;
  if (!match) return <div className="text-center py-20 text-muted-foreground">Match not found. <Link to="/sports" className="underline text-primary">Back to Live Sports</Link></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link to="/sports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Live Sports</Link>

      {match.status === "live" ? (
        <MatchStream match={match} onClose={() => window.history.back()} hasMembership={false} />
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card p-6 text-center">
          <p className="text-base font-semibold mb-1">{match.team_a} vs {match.team_b}</p>
          <p className="text-xs text-muted-foreground">{match.league}{match.kickoff_time ? ` · ${new Date(match.kickoff_time).toLocaleString("en-NG")}` : ""}</p>
          <p className="text-xs text-muted-foreground mt-3">The stream becomes available when the match is live.</p>
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Match info</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="League" value={match.league || "—"} />
          <Info label="Venue" value={match.venue || "TBD"} />
          <Info label="Status" value={match.status || "—"} />
          <Info label="Kick-off" value={match.kickoff_time ? new Date(match.kickoff_time).toLocaleString("en-NG") : "TBD"} />
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium capitalize">{value}</p>
    </div>
  );
}