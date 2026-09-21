import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Send, Users, Sparkles, CheckCircle2, Clock, XCircle, TrendingUp, Music2, Film, Package, Disc3, Plus, Check, Flame } from "lucide-react";

// Real per-post/skit promotion rates (₦) — what each tier charges to promote
// on their page. Confirmed Aug 2026 (₦1,425/$). 20% platform commission built in.
const INF_FEE = { nano: 200000, micro: 500000, mid: 5000000, macro: 6000000, mega: 8000000 };
const TIER_META = {
  nano: { label: "Nano", color: "text-emerald-400" },
  micro: { label: "Micro", color: "text-sky-400" },
  mid: { label: "Mid", color: "text-amber-400" },
  macro: { label: "Macro", color: "text-orange-400" },
  mega: { label: "Mega", color: "text-rose-400" },
};
const TYPE_ICON = { song: Music2, video: Film, product: Package, album: Disc3 };

// Nigerian creators are surfaced first in the grid.
const NIGERIAN = new Set([
  "davido","tiwa savage","yemi alade","wizkid","burna boy","kiekie","broda shaggi","mercy johnson",
  "mr macaroni","ini edo","taaooma","mark angel","ayra starr","asake","rema","tonto dikeh","don jazzy",
  "cute abiola","tunde ednut","tems","sabinus","adesua etomi","brain jotter","nasty blaq","layi wasabi",
  "nancy isime","sydney talker","toke makinwa","josh2funny","brainchild","enioluwa","banky w","ashmusy",
  "ebuka obi-uchendu","lord lamba","mainland plug","zee dances","classic vibe","grace sounds",
  "pop pixie","fresh ears","alt listener","star gist","tunde vibes","ada reactions","dance king","ride x official",
]);
const isNigerian = (inf) => NIGERIAN.has((inf.full_name || inf.username || "").toLowerCase());
// Fee for a selected influencer. International mega celebrities = On request (not auto-counted).
const feeFor = (inf) => {
  const tier = inf.tier || "nano";
  if (tier === "mega" && !isNigerian(inf)) return 0;
  return INF_FEE[tier] || 15000;
};
const commissionOf = (fee) => Math.round(Number(fee || 0) * 0.2);

// Preset packages — curated tier mixes with a bundled discount.
const PACKAGES = [
  {
    key: "combo",
    name: "Combo Pack",
    emoji: "🍱",
    tagline: "Balanced reach across micro + mid voices.",
    mix: { micro: 2, mid: 1 },
    discount: 100000,
  },
  {
    key: "hotjollof",
    name: "Hot Jollof Package",
    emoji: "🌶️",
    tagline: "Our spiciest bundle — a macro headline + mids + micros.",
    mix: { macro: 1, mid: 2, micro: 2 },
    discount: 300000,
  },
];

export default function Influencers() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [influencers, setInfluencers] = React.useState([]);
  const [submissions, setSubmissions] = React.useState([]);
  const [matches, setMatches] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filterTier, setFilterTier] = React.useState("any");
  const [filterGenre, setFilterGenre] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());
  const [packageKey, setPackageKey] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [checkout, setCheckout] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    title: "", type: "song", genre: "Afrobeats", mood: "", tempo: "",
    description: "", audio_url: "", video_url: "", cover_url: "",
  });

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      Promise.all([
        base44.entities.Influencer.filter({ verification_status: "approved" }, "-follower_count", 100),
        u ? base44.entities.InfluencerSubmission.filter({ artist_id: u.id }, "-created_date", 50).catch(() => []) : [],
        u ? base44.entities.InfluencerMatch.filter({ artist_id: u.id }, "-created_date", 200).catch(() => []) : [],
      ]).then(([inf, subs, mtch]) => {
        setInfluencers(inf); setSubmissions(subs); setMatches(mtch);
      }).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const isAdmin = user?.role === "admin";
  const visible = influencers
    .filter((i) => {
      if (filterTier !== "any" && (i.tier || "nano") !== filterTier) return false;
      if (filterGenre) {
        const g = (i.genres || "").toLowerCase();
        if (!g.includes(filterGenre.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Nigerian creators first, then by follower count descending.
      const aN = isNigerian(a) ? 1 : 0;
      const bN = isNigerian(b) ? 1 : 0;
      if (aN !== bN) return bN - aN;
      return (b.follower_count || 0) - (a.follower_count || 0);
    });

  // Resolve a package → set of influencer ids (top-by-followers per required tier).
  const applyPackage = (pkg) => {
    const ids = new Set();
    Object.entries(pkg.mix).forEach(([tier, count]) => {
      influencers
        .filter((i) => (i.tier || "nano") === tier)
        .slice(0, count)
        .forEach((i) => ids.add(i.id));
    });
    setSelected(ids);
    setPackageKey(pkg.key);
  };

  const toggleInfluencer = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setPackageKey(null); // manual toggle breaks out of a preset
  };

  const selectedList = influencers.filter((i) => selected.has(i.id));
  const sumFee = selectedList.reduce((t, i) => t + feeFor(i), 0);
  const pkg = PACKAGES.find((p) => p.key === packageKey) || null;
  const total = pkg ? Math.max(0, sumFee - pkg.discount) : sumFee;

  const startSubmission = () => {
    if (selected.size === 0) {
      toast({ title: "Pick influencers", description: "Choose at least one influencer or a package.", variant: "destructive" });
      return;
    }
    setOpen(true);
  };

  const confirmPay = () => {
    if (!form.title || !form.genre) {
      toast({ title: "Missing details", description: "Title and genre are required.", variant: "destructive" });
      return;
    }
    if (form.type === "song" && !form.audio_url) {
      toast({ title: "Audio link required", variant: "destructive" });
      return;
    }
    setOpen(false);
    setCheckout(true);
  };

  const onPaid = async () => {
    setSubmitting(true);
    try {
      const s = await base44.entities.InfluencerSubmission.create({
        artist_id: user?.id || "",
        artist_name: user?.full_name || "",
        title: form.title,
        type: form.type,
        description: form.description,
        genre: form.genre,
        mood: form.mood,
        tempo: form.tempo,
        audio_url: form.audio_url,
        video_url: form.video_url,
        cover_url: form.cover_url,
        price: total,
        target_tier: "any",
        status: "accepted", // auto-approve: routed instantly, no manual review
      });
      // Client-side matching + auto-approve — runs entirely in the browser with
      // NO backend function, so it works even while integration credits are
      // exhausted. Creates an InfluencerMatch (status="accepted") for every
      // chosen influencer, routing the submission to their dashboard instantly.
      const matchRecs = selectedList.map((i) => ({
        submission_id: s.id,
        submission_title: form.title,
        artist_id: user?.id || "",
        artist_name: user?.full_name || "",
        influencer_id: i.id,
        influencer_name: i.full_name || i.username || "",
        match_score: 100,
        status: "accepted",
        auto_notified: true,
      }));
      let created = [];
      try {
        created = matchRecs.length ? await base44.entities.InfluencerMatch.bulkCreate(matchRecs) : [];
      } catch (e) {
        console.error("client-side match create failed", e);
      }
      const matched = created.length;
      setMatches((prev) => [...created, ...prev]);
      setSubmissions((prev) => [{ ...s, status: "accepted" }, ...prev]);
      setCheckout(null);
      setOpen(false);
      setSelected(new Set());
      setPackageKey(null);
      setForm({ title: "", type: "song", genre: "Afrobeats", mood: "", tempo: "", description: "", audio_url: "", video_url: "", cover_url: "" });
      toast({ title: "Submitted & auto-approved", description: `Routed & approved to ${matched} chosen influencer${matched === 1 ? "" : "s"}.` });
    } catch (e) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const statusIcon = (st) => st === "live" || st === "accepted" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : st === "rejected" ? <XCircle className="w-4 h-4 text-destructive" /> : <Clock className="w-4 h-4 text-amber-400" />;
  const matchCountFor = (sid) => matches.filter((m) => m.submission_id === sid).length;
  const acceptedCountFor = (sid) => matches.filter((m) => m.submission_id === sid && m.status === "accepted").length;

  return (
    <div className="pb-28">
      <PageHeader
        eyebrow="RIDE X Influencers"
        title="Build Your Influencer Combo"
        subtitle="Hand-pick the exact influencers you want, or grab a preset package. You only pay for who you choose — and your submission goes straight to their dashboard."
        action={<Button className="rounded-full" onClick={() => setOpen(true)} disabled={selected.size === 0}><Sparkles className="w-4 h-4" /> Submit to {selected.size || "—"}</Button>}
      />

      {/* Today's pricing — flat per-influencer, no surprises */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Today&apos;s Pricing — per influencer</p>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">Flat fee by tier · you only pay for who you pick</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {Object.entries(INF_FEE).map(([k, fee]) => {
            const t = TIER_META[k];
            const isMega = k === "mega";
            return (
              <div key={k} className="rounded-xl bg-secondary/40 p-3 text-center">
                <p className={`text-xs font-bold uppercase ${t.color}`}>{t.label}</p>
                <p className="text-lg font-extrabold mt-1">{money(fee)}</p>
                <p className="text-[10px] mt-1 text-emerald-400 font-semibold">{isAdmin ? "Auto-accepts" : "Available"}{isMega ? " (NG)" : ""}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">20% platform · ₦{commissionOf(fee).toLocaleString()}</p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Real per-post promotion rates (confirmed Aug 2026). International celebrity Mega names (Ronaldo, Messi, Kim K) are expression-of-interest, reached on your behalf. 20% platform commission is built into every price; 80% goes to the influencer(s).</p>
      </div>

      {/* Packages */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {PACKAGES.map((p) => {
          const active = packageKey === p.key;
          return (
            <button
              key={p.key}
              onClick={() => applyPackage(p)}
              className={`text-left rounded-2xl border p-5 transition-all card-lift ${active ? "border-primary bg-primary/10" : "border-border/60 bg-card"}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{p.emoji}</span>
                <div className="flex-1">
                  <p className="font-bold flex items-center gap-2">{p.name} {p.key === "hotjollof" && <Flame className="w-4 h-4 text-orange-400" />}</p>
                  <p className="text-xs text-muted-foreground">{p.tagline}</p>
                </div>
                {active && <Check className="w-5 h-5 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Includes: {Object.entries(p.mix).map(([t, n]) => `${n} ${TIER_META[t]?.label || t}`).join(" + ")}
              </p>
              <p className="text-sm font-semibold text-primary">{money(p.discount)} off · bundle price applied at checkout</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Select value={filterTier} onValueChange={setFilterTier}>
          <SelectTrigger className="w-36 rounded-full"><SelectValue placeholder="Tier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All tiers</SelectItem>
            {Object.entries(TIER_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="rounded-full w-44" placeholder="Filter genre…" value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((inf) => {
            const t = TIER_META[inf.tier || "nano"];
            const isSel = selected.has(inf.id);
            return (
              <div
                key={inf.id}
                className={`rounded-2xl border bg-card p-4 card-lift cursor-pointer transition-all ${isSel ? "border-primary ring-1 ring-primary/40" : "border-border/60"}`}
                onClick={() => toggleInfluencer(inf.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                    {(inf.full_name || inf.username || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{inf.full_name || inf.username}</p>
                    <p className="text-xs text-primary">@{inf.username} · {inf.platform}</p>
                    {inf.genres && <p className="text-xs text-muted-foreground truncate">{inf.genres}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] font-bold uppercase ${t.color}`}>{t.label}</span>
                    {inf.tier === "mega" && !isNigerian(inf) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400"><Clock className="w-2.5 h-2.5" /> On request</span>
                    ) : isAdmin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400"><CheckCircle2 className="w-2.5 h-2.5" /> Auto-accepts</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400"><CheckCircle2 className="w-2.5 h-2.5" /> Available</span>
                    )}
                  </div>
                </div>
                {inf.bio && <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{inf.bio}</p>}
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="w-3.5 h-3.5" /> {(inf.follower_count || 0).toLocaleString()}</span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground"><TrendingUp className="w-3.5 h-3.5" /> {(inf.engagement_rate || 0).toFixed(1)}% eng</span>
                  {feeFor(inf) > 0 ? (
                    <span className="font-semibold text-primary">{money(feeFor(inf))}</span>
                  ) : (
                    <span className="font-semibold text-amber-400 text-[10px]">On request</span>
                  )}
                </div>
                {feeFor(inf) > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">80% talent · 20% platform (₦{commissionOf(feeFor(inf)).toLocaleString()})</p>
                )}
                <div className={`mt-3 flex items-center justify-center gap-1 rounded-full py-1.5 text-xs font-medium ${isSel ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  {isSel ? <><Check className="w-3.5 h-3.5" /> Selected</> : <><Plus className="w-3.5 h-3.5" /> Add to combo</>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* My submissions */}
      {submissions.length > 0 && (
        <div className="mt-10">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">My submissions</p>
          <div className="space-y-2">
            {submissions.map((s) => {
              const Icon = TYPE_ICON[s.type] || Music2;
              return (
                <div key={s.id} className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.type} · {s.genre} · matched to {matchCountFor(s.id)} ({acceptedCountFor(s.id)} accepted)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0 capitalize">
                    {statusIcon(s.status)} {s.status}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sticky selection bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-[550] border-t border-border/60 bg-card/95 backdrop-blur">
          <div className="max-w-7xl mx-auto px-5 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {selected.size} selected {pkg ? <span className="text-primary">· {pkg.emoji} {pkg.name}</span> : <span className="text-muted-foreground">· custom combo</span>}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {pkg && <span className="line-through opacity-60 mr-1">{money(sumFee)}</span>}
                Total {money(total)}
              </p>
            </div>
            <Button className="rounded-full" onClick={startSubmission} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Pay {money(total)} & Submit
            </Button>
          </div>
        </div>
      )}

      {/* Create submission modal */}
      {open && (
        <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg bg-card rounded-2xl p-5 space-y-3 my-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold">Submit to {selected.size} influencer{selected.size === 1 ? "" : "s"}</p>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedList.slice(0, 8).map((i) => (
                <span key={i.id} className="text-[11px] rounded-full bg-secondary px-2 py-1 truncate max-w-[140px]">{i.full_name || i.username}</span>
              ))}
              {selectedList.length > 8 && <span className="text-[11px] text-muted-foreground px-1 py-1">+{selectedList.length - 8} more</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="song">Song</SelectItem>
                    <SelectItem value="video">Music Video</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="album">Album/EP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Genre</Label>
                <Input className="rounded-xl mt-1" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} placeholder="Afrobeats, Pop…" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input className="rounded-xl mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Song / video / product title" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Mood</Label><Input className="rounded-xl mt-1" value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })} placeholder="Happy, Chill…" /></div>
              <div><Label className="text-xs">Tempo</Label><Input className="rounded-xl mt-1" value={form.tempo} onChange={(e) => setForm({ ...form, tempo: e.target.value })} placeholder="Upbeat, Slow…" /></div>
            </div>
            <div>
              <Label className="text-xs">Description / story</Label>
              <Textarea className="rounded-xl mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            {form.type === "song" || form.type === "album" ? (
              <div><Label className="text-xs">Audio link (MP3 / streaming URL)</Label><Input className="rounded-xl mt-1" value={form.audio_url} onChange={(e) => setForm({ ...form, audio_url: e.target.value })} placeholder="https://…" /></div>
            ) : form.type === "video" ? (
              <div><Label className="text-xs">Video link (MP4 / YouTube URL)</Label><Input className="rounded-xl mt-1" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://…" /></div>
            ) : (
              <div><Label className="text-xs">Cover / product image URL</Label><Input className="rounded-xl mt-1" value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="https://…" /></div>
            )}
            <p className="text-xs text-muted-foreground">Total {money(total)} — 80% to the influencers on accept, 20% platform. Routed directly to your chosen {selected.size} influencer{selected.size === 1 ? "" : "s"}.</p>
            <Button className="w-full rounded-full" onClick={confirmPay}><Send className="w-4 h-4" /> Pay {money(total)} & Submit</Button>
          </div>
        </div>
      )}

      <CheckoutDialog
        open={!!checkout}
        onOpenChange={(v) => !v && setCheckout(null)}
        amount={total}
        service="subscription"
        description={`Influencer combo — ${form.title}`}
        referenceId={checkout ? `influencer-${form.type}` : ""}
        onPaid={onPaid}
        allowCash={false}
        commission={Math.round(total * 0.2)}
      />
    </div>
  );
}