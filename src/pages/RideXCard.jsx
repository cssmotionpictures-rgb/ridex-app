import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, Plus, Mail, ShieldCheck, RotateCw } from "lucide-react";
import { money } from "@/lib/pricing";
import { CONTACT } from "@/lib/catalog";
import CardFace from "@/components/card/CardFace";

const inIframe = () => { try { return window.self !== window.top; } catch { return true; } };
const pad2 = (n) => String(n).padStart(2, "0");

export default function RideXCard() {
  const [me, setMe] = React.useState(null);
  const [card, setCard] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [flipped, setFlipped] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [tbusy, setTbusy] = React.useState(false);
  const [txns, setTxns] = React.useState([]);

  const load = React.useCallback(async (user) => {
    if (!user) return;
    const cards = await base44.entities.RideXCard.filter({ created_by_id: user.id }, "-created_date", 1);
    const c = cards[0];
    setCard(c);
    if (c) {
      const list = await base44.entities.Transaction.filter({ created_by_id: user.id }, "-created_date", 30);
      setTxns(list.filter((t) => t.method === "ridex_card" || t.service === "card"));
    }
  }, []);

  React.useEffect(() => {
    base44.auth.me().then(async (u) => {
      setMe(u);
      if (u) setEmail(u.email || "");
      await load(u);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [load]);

  const register = async () => {
    setErr("");
    if (!name.trim() || !email.trim()) { setErr("Name and email are required"); return; }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("ride-x-card", {
        action: "register", cardholder_name: name.trim(), email: email.trim(), phone: phone.trim(),
      });
      if (res?.data?.card) { setCard(res.data.card); await load(me); }
      else setErr(res?.data?.error || "Registration failed");
    } catch (e) { setErr(e.message || "Registration failed"); }
    setBusy(false);
  };

  const topup = async () => {
    setErr("");
    const n = Math.round(Number(amount));
    if (!n || n <= 0) { setErr("Enter a valid amount in ₦"); return; }
    setTbusy(true);
    try {
      if (inIframe()) {
        await base44.entities.RideXCard.update(card.id, {
          balance: (card.balance || 0) + n,
          total_loaded: (card.total_loaded || 0) + n,
        });
        await base44.entities.Transaction.create({
          amount: n, commission: 0, currency: "NGN", service: "card",
          description: "Ride X Card top-up", reference_id: card.id,
          method: "card", status: "paid", settled_to_opay: true, opay_account: CONTACT.opay,
        });
        setAmount("");
        await load(me);
      } else {
        const res = await base44.functions.invoke("flutterwave-checkout", {
          amount: n, service: "card", description: "Ride X Card top-up",
          referenceId: card.id, currency: "NGN", email: card.email || me?.email, method: "card", commission: 0,
        });
        const url = res?.data?.url || res?.url;
        if (url) { window.location.href = url; return; }
        setErr((res?.data && res.data.error) || "Could not start top-up");
      }
    } catch (e) { setErr(e.message || "Top-up failed"); }
    setTbusy(false);
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  }

  const masked = card ? `5399 **** **** ${card.card_last4}` : "5399 **** **** 8107";
  const exp = card ? `${pad2(card.expiry_month)}/${String(card.expiry_year).slice(-2)}` : "08/29";

  return (
    <div>
      <PageHeader
        eyebrow="Wallet"
        title="Ride X Card"
        subtitle="Your virtual wallet — pay for rides, deliveries and more. Card front and back are emailed to you on registration."
      />

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* Flip card sample */}
        <div className="flex flex-col items-center">
          <div
            onClick={() => setFlipped((f) => !f)}
            className="relative w-full max-w-sm cursor-pointer select-none"
            style={{ aspectRatio: "1.586" }}
          >
            <div style={{
              position: "absolute", inset: 0, transformStyle: "preserve-3d",
              transition: "transform .6s ease", transform: flipped ? "rotateY(180deg)" : "none",
            }}>
              <CardFace card={card} side="front" />
              <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                <CardFace card={card} side="back" />
              </div>
            </div>
          </div>
          <button onClick={() => setFlipped((f) => !f)} className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors">
            <RotateCw className="w-3.5 h-3.5" /> Tap card to flip {flipped ? "(back)" : "(front)"}
          </button>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {!card ? (
            <div className="glass rounded-3xl p-6 space-y-4 border border-border/60">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                <h2 className="font-heading font-bold text-lg">Register your card</h2>
              </div>
              <p className="text-sm text-muted-foreground">Instant virtual card. Details and card images are emailed to you.</p>
              <div>
                <Label className="text-xs">Cardholder name</Label>
                <Input className="rounded-xl mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Email</Label>
                <Input className="rounded-xl mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <Label className="text-xs">Phone (optional)</Label>
                <Input className="rounded-xl mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 ..." />
              </div>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <Button className="w-full rounded-full h-11 font-semibold" disabled={busy} onClick={register}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Get my Ride X Card"}
              </Button>
            </div>
          ) : (
            <>
              <div className="glass rounded-3xl p-6 border border-border/60 space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Cardholder</p>
                    <p className="font-semibold">{card.cardholder_name}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5" /> {card.status}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-primary" />
                  <p className="font-mono tracking-wider text-lg">{masked}</p>
                  <span className="ml-auto text-sm text-muted-foreground">{exp}</span>
                </div>
                <div className="pt-4 border-t border-border/60">
                  <p className="text-xs text-muted-foreground">Available balance</p>
                  <p className="text-4xl font-extrabold gold-text">{money(card.balance || 0, card.currency || "NGN")}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-secondary p-3">
                    <p className="text-xs text-muted-foreground">Total loaded</p>
                    <p className="font-semibold">{money(card.total_loaded || 0, card.currency || "NGN")}</p>
                  </div>
                  <div className="rounded-2xl bg-secondary p-3">
                    <p className="text-xs text-muted-foreground">Total spent</p>
                    <p className="font-semibold">{money(card.total_spent || 0, card.currency || "NGN")}</p>
                  </div>
                </div>
              </div>

              <div className="glass rounded-3xl p-6 border border-border/60 space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary" />
                  <h2 className="font-heading font-bold text-lg">Top up card</h2>
                </div>
                <div className="flex gap-2">
                  <Input className="rounded-xl" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in ₦" />
                  <Button className="rounded-full px-6" disabled={tbusy} onClick={topup}>
                    {tbusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Top up"}
                  </Button>
                </div>
                {[1000, 5000, 10000].map((q) => (
                  <button key={q} onClick={() => setAmount(String(q))} className="mr-2 px-3 py-1 rounded-full text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
                    ₦{q.toLocaleString()}
                  </button>
                ))}
                {inIframe() && <p className="text-[11px] text-amber-300/80">Preview mode — top-ups settle instantly for testing.</p>}
                {err && <p className="text-sm text-destructive">{err}</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {card && txns.length > 0 && (
        <div className="mt-10">
          <h2 className="font-heading font-bold text-lg mb-4">Recent activity</h2>
          <div className="glass rounded-3xl border border-border/60 divide-y divide-border/60">
            {txns.map((t) => (
              <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${t.service === "card" ? "bg-emerald-500/15 text-emerald-300" : "bg-primary/15 text-primary"}`}>
                  {t.service === "card" ? <Plus className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.description}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.created_date).toLocaleString()}</p>
                </div>
                <p className={`font-semibold ${t.service === "card" ? "text-emerald-300" : "text-foreground"}`}>
                  {t.service === "card" ? "+" : "−"}{money(t.amount, t.currency || "NGN")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}