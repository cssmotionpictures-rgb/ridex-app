import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Trophy, Target, Flame } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { celebrateWin } from "@/lib/winCelebration";

export default function PredictGame({ user }) {
  const { toast } = useToast();
  const [matches, setMatches] = React.useState([]);
  const [predictions, setPredictions] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(null);
  const [draft, setDraft] = React.useState({});

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([
        base44.entities.LiveMatch.list("-kickoff_time", 50),
        user?.id ? base44.entities.MatchPrediction.filter({ user_id: user.id }, "-created_date", 100) : [],
      ]);
      setMatches(m || []);
      setPredictions(p || []);
      gradeEnded(m || [], p || []);
    } catch {
      setMatches([]); setPredictions([]);
    } finally { setLoading(false); }
  }, [user?.id]);

  React.useEffect(() => { load(); }, [load]);

  const gradeEnded = async (allMatches, preds) => {
    const ended = allMatches.filter((m) => m.status === "ended");
    const toGrade = preds.filter((p) => !p.graded && ended.some((m) => m.id === p.match_id));
    for (const p of toGrade) {
      const m = ended.find((x) => x.id === p.match_id);
      let pts = 0;
      if (p.predicted_score_a === m.score_a && p.predicted_score_b === m.score_b) {
        pts = 3;
        // EXACT-SCORE HIT — the full celebration: voice shout, triumphant
        // sound and the congratulations badge overlay (fires once per
        // prediction, no matter how often the page re-grades it).
        celebrateWin({ home: m.team_a, away: m.team_b, market: "Exact score prediction" });
      }
      else {
        const dr = (a, b) => Math.sign(a - b);
        if (dr(p.predicted_score_a, p.predicted_score_b) === dr(m.score_a, m.score_b)) pts = 1;
      }
      try { await base44.entities.MatchPrediction.update(p.id, { graded: true, points: pts }); } catch {}
    }
    if (toGrade.length) setTimeout(load, 600);
  };

  const myPred = (matchId) => predictions.find((p) => p.match_id === matchId);

  const setScore = (matchId, side, val) => {
    const v = Math.max(0, Math.min(20, Number(val) || 0));
    setDraft((d) => ({ ...d, [matchId]: { ...(d[matchId] || { a: 0, b: 0 }), [side]: v } }));
  };

  const submit = async (match) => {
    const pred = draft[match.id] || { a: 0, b: 0 };
    setSubmitting(match.id);
    try {
      const existing = myPred(match.id);
      if (existing) {
        await base44.entities.MatchPrediction.update(existing.id, { predicted_score_a: Number(pred.a), predicted_score_b: Number(pred.b) });
      } else {
        await base44.entities.MatchPrediction.create({
          match_id: match.id,
          match_label: `${match.team_a} vs ${match.team_b}`,
          user_id: user.id,
          user_name: user.full_name || user.email,
          club_id: user.club_id || "",
          club_name: user.club_name || "",
          predicted_score_a: Number(pred.a),
          predicted_score_b: Number(pred.b),
        });
      }
      toast({ title: "Prediction saved", description: `${match.team_a} ${pred.a} - ${pred.b} ${match.team_b}` });
      load();
    } catch (e) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally { setSubmitting(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading predictions…</div>;

  const open = matches.filter((m) => m.status !== "ended");
  const myPoints = predictions.reduce((s, p) => s + (p.points || 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat icon={<Target className="w-4 h-4" />} label="Your points" value={myPoints} />
        <Stat icon={<Trophy className="w-4 h-4" />} label="Predictions" value={predictions.length} />
        <Stat icon={<Flame className="w-4 h-4" />} label="Open matches" value={open.length} />
      </div>

      {open.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No open matches to predict right now. Check back soon!</div>
      ) : (
        <div className="space-y-3">
          {open.map((m) => {
            const pred = myPred(m.id);
            const d = draft[m.id] || { a: pred?.predicted_score_a ?? 0, b: pred?.predicted_score_b ?? 0 };
            return (
              <div key={m.id} className="rounded-2xl border border-border/60 bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold truncate">{m.team_a} <span className="text-muted-foreground">vs</span> {m.team_b}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${m.status === "live" ? "bg-red-500/15 text-red-400" : "bg-secondary text-muted-foreground"}`}>{m.status === "live" ? "LIVE" : "UPCOMING"}</span>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-xs w-20 text-right truncate">{m.team_a}</span>
                  <input type="number" min="0" max="20" value={d.a} onChange={(e) => setScore(m.id, "a", e.target.value)} className="w-12 h-10 text-center rounded-lg border border-input bg-transparent" />
                  <span className="text-muted-foreground">-</span>
                  <input type="number" min="0" max="20" value={d.b} onChange={(e) => setScore(m.id, "b", e.target.value)} className="w-12 h-10 text-center rounded-lg border border-input bg-transparent" />
                  <span className="text-xs w-20 truncate">{m.team_b}</span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">{pred ? "✓ Prediction saved" : "No prediction yet"}</span>
                  <button onClick={() => submit(m)} disabled={submitting === m.id} className="px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                    {submitting === m.id ? "Saving…" : pred ? "Update" : "Predict"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">{icon}</div>
      <div><p className="text-lg font-bold leading-none">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>
    </div>
  );
}