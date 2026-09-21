import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, CheckCircle2, XCircle, ShieldCheck, Search, Filter,
  Package, ShoppingBag, Users, Music2, Star, Film, BarChart3,
  Mic, Crown, MessageCircle, PenTool, FileText, Megaphone, Sparkles,
  Building2, Shirt, Heart, Disc3, Video, BookOpen,
} from "lucide-react";

const FEATURE_META = {
  digital_product:          { label: "Digital Product Listing", icon: Package,   tint: "text-sky-400",      approver: "Admin" },
  digital_product_purchase: { label: "Digital Product Purchase", icon: ShoppingBag, tint: "text-emerald-400",  approver: "Auto" },
  collaboration:            { label: "Collaboration Booking",    icon: Users,      tint: "text-violet-400",    approver: "Provider" },
  song_premiere:            { label: "Song Premiere",            icon: Music2,     tint: "text-pink-400",     approver: "Admin" },
  artist_showcase:          { label: "Artist Showcase",          icon: Star,       tint: "text-amber-400",    approver: "Admin" },
  movie_premiere:           { label: "Movie Premiere",          icon: Film,       tint: "text-indigo-400",   approver: "Admin" },
  artist_analytics:         { label: "Artist Analytics",        icon: BarChart3,  tint: "text-teal-400",     approver: "Auto" },
  podcast_hosting:          { label: "Podcast Hosting",          icon: Mic,        tint: "text-orange-400",   approver: "Admin" },
  vip_tier:                 { label: "VIP Tier",                icon: Crown,      tint: "text-yellow-400",    approver: "Auto" },
  live_chat:                { label: "Live Chat With Fans",     icon: MessageCircle, tint: "text-cyan-400",   approver: "Auto" },
  digital_autograph:        { label: "Digital Autograph",        icon: PenTool,    tint: "text-rose-400",     approver: "Auto" },
  song_license:             { label: "Song License",            icon: FileText,   tint: "text-lime-400",     approver: "Licensing Agency" },
  sponsored_content:        { label: "Sponsored Content",        icon: Megaphone,  tint: "text-fuchsia-400",  approver: "Admin" },
  ai_songwriter:            { label: "AI Songwriter",            icon: Sparkles,   tint: "text-purple-400",  approver: "Auto" },
  virtual_studio:           { label: "Virtual Studio Rental",    icon: Building2,  tint: "text-blue-400",     approver: "Admin" },
  merchandise:              { label: "Merchandise Dropshipping", icon: Shirt,      tint: "text-red-400",      approver: "Admin" },
  fan_club:                 { label: "Fan Club Membership",      icon: Heart,      tint: "text-pink-400",     approver: "Artist" },
  remix_contest:            { label: "Remix Contest Entry",      icon: Disc3,      tint: "text-green-400",    approver: "Admin" },
  video_contest:            { label: "Video Contest Entry",      icon: Video,      tint: "text-amber-400",    approver: "Admin" },
  audiobook:                { label: "Audiobook Publishing",     icon: BookOpen,   tint: "text-sky-400",     approver: "Admin" },
};

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default function Approvals() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [subs, setSubs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState("");
  const [tab, setTab] = React.useState("pending");
  const [search, setSearch] = React.useState("");
  const [featureFilter, setFeatureFilter] = React.useState("all");

  const load = async (u) => {
    const all = await base44.entities.BatchSubmission.list("-created_date", 300);
    let visible = all;
    if (u?.role !== "admin") {
      visible = all.filter((s) => s.owner_id === u?.id || s.submitter_id === u?.id);
    }
    setSubs(visible);
  };

  React.useEffect(() => {
    base44.auth.me().then(async (u) => { setUser(u); await load(u); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const decide = async (s, action) => {
    setBusy(s.id);
    try {
      const res = await base44.functions.invoke("approve-submission", {
        submission_id: s.id, action,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      toast({
        title: action === "approved" ? "Approved" : "Rejected",
        description: `${s.title} is now ${action}.`,
      });
      await load(user);
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const pendingCount = subs.filter((s) => s.status === "pending").length;

  const filtered = subs.filter((s) => {
    if (tab !== "all" && s.status !== tab) return false;
    if (featureFilter !== "all" && s.feature_type !== featureFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(`${s.title}`.toLowerCase().includes(q) || `${s.submitter_name || ""}`.toLowerCase().includes(q) || `${s.owner_name || ""}`.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const isAdmin = user?.role === "admin";
  const subtitle = isAdmin
    ? "Admin queue — every paid submission across all 20 features. Approve to grant, reject to decline."
    : "Submissions routed to you for review, plus your own requests.";

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Approvals"
        title={isAdmin ? "All Submissions — Admin Queue" : "My Approvals"}
        subtitle={subtitle}
        action={
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-border/60 bg-card px-4 py-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">Pending</span>
            <span className="font-semibold text-primary">{pendingCount}</span>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex rounded-full border border-border/60 bg-card p-1 overflow-x-auto no-scrollbar">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, submitter, owner…" className="pl-9 rounded-full" />
            </div>
            <div className="relative">
              <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <select
                value={featureFilter}
                onChange={(e) => setFeatureFilter(e.target.value)}
                className="appearance-none rounded-full border border-input bg-card pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All features</option>
                {Object.entries(FEATURE_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <ShieldCheck className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No submissions match this view.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => {
                const meta = FEATURE_META[s.feature_type] || { label: s.feature_type, icon: ShieldCheck, tint: "text-muted-foreground", approver: "—" };
                const Icon = meta.icon;
                const isPending = s.status === "pending";
                return (
                  <div key={s.id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className={`shrink-0 w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center ${meta.tint}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{s.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {meta.label} · ₦{(s.amount || 0).toLocaleString()} · by {s.submitter_name || "—"}
                        </p>
                        <p className="text-[11px] truncate">
                          <span className="text-primary">Approver: {meta.approver}</span>
                          {s.owner_name ? <span className="text-muted-foreground"> · Routed to {s.owner_name}</span> : null}
                          {s.approver_name ? <span className="text-muted-foreground"> · {s.status} by {s.approver_name}</span> : null}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPending ? (
                        <>
                          <Button size="sm" className="rounded-full" disabled={busy === s.id} onClick={() => decide(s, "approved")}>
                            {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Approve
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-full" disabled={busy === s.id} onClick={() => decide(s, "rejected")}>
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </Button>
                        </>
                      ) : (
                        <span className={`text-xs font-medium px-3 py-1 rounded-full ${s.status === "approved" ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/15 text-destructive"}`}>
                          {s.status === "approved" ? <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> : <XCircle className="w-3.5 h-3.5 inline mr-1" />}
                          {s.status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}