import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { STUDIO_ARTISTS, STUDIO_TIERS, grossUpStudio, usd, tierLabel, FREE_FEATURE_TIERS, FREE_FEATURE_TERMS, freeFeatureFee, freeFeatureTierLabel } from "@/lib/studioFeatures";
import FeatureRequestDialog from "@/components/studio/FeatureRequestDialog";
import StudioFeatureInvoiceDialog from "@/components/studio/StudioFeatureInvoiceDialog";
import FreeFeatureDialog from "@/components/studio/FreeFeatureDialog";
import RegulatoryPortals from "@/components/shared/RegulatoryPortals";
import { Search, Mic2, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { money } from "@/lib/pricing";

export default function StudioFeatures() {
  const [artists, setArtists] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [tier, setTier] = React.useState("tier1_global");
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(null);
  const [booking, setBooking] = React.useState(null);
  const [tab, setTab] = React.useState("rate");
  const [ffaOpen, setFfaOpen] = React.useState(false);
  const [myApps, setMyApps] = React.useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.StudioFeatureArtist.list("sort_order", 200);
      setArtists(list.length ? list : STUDIO_ARTISTS.map((a) => ({ ...a, id: a.name, gross_fee: a.net * 1.2, status: "active" })));
    } catch {
      setArtists(STUDIO_ARTISTS.map((a) => ({ ...a, id: a.name, gross_fee: a.net * 1.2, status: "active" })));
    }
    setLoading(false);
    try { setMyApps(await base44.entities.FreeFeatureApplication.list("-created_date", 20)); } catch { setMyApps([]); }
  };
  React.useEffect(() => { load(); }, []);

  const filtered = artists
    .filter((a) => a.tier === tier && a.status !== "inactive")
    .filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.net_fee || a.net) - (b.net_fee || b.net));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <PageHeader
        eyebrow="A&R Division"
        title="Studio Feature Rate Sheet"
        subtitle="100-artist collaboration ledger. Every quote is 20% grossed-up — the promoter gross covers your agency commission."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex gap-1 bg-transparent p-0 mb-5 flex-wrap">
          <TabsTrigger value="rate" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Rate Sheet</TabsTrigger>
          <TabsTrigger value="free" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs"><Sparkles className="w-3.5 h-3.5 mr-1" /> Apply for a Free Feature</TabsTrigger>
        </TabsList>

        <TabsContent value="rate">
          <div className="flex flex-wrap gap-2 items-center mb-5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artists…" className="rounded-full pl-9" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-6">
            {STUDIO_TIERS.map((t) => (
              <button key={t.key} onClick={() => setTier(t.key)} className={`px-4 py-1.5 rounded-full text-xs font-medium ${tier === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                {t.label.split("·")[0].trim()}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((a, i) => {
                const net = a.net_fee || a.net;
                const g = grossUpStudio(net);
                return (
                  <div key={a.id || a.name} className="rounded-2xl border border-border/60 bg-card p-4 card-lift">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center"><Mic2 className="w-4 h-4 text-primary" /></div>
                        <div>
                          <p className="font-semibold leading-tight">{a.name}</p>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{tierLabel(a.tier).split("·")[0].trim()}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Net feature</span><span>{usd(net)}</span></div>
                      <div className="flex justify-between font-semibold"><span>Promoter gross</span><span className="text-primary">{usd(g.gross)}</span></div>
                    </div>
                    <Button size="sm" className="rounded-full w-full mt-3" onClick={() => setActive(a)}>Request Feature</Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="free">
          <FreeFeatureTab onApply={() => setFfaOpen(true)} myApps={myApps} />
        </TabsContent>
      </Tabs>

      <FeatureRequestDialog open={!!active} onOpenChange={(v) => !v && setActive(null)} artist={active} onCreated={(rec) => { setActive(null); setBooking(rec); }} />
      <StudioFeatureInvoiceDialog open={!!booking} onOpenChange={(v) => !v && setBooking(null)} booking={booking} />
      <FreeFeatureDialog open={ffaOpen} onOpenChange={(v) => !v && setFfaOpen(false)} onApproved={() => load()} />
    </div>
  );
}

function FreeFeatureTab({ onApply, myApps }) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/10 to-card p-6 md:p-8">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Free Feature Programme</h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl mb-4">
          Think your music is good enough to earn a free feature? Submit your track for A&R review.
          If it meets our terms & quality bar, you get a guest 16-bar verse or chorus hook — on the house.
          The non-refundable processing fee is tiered — <span className="text-primary font-semibold">Macro ₦100k, degrading down to Nano ₦15k</span> —
          and your application is scored by the <span className="text-primary font-semibold">algorithmic A&R vetting matrix</span>. Score 9.5/10 or higher and the superstar records your feature for free; below the threshold, the application is declined.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {FREE_FEATURE_TIERS.map((t) => (
            <div key={t.key} className="rounded-xl bg-secondary/40 p-3 text-center">
              <p className="text-xs font-bold uppercase text-primary">{t.label}</p>
              <p className="text-lg font-extrabold mt-1">{money(t.fee)}</p>
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          {FREE_FEATURE_TERMS.map((t, i) => (
            <div key={i} className="flex gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span>{t}</span>
            </div>
          ))}
        </div>
        <Button size="lg" className="rounded-full h-12 font-semibold" onClick={onApply}>
          <Sparkles className="w-4 h-4" /> Apply & Get Scored · from {money(FREE_FEATURE_TIERS[FREE_FEATURE_TIERS.length - 1].fee)}
        </Button>
      </div>

      <div>
        <h3 className="font-semibold mb-3">Your applications</h3>
        {!myApps.length ? (
          <p className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border/60 rounded-2xl">No applications yet. Submit your track above.</p>
        ) : (
          <div className="space-y-2">
            {myApps.map((a) => (
              <div key={a.id} className="rounded-2xl border border-border/60 bg-card p-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[140px]">
                  <p className="font-medium">{a.song_title}</p>
                  <p className="text-xs text-muted-foreground">{a.artist_name} · {a.genre || "—"} · {freeFeatureTierLabel(a.feature_tier)}</p>
                </div>
                <a href={a.music_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline truncate max-w-[160px]">{a.music_url}</a>
                <span className={`px-2.5 py-1 rounded-full text-xs ${a.status === "approved" ? "bg-emerald-500/15 text-emerald-300" : a.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-secondary"}`}>
                  {a.status === "approved" ? "✓ Accepted" : a.status === "rejected" ? "Declined" : "Pending"}
                </span>
                <span className="text-xs text-muted-foreground">{money(a.application_fee)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <RegulatoryPortals />
    </div>
  );
}