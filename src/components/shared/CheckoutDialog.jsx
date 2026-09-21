import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/pricing";
import { CONTACT } from "@/lib/catalog";
import { issueReceiptClient } from "@/lib/clientBackdoor";
import { createCardOrder, authorizeFlutterwaveOrder, orderIsPaid } from "@/lib/flutterwaveCheckout";
import { invokeCrix, invokeCrixFunction, newIdempotencyKey } from "@/lib/crix";
import PinDialog from "@/components/crix/PinDialog";
import { CreditCard, Loader2, CheckCircle2, Coins, Mail, ShieldCheck, Ticket } from "lucide-react";

const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export default function CheckoutDialog({ open, onOpenChange, amount, service, description, referenceId, onPaid, allowCash = true, commission = 0 }) {
  const [email, setEmail] = React.useState(CONTACT.paystack_email || "");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState("");
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [authUser, setAuthUser] = React.useState(null);
  const [promoInput, setPromoInput] = React.useState("");
  const [promo, setPromo] = React.useState(null);
  const [promoBusy, setPromoBusy] = React.useState(false);
  const [promoErr, setPromoErr] = React.useState("");
  const [cardNum, setCardNum] = React.useState("");
  const [cardExp, setCardExp] = React.useState("");
  const [cardCvv, setCardCvv] = React.useState("");
  const [authStep, setAuthStep] = React.useState(null); // { type: 'pin' | 'otp', orderId }
  const [authValue, setAuthValue] = React.useState("");
  const activeTx = React.useRef(null);
  const [crixWallet, setCrixWallet] = React.useState(null);
  const [crixBusy, setCrixBusy] = React.useState(false);
  const [pinPrompt, setPinPrompt] = React.useState(null); // "set" | "verify"
  const [pinHas, setPinHas] = React.useState(false);
  const afterPin = React.useRef(null);
  React.useEffect(() => { base44.auth.me().then((u) => { setIsAdmin(u?.role === "admin"); setAuthUser(u); }).catch(() => {}); }, []);

  // CRIXCOIN wallet — the customer can pay any purchase straight from their
  // funded Naira wallet instead of a card
  React.useEffect(() => {
    if (!open || !authUser?.id) return;
    base44.entities.CrixWallet.filter({ user_id: authUser.id, currency: "NGN" })
      .then((w) => setCrixWallet((w || [])[0] || null))
      .catch(() => setCrixWallet(null));
  }, [open, authUser?.id]);
  const crixAvailable = Number(crixWallet?.available) || 0;

  const applyPromo = async () => {
    setPromoErr("");
    const code = promoInput.trim().toUpperCase();
    if (!code) { setPromoErr("Enter a promo code."); return; }
    setPromoBusy(true);
    try {
      // Client-side validation — reads the PromoCode entity directly with NO
      // backend function, so promo codes work even while integration credits
      // are exhausted.
      const found = await base44.entities.PromoCode.filter({ code }, "-created_date", 5);
      const p = found[0];
      if (!p) { setPromoErr("Invalid code."); setPromo(null); return; }
      if (!p.active) { setPromoErr("This code is no longer active."); setPromo(null); return; }
      if (p.expires_at && new Date(p.expires_at) < new Date()) { setPromoErr("This code has expired."); setPromo(null); return; }
      if (p.max_uses > 0 && (p.used_count || 0) >= p.max_uses) { setPromoErr("This code has reached its usage limit."); setPromo(null); return; }
      if (p.min_amount > 0 && total < p.min_amount) { setPromoErr(`Minimum spend is ${money(p.min_amount)}.`); setPromo(null); return; }
      const svc = (p.applicable_services || "all").toLowerCase();
      if (svc !== "all" && !svc.split(",").map((s) => s.trim()).includes(service)) { setPromoErr("This code doesn't apply to this service."); setPromo(null); return; }
      const discount = p.discount_type === "percent" ? Math.round(total * ((p.value || 0) / 100)) : Number(p.value || 0);
      if (discount <= 0) { setPromoErr("This code gives no discount."); setPromo(null); return; }
      setPromo({ code, discount, promoId: p.id, discount_type: p.discount_type, value: p.value });
    } catch (e) {
      setPromoErr(e.message || "Could not validate code.");
    } finally {
      setPromoBusy(false);
    }
  };
  const issueReceipt = async (tx) => {
    if (!tx || !tx.id) return;
    // Try the backend invoice function; if it's blocked (credits exhausted),
    // fall back to a real client-side Invoice record + queued receipt email.
    try {
      await base44.functions.invoke("create-invoice", { transaction_id: tx.id, userId: authUser?.id, userName: authUser?.full_name });
    } catch {
      try { await issueReceiptClient(base44, tx, authUser); } catch {}
    }
  };

  const total = Number(amount);
  const charged = Math.max(0, total - (promo?.discount || 0));
  const cardOk = cardNum.replace(/\D/g, "").length >= 12 && /^\d{2}\/\d{2}$/.test(cardExp) && cardCvv.trim().length >= 3;
  const canPay = isAdmin || charged === 0 || (validEmail(email) && cardOk);

  const adminBypass = async () => {
    setBusy(true);
    try {
      const tx = await base44.entities.Transaction.create({
        amount: 0,
        commission: 0,
        currency: "NGN",
        service,
        description,
        reference_id: referenceId || "",
        method: "admin_bypass",
        status: "paid",
        escrow_status: "released",
        escrow_released_at: new Date().toISOString(),
        escrow_released_by_name: "admin",
        settled_to_opay: true,
        opay_account: CONTACT.opay,
      });
      setBusy(false);
      setDone(true);
      await onPaid?.(tx, "admin_bypass");
      await issueReceipt(tx);
    } catch (e) {
      setBusy(false);
      setError(e.message || "Admin bypass failed");
    }
  };

  const pay = async () => {
    setError("");
    if (isAdmin) { await adminBypass(); return; }
    if (!canPay) { setError("Enter a valid email to continue."); return; }
    setBusy(true);
    try {
      // Free submissions (₦0, e.g. editorial playlists OR a 100%-off promo)
      // confirm instantly without Paystack — a zero charge would hang Paystack.
      if (charged === 0) {
        const tx = await base44.entities.Transaction.create({
          amount: 0,
          commission: 0,
          discount: promo?.discount || 0,
          promo_code: promo?.code || "",
          currency: "NGN",
          service,
          description,
          reference_id: referenceId || "",
          method: "free",
          status: "paid",
          escrow_status: "released",
          escrow_released_at: new Date().toISOString(),
          escrow_released_by_name: "system",
          settled_to_opay: true,
          opay_account: CONTACT.opay,
        });
        setBusy(false);
        setDone(true);
        await onPaid?.(tx, "free");
        await issueReceipt(tx);
        // Tally the promo redemption for the free path (paid path is tallied
        // by the Paystack webhook) so a 100%-off code still increments used_count.
        if (promo?.code) {
          try { await base44.functions.invoke("redeem-promo-code", { code: promo.code, transaction_id: tx.id }); } catch {}
        }
        return;
      }
      // Flutterwave card checkout — the pending Transaction is created
      // client-side; the gateway order (with card fields encrypted server-side)
      // is created via the flutterwave-pay function; PIN/OTP/3DS steps are
      // handled in-dialog or via redirect, and the webhook settles escrow.
      const [mm, yy] = cardExp.split("/").map((s) => s.trim());
      const pendingTx = await base44.entities.Transaction.create({
        amount: charged,
        commission,
        discount: promo?.discount || 0,
        promo_code: promo?.code || "",
        currency: "NGN",
        service,
        description,
        reference_id: referenceId || "",
        method: "card",
        status: "pending",
        settled_to_opay: true,
        opay_account: CONTACT.opay,
      });
      activeTx.current = pendingTx;
      const reference = `RXFLW-${pendingTx.id.slice(-10)}-${Date.now().toString(36)}`;
      const redirectUrl = `${window.location.origin}/payment-success?service=${encodeURIComponent(service)}&ref=${encodeURIComponent(referenceId || "")}&flw_tx=${pendingTx.id}`;
      const res = await createCardOrder({
        amount: charged,
        email: email.trim(),
        reference,
        card: { number: cardNum.replace(/\D/g, ""), expiry_month: mm, expiry_year: yy, cvv: cardCvv.trim() },
        meta: {
          transaction_id: pendingTx.id,
          service,
          reference_id: referenceId || "",
          promo_code_id: promo?.promoId || "",
          user_id: authUser?.id || "",
          user_name: authUser?.full_name || "",
        },
        redirectUrl,
      });
      const order = res?.order;
      if (!order || !order.order_id) throw new Error(res?.error || "Ride X could not start the payment");
      // Remember the gateway order so webhooks and redirect returns can settle this transaction.
      try { await base44.entities.Transaction.update(pendingTx.id, { gateway_reference: order.order_id }); } catch {}
      await handleOrderOutcome(order, pendingTx);
      return;
    } catch (e) {
      setBusy(false);
      setError(e.message || "Payment failed");
    }
  };

  // CRIXCOIN WALLET PAYMENT — every purchase can be paid from the funded
  // Naira wallet, confirmed with the customer's transaction PIN
  const payWithCrix = async (pin) => {
    setError("");
    if (crixBusy) return;
    setCrixBusy(true);
    try {
      const d = await invokeCrixFunction("crix-pay-service", {
        action: "pay",
        purchase_key: newIdempotencyKey(),
        service,
        description,
        reference_id: referenceId || "",
        amount_ngn: charged,
        discount: promo?.discount || 0,
        promo_code: promo?.code || "",
        pin,
      });
      if (promo?.code) {
        try { await base44.functions.invoke("redeem-promo-code", { code: promo.code, transaction_id: d.transaction_id }); } catch {}
      }
      const tx = d.transaction_id ? await base44.entities.Transaction.get(d.transaction_id) : null;
      setCrixBusy(false);
      setDone(true);
      if (tx) await onPaid?.(tx, "crix_wallet");
      if (tx) await issueReceipt(tx);
    } catch (e) {
      setCrixBusy(false);
      setError(e.message || "The CRIXCOIN payment could not complete");
    }
  };

  const startCrixPay = async () => {
    setError("");
    setCrixBusy(true);
    try {
      const st = await invokeCrix({ action: "pin_status" });
      setPinHas(!!st.has_pin);
      afterPin.current = payWithCrix;
      setPinPrompt(st.has_pin ? "verify" : "set");
    } catch (e) {
      setError(e.message || "Cannot start the payment right now");
    }
    setCrixBusy(false);
  };

  const finalizePaid = async (pendingTx) => {
    setBusy(true);
    try {
      await base44.entities.Transaction.update(pendingTx.id, {
        status: "paid",
        platform_fee_settled: true,
      });
      // Tally promo redemption client-side (the authoritative tally happens in the webhook).
      if (promo?.code) {
        try {
          const codes = await base44.entities.PromoCode.filter({ code: promo.code }, "-created_date", 5);
          const pc = codes[0];
          if (pc && pc.id) {
            await base44.entities.PromoCode.update(pc.id, {
              used_count: (Number(pc.used_count) || 0) + 1,
            });
          }
        } catch {}
      }
      const paidTx = await base44.entities.Transaction.get(pendingTx.id);
      setDone(true);
      setBusy(false);
      setAuthStep(null);
      await onPaid?.(paidTx, "card");
      await issueReceipt(paidTx);
    } catch (e) {
      setBusy(false);
      setError(e.message || "Could not finalize payment. If you were charged, contact Support.");
    }
  };

  const handleOrderOutcome = async (order, pendingTx) => {
    const na = order?.next_action;
    if (orderIsPaid(order)) { await finalizePaid(pendingTx); return; }
    if (order?.status === "failed" || order?.status === "cancelled") {
      setBusy(false);
      setError("The payment was declined. Please try another card.");
      return;
    }
    if (na?.type === "otp" || na?.type === "pin") {
      setBusy(false);
      setAuthValue("");
      setAuthStep({ type: na.type, orderId: order.order_id });
      return;
    }
    if (na?.type === "redirect") {
      setBusy(false);
      window.location.href = na.url; // Flutterwave 3DS authorization, returns to /payment-success
      return;
    }
    if (na?.type === "avs") {
      setBusy(false);
      setError("Your bank requires address verification, which this checkout doesn't support yet — please try another card.");
      return;
    }
    if (na?.type === "instruction" || na?.type === "bank_transfer") {
      setBusy(false);
      setError(na.note || "Complete the payment instructions from your bank, then check back.");
      return;
    }
    setBusy(false);
    setError("Your payment is processing — the transaction will be confirmed automatically.");
  };

  const submitAuth = async () => {
    if (!authStep || !activeTx.current) return;
    setError("");
    if (!authValue) { setError(authStep.type === "pin" ? "Enter your card PIN" : "Enter the OTP sent to you"); return; }
    setBusy(true);
    try {
      const res = await authorizeFlutterwaveOrder({ orderId: authStep.orderId, type: authStep.type, value: authValue });
      const order = res?.order;
      if (!order) throw new Error(res?.error || "Ride X could not confirm the code");
      await handleOrderOutcome(order, activeTx.current);
    } catch (e) {
      setBusy(false);
      setError(e.message || "Could not confirm the code. Please retry.");
    }
  };

  const close = (v) => {
    onOpenChange(v);
    if (!v) { setDone(false); setError(""); setPromo(null); setPromoInput(""); setPromoErr(""); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>{done ? (isAdmin ? "Admin confirmed" : "Payment complete") : "Checkout"}</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
            <p className="font-semibold">{isAdmin ? "Confirmed free (admin bypass)" : charged === 0 ? "Free submission confirmed" : `${money(charged)} paid`}</p>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Admin bypass — no charge applied. Submission auto-routed and approved."
                : charged === 0
                ? "Free submission confirmed."
                : "Payment held in escrow for your protection — release it from your profile once the service is delivered."}
            </p>
            <Button className="rounded-full w-full" onClick={() => close(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-5">
            {isAdmin && (
              <div className="flex gap-2 items-start text-xs rounded-2xl bg-primary/10 border border-primary/40 p-3 text-primary">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Admin mode — confirm free. No charge is applied; the submission is auto-routed and approved instantly.</span>
              </div>
            )}

            <div className="rounded-2xl bg-secondary p-4">
              <p className="text-xs text-muted-foreground">{description}</p>
              <div className="flex items-end justify-between gap-2 mt-1">
                <p className="text-3xl font-extrabold">{money(charged)}</p>
                {promo && promo.discount > 0 && <p className="text-xs text-muted-foreground line-through">{money(total)}</p>}
              </div>
              {promo && promo.discount > 0 && (
                <p className="text-xs text-emerald-400 mt-1">Promo {promo.code} · −{money(promo.discount)}</p>
              )}
            </div>

            {total > 0 && !isAdmin && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Ticket className="w-3 h-3" /> Promo code</Label>
                <div className="flex gap-2">
                  <Input className="rounded-xl" placeholder="Enter promo code" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} />
                  <Button size="sm" variant="outline" className="rounded-xl px-4 shrink-0" disabled={promoBusy} onClick={applyPromo}>
                    {promoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
                {promoErr && <p className="text-xs text-destructive">{promoErr}</p>}
                {promo && promo.discount > 0 && (
                  <button onClick={() => { setPromo(null); setPromoInput(""); setPromoErr(""); }} className="text-xs text-muted-foreground underline">Remove {promo.code}</button>
                )}
              </div>
            )}

            {total > 0 && !isAdmin && (
              <div>
                <Label className="text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Email for receipt</Label>
                <Input
                  className="rounded-xl mt-1"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}

            {total > 0 && !isAdmin && !authStep && (
              <div className="rounded-2xl border border-primary/40 bg-primary/10 p-3">
                <div className="flex items-center gap-2.5">
                  <Coins className="w-5 h-5 text-primary shrink-0" />
                  <div className="text-xs min-w-0">
                    <p className="font-semibold">Pay with CRIXCOIN wallet</p>
                    <p className="text-muted-foreground">
                      Balance: {money(crixWallet ? crixWallet.available : 0)}
                      {crixWallet && crixAvailable < charged ? " — fund your wallet to use this" : ""}
                    </p>
                  </div>
                  <Button size="sm" className="ml-auto rounded-full px-4 shrink-0 font-bold" disabled={crixBusy || crixAvailable < charged} onClick={startCrixPay}>
                    {crixBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Use wallet"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">Your primary payment method — paid instantly from your Naira wallet with your transaction PIN. The wallet fee is added on top.</p>
              </div>
            )}

            {total > 0 && !isAdmin && !authStep && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><CreditCard className="w-3 h-3" /> Or pay by card</Label>
                <Input
                  className="rounded-xl"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="Card number"
                  value={cardNum}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 19);
                    setCardNum(digits.replace(/(.{4})/g, "$1 ").trim());
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    className="rounded-xl"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    value={cardExp}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setCardExp(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
                    }}
                  />
                  <Input
                    className="rounded-xl"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="CVV"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </div>
              </div>
            )}

            {pinPrompt ? (
              <PinDialog
                mode={pinPrompt}
                hasPin={pinHas}
                onDone={(pin) => { const run = afterPin.current; afterPin.current = null; setPinPrompt(null); if (run) run(pin); }}
                onClose={() => { afterPin.current = null; setPinPrompt(null); }}
              />
            ) : null}

            {authStep && (
              <div className="space-y-1.5 rounded-2xl border border-primary/40 bg-primary/5 p-3">
                <Label className="text-xs">{authStep.type === "pin" ? "Enter your card PIN" : "Enter the OTP sent to you"}</Label>
                <Input
                  className="rounded-xl"
                  inputMode="numeric"
                  type="password"
                  placeholder={authStep.type === "pin" ? "••••" : "Code"}
                  value={authValue}
                  onChange={(e) => setAuthValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
                />
                <Button size="sm" className="rounded-xl w-full" disabled={busy} onClick={submitAuth}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
                </Button>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button className="w-full rounded-full h-11 font-semibold" disabled={busy || !canPay} onClick={pay}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isAdmin ? "Confirm Free (Admin)" : charged === 0 ? "Confirm (Free)" : `Pay ${money(charged)}`}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              Secured by Ride X · card payments
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}