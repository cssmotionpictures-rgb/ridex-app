import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CheckCircle2, XCircle, Wallet, Inbox, TrendingUp, Headphones, ExternalLink } from "lucide-react";

const tierOf = (n) => (n >= 1000000 ? "mega" : n >= 200000 ? "macro" : n >= 50000 ? "mid" : n >= 10000 ? "micro" : "nano");
const ACCEPT_LIMIT = { nano: 5, micro: 10, mid: 20, macro: 50, mega: 100 };

export default function InfluencerDashboard() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [influencer, setInfluencer] = React.useState(null);
  const [matches, setMatches] = React.useState([]);
  const [earnings, setEarnings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(null);
  // become-influencer form
  const [form, setForm] = React.useState({ full_name: "", username: "", platform: "TikTok", follower_count: 0, engagement_rate: 5, genres: "Afrobeats, Pop", bio: "", profile_image: "" });

  const load = (u) => {
    base44.entities.Influencer.filter({ user_id: u.id }, "-created_date", 5).then((list) => {
      const inf = list[0] || null;
      setInfluencer(inf);
      if (inf) {
        Promise.all([
          base44.entities.InfluencerMatch.filter({ influencer_id: inf.id }, "-created_date", 100).catch(() => []),
          base44.entities.InfluencerEarning.filter({ influencer_id: inf.id }, "-created_date", 100).catch(() => []),
        ]).then(([m, e]) => { setMatches(m); setEarnings(e); }).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  };

  React.useEffect(() => {
    base44.auth.me().then((u) => { setUser(u); load(u); }).catch(() => setLoading(false));
  }, []);

  const createProfile = async () => {
    if (!form.username) { toast({ title: "Username required", variant: "destructive" }); return; }
    const tier = tierOf(Number(form.follower_count) || 0);
    const inf = await base44.entities.Influencer.create({
      user_id: user.id,
      full_name: form.full_name || form.username,
      username: form.username,
      email: user.email,
      platform: form.platform,
      follower_count: Number(form.follower_count) || 0,
      engagement_rate: Number(form.engagement_rate) || 0,
      genres: form.genres,
      bio: form.bio,
      profile_image: form.profile_image,
      tier,
      verification_status: "approved",
      auto_accept_limit: ACCEPT_LIMIT[tier],
      total_earnings: 0,
    });
    setInfluencer(inf);
    setLoading(false);
    toast({ title: "Influencer profile live", description: `You're a ${tier} influencer — ready to receive submissions.` });
  };

  const respond = async (matchId, action) => {
    setBusy(matchId + action);
    try {
      const r = await base44.functions.invoke("respond-influencer-match", { match_id: matchId, action });
      setMatches((prev) => prev.map((m) => m.id === matchId ? { ...m, status: action === "accept" ? "accepted" : "rejected" } : m));
      if (action === "accept" && r?.earned) {
        setInfluencer((prev) => prev ? { ...prev, total_earnings: (prev.total_earnings || 0) + r.earned } : prev);
        setEarnings((prev) => [{ influencer_id: influencer.id, amount: r.earned, status: "pending", submission_title: matches.find((m) => m.id === matchId)?.submission_title }, ...prev]);
        toast({ title: "Accepted", description: `Earning of ${money(r.earned)} added to your wallet.` });
      } else {
        toast({ title: "Rejected", description: "Submission rejected." });
      }
    } catch (e) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const pending = matches.filter((m) => m.status === "pending");
  const totalEarn = earnings.reduce((s, e) => s + (e.amount || 0), 0);
  const paidEarn = earnings.filter((e) => e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <PageHeader eyebrow="RIDE X Influencers" title="Influencer Dashboard" subtitle="Review auto-routed submissions, accept to showcase to your followers, and earn 80% commission." />

      {!influencer ? (
        <div className="max-w-xl rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <p className="font-semibold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /> Become an Influencer</p>
          <p className="text-sm text-muted-foreground">Create your profile to start receiving paid submissions matched to your audience. Your tier is auto-assigned from your follower count.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Full name</Label><Input className="rounded-xl mt-1" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label className="text-xs">Username</Label><Input className="rounded-xl mt-1" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="@handle" /></div>
            <div><Label className="text-xs">Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{["TikTok", "Instagram", "YouTube", "X", "Facebook"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Followers</Label><Input className="rounded-xl mt-1" type="number" value={form.follower_count} onChange={(e) => setForm({ ...form, follower_count: e.target.value })} /></div>
            <div><Label className="text-xs">Engagement rate %</Label><Input className="rounded-xl mt-1" type="number" value={form.engagement_rate} onChange={(e) => setForm({ ...form, engagement_rate: e.target.value })} /></div>
            <div><Label className="text-xs">Genres</Label><Input className="rounded-xl mt-1" value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} /></div>
          </div>
          <div><Label className="text-xs">Bio</Label><Textarea className="rounded-xl mt-1" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
          <Button className="rounded-full" onClick={createProfile}>Create Influencer Profile</Button>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Inbox className="w-3.5 h-3.5" /> Pending reviews</p>
              <p className="text-2xl font-bold mt-1">{pending.length}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Total earnings</p>
              <p className="text-2xl font-bold mt-1 text-primary">{money(totalEarn)}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-xs text-muted-foreground">Paid out</p>
              <p className="text-2xl font-bold mt-1 text-emerald-400">{money(paidEarn)}</p>
            </div>
          </div>

          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Submission inbox</p>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No submissions matched to you yet. Once artists submit content matching your genres, it'll appear here automatically.</p>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => (
                <div key={m.id} className="rounded-xl border border-border/60 bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.submission_title}</p>
                      <p className="text-xs text-muted-foreground">by {m.artist_name || "artist"} · match score {m.match_score}%</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.status === "pending" ? (
                        <>
                          <Button size="sm" className="rounded-full" disabled={!!busy} onClick={() => respond(m.id, "accept")}><CheckCircle2 className="w-3.5 h-3.5" /> Accept</Button>
                          <Button size="sm" variant="outline" className="rounded-full" disabled={!!busy} onClick={() => respond(m.id, "reject")}><XCircle className="w-3.5 h-3.5" /> Reject</Button>
                        </>
                      ) : (
                        <span className={`text-xs inline-flex items-center gap-1 ${m.status === "accepted" ? "text-emerald-400" : "text-destructive"}`}>{m.status === "accepted" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />} {m.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}