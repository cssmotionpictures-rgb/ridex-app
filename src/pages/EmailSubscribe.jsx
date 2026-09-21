import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Mail, Globe, Gift, CheckCircle2 } from "lucide-react";

const COUNTRIES = [
  "Nigeria - Lagos", "Nigeria - Abuja", "Nigeria - Other",
  "Ghana", "Kenya", "South Africa",
  "United States", "United Kingdom", "Other",
];

export default function EmailSubscribe() {
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const ref = React.useMemo(
    () => new URLSearchParams(window.location.search).get("ref") || "",
    []
  );

  const submit = async () => {
    if (!email.includes("@")) { toast({ title: "Enter a valid email", variant: "destructive" }); return; }
    if (!country) { toast({ title: "Select your country/region", variant: "destructive" }); return; }
    setBusy(true); setResult(null);
    try {
      const res = await base44.functions.invoke("email-subscribe", { email, country, referralCode: ref });
      const d = res.data || res;
      if (d.success) {
        setResult(d);
        toast({ title: "Subscribed!", description: "Check your inbox for your referral link." });
        setEmail(""); setCountry("");
      } else {
        toast({ title: d.error || "Error", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-5">
      <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card p-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center mb-1">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold gold-text">Ride X Newsletter</h1>
          <p className="text-sm text-muted-foreground">Weekly updates, offers & events — tuned to your country.</p>
        </div>

        {result ? (
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm space-y-2">
            <p className="flex items-center gap-2 font-semibold text-emerald-300"><CheckCircle2 className="w-4 h-4" /> You're subscribed!</p>
            <p className="text-muted-foreground">Share your referral link and earn rewards:</p>
            <code className="block break-all rounded-lg bg-background/60 p-2 text-xs text-primary">{result.referralLink}</code>
            <Button variant="outline" className="w-full rounded-full" onClick={() => { navigator.clipboard?.writeText(result.referralLink); toast({ title: "Link copied" }); }}>
              Copy referral link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium flex items-center gap-1 mb-1"><Mail className="w-3.5 h-3.5" /> Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-medium flex items-center gap-1 mb-1"><Globe className="w-3.5 h-3.5" /> Country / Region</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">Select…</option>
                {COUNTRIES.map((c) => <option key={c} value={c} className="bg-card">{c}</option>)}
              </select>
            </div>
            {ref && <p className="text-[11px] text-primary flex items-center gap-1"><Gift className="w-3 h-3" /> Referred by a friend — rewards unlock after you subscribe.</p>}
            <Button className="w-full rounded-full" disabled={busy} onClick={submit}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Subscribe
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">By subscribing you consent to weekly emails. Unsubscribe anytime.</p>
          </div>
        )}
      </div>
    </div>
  );
}