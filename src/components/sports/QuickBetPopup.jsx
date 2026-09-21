import React from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Zap } from "lucide-react";

// Free, points-based quick prediction that flashes for 4s during a live stream.
// Tapping a side locks a score pick into MatchPrediction (graded when the match ends).
export default function QuickBetPopup({ match }) {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [visible, setVisible] = React.useState(false);
  const [left, setLeft] = React.useState(4);

  React.useEffect(() => {
    let mounted = true;
    let cd, hide;
    (async () => {
      let u = null;
      try { u = await base44.auth.me(); } catch {}
      if (!mounted) return;
      setUser(u);
      const shownKey = `qb_${match.id}`;
      if (sessionStorage.getItem(shownKey)) return;
      if (u?.id) {
        try {
          const preds = await base44.entities.MatchPrediction.filter({ user_id: u.id, match_id: match.id }, "-created_date", 5);
          if (preds && preds.length) { sessionStorage.setItem(shownKey, "1"); return; }
        } catch {}
      }
      sessionStorage.setItem(shownKey, "1");
      setVisible(true);
      setLeft(4);
      cd = setInterval(() => setLeft((l) => l - 1), 1000);
      hide = setTimeout(() => mounted && setVisible(false), 4000);
    })();
    return () => { mounted = false; clearInterval(cd); clearTimeout(hide); };
  }, [match.id]);

  React.useEffect(() => { if (left <= 0) setVisible(false); }, [left]);

  if (!visible) return null;

  const pick = async (choice) => {
    setVisible(false);
    if (!user?.id) { toast({ title: "Log in to predict", variant: "destructive" }); return; }
    const a = choice === "a" ? 1 : choice === "b" ? 0 : 1;
    const b = choice === "b" ? 1 : choice === "a" ? 0 : 1;
    try {
      await base44.entities.MatchPrediction.create({
        match_id: match.id,
        match_label: `${match.team_a} vs ${match.team_b}`,
        user_id: user.id,
        user_name: user.full_name || user.email,
        club_id: user.club_id || "",
        club_name: user.club_name || "",
        predicted_score_a: a,
        predicted_score_b: b,
      });
      toast({ title: "Quick bet locked!", description: `${match.team_a} ${a} - ${b} ${match.team_b} · 3 pts if exact` });
    } catch (e) {
      toast({ title: "Could not save bet", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="px-3 pb-1">
      <div className="rounded-2xl border border-primary/50 bg-card/95 backdrop-blur-md shadow-xl px-3 py-2.5 animate-fade-in">
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary"><Zap className="w-3.5 h-3.5" /> QUICK BET · free pick</span>
          <span className="text-[10px] text-muted-foreground">{Math.max(left, 0)}s</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => pick("a")} className="rounded-xl bg-secondary py-2 text-xs font-semibold hover:bg-primary hover:text-primary-foreground truncate" title={match.team_a}>{match.team_a}</button>
          <button onClick={() => pick("draw")} className="rounded-xl bg-secondary py-2 text-xs font-semibold hover:bg-primary hover:text-primary-foreground">Draw</button>
          <button onClick={() => pick("b")} className="rounded-xl bg-secondary py-2 text-xs font-semibold hover:bg-primary hover:text-primary-foreground truncate" title={match.team_b}>{match.team_b}</button>
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-1.5 text-center">Tap to lock your prediction · auto-grades into the leaderboard when the match ends</p>
      </div>
    </div>
  );
}