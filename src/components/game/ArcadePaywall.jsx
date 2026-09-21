import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Crown, Loader2, Lock, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";

const PLANS = [
  { id: "monthly", label: "Monthly", price: 1500, note: "₦1,500 / month" },
  { id: "yearly", label: "Yearly", price: 15000, note: "₦15,000 / year — save 2 months" },
];

export default function ArcadePaywall({ open, onClose }) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const subscribe = async () => {
    setErr("");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr("Enter a valid email for your receipt"); return; }
    if (window.self !== window.top) { setErr("Checkout works only from the published app — open Ride X outside the builder preview to pay."); return; }
    setBusy(true);
    try {
      const p = PLANS.find((x) => x.id === plan);
      const res = await base44.functions.invoke("flutterwave-checkout", {
        amount: p.price,
        service: "arcade",
        currency: "NGN",
        description: `Ride X Arcade — ${p.label} subscription`,
        email,
        referenceId: `arcade-${plan}`,
      });
      const url = res?.data?.url || res?.url;
      if (url) { window.location.href = url; return; }
      setErr((res?.data && res.data.error) || res?.error || "Payment could not start. Try again.");
      setBusy(false);
    } catch (e) {
      setErr(e.message || "Payment failed");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
            <Crown className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold">Arcade Premium</h2>
          <p className="text-xs text-muted-foreground">You've used your 3 free ad-plays. Subscribe for unlimited access to every game — no ads, no limits.</p>
        </div>

        <div className="space-y-2">
          {PLANS.map((p) => (
            <button key={p.id} onClick={() => setPlan(p.id)} className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${plan === p.id ? "border-primary bg-primary/10" : "border-border"}`}>
              <div>
                <p className="font-semibold text-sm">{p.label}</p>
                <p className="text-[11px] text-muted-foreground">{p.note}</p>
              </div>
              {plan === p.id ? <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Check className="w-3 h-3" /></span> : <Lock className="w-4 h-4 text-muted-foreground" />}
            </button>
          ))}
        </div>

        <Input type="email" placeholder="Your email (for receipt)" value={email} onChange={(e) => setEmail(e.target.value)} />
        {err && <p className="text-xs text-destructive">{err}</p>}
        <Button className="rounded-full w-full" disabled={busy} onClick={subscribe}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Subscribe ${plan === "yearly" ? "Yearly" : "Monthly"}`}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">Secured by Ride X · Cancel anytime</p>
      </DialogContent>
    </Dialog>
  );
}