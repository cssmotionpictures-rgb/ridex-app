import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Crown, CheckCircle2, Loader2 } from "lucide-react";
import { SPORTS_MEMBERSHIP, money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";

export default function MembershipBanner({ membership, user }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const active = !!(membership && membership.status === "active" &&
    (!membership.expires_at || new Date(membership.expires_at) > new Date()));

  const buy = async () => {
    if (!user?.email) {
      toast({ title: "Please log in to upgrade", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const mem = await base44.entities.SportsMembership.create({
        user_id: user.id,
        user_name: user.full_name || user.email,
        user_email: user.email,
        club_id: user.club_id || "",
        club_name: user.club_name || "",
        status: "expired",
        amount: SPORTS_MEMBERSHIP,
      });
      const res = await base44.functions.invoke("flutterwave-checkout", {
        amount: SPORTS_MEMBERSHIP,
        service: "subscription",
        description: "Ride X Sports — Ad-free membership (30 days)",
        referenceId: mem.id,
        email: user.email,
        method: "card",
      });
      const url = res?.data?.url || res?.url;
      if (url) window.location.href = url;
      else toast({ title: "Could not start checkout", description: (res?.data && res.data.error) || res?.error, variant: "destructive" });
    } catch (e) {
      toast({ title: "Payment failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (active) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 flex items-center gap-3">
        <Crown className="w-5 h-5 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Ad-free membership active</p>
          <p className="text-xs text-muted-foreground">Enjoy uninterrupted live football{membership.expires_at ? ` · until ${new Date(membership.expires_at).toLocaleDateString("en-NG")}` : ""}</p>
        </div>
        <CheckCircle2 className="w-5 h-5 text-primary" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-r from-primary/15 to-transparent px-4 py-3 flex flex-wrap items-center gap-3">
      <Crown className="w-5 h-5 text-primary" />
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-semibold">Go ad-free with Sports Membership</p>
        <p className="text-xs text-muted-foreground">Remove all stream ads for 30 days — {money(SPORTS_MEMBERSHIP)}</p>
      </div>
      <Button onClick={buy} disabled={loading} className="rounded-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Upgrade · ${money(SPORTS_MEMBERSHIP)}`}
      </Button>
    </div>
  );
}