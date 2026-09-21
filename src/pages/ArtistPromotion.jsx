import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Rocket, Star, Crown, CheckCircle2, Clock, Sparkles } from "lucide-react";

const PACKAGES = [
  {
    tier: "basic",
    label: "Basic",
    price: 10000,
    icon: Rocket,
    features: ["Featured in RIDE X app", "Social media post", "2-week visibility", "Analytics report"],
  },
  {
    tier: "premium",
    label: "Premium",
    price: 25000,
    icon: Star,
    features: ["Everything in Basic", "Playlist placement", "Artist interview feature", "1-month visibility", "Priority support"],
  },
  {
    tier: "ultimate",
    label: "Ultimate",
    price: 50000,
    icon: Crown,
    features: ["Everything in Premium", "Full marketing campaign", "Social media push (all platforms)", "Live stream feature", "3-month visibility", "Dedicated manager"],
  },
];

const STATUS_META = {
  pending: { icon: Clock, label: "Pending", color: "text-amber-400" },
  active: { icon: Sparkles, label: "Active", color: "text-primary" },
  completed: { icon: CheckCircle2, label: "Completed", color: "text-emerald-400" },
  cancelled: { icon: Loader2, label: "Cancelled", color: "text-muted-foreground" },
};

export default function ArtistPromotion() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [promos, setPromos] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [checkout, setCheckout] = React.useState(null);
  const [form, setForm] = React.useState({ artist_name: "", song_title: "", song_url: "" });

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.PromotionPackage.filter({ user_id: u.id }, "-created_date", 50)
        .then(setPromos).catch(() => {}).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const buy = (pkg) => {
    if (!form.artist_name || !form.song_title) {
      toast({ title: "Artist & song required", description: "Fill in your artist name and song title first.", variant: "destructive" });
      return;
    }
    setCheckout(pkg);
  };

  const onPaid = async (tx) => {
    const p = await base44.entities.PromotionPackage.create({
      artist_name: form.artist_name,
      song_title: form.song_title,
      song_url: form.song_url,
      tier: checkout.tier,
      price: checkout.price,
      user_id: user?.id || "",
      user_email: user?.email || "",
      payment_reference: tx?.reference_id || tx?.id || "",
      features_included: checkout.features.join(", "),
      status: "pending",
    });
    setPromos((prev) => [p, ...prev]);
    setCheckout(null);
    setForm({ artist_name: "", song_title: "", song_url: "" });
    toast({ title: "Promotion booked!", description: `${checkout.label} package activated for ${form.artist_name}.` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Promote"
        title="Artist Promotion Packages"
        subtitle="Get your music featured across RIDE X and social media. 50% platform commission."
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        {PACKAGES.map((p) => {
          const Icon = p.icon;
          const featured = p.tier === "premium";
          return (
            <div key={p.tier} className={`rounded-3xl border p-5 card-lift ${featured ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card"}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-6 h-6 text-primary" />
                <p className="font-heading font-bold text-lg">{p.label}</p>
              </div>
              <p className="text-3xl font-extrabold mb-3">{money(p.price)}</p>
              <ul className="space-y-2 mb-4">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-border/60 bg-card p-5 mb-8 space-y-3 max-w-lg">
        <p className="font-semibold">Your details</p>
        <div>
          <Label className="text-xs">Artist / stage name</Label>
          <Input className="rounded-xl mt-1" value={form.artist_name} onChange={(e) => setForm({ ...form, artist_name: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Song title</Label>
          <Input className="rounded-xl mt-1" value={form.song_title} onChange={(e) => setForm({ ...form, song_title: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Song link (optional)</Label>
          <Input className="rounded-xl mt-1" value={form.song_url} onChange={(e) => setForm({ ...form, song_url: e.target.value })} placeholder="https://…" />
        </div>
        <div className="grid sm:grid-cols-3 gap-2 pt-1">
          {PACKAGES.map((p) => (
            <Button key={p.tier} className="rounded-full" variant={p.tier === "premium" ? "default" : "outline"} onClick={() => buy(p)}>
              {p.label} · {money(p.price)}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">My promotions</p>
      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : promos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No promotions yet. Pick a package above to get started.</p>
      ) : (
        <div className="space-y-2">
          {promos.map((p) => {
            const sm = STATUS_META[p.status] || STATUS_META.pending;
            const SIcon = sm.icon;
            return (
              <div key={p.id} className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.song_title} <span className="text-muted-foreground">· {p.artist_name}</span></p>
                  <p className="text-xs text-muted-foreground capitalize">{p.tier} package · {money(p.price)}</p>
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-semibold shrink-0 ${sm.color}`}>
                  <SIcon className="w-4 h-4" /> {sm.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CheckoutDialog
        open={!!checkout}
        onOpenChange={(v) => !v && setCheckout(null)}
        amount={checkout?.price || 0}
        service="ads"
        description={checkout ? `${checkout.label} promotion package` : ""}
        referenceId={checkout ? `promo-${checkout.tier}` : ""}
        onPaid={onPaid}
        allowCash={false}
      />
    </div>
  );
}