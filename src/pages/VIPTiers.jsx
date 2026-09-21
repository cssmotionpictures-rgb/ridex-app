import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { money, VIP_TIERS } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Crown, CheckCircle2, Sparkles, ShieldCheck } from "lucide-react";

export default function VIPTiers() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [sub, setSub] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [checkout, setCheckout] = React.useState(null);

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.VIPSubscription.filter({ user_id: u.id, status: "active" }, "-created_date", 5)
        .then((s) => setSub(s[0] || null)).catch(() => {})
        .finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const subscribe = (tier) => setCheckout(tier);

  const onPaid = async () => {
    const tier = checkout;
    const now = new Date();
    const end = new Date(now); end.setDate(end.getDate() + 30);
    const s = await base44.entities.VIPSubscription.create({
      user_id: user?.id || "",
      user_name: user?.full_name || "",
      tier: tier.tier,
      price: tier.price,
      start_date: now.toISOString(),
      end_date: end.toISOString(),
      status: "active",
    });
    setSub(s);
    setCheckout(null);
    toast({ title: `${tier.tier} activated`, description: "Your VIP membership is now active for 30 days." });
  };

  const activeTier = sub?.tier;

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X VIP"
        title="VIP Membership Tiers"
        subtitle="Unlock exclusive perks, ad-free experience, early access and priority support. Billed monthly."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {sub && (
            <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 mb-6 flex items-center gap-3">
              <Crown className="w-6 h-6 text-primary" />
              <div>
                <p className="font-semibold">{sub.tier} member</p>
                <p className="text-xs text-muted-foreground">Active until {new Date(sub.end_date).toLocaleDateString()}</p>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {VIP_TIERS.map((t) => {
              const isCurrent = activeTier === t.tier;
              return (
                <div key={t.tier} className={`rounded-2xl border p-5 card-lift flex flex-col ${isCurrent ? "border-primary bg-primary/10" : "border-border/60 bg-card"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className={`w-5 h-5 ${isCurrent ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="font-semibold">{t.tier}</p>
                  </div>
                  <p className="text-3xl font-extrabold mt-1">{money(t.price)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                  <ul className="mt-4 space-y-2 flex-1">
                    {t.perks.map((perk) => (
                      <li key={perk} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> {perk}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full rounded-full mt-5" disabled={isCurrent} variant={isCurrent ? "secondary" : "default"} onClick={() => subscribe(t)}>
                    {isCurrent ? "Current plan" : `Subscribe · ${money(t.price)}`}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            <p>VIP memberships renew monthly. Cancel anytime from your profile. Perks apply across all Ride X services — ad-free sports streams, priority ride matching, and exclusive content.</p>
          </div>
        </>
      )}

      <CheckoutDialog
        open={!!checkout}
        onOpenChange={(v) => !v && setCheckout(null)}
        amount={checkout?.price}
        service="vip_subscription"
        description={checkout ? `VIP ${checkout.tier} membership (30 days)` : ""}
        referenceId={checkout ? `vip-${checkout.tier.toLowerCase()}` : ""}
        onPaid={onPaid}
        allowCash={false}
      />
    </div>
  );
}