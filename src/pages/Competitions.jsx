import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Trophy, Loader2, Coins, Vote, Users, CalendarDays, ArrowLeft } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

export default function Competitions() {
  const [me, setMe] = React.useState(null);
  const [comps, setComps] = React.useState([]);
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [entered, setEntered] = React.useState(new Set());
  const [caption, setCaption] = React.useState("");
  const [contentUrl, setContentUrl] = React.useState("");

  React.useEffect(() => {
    (async () => {
      let u = null;
      try { u = await base44.auth.me(); setMe(u); } catch {}
      try {
        const list = await base44.entities.Competition.list("-created_date", 50);
        setComps(list.filter((c) => c.status === "active" || c.status === "voting" || c.status === "completed"));
        if (u) {
          const mine = await base44.entities.CompetitionEntry.filter({ user_id: u.id });
          setEntries(mine);
          setEntered(new Set(mine.map((e) => e.competition_id)));
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const enterFanContest = async (comp) => {
    if (!me) { toast({ title: "Please log in to enter", variant: "destructive" }); return; }
    if (!caption.trim() && !contentUrl.trim()) {
      toast({ title: "Add a caption or content URL", variant: "destructive" });
      return;
    }
    try {
      await base44.entities.CompetitionEntry.create({
        competition_id: comp.id,
        competition_title: comp.title,
        user_id: me.id,
        user_name: me.full_name || me.email,
        entry_type: contentUrl.trim() ? "video" : "text",
        content_url: contentUrl.trim(),
        caption: caption.trim(),
        status: "pending",
      });
      toast({ title: "Entry submitted!", description: "Your submission is pending review." });
      setEntered(new Set([...entered, comp.id]));
      setCaption(""); setContentUrl("");
      // bump entry count
      await base44.entities.Competition.update(comp.id, { entry_count: (comp.entry_count || 0) + 1 });
    } catch (e) {
      toast({ title: e.message || "Submission failed", variant: "destructive" });
    }
  };

  const vote = async (entry) => {
    try {
      await base44.entities.CompetitionEntry.update(entry.id, { votes: (entry.votes || 0) + 1 });
      toast({ title: "Vote recorded!" });
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, votes: (e.votes || 0) + 1 } : e));
    } catch (e) {
      toast({ title: e.message || "Vote failed", variant: "destructive" });
    }
  };

  const active = comps.filter((c) => c.status === "active");
  const voting = comps.filter((c) => c.status === "voting");
  const completed = comps.filter((c) => c.status === "completed");
  const publicEntries = comps.length ? entries.filter((e) => comps.some((c) => c.id === e.competition_id && c.status !== "active")) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <PageHeader
        eyebrow="RIDE X REWARDS"
        title="Weekly Competitions"
        subtitle="Compete every week — Predict & Win points and themed fan contests. Free to enter, no real money."
        action={<Button asChild variant="outline" className="rounded-full"><Link to="/rewards"><ArrowLeft className="w-4 h-4" /> Rewards</Link></Button>}
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : comps.length === 0 ? (
        <div className="text-center py-20">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No competitions right now — new ones are auto-created each week.</p>
        </div>
      ) : (
        <Tabs defaultValue="active">
          <TabsList className="rounded-full">
            <TabsTrigger value="active" className="rounded-full">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="voting" className="rounded-full">Voting ({voting.length})</TabsTrigger>
            <TabsTrigger value="completed" className="rounded-full">Completed ({completed.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6 space-y-4">
            {active.map((c) => (
              <div key={c.id} className="rounded-3xl border border-border/60 bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${c.competition_type === "predict_win" ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent"}`}>
                      {c.competition_type === "predict_win" ? <Coins className="w-3 h-3" /> : <Trophy className="w-3 h-3" />}
                      {c.competition_type === "predict_win" ? "Predict & Win" : "Fan Contest"}
                    </span>
                    <h3 className="font-bold text-lg mt-2">{c.title}</h3>
                    <p className="text-sm text-muted-foreground">{c.theme}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Prize</p>
                    <p className="font-bold text-primary">{c.prize_coins?.toLocaleString()} coins</p>
                    <p className="text-xs text-muted-foreground">{c.prize_description}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line mb-3">{c.rules}</p>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-4">
                  <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {c.entry_count || 0} entries</span>
                  <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {c.end_date ? `Ends ${new Date(c.end_date).toLocaleDateString()}` : "—"}</span>
                </div>

                {c.competition_type === "predict_win" ? (
                  entered.has(c.id) ? (
                    <div className="rounded-2xl bg-primary/10 border border-primary/30 p-3 text-sm font-medium text-primary">✓ You've entered this week's prediction league.</div>
                  ) : (
                    <Button asChild className="rounded-full"><Link to="/sports"><Coins className="w-4 h-4" /> Go to Predict & Win</Link></Button>
                  )
                ) : (
                  entered.has(c.id) ? (
                    <div className="rounded-2xl bg-primary/10 border border-primary/30 p-3 text-sm font-medium text-primary">✓ Your entry is submitted and pending review.</div>
                  ) : (
                    <div className="space-y-3 rounded-2xl bg-secondary/40 p-4">
                      <div>
                        <Label htmlFor="cap">Caption / description</Label>
                        <Input id="cap" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Tell us about your entry" />
                      </div>
                      <div>
                        <Label htmlFor="url">Video / image URL</Label>
                        <Input id="url" value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} placeholder="https://…" />
                      </div>
                      <Button className="rounded-full" onClick={() => enterFanContest(c)}>Submit entry</Button>
                    </div>
                  )
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="voting" className="mt-6 space-y-4">
            {voting.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">No contests in voting phase right now.</p>
            ) : publicEntries.filter((e) => voting.some((c) => c.id === e.competition_id)).length === 0 ? (
              <p className="text-muted-foreground text-center py-12">No entries to vote on yet.</p>
            ) : (
              publicEntries.filter((e) => voting.some((c) => c.id === e.competition_id && c.competition_type === "fan_contest")).map((e) => (
                <div key={e.id} className="rounded-3xl border border-border/60 bg-card p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{e.user_name || "Anonymous"}</p>
                    <p className="text-sm text-muted-foreground">{e.caption}</p>
                    {e.content_url && <a href={e.content_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View submission →</a>}
                    <p className="text-xs text-muted-foreground mt-1">{e.competition_title}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{e.votes || 0} votes</span>
                    <Button size="sm" className="rounded-full" onClick={() => vote(e)}><Vote className="w-3.5 h-3.5" /> Vote</Button>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-6 space-y-4">
            {completed.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">No completed competitions yet.</p>
            ) : completed.map((c) => (
              <div key={c.id} className="rounded-3xl border border-border/60 bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{c.title}</h3>
                    <p className="text-sm text-muted-foreground">{c.theme} · {c.week_key}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Winner</p>
                    <p className="font-bold text-primary">{c.winner_name || "—"}</p>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}