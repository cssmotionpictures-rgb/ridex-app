import React from "react";
import { base44 } from "@/api/base44Client";
import { money } from "@/lib/pricing";
import { grossUp } from "@/lib/agency";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Film, Megaphone, ListMusic, Loader2 } from "lucide-react";

const PACKAGES = [
  { key: "movie_sync", label: "Movie Sync / Director", icon: Film, gross: 3600000, blurb: "Soundtrack sync pitch + master-use license per track.", intl: "$6,000" },
  { key: "digital_influencer", label: "Digital Influencer Campaign", icon: Megaphone, gross: 2400000, blurb: "1 video + 3 stories, VVIP red-carpet & ticket push.", intl: "$4,200" },
  { key: "playlist_curator", label: "Playlist Curator Sync", icon: ListMusic, gross: 1800000, blurb: "Pitch + sync placement with A&R / playlist editors.", intl: "$3,000" },
];

export default function MediaAmplification() {
  const { toast } = useToast();
  const [me, setMe] = React.useState(null);
  const [active, setActive] = React.useState(null);
  const [brief, setBrief] = React.useState({ brand: "", artist_pref: "", details: "" });
  const [checkout, setCheckout] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [campaigns, setCampaigns] = React.useState([]);

  React.useEffect(() => {
    base44.auth.me().then(setMe).catch(() => {});
    base44.entities.MediaCampaign.list("-created_date", 20).then(setCampaigns).catch(() => []);
  }, []);

  const open = (pkg) => { setActive(pkg); setBrief({ brand: "", artist_pref: "", details: "" }); };
  const { gross, net, agency } = grossUp(active?.gross || 0);

  const onPaid = async () => {
    setBusy(true);
    try {
      await base44.entities.MediaCampaign.create({
        package_type: active.key,
        client_name: me?.full_name || "",
        brand: brief.brand,
        brief: brief.details,
        artist_pref: brief.artist_pref,
        gross_fee: gross,
        net_fee: net,
        agency_commission: agency,
        status: "active",
      });
      toast({ title: "Campaign activated", description: `${active.label} booked & escrow-held.` });
      setCheckout(false);
      setActive(null);
      base44.entities.MediaCampaign.list("-created_date", 20).then(setCampaigns);
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader eyebrow="Media Residency" title="Content Amplification Hub" subtitle="Book movie sync, influencer and playlist-curator campaigns on the 20% gross-up model. First-look roster access included." />
      <div className="grid md:grid-cols-3 gap-4">
        {PACKAGES.map((p) => {
          const { net, agency } = grossUp(p.gross);
          const Icon = p.icon;
          return (
            <div key={p.key} className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col">
              <Icon className="w-7 h-7 text-primary mb-2" />
              <p className="font-semibold">{p.label}</p>
              <p className="text-2xl font-extrabold mt-1">{money(p.gross)}</p>
              <p className="text-xs text-muted-foreground mt-1">{p.blurb}</p>
              <p className="text-xs text-muted-foreground mt-2">Net to partner {money(net)} · Agency {money(agency)} · Intl {p.intl}</p>
              <Button className="w-full rounded-full mt-4" onClick={() => open(p)}>Book campaign</Button>
            </div>
          );
        })}
      </div>

      {campaigns.length > 0 && (
        <div className="mt-8">
          <p className="text-sm font-semibold mb-3">Active campaigns</p>
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{c.brand || c.client_name} · {c.package_type.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">{c.artist_pref ? `Artist: ${c.artist_pref} · ` : ""}{c.status}</p>
                </div>
                <span className="text-sm font-bold">{money(c.gross_fee)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3" onClick={() => setActive(null)}>
          <div className="w-full max-w-md bg-card rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">{active.label} — brief</p>
            <div>
              <Label className="text-xs">Brand / studio</Label>
              <Input className="rounded-xl mt-1" value={brief.brand} onChange={(e) => setBrief({ ...brief, brand: e.target.value })} placeholder="e.g. Flytime Fest / FilmOne" />
            </div>
            <div>
              <Label className="text-xs">Requested roster artist (optional)</Label>
              <Input className="rounded-xl mt-1" value={brief.artist_pref} onChange={(e) => setBrief({ ...brief, artist_pref: e.target.value })} placeholder="e.g. Tems" />
            </div>
            <div>
              <Label className="text-xs">Campaign brief</Label>
              <Textarea className="rounded-xl mt-1" rows={3} value={brief.details} onChange={(e) => setBrief({ ...brief, details: e.target.value })} placeholder="Deliverables, dates, scene mood…" />
            </div>
            <div className="rounded-xl bg-secondary p-3 text-sm flex justify-between">
              <span className="text-muted-foreground">Gross to pay (escrow)</span>
              <span className="font-bold">{money(gross)}</span>
            </div>
            <Button className="w-full rounded-full" onClick={() => { setActive(null); setCheckout(true); }}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Proceed to checkout · ${money(gross)}`}</Button>
          </div>
        </div>
      )}

      <CheckoutDialog
        open={checkout}
        onOpenChange={(v) => !v && setCheckout(false)}
        amount={gross}
        service="ads"
        description={active ? `Media campaign — ${active.label}` : "Media campaign"}
        referenceId={active ? `media-${active.key}` : "media"}
        onPaid={onPaid}
        commission={agency}
      />
    </div>
  );
}