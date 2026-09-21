import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Crown, Lock, Ticket } from "lucide-react";
import PredictionBoard from "@/components/sports/PredictionBoard";
import { SPORTS_MEMBERSHIP, money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Premium AI prediction engine — gated behind the ₦5,000/month Sports Membership.
// AI (InvokeLLM) analyses upcoming fixtures daily and returns a predicted score + confidence
// for each. Members can copy an AI pick straight into their own free prediction.
export default function AiPredictions({ user, membership, onCopied }) {
  const { toast } = useToast();
  const [buying, setBuying] = React.useState(false);
  const [promoInput, setPromoInput] = React.useState("");
  const [promoBusy, setPromoBusy] = React.useState(false);
  const [promoErr, setPromoErr] = React.useState("");
  const [unlocked, setUnlocked] = React.useState(false);

  const active = unlocked || !!(membership && membership.status === "active" &&
    (!membership.expires_at || new Date(membership.expires_at) > new Date()));

  // Promo-code unlock — type a code, validate it client-side (no backend /
  // integration credits needed), and activate a 30-day membership for free,
  // bypassing the Paystack payment flow entirely.
  const unlockWithCode = async () => {
    setPromoErr("");
    const code = promoInput.trim().toUpperCase();
    if (!code) { setPromoErr("Enter a promo code."); return; }
    setPromoBusy(true);
    try {
      const found = await base44.entities.PromoCode.filter({ code }, "-created_date", 5);
      const p = found[0];
      if (!p) { setPromoErr("Invalid code."); return; }
      if (!p.active) { setPromoErr("This code is no longer active."); return; }
      if (p.expires_at && new Date(p.expires_at) < new Date()) { setPromoErr("This code has expired."); return; }
      if (p.max_uses > 0 && (p.used_count || 0) >= p.max_uses) { setPromoErr("This code has reached its usage limit."); return; }
      const svc = (p.applicable_services || "all").toLowerCase();
      if (svc !== "all" && !svc.split(",").map((s) => s.trim()).includes("subscription")) { setPromoErr("This code doesn't apply here."); return; }
      if (user?.id) {
        const expires_at = new Date(); expires_at.setDate(expires_at.getDate() + 30);
        try {
          await base44.entities.SportsMembership.create({
            user_id: user.id,
            user_name: user.full_name || user.email,
            user_email: user.email,
            club_id: user.club_id || "",
            club_name: user.club_name || "",
            status: "active",
            amount: 0,
            expires_at: expires_at.toISOString(),
          });
        } catch {}
        try { await base44.functions.invoke("redeem-promo-code", { code }); } catch {}
      }
      setUnlocked(true);
      toast({ title: "Unlocked!", description: "AI predictions are now active for 30 days." });
    } catch (e) {
      setPromoErr(e.message || "Could not validate code.");
    } finally {
      setPromoBusy(false);
    }
  };

  const buy = async () => {
    if (!user?.email) {
      toast({ title: "Please log in to upgrade", variant: "destructive" });
      return;
    }
    setBuying(true);
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
        description: "Ride X Sports — Premium AI Predictions (30 days)",
        referenceId: mem.id,
        email: user.email,
        method: "card",
      });
      const url = res?.data?.url || res?.url;
      if (url) window.location.href = url;
      else toast({ title: "Could not start checkout", description: (res?.data && res.data.error) || res?.error, variant: "destructive" });
    } catch (e) {
      toast({ title: "Payment failed", description: e.message, variant: "destructive" });
    } finally { setBuying(false); }
  };


  if (!active) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 to-transparent overflow-hidden">
        <div className="px-5 py-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center"><Crown className="w-5 h-5" /></div>
            <div>
              <p className="text-base font-bold flex items-center gap-1.5">Model Engine Auto-Predictions <Lock className="w-3.5 h-3.5 text-primary" /></p>
              <p className="text-[11px] text-muted-foreground">Premium feature · {money(SPORTS_MEMBERSHIP)}/month</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Unlock daily model-engine match predictions — a statistical ensemble (Poisson, Dixon-Coles, form, home/away strength, market odds) analyses real fixtures and league data across 28+ competitions, and publishes only the few picks where the evidence is strongest.</p>
          <div className="flex flex-wrap gap-2 mb-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary">✓ Daily model picks</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary">✓ Confidence scores</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary">✓ One-tap copy</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary">✓ 30-day access</span>
          </div>
          {/* Promo-code unlock — empty box, type a code to unlock free (bypasses payment) */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1"><Ticket className="w-3 h-3" /> Enter promo code to unlock free</Label>
            <div className="flex gap-2">
              <Input className="rounded-xl uppercase tracking-wider" placeholder="Enter code" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") unlockWithCode(); }} />
              <Button size="sm" className="rounded-xl px-4 shrink-0" disabled={promoBusy} onClick={unlockWithCode}>
                {promoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unlock"}
              </Button>
            </div>
            {promoErr && <p className="text-xs text-destructive">{promoErr}</p>}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Or pay {money(SPORTS_MEMBERSHIP)}/mo</span>
            <button onClick={buy} disabled={buying} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold disabled:opacity-50">
              {buying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Crown className="w-3.5 h-3.5" /> Upgrade</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <PredictionBoard user={user} />;
}