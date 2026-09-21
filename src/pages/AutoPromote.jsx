import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, Zap, Users, Send, CheckCircle2, Clock, XCircle, Headphones, Sparkles, Music2, Play,
} from "lucide-react";

const PER_CURATOR = 40000;
const KEYS = ["C", "G", "D", "A", "E", "F", "B"];
const fmt = (n) => Number(n || 0).toLocaleString();

const INFLUENCER_PLATFORMS = new Set(["TikTok", "Instagram", "YouTube", "X", "Facebook"]);
const CREATOR_PLATFORMS = new Set(["Blog", "Web", "Stream"]);
const categoryOf = (platform) =>
  INFLUENCER_PLATFORMS.has(platform) ? "influencer" : CREATOR_PLATFORMS.has(platform) ? "creator" : "curator";
const TABS = ["influencer", "creator", "curator"];
const TAB_LABEL = { influencer: "Influencers", creator: "Content Creators", curator: "Curators" };
const TAB_BLURB = {
  influencer: "Social creators who push your song to their followers with posts, reels and stories.",
  creator: "Bloggers, music sites and video channels that feature, review or react to your track.",
  curator: "Playlist editors on Spotify, Audiomack, Boomplay, Apple Music and more.",
};

export default function AutoPromote() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [form, setForm] = React.useState({ title: "", artist: "", genres: "", bpm: "", key: "C", audio_url: "", cover_url: "", notes: "" });
  const [curators, setCurators] = React.useState([]);       // all approved curators, free-first
  const [scores, setScores] = React.useState({});          // id -> match score (optional)
  const [matching, setMatching] = React.useState(false);
  const [selected, setSelected] = React.useState(new Set());
  const [tab, setTab] = React.useState("influencer");
  const [checkout, setCheckout] = React.useState(false);
  const [subs, setSubs] = React.useState([]);
  const [busy, setBusy] = React.useState(true);

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      base44.functions.invoke("auto-promote-approve", {}).catch(() => {});
      Promise.all([
        base44.entities.Curator.filter({ status: "approved" }, "-follower_count", 200),
        u ? base44.entities.CuratorSubmission.filter({ submitted_by_id: u.id }, "-created_date", 100).catch(() => []) : [],
      ]).then(([c, s]) => {
        const sorted = [...c].sort((a, b) =>
          (a.is_free === b.is_free ? 0 : a.is_free ? -1 : 1) || (b.follower_count || 0) - (a.follower_count || 0)
        );
        setCurators(sorted);
        setSelected(new Set(sorted.map((x) => x.id)));
        setSubs((s || []).filter((x) => x.promote_batch_id));
      }).finally(() => setBusy(false));
    }).catch(() => setBusy(false));
  }, []);

  const isAdmin = user?.role === "admin";
  const toggle = (id) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const selectAll = () => setSelected(new Set(curators.map((m) => m.id)));
  const clearAll = () => setSelected(new Set());

  const selectedCurators = curators.filter((c) => selected.has(c.id));
  const total = PER_CURATOR * selectedCurators.length;

  const cats = React.useMemo(() => ({
    influencer: curators.filter((c) => categoryOf(c.platform) === "influencer"),
    creator: curators.filter((c) => categoryOf(c.platform) === "creator"),
    curator: curators.filter((c) => categoryOf(c.platform) === "curator"),
  }), [curators]);
  const selectTab = () => setSelected((prev) => new Set([...prev, ...cats[tab].map((m) => m.id)]));
  const clearTab = () => setSelected((prev) => {
    const next = new Set(prev);
    cats[tab].forEach((m) => next.delete(m.id));
    return next;
  });

  // Optional: re-sort the visible list by genre+BPM+key match score
  const runMatch = async () => {
    if (!form.title) {
      toast({ title: "Add a song title", description: "Enter a song title to score matches.", variant: "destructive" });
      return;
    }
    setMatching(true);
    try {
      const genres = form.genres.split(",").map((g) => g.trim()).filter(Boolean);
      const res = await base44.functions.invoke("auto-promote-match", {
        title: form.title, artist: form.artist || user?.full_name || "",
        genres, bpm: Number(form.bpm) || 0, key: form.key,
        audio_url: form.audio_url, cover_url: form.cover_url,
      });
      const data = res?.data || res;
      const byId = new Map((data.matched || []).map((m) => [m.id, m]));
      setScores(Object.fromEntries((data.matched || []).map((m) => [m.id, m.score || 0])));
      // keep free-first, but within that order by match score desc
      setCurators((prev) =>
        [...prev].sort((a, b) => {
          if (a.is_free !== b.is_free) return a.is_free ? -1 : 1;
          return (byId.get(b.id)?.score || 0) - (byId.get(a.id)?.score || 0);
        })
      );
    } catch (e) {
      toast({ title: "Matching failed", description: e.message, variant: "destructive" });
    } finally {
      setMatching(false);
    }
  };

  const onPaid = async () => {
    if (!form.title || !form.audio_url) {
      toast({ title: "Missing details", description: "Song title and audio link are required to submit.", variant: "destructive" });
      return;
    }
    if (!selectedCurators.length) return;
    try {
      const matched = selectedCurators.map((c) => ({
        id: c.id, name: c.name, platform: c.platform, score: scores[c.id] || 0, auto_approve: !!c.auto_approve,
      }));
      const res = await base44.functions.invoke("auto-promote-finalize", {
        track: {
          title: form.title, artist: form.artist || user?.full_name || "",
          genres: form.genres.split(",").map((g) => g.trim()).filter(Boolean),
          bpm: Number(form.bpm) || 0, key: form.key,
          audio_url: form.audio_url, cover_url: form.cover_url,
        },
        matched,
      });
      const data = res?.data || res;
      toast({
        title: "Auto-Promote live",
        description: isAdmin
          ? `Sent to ${data.created} curator${data.created === 1 ? "" : "s"}. Auto-approves in 60 minutes unless a curator rejects.`
          : `Sent to ${data.created} curator${data.created === 1 ? "" : "s"} for review.`,
      });
      setCheckout(false);
      const fresh = await base44.entities.CuratorSubmission.filter({ submitted_by_id: user?.id || "" }, "-created_date", 100);
      setSubs(fresh.filter((x) => x.promote_batch_id));
    } catch (e) {
      toast({ title: "Finalize failed", description: e.message, variant: "destructive" });
    }
  };

  const statusIcon = (st) =>
    st === "accepted" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
    : st === "rejected" ? <XCircle className="w-4 h-4 text-destructive" />
    : <Clock className="w-4 h-4 text-amber-400" />;

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Auto-Promote"
        title="Auto-Promote Engine"
        subtitle={`₦${PER_CURATOR.toLocaleString()} per curator. Pick exactly which curators you want and how many — free curators are shown first. Add your track details below, then pay for your selection.${isAdmin ? " Auto-approves in 60 minutes." : ""}`}
        action={
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <Zap className="w-4 h-4" /> ₦{PER_CURATOR.toLocaleString()} / curator
          </span>
        }
      />

      {/* Who Auto-Promote reaches — click a card to switch the list below */}
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        {TABS.map((k) => {
          const Icon = k === "influencer" ? Users : k === "creator" ? Sparkles : Headphones;
          const on = tab === k;
          return (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`text-left rounded-2xl border p-4 transition-colors ${on ? "border-primary bg-primary/10" : "border-primary/30 bg-card hover:border-primary/50"}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${on ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <p className="font-semibold text-sm">{TAB_LABEL[k]}</p>
                </span>
                <span className={`text-xs font-medium ${on ? "text-primary" : "text-muted-foreground"}`}>{cats[k]?.length || 0}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{TAB_BLURB[k]}</p>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Track form */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
          <p className="text-sm font-semibold flex items-center gap-2"><Music2 className="w-4 h-4 text-primary" /> Track details</p>
          <div>
            <Label className="text-xs">Song title</Label>
            <Input className="rounded-xl mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Song title" />
          </div>
          <div>
            <Label className="text-xs">Artist name</Label>
            <Input className="rounded-xl mt-1" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} placeholder={user?.full_name || "Artist name"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Genre(s)</Label>
              <Input className="rounded-xl mt-1" value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} placeholder="Afrobeats, Amapiano" />
            </div>
            <div>
              <Label className="text-xs">BPM</Label>
              <Input className="rounded-xl mt-1" type="number" value={form.bpm} onChange={(e) => setForm({ ...form, bpm: e.target.value })} placeholder="105" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Key</Label>
              <select className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })}>
                {KEYS.map((k) => <option key={k} value={k} className="bg-card">{k}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Cover URL (optional)</Label>
              <Input className="rounded-xl mt-1" value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="https://…" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Audio link (MP3 / streaming URL)</Label>
            <Input className="rounded-xl mt-1" value={form.audio_url} onChange={(e) => setForm({ ...form, audio_url: e.target.value })} placeholder="https://…" />
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea className="rounded-xl mt-1" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything curators should know" />
          </div>
          <Button variant="outline" className="w-full rounded-full" disabled={matching} onClick={runMatch}>
            {matching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {matching ? "Scoring…" : "Re-rank by match score (optional)"}
          </Button>
        </div>

        {/* Curator selection */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/40 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> {TAB_LABEL[tab]} <span className="text-muted-foreground font-normal">· {cats[tab]?.length || 0}</span>
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-full h-7 text-xs" onClick={selectTab}>Select all</Button>
                <Button size="sm" variant="outline" className="rounded-full h-7 text-xs" onClick={clearTab}>Clear</Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-secondary/60 py-2"><p className="text-muted-foreground">Selected</p><p className="font-bold text-primary">{selectedCurators.length}</p></div>
              <div className="rounded-xl bg-secondary/60 py-2"><p className="text-muted-foreground">Per pick</p><p className="font-bold">₦{fmt(PER_CURATOR)}</p></div>
              <div className="rounded-xl bg-secondary/60 py-2"><p className="text-muted-foreground">Total</p><p className="font-bold text-primary">{money(total)}</p></div>
            </div>

            {busy ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (cats[tab]?.length || 0) === 0 ? (
              <div className="text-center py-10">
                <Headphones className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No {TAB_LABEL[tab].toLowerCase()} available yet.</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                {cats[tab].map((m) => {
                  const on = selected.has(m.id);
                  return (
                    <button key={m.id} onClick={() => toggle(m.id)} type="button"
                      className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-colors ${on ? "border-primary bg-primary/10" : "border-border/50 bg-secondary/40"}`}>
                      <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary" : "border-input"}`}>
                        {on && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{m.name} <span className="text-muted-foreground">· {m.platform}</span></p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                          <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {fmt(m.follower_count)}</span>
                          <span className="inline-flex items-center gap-1"><Play className="w-3 h-3" /> {fmt(m.plays)}</span>
                          {m.is_free && <span className="text-emerald-400">Free</span>}
                          {isAdmin && m.auto_approve && <span className="text-amber-300">⚡ Boost</span>}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-primary shrink-0">₦{fmt(PER_CURATOR)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <Button className="w-full rounded-full h-11 font-semibold" onClick={() => setCheckout(true)} disabled={!selectedCurators.length}>
              <Send className="w-4 h-4" /> Pay {money(total)} & Auto-Promote {selectedCurators.length}
            </Button>
          </div>

          {subs.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">My Auto-Promote submissions</p>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {subs.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border/50 bg-secondary/40 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.song_title}</p>
                      <p className="text-xs text-muted-foreground truncate">to {s.curator_name}{s.is_standby ? " · standby" : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      {statusIcon(s.status)}
                      <span className="capitalize">{s.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <CheckoutDialog
        open={checkout}
        onOpenChange={(v) => !v && setCheckout(false)}
        amount={total}
        service="auto_promote"
        description={`Auto-Promote: ${form.title || "track"} → ${selectedCurators.length} curator${selectedCurators.length === 1 ? "" : "s"}`}
        referenceId={`autopromote-${selectedCurators.length}`}
        onPaid={onPaid}
        allowCash={false}
        commission={Math.round(total * 0.2)}
      />
    </div>
  );
}