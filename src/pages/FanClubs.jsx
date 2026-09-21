import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money, FAN_CLUB_TIERS } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, X, Users, Heart, Star } from "lucide-react";

export default function FanClubs() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [clubs, setClubs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [join, setJoin] = React.useState(null);
  const [form, setForm] = React.useState({ artist_name: "", tier: "Fan Club", description: "" });

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.FanClub.filter({ status: "active" }, "-created_date", 100)
        .then(setClubs).catch(() => {})
        .finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const tierInfo = (tier) => FAN_CLUB_TIERS.find((t) => t.tier === tier) || FAN_CLUB_TIERS[0];

  const createClub = async () => {
    if (!form.artist_name) {
      toast({ title: "Missing artist name", variant: "destructive" });
      return;
    }
    const info = tierInfo(form.tier);
    const c = await base44.entities.FanClub.create({
      artist_name: form.artist_name,
      tier: form.tier,
      price: info.price,
      benefits: info.benefits,
      description: form.description,
      members: 0,
      creator_id: user?.id || "",
      status: "active",
    });
    setClubs((prev) => [c, ...prev]);
    setOpen(false);
    setForm({ artist_name: "", tier: "Fan Club", description: "" });
    toast({ title: "Fan club created", description: `${form.artist_name} ${form.tier} is live.` });
  };

  const startJoin = (c) => setJoin(c);

  const onJoined = async () => {
    const c = join;
    try {
      await base44.functions.invoke("auto-submit-batch", {
        feature_type: "fan_club", reference_id: c.id, title: `${c.artist_name} — ${c.tier} join request`,
        amount: c.price, owner_id: c.creator_id || "", owner_name: c.artist_name,
      });
    } catch {}
    setJoin(null);
    toast({ title: "Request sent", description: `Your join request for ${c.artist_name}'s ${c.tier} is pending the artist's approval.` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Fan Clubs"
        title="Fan Club Membership"
        subtitle="Artists create paid fan clubs with exclusive content, early access, merch discounts & live streams. From ₦2,500/month."
        action={<Button className="rounded-full" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Create a fan club</Button>}
      />

      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        {FAN_CLUB_TIERS.map((t) => (
          <div key={t.tier} className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /><p className="font-semibold text-sm">{t.tier}</p></div>
            <p className="text-2xl font-extrabold mt-1">{money(t.price)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
            <p className="text-xs text-muted-foreground mt-1">{t.benefits}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : clubs.length === 0 ? (
        <div className="text-center py-20"><Star className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" /><p className="text-muted-foreground">No fan clubs yet. Create one for your fans.</p></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clubs.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border/60 bg-card p-4 card-lift">
              <div className="flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /><p className="font-semibold truncate">{c.artist_name}</p></div>
              <p className="text-xs text-primary mt-0.5">{c.tier}</p>
              {c.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{c.description}</p>}
              <p className="text-xs text-muted-foreground mt-2">{c.benefits}</p>
              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="w-3.5 h-3.5" /> {c.members || 0} members</span>
                <span className="font-bold">{money(c.price)}<span className="text-muted-foreground font-normal">/mo</span></span>
              </div>
              <Button className="w-full rounded-full mt-3" onClick={() => startJoin(c)}>Join · {money(c.price)}</Button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3" onClick={() => setOpen(null)}>
          <div className="w-full max-w-md bg-card rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="font-semibold">Create a fan club</p><button onClick={() => setOpen(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button></div>
            <div><Label className="text-xs">Artist name</Label><Input className="rounded-xl mt-1" value={form.artist_name} onChange={(e) => setForm({ ...form, artist_name: e.target.value })} /></div>
            <div><Label className="text-xs">Tier</Label>
              <select className="w-full mt-1 rounded-xl bg-secondary border border-border text-sm h-9 px-2" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                {FAN_CLUB_TIERS.map((t) => <option key={t.tier} value={t.tier}>{t.tier} — {money(t.price)}/mo</option>)}
              </select>
            </div>
            <div><Label className="text-xs">Description</Label><Textarea className="rounded-xl mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What fans get…" /></div>
            <Button className="w-full rounded-full" onClick={createClub}>Create fan club</Button>
          </div>
        </div>
      )}

      <CheckoutDialog
        open={!!join}
        onOpenChange={(v) => !v && setJoin(null)}
        amount={join?.price}
        service="fan_club"
        description={join ? `${join.tier} fan club — ${join.artist_name}` : ""}
        referenceId={join ? `fanclub-${join.id}` : ""}
        onPaid={onJoined}
        allowCash={false}
      />
    </div>
  );
}