import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Users, Car, Repeat, Crown, Copy, Check, Loader2, TrendingUp, Share2 } from "lucide-react";

const genCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "RX";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

const COMMISSIONS = [
  { icon: Users, title: "New customers", rate: "10%", desc: "Of Ride X's 10% platform commission (first 5 rides, 60-day window). Earn up to ₦1,000 when a customer spends up to ₦100,000." },
  { icon: Car, title: "New drivers", rate: "15%", desc: "Of Ride X's 10% platform commission (driver's first month). Earn up to ₦12,960 when a driver earns up to ₦864,000." },
  { icon: Repeat, title: "Subscriptions", rate: "5%", desc: "Of Ride X's 10% platform commission on every subscription renewal. Earn up to ₦50/month on a ₦10,000/month subscription." },
];

const TIERS = [
  { name: "Bronze", req: "5+ customers OR 2+ drivers", bonus: "₦10,000" },
  { name: "Silver", req: "15+ customers OR 5+ drivers", bonus: "₦40,000" },
  { name: "Gold", req: "50+ customers OR 15+ drivers", bonus: "₦100,000" },
  { name: "Platinum", req: "100+ customers OR 30+ drivers", bonus: "₦250,000" },
];

const STEPS = [
  { n: 1, t: "Register for the program", d: "Apply once — admin reviews and approves your referrer account." },
  { n: 2, t: "Get your unique code", d: "We generate a personal referral code and shareable link." },
  { n: 3, t: "Share everywhere", d: "Post it on YouTube, TikTok, blogs, WhatsApp — anywhere." },
  { n: 4, t: "Earn for 60 days", d: "Every referred customer's first 5 rides and driver's first month earns you commission." },
  { n: 5, t: "Get paid every 2 months", d: "Payouts via bank transfer or OPay." },
];

export default function ReferralLanding() {
  const nav = useNavigate();
  const [user, setUser] = React.useState(null);
  const [myRef, setMyRef] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({ full_name: "", email: "", phone: "", social_handles: "", terms: false });

  const load = React.useCallback(async () => {
    const u = await base44.auth.me().catch(() => null);
    setUser(u);
    if (u) {
      setForm((f) => ({ ...f, full_name: u.full_name || "", email: u.email || "" }));
      const list = await base44.entities.Referrer.list("-created_date", 10).catch(() => []);
      setMyRef(list[0] || null);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const apply = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.terms) return;
    setBusy(true);
    try {
      // ensure unique code
      let code = genCode();
      let exists = await base44.entities.Referrer.filter({ referral_code: code }).catch(() => []);
      let tries = 0;
      while (exists.length && tries < 5) { code = genCode(); exists = await base44.entities.Referrer.filter({ referral_code: code }).catch(() => []); tries++; }
      const created = await base44.entities.Referrer.create({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        social_handles: form.social_handles.trim(),
        referral_code: code,
        status: "pending",
        terms_accepted: true,
      });
      setMyRef(created);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <PageHeader eyebrow="Earn with Ride X" title="Ride X Referral Program" subtitle="Creators, influencers, advertisers, drivers and everyday users — earn commission for every new customer and driver you bring to Ride X." />

        {/* CTA banner */}
        <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 to-accent/5 p-6 md:p-8 mb-10 flex flex-wrap items-center gap-4 justify-between">
          <div>
            <h2 className="text-xl font-bold">Turn your audience into income</h2>
            <p className="text-sm text-muted-foreground mt-1">Earn from Ride X's 10% platform commission — up to ₦12,960 per driver, bonus tiers up to ₦250,000, payouts every 2 months.</p>
          </div>
          {loading ? (
            <Button disabled><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</Button>
          ) : !user ? (
            <div className="flex gap-2">
              <Link to="/register?returnTo=/referral"><Button className="rounded-full">Join now</Button></Link>
              <Link to="/login?returnTo=/referral-portal"><Button variant="outline" className="rounded-full">Referrer login</Button></Link>
            </div>
          ) : myRef?.status === "approved" ? (
            <Button className="rounded-full" onClick={() => nav("/referral-portal")}>Go to my dashboard</Button>
          ) : myRef?.status === "pending" ? (
            <Button disabled className="rounded-full">Application under review</Button>
          ) : (
            <a href="#apply"><Button className="rounded-full">Apply now</Button></a>
          )}
        </div>

        {/* How it works */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">How it works</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center mb-3">{s.n}</div>
                <p className="font-semibold text-sm">{s.t}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Commission structure */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Commission structure</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {COMMISSIONS.map((c) => (
              <div key={c.title} className="rounded-3xl border border-border/60 bg-card p-6">
                <c.icon className="w-8 h-8 text-primary mb-3" />
                <p className="text-3xl font-extrabold gold-text">{c.rate}</p>
                <p className="font-semibold mt-2">{c.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bonus tiers */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><Crown className="w-6 h-6 text-primary" /> Bonus tiers</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TIERS.map((t) => (
              <div key={t.name} className="rounded-3xl border border-border/60 bg-card p-6 text-center">
                <p className="text-lg font-bold gold-text">{t.name}</p>
                <p className="text-3xl font-extrabold my-2">{t.bonus}</p>
                <p className="text-xs text-muted-foreground">{t.req}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Apply form */}
        {user && (!myRef || myRef.status === "rejected") && (
          <section id="apply" className="mb-10">
            <div className="rounded-3xl border border-border/60 bg-card p-6 md:p-8 max-w-xl">
              <h2 className="text-xl font-bold mb-1">Apply to become a referrer</h2>
              <p className="text-sm text-muted-foreground mb-5">Admin reviews applications before activation.</p>
              <div className="space-y-4">
                <div>
                  <Label>Full name</Label>
                  <Input className="rounded-xl mt-1" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input className="rounded-xl mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input className="rounded-xl mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="080…" />
                </div>
                <div>
                  <Label>Social media handles (optional)</Label>
                  <Textarea className="rounded-xl mt-1" value={form.social_handles} onChange={(e) => setForm({ ...form, social_handles: e.target.value })} placeholder="@youtube, @tiktok, blog URL…" />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.checked })} className="mt-1" />
                  <span className="text-muted-foreground">I agree to the Ride X referral program terms and conditions.</span>
                </label>
                <Button className="rounded-full w-full" disabled={busy || !form.full_name.trim() || !form.email.trim() || !form.terms} onClick={apply}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <TrendingUp className="w-4 h-4 mr-2" />} Create referral account
                </Button>
              </div>
            </div>
          </section>
        )}

        {user && myRef?.status === "pending" && (
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6 mb-10">
            <h2 className="font-semibold text-amber-300">Application under review</h2>
            <p className="text-sm text-muted-foreground mt-1">Your referrer application is pending admin approval. We'll activate your account shortly. Your code: <span className="font-mono font-bold">{myRef.referral_code}</span></p>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground mt-10">
          Already a referrer? <Link to="/login?returnTo=/referral-portal" className="text-primary hover:underline">Sign in to your dashboard</Link>
        </p>
      </div>
    </div>
  );
}