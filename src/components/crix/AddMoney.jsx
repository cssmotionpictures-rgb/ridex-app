import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, CreditCard, ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { invokeCrix, newIdempotencyKey, formatCrix } from "@/lib/crix";
import { createCardOrder, authorizeFlutterwaveOrder, orderIsPaid } from "@/lib/flutterwaveCheckout";
import { money } from "@/lib/pricing";

// ADD MONEY — real Naira funding of the Crix wallet. Every money decision is
// server-side: the quote, the funding record and the wallet credit all come
// from the crix-wallet engine — this screen only collects the amount and the
// card details. The card charge runs on the existing Flutterwave rail; the
// wallet is credited ONLY after the payment is independently verified at the
// provider (webhook or deposit_settle), never from a screen click alone.
export default function AddMoney({ open, onOpenChange, user }) {
  const [amount, setAmount] = React.useState("");
  const [quote, setQuote] = React.useState(null);
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [authStep, setAuthStep] = React.useState(null); // { type: 'pin'|'otp', orderId }
  const [authValue, setAuthValue] = React.useState("");
  const [done, setDone] = React.useState(null); // { lands, balance, crix_id } | { processing, crix_id }
  const [cardNum, setCardNum] = React.useState("");
  const [cardExp, setCardExp] = React.useState("");
  const [cardCvv, setCardCvv] = React.useState("");
  const keyRef = React.useRef(newIdempotencyKey());
  const orderRef = React.useRef(null); // { crix_id, order_id, transaction_id }

  React.useEffect(() => { if (user?.email) setEmail((e) => e || user.email); }, [user]);

  const reset = () => {
    setAmount(""); setQuote(null); setError(""); setAuthStep(null); setAuthValue("");
    setDone(null); setCardNum(""); setCardExp(""); setCardCvv("");
    keyRef.current = newIdempotencyKey(); orderRef.current = null;
  };
  const close = (v) => { onOpenChange(v); if (!v) reset(); };

  // While the funding engine finishes its rollout the server answers with its
  // own honest refusal — translate that one shape into a friendly notice.
  const fundingError = (message) =>
    /unknown action/i.test(String(message))
      ? "CRIXCOIN deposits are being activated — this will be available shortly. Nothing was charged."
      : message;

  const getQuote = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) { setError("Enter an amount."); return; }
    setError(""); setBusy(true);
    try {
      const res = await invokeCrix({ action: "deposit_quote", currency: "NGN", amount: amt });
      if (!res.available) { setError(res.reason || res.error || "Funding is not available right now."); return; }
      setQuote(res);
    } catch (e) {
      setError(fundingError(e.message));
    } finally { setBusy(false); }
  };

  const handleOutcome = async (order) => {
    const na = order?.next_action;
    if (orderIsPaid(order)) { await settle(); return; }
    if (order?.status === "failed" || order?.status === "cancelled") {
      setBusy(false); setError("The payment was declined. Please try another card."); return;
    }
    if (na?.type === "otp" || na?.type === "pin") {
      setBusy(false); setAuthValue(""); setAuthStep({ type: na.type, orderId: order.order_id }); return;
    }
    if (na?.type === "redirect") {
      setBusy(false); window.location.href = na.url; // Flutterwave 3DS — returns via /payment-success
      return;
    }
    setBusy(false);
    setError("Your payment is processing — your wallet credits automatically the moment it confirms.");
  };

  const settle = async () => {
    try {
      const res = await invokeCrix({ action: "deposit_settle", crix_id: orderRef.current.crix_id, order_id: orderRef.current.order_id });
      if (res.status === "COMPLETED") {
        setDone({ lands: res.lands, balance: res.balance, crix_id: orderRef.current.crix_id });
      } else {
        setDone({ processing: true, crix_id: orderRef.current.crix_id });
      }
      setBusy(false); setAuthStep(null);
    } catch (e) {
      setBusy(false); setError(e.message);
    }
  };

  const pay = async () => {
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Enter a valid email for the receipt."); return; }
    const digits = cardNum.replace(/\D/g, "");
    const [mm, yy] = cardExp.split("/").map((s) => s.trim());
    if (digits.length < 12 || !mm || !yy || cardCvv.trim().length < 3) { setError("Enter complete card details."); return; }
    setBusy(true);
    try {
      // 1 — the server creates the funding record (idempotent) and the payment meta
      const init = await invokeCrix({ action: "deposit_init", currency: "NGN", amount: Number(amount), idempotency_key: keyRef.current });
      orderRef.current = { crix_id: init.crix_id, transaction_id: init.transaction_id, order_id: "" };
      // 2 — the card charge on the existing Flutterwave rail
      const redirectUrl = `${window.location.origin}/payment-success?service=crix_funding&ref=${encodeURIComponent(init.crix_id)}&flw_tx=${init.transaction_id}`;
      const res = await createCardOrder({
        amount: Number(amount),
        email: email.trim(),
        reference: init.reference,
        card: { number: digits, expiry_month: mm, expiry_year: yy, cvv: cardCvv.trim() },
        meta: init.meta,
        redirectUrl,
      });
      const order = res?.order;
      if (!order || !order.order_id) throw new Error(res?.error || "Could not start the payment.");
      orderRef.current.order_id = order.order_id;
      try { await base44.entities.Transaction.update(init.transaction_id, { gateway_reference: order.order_id }); } catch {}
      await handleOutcome(order);
    } catch (e) {
      setBusy(false);
      setError(fundingError(e.message || "Payment failed"));
    }
  };

  const submitAuth = async () => {
    if (!authStep) return;
    if (!authValue) { setError(authStep.type === "pin" ? "Enter your card PIN" : "Enter the OTP sent to you"); return; }
    setError(""); setBusy(true);
    try {
      const res = await authorizeFlutterwaveOrder({ orderId: authStep.orderId, type: authStep.type, value: authValue });
      const order = res?.order;
      if (!order) throw new Error(res?.error || "Could not confirm the code");
      await handleOutcome(order);
    } catch (e) {
      setBusy(false); setError(e.message || "Could not confirm the code. Please retry.");
    }
  };

  const cardOk = cardNum.replace(/\D/g, "").length >= 12 && /^\d{2}\/\d{2}$/.test(cardExp) && cardCvv.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>{done ? "Funding complete" : "Add money"}</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="text-center py-6 space-y-3">
            {done.processing ? (
              <>
                <Clock className="w-14 h-14 text-primary mx-auto" />
                <p className="font-semibold">Payment received — confirming</p>
                <p className="text-sm text-muted-foreground">Your wallet credits automatically the moment the payment is verified. Reference: <span className="font-mono text-primary">{done.crix_id}</span></p>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
                <p className="font-semibold">{formatCrix(done.lands, "NGN")} added to your wallet</p>
                {typeof done.balance === "number" && (
                  <p className="text-sm text-muted-foreground">New available balance: <b>{formatCrix(done.balance, "NGN")}</b></p>
                )}
                <p className="text-xs font-mono text-primary">{done.crix_id}</p>
              </>
            )}
            <Button className="rounded-full w-full" onClick={() => close(false)}>Done</Button>
          </div>
        ) : !quote ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary p-4">
              <p className="text-xs text-muted-foreground">Fund your Naira wallet by card. Your deposit lands instantly and can be sent to anyone on Crix.</p>
            </div>
            <div>
              <Label htmlFor="fund-amount">Amount to add (₦)</Label>
              <Input id="fund-amount" type="number" min="100" step="50" placeholder="e.g. 5000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}
            <Button className="w-full rounded-full h-11 font-semibold" disabled={busy} onClick={getQuote}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">You pay</span><b>{money(quote.quote.charge)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">CRIXCOIN fee</span><span>{quote.quote.fee > 0 ? formatCrix(quote.quote.fee, "NGN") : "Free"}</span></div>
              <div className="flex justify-between border-t border-border pt-1.5"><span className="text-muted-foreground">Lands in your wallet</span><b className="text-primary">{formatCrix(quote.quote.lands, "NGN")}</b></div>
            </div>

            <div>
              <Label htmlFor="fund-email" className="text-xs">Email for receipt</Label>
              <Input id="fund-email" type="email" className="rounded-xl mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            {!authStep && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><CreditCard className="w-3 h-3" /> Card details</Label>
                <Input className="rounded-xl" inputMode="numeric" autoComplete="cc-number" placeholder="Card number"
                  value={cardNum}
                  onChange={(e) => { const dg = e.target.value.replace(/\D/g, "").slice(0, 19); setCardNum(dg.replace(/(.{4})/g, "$1 ").trim()); }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input className="rounded-xl" inputMode="numeric" placeholder="MM/YY" value={cardExp}
                    onChange={(e) => { const dg = e.target.value.replace(/\D/g, "").slice(0, 4); setCardExp(dg.length > 2 ? `${dg.slice(0, 2)}/${dg.slice(2)}` : dg); }}
                  />
                  <Input className="rounded-xl" inputMode="numeric" placeholder="CVV" value={cardCvv} onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                </div>
              </div>
            )}

            {authStep && (
              <div className="space-y-1.5 rounded-2xl border border-primary/40 bg-primary/5 p-3">
                <Label className="text-xs">{authStep.type === "pin" ? "Enter your card PIN" : "Enter the OTP sent to you"}</Label>
                <Input className="rounded-xl" inputMode="numeric" type="password" placeholder={authStep.type === "pin" ? "••••" : "Code"}
                  value={authValue} onChange={(e) => setAuthValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
                />
                <Button size="sm" className="rounded-xl w-full" disabled={busy} onClick={submitAuth}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
                </Button>
              </div>
            )}

            {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}

            <Button className="w-full rounded-full h-11 font-semibold" disabled={busy || !cardOk} onClick={pay}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ${money(quote.quote.charge)}`}
            </Button>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-center">
              <ShieldCheck className="w-3 h-3" /> Your wallet is credited only after the payment is verified — never from a tap alone.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}