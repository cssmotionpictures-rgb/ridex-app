import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, CheckCircle2, Zap, Music2, Mic, Star, FileText, ShoppingBag, Users, Sparkles,
} from "lucide-react";

// Admin bypass: approve/activate pending submissions across every RIDE X section
// WITHOUT requiring the user to pay. Uses existing backend functions where side
// effects matter (BatchSubmission) and direct bulk updates otherwise.
export default function AdminAutoApprovals() {
  const { toast } = useToast();
  const [counts, setCounts] = React.useState({});
  const [busy, setBusy] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const SECTIONS = [
    { key: "batch", label: "Digital Submissions", icon: ShoppingBag, tint: "text-sky-400", desc: "Premieres, showcases, fan clubs, licensing, VIP, autographs" },
    { key: "curator", label: "Curator Submissions", icon: Music2, tint: "text-pink-400", desc: "Auto-Promote & manual curator pitches" },
    { key: "influencer", label: "Influencer Submissions", icon: Users, tint: "text-violet-400", desc: "Promotional campaign matches" },
    { key: "talent", label: "Talent Bookings", icon: Mic, tint: "text-amber-400", desc: "Artist performance bookings" },
    { key: "event", label: "Event Submissions", icon: Star, tint: "text-emerald-400", desc: "User & promoter event submissions" },
    { key: "promotion", label: "Promotion Packages", icon: Zap, tint: "text-yellow-400", desc: "Paid song promotion packages" },
    { key: "distribution", label: "Music Distribution", icon: FileText, tint: "text-lime-400", desc: "Platform distribution releases" },
  ];

  const loadCounts = async () => {
    try {
      const [batch, curator, infSub, infMatch, talent, event, promo, distro] = await Promise.all([
        base44.entities.BatchSubmission.filter({ status: "pending" }, "-created_date", 500),
        base44.entities.CuratorSubmission.filter({ status: "pending" }, "-created_date", 500),
        base44.entities.InfluencerSubmission.list("-created_date", 500),
        base44.entities.InfluencerMatch.filter({ status: "pending" }, "-created_date", 500),
        base44.entities.TalentBooking.filter({ status: "pending" }, "-created_date", 500),
        base44.entities.EventSubmission.filter({ status: "pending" }, "-created_date", 500),
        base44.entities.PromotionPackage.filter({ status: "pending" }, "-created_date", 500),
        base44.entities.MusicDistribution.filter({ release_status: "pending" }, "-created_date", 500),
      ]);
      setCounts({
        batch: batch.length,
        curator: curator.length,
        influencer: infSub.filter((s) => s.status === "pending" || s.status === "matched").length + infMatch.length,
        talent: talent.length,
        event: event.length,
        promotion: promo.length,
        distribution: distro.length,
      });
    } catch (e) {
      toast({ title: "Failed to load counts", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { loadCounts(); }, []);

  const approveBatch = async () => {
    const list = await base44.entities.BatchSubmission.filter({ status: "pending" }, "-created_date", 500);
    let ok = 0;
    for (const s of list) {
      try {
        const res = await base44.functions.invoke("approve-submission", {
          submission_id: s.id, action: "approved", notes: "Admin auto-approve (no payment)",
        });
        if (!res?.data?.error) ok++;
      } catch (e) {}
    }
    return ok;
  };

  const approveCurator = async () => {
    const list = await base44.entities.CuratorSubmission.filter({ status: "pending" }, "-created_date", 500);
    if (list.length) await base44.entities.CuratorSubmission.updateMany({ status: "pending" }, { $set: { status: "accepted", fee_paid: 0 } });
    return list.length;
  };

  const approveInfluencer = async () => {
    const subs = await base44.entities.InfluencerSubmission.list("-created_date", 500);
    const pend = subs.filter((s) => s.status === "pending").length;
    const matched = subs.filter((s) => s.status === "matched").length;
    const matches = await base44.entities.InfluencerMatch.filter({ status: "pending" }, "-created_date", 500);
    if (pend) await base44.entities.InfluencerSubmission.updateMany({ status: "pending" }, { $set: { status: "accepted" } });
    if (matched) await base44.entities.InfluencerSubmission.updateMany({ status: "matched" }, { $set: { status: "accepted" } });
    if (matches.length) await base44.entities.InfluencerMatch.updateMany({ status: "pending" }, { $set: { status: "accepted" } });
    return pend + matched + matches.length;
  };

  const approveTalent = async () => {
    const list = await base44.entities.TalentBooking.filter({ status: "pending" }, "-created_date", 500);
    if (list.length) await base44.entities.TalentBooking.updateMany({ status: "pending" }, { $set: { status: "confirmed" } });
    return list.length;
  };

  const approveEvent = async () => {
    const list = await base44.entities.EventSubmission.filter({ status: "pending" }, "-created_date", 500);
    let ok = 0;
    for (const r of list) {
      try {
        await base44.entities.LiveEvent.create({
          title: r.title, artist_lineup: r.artist_lineup, event_date: r.event_date,
          venue: r.venue, city: r.city, genres: r.genres, description: r.description,
          ticket_regular_price: r.ticket_regular_price || 1500, status: "on_sale",
          source: r.source === "promoter" ? "promoter" : "user_submission",
        });
        await base44.entities.EventSubmission.update(r.id, { status: "approved" });
        ok++;
      } catch (e) {}
    }
    return ok;
  };

  const approvePromotion = async () => {
    const list = await base44.entities.PromotionPackage.filter({ status: "pending" }, "-created_date", 500);
    if (list.length) await base44.entities.PromotionPackage.updateMany({ status: "pending" }, { $set: { status: "active" } });
    return list.length;
  };

  const approveDistribution = async () => {
    const list = await base44.entities.MusicDistribution.filter({ release_status: "pending" }, "-created_date", 500);
    if (list.length) await base44.entities.MusicDistribution.updateMany({ release_status: "pending" }, { $set: { release_status: "live", fee_paid: 0 } });
    return list.length;
  };

  const HANDLERS = {
    batch: approveBatch, curator: approveCurator, influencer: approveInfluencer,
    talent: approveTalent, event: approveEvent, promotion: approvePromotion, distribution: approveDistribution,
  };

  const run = async (key) => {
    setBusy(key);
    try {
      const n = await HANDLERS[key]();
      toast({ title: "Approved without payment", description: `${n} ${SECTIONS.find((s) => s.key === key).label.toLowerCase()} processed.` });
      await loadCounts();
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const runAll = async () => {
    setBusy("all");
    try {
      const results = await Promise.all(Object.values(HANDLERS).map((fn) => fn().catch(() => 0)));
      const total = results.reduce((a, b) => a + b, 0);
      toast({ title: "All sections approved", description: `${total} pending items processed across every section (no payment).` });
      await loadCounts();
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const totalPending = Object.values(counts).reduce((a, b) => a + (b || 0), 0);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-primary/40 bg-primary/5 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Auto-Approve (No Payment)</h3>
          <p className="text-sm text-muted-foreground mt-1">Admin bypass — approve and activate pending submissions across every section without requiring payment.</p>
        </div>
        <Button className="rounded-full h-11 font-semibold" disabled={busy === "all" || loading} onClick={runAll}>
          {busy === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {busy === "all" ? "Approving everything…" : `Approve everything (${totalPending})`}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const n = counts[s.key] || 0;
            const isBusy = busy === s.key;
            return (
              <div key={s.key} className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center ${s.tint}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`text-2xl font-extrabold ${n > 0 ? "text-primary" : "text-muted-foreground/40"}`}>{n}</span>
                </div>
                <div>
                  <p className="font-semibold text-sm">{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
                <Button
                  className="rounded-full mt-auto"
                  variant={n > 0 ? "default" : "outline"}
                  disabled={isBusy || n === 0}
                  onClick={() => run(s.key)}
                >
                  {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {isBusy ? "Processing…" : n > 0 ? `Approve all (no payment)` : "Nothing pending"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}