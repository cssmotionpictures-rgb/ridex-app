import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Image } from "@/components/ui/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ExternalLink, Users, Send, CheckCircle2, Clock, XCircle, Headphones, Zap, Film, Video, Wand2 } from "lucide-react";
import GuidedSubmitFlow from "@/components/curators/GuidedSubmitFlow";
import { notifyCuratorsClient } from "@/lib/clientBackdoor";

const TYPES = [
  { key: "music", label: "Music", icon: Headphones },
  { key: "movie", label: "Movies", icon: Film },
  { key: "music_video", label: "Music Videos", icon: Video },
];

// Official editorial playlists (Spotify "New Music Friday", "Today's Top Hits",
// RapCaviar, Apple Music Daily, TikTok Trending, etc.) are FREE to submit — you
// cannot pay for editorial placement. Independent paid curators charge a modest
// descending processing fee by reach: ₦100K (1M+) → 80K → 60K → 40K → 20K (<10K).
// Free curators and editorial flagships show ₦0; a manually-set higher fee is respected.
const TIER_FEE = {
  macro: 100000,  // 1M+ followers
  big: 80000,     // 500K–1M
  mid: 60000,     // 100K–500K
  micro: 40000,   // 10K–100K
  nano: 20000,    // <10K
};
const feeFor = (c) => {
  if (!c || c.is_free) return 0;
  const f = Number(c?.follower_count) || 0;
  const tier =
    f >= 1_000_000 ? TIER_FEE.macro :
    f >= 500_000 ? TIER_FEE.big :
    f >= 100_000 ? TIER_FEE.mid :
    f >= 10_000 ? TIER_FEE.micro :
    TIER_FEE.nano;
  return Math.max(tier, Number(c?.submission_fee) || 0);
};

// Free editorial curators (Spotify New Music Friday, Today's Top Hits…) charge no
// curator fee, but the platform still applies a flat processing fee at checkout
// for routing the submission to every matching curator + auto-approval handling.
const PLATFORM_PROCESSING_FEE = 120000;
const checkoutAmountFor = (c) => (c && c.is_free) ? PLATFORM_PROCESSING_FEE : feeFor(c);
const commissionFor = (c) => (c && c.is_free) ? PLATFORM_PROCESSING_FEE : Math.round(feeFor(c) * 0.2);

export default function Curators() {
  const { toast } = useToast();
  const [curators, setCurators] = React.useState([]);
  const [submissions, setSubmissions] = React.useState([]);
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [submitTo, setSubmitTo] = React.useState(null);
  const [type, setType] = React.useState("music");
  const [form, setForm] = React.useState({ artist_name: "", song_title: "", audio_url: "", genre: "" });
  const [checkout, setCheckout] = React.useState(null);
  const [filter, setFilter] = React.useState("all");
  const [replyTo, setReplyTo] = React.useState(null);
  const [replyText, setReplyText] = React.useState("");
  const [guided, setGuided] = React.useState(false);

  const visibleCurators = curators.filter((c) => (c.curator_type || "music") === type);
  const isAdmin = user?.role === "admin";
  const labelFor = (curator) => {
    const t = curator?.curator_type || "music";
    if (t === "movie") return { who: "Studio / Creator", title: "Movie title", media: "Video link (MP4 / streaming URL)", cta: "Submit Film" };
    if (t === "music_video") return { who: "Artist name", title: "Video title", media: "Video link (MP4 / YouTube URL)", cta: "Submit Video" };
    return { who: "Artist name", title: "Song title", media: "Audio link (MP3 / streaming URL)", cta: "Submit Song" };
  };

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      Promise.all([
        base44.entities.Curator.filter({ status: "approved" }, "-follower_count", 100),
        u ? base44.entities.CuratorSubmission.filter({ submitted_by_id: u.id }, "-created_date", 50).catch(() => []) : [],
      ]).then(([c, s]) => { setCurators(c); setSubmissions(s); }).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const startSubmission = (curator) => {
    setSubmitTo(curator);
    setForm({ artist_name: user?.full_name || "", song_title: "", audio_url: "", genre: "" });
  };

  const confirmPay = () => {
    if (!form.song_title || !form.audio_url) {
      toast({ title: "Missing details", description: "Song title and audio link are required.", variant: "destructive" });
      return;
    }
    setCheckout(submitTo);
  };

  const onPaid = async (tx) => {
    // Auto-submit the paid song to every approved curator whose genres match
    // (falls back to all approved curators when the genre is blank or unmatched).
    // Each created CuratorSubmission is pending and routed to that curator for approval.
    const pool = curators.length ? curators : await base44.entities.Curator.filter({ status: "approved" }, "-follower_count", 200);
    const songGenres = (form.genre || "").toLowerCase().split(/[,\s/]+/).map((g) => g.trim()).filter(Boolean);
    const matches = pool.filter((c) => {
      const cg = (c.genres || "").toLowerCase().split(",").map((g) => g.trim()).filter(Boolean);
      if (!cg.length || !songGenres.length) return true;
      return cg.some((g) => songGenres.some((s) => s.includes(g) || g.includes(s)));
    });
    const targets = matches.length ? matches : pool;

    const existing = await base44.entities.CuratorSubmission.filter({ submitted_by_id: user?.id || "" }, "-created_date", 300).catch(() => []);
    const dupKey = new Set(existing.map((s) => `${s.curator_id}|${(s.artist_name || "").toLowerCase().trim()}|${(s.song_title || "").toLowerCase().trim()}`));
    const toCreate = targets
      .filter((c) => !dupKey.has(`${c.id}|${(form.artist_name || "").toLowerCase().trim()}|${(form.song_title || "").toLowerCase().trim()}`))
      .map((c) => ({
        curator_id: c.id,
        curator_name: c.name,
        artist_name: form.artist_name,
        song_title: form.song_title,
        audio_url: form.audio_url,
        genre: form.genre,
        submitted_by_id: user?.id || "",
        submitted_by_name: user?.full_name || "",
        fee_paid: feeFor(submitTo),
        status: c.auto_approve ? "accepted" : "pending",
        curator_review: c.auto_approve ? "Routed to curator — placement pending on their platform" : "",
      }));

    const created = toCreate.length ? await base44.entities.CuratorSubmission.bulkCreate(toCreate) : [];
    setSubmissions((prev) => [...created, ...prev]);
    setCheckout(null);
    setSubmitTo(null);
    const approved = created.filter((s) => s.status === "accepted").length;
    const pending = created.length - approved;
    // Best-effort: email each routed curator on creation (platform email only reaches
    // registered users / verified external domains, so results are reported honestly).
    let emailed = 0, emailFailed = 0, queued = 0;
    if (created.length) {
      try {
        const res = await base44.functions.invoke("notify-curators", { submissions: created });
        const results = res?.data?.results || [];
        emailed = results.filter((r) => r.ok).length;
        emailFailed = results.filter((r) => !r.ok).length;
      } catch {
        // Backend blocked (credits exhausted) — queue the curator notifications
        // client-side so they drain automatically once credits reset.
        try { const q = await notifyCuratorsClient(base44, created); queued = q.queued || 0; } catch {}
      }
    }
    const emailNote = created.length ? (queued ? ` · ${queued} queued (back door)` : ` · ${emailed} emailed${emailFailed ? `, ${emailFailed} undeliverable` : ""}`) : "";
    toast({
      title: "Routed to curators",
      description: isAdmin
        ? `Routed to ${created.length} curator${created.length === 1 ? "" : "s"} — ${approved} marked routed${pending ? `, ${pending} pending review` : ""}${emailNote}.`
        : created.length
          ? `Your track has been routed to ${created.length} curator${created.length === 1 ? "" : "s"} for real placement${emailNote}.`
          : "Your submission has already been sent to all matching curators.",
    });
  };

  const statusIcon = (st) => st === "accepted" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : st === "rejected" ? <XCircle className="w-4 h-4 text-destructive" /> : <Clock className="w-4 h-4 text-amber-400" />;

  const saveReply = async () => {
    if (!replyTo) return;
    try {
      const updated = await base44.entities.CuratorSubmission.update(replyTo.id, {
        curator_reply: replyText.trim(),
        replied_at: replyText.trim() ? new Date().toISOString() : "",
      });
      setSubmissions((prev) => prev.map((s) => (s.id === replyTo.id ? { ...s, ...updated } : s)));
      setReplyTo(null);
      setReplyText("");
      toast({ title: "Reply logged" });
    } catch (e) {
      toast({ title: "Could not save reply", description: e.message, variant: "destructive" });
    }
  };

  const filteredSubs = submissions.filter((s) => (filter === "all" ? true : s.status === filter));

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Curators"
        title="Curator Program"
        subtitle="Submit to the biggest curators across music, movies & music videos. Official editorial playlists (Spotify New Music Friday, Today's Top Hits…) are free to submit. Independent paid curators charge a processing fee from ₦20K to ₦100K by reach. 20% platform fee included."
      />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Button size="sm" className="rounded-full" onClick={() => setGuided(true)}>
          <Wand2 className="w-4 h-4" /> Guided Auto-Submit
        </Button>
        {TYPES.map((t) => {
          const Icon = t.icon;
          const active = type === t.key;
          return (
            <button key={t.key} onClick={() => setType(t.key)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border/60 text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : curators.length === 0 ? (
        <div className="text-center py-20">
          <Headphones className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No curators available yet. Admins can add curators from the Admin panel.</p>
        </div>
      ) : visibleCurators.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No {TYPES.find((t) => t.key === type)?.label.toLowerCase()} curators yet.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleCurators.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border/60 bg-card p-4 card-lift">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <Headphones className="w-6 h-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-primary">{c.platform}</p>
                  {c.playlist_name && <p className="text-xs text-muted-foreground truncate">{c.playlist_name}</p>}
                </div>
              </div>
              {c.bio && <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{c.bio}</p>}
              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="w-3.5 h-3.5" /> {(c.follower_count || 0).toLocaleString()}</span>
                <span className={`font-semibold ${c.is_free ? "text-emerald-400" : "text-primary"}`}>{c.is_free ? "Free" : money(feeFor(c))}</span>
                </div>
                {isAdmin && c.auto_approve && <p className="mt-2 text-[11px] text-amber-300/90">⚡ Boosted — auto-approves on payment.</p>}
                <div className="flex gap-2 mt-3">
                 <Button size="sm" className="rounded-full flex-1" onClick={() => startSubmission(c)}><Send className="w-3.5 h-3.5" /> Submit</Button>
                 {isAdmin && c.auto_approve && (
                   <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5"><Zap className="w-3 h-3" /> Auto-Approve</span>
                 )}
                {c.playlist_url && (
                   <Button size="sm" variant="outline" className="rounded-full" onClick={() => window.open(c.playlist_url, "_blank", "noopener")}>
                     <ExternalLink className="w-3.5 h-3.5" />
                   </Button>
                 )}
                {c.submission_url && (
                  <Button size="sm" variant="outline" className="rounded-full w-full mt-2" onClick={() => window.open(c.submission_url, "_blank", "noopener")}>
                    <ExternalLink className="w-3.5 h-3.5" /> Submit on {c.platform}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {submissions.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">My submissions</p>
            <div className="flex gap-1.5">
              {["all", "pending", "accepted", "rejected"].map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`text-[11px] px-2.5 py-1 rounded-full border capitalize ${filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border/60 text-muted-foreground"}`}>{f}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {filteredSubs.map((s) => (
              <div key={s.id} className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.song_title}</p>
                    <p className="text-xs text-muted-foreground">to {s.curator_name}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    {statusIcon(s.status)}
                    <span className="capitalize">{s.status === "accepted" ? "Routed" : s.status}</span>
                  </div>
                </div>
                {s.curator_review && <p className="text-xs text-muted-foreground border-t border-border/40 pt-2">“{s.curator_review}”</p>}
                {s.curator_reply && <p className="text-xs text-emerald-300/90 border-t border-border/40 pt-2">📩 {s.curator_reply}</p>}
                <button onClick={() => { setReplyTo(s); setReplyText(s.curator_reply || ""); }} className="text-[11px] text-primary underline">Log curator reply</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {replyTo && (
        <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3" onClick={() => setReplyTo(null)}>
          <div className="w-full max-w-md bg-card rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div><p className="font-semibold">Log reply — {replyTo.curator_name}</p><p className="text-xs text-muted-foreground">{replyTo.song_title}</p></div>
              <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground"><XCircle className="w-5 h-5" /></button>
            </div>
            <Textarea className="rounded-xl min-h-24" placeholder="Paste the curator's reply / placement confirmation here…" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
            <Button className="w-full rounded-full" onClick={saveReply}>Save reply</Button>
          </div>
        </div>
      )}

      {submitTo && !checkout && (
        <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3" onClick={() => setSubmitTo(null)}>
          <div className="w-full max-w-md bg-card rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div><p className="font-semibold">Submit to {submitTo.name}</p><p className="text-xs text-primary">{submitTo.platform}</p></div>
              <button onClick={() => setSubmitTo(null)} className="text-muted-foreground hover:text-foreground"><XCircle className="w-5 h-5" /></button>
              </div>
              {isAdmin && submitTo.auto_approve && (
               <div className="inline-flex items-center gap-2 text-xs text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-3 py-1 w-fit">
                 <Zap className="w-3.5 h-3.5" /> Boosted — submission auto-approves on payment
               </div>
              )}
            <div>
              <Label className="text-xs">{labelFor(submitTo).who}</Label>
              <Input className="rounded-xl mt-1" value={form.artist_name} onChange={(e) => setForm({ ...form, artist_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">{labelFor(submitTo).title}</Label>
              <Input className="rounded-xl mt-1" value={form.song_title} onChange={(e) => setForm({ ...form, song_title: e.target.value })} placeholder={labelFor(submitTo).title} />
            </div>
            <div>
              <Label className="text-xs">Genre</Label>
              <Input className="rounded-xl mt-1" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} placeholder="Afrobeats, Pop…" />
            </div>
            <div>
              <Label className="text-xs">{labelFor(submitTo).media}</Label>
              <Input className="rounded-xl mt-1" value={form.audio_url} onChange={(e) => setForm({ ...form, audio_url: e.target.value })} placeholder="https://…" />
            </div>
            <p className="text-xs text-muted-foreground">Fee: {submitTo.is_free ? `Free · ${money(PLATFORM_PROCESSING_FEE)} platform processing` : money(feeFor(submitTo))}. On payment your song is auto-submitted to <span className="text-primary">all approved curators matching this genre</span> for approval — not just {submitTo.name}.</p>
            <Button className="w-full rounded-full" onClick={confirmPay}>{submitTo.is_free ? `Pay ${money(PLATFORM_PROCESSING_FEE)} & Submit` : `Pay ${money(feeFor(submitTo))} & Submit`}</Button>
          </div>
        </div>
      )}

      <GuidedSubmitFlow
        open={guided}
        onClose={() => setGuided(false)}
        curators={curators}
        user={user}
        type={type}
      />

      <CheckoutDialog
        open={!!checkout}
        onOpenChange={(v) => !v && setCheckout(null)}
        amount={checkoutAmountFor(checkout)}
        service="subscription"
        description={checkout ? `Curator submission to ${checkout.name}` : ""}
        referenceId={checkout ? `curator-${checkout.id}` : ""}
        onPaid={onPaid}
        allowCash={false}
        commission={commissionFor(checkout)}
      />
    </div>
  );
}