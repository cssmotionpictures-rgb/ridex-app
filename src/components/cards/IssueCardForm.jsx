import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard, Banknote, Globe2 } from "lucide-react";
import { getCardFeeConfig } from "@/lib/virtualCards";

const sym = (currency) => (currency === "USD" ? "$" : "₦");

export default function IssueCardForm({ defaultEmail, defaultName, busy, error, onIssue }) {
  const [name, setName] = React.useState(defaultName || "");
  const [email, setEmail] = React.useState(defaultEmail || "");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [currency, setCurrency] = React.useState("NGN");
  const [topUp, setTopUp] = React.useState("");
  const [fees, setFees] = React.useState(null);

  React.useEffect(() => {
    getCardFeeConfig().then(setFees).catch(() => {});
  }, []);

  // Transparent fee breakdown — computed from the same admin-configured
  // schedule the backend charges from, and shown BEFORE the customer confirms.
  const schedule = fees?.fees?.[currency] || null;
  const rate = fees?.usd_ngn_rate || 0;
  const fundingAmt = Math.max(0, Number(topUp) || 0);
  const creationFee = schedule ? schedule.issuance_fee + schedule.activation_fee : 0;
  const fundingFee = schedule && fundingAmt > 0 ? fundingAmt * (schedule.funding_percentage / 100) : 0;
  const fxMarkup = schedule && currency === "USD" && fundingAmt > 0 ? fundingAmt * (schedule.fx_markup_percentage / 100) : 0;
  const feeTotal = Math.round((creationFee + fundingFee + fxMarkup) * 100) / 100;
  const walletDebit = currency === "USD" ? Math.round((feeTotal + fundingAmt) * rate) : Math.round(feeTotal + fundingAmt);

  const submit = (e) => {
    e.preventDefault();
    onIssue({
      cardholder_name: name,
      email,
      phone_number: phone,
      address,
      currency,
      funding_amount: fundingAmt,
    });
  };

  const pill = (key, icon, title, note) => (
    <button
      type="button"
      onClick={() => setCurrency(key)}
      className={`rounded-2xl border p-3 text-left transition-colors ${
        currency === key ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary/50"
      }`}
    >
      <span className="flex items-center gap-2 font-semibold text-sm">
        {icon}
        {title}
      </span>
      <span className="block text-[11px] mt-1">{note}</span>
    </button>
  );

  const line = (label, value, muted = false) => (
    <div className={`flex justify-between text-xs ${muted ? "text-muted-foreground" : "text-foreground font-semibold"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <form onSubmit={submit} className="glass rounded-3xl p-6 space-y-4 border border-border/60 max-w-xl">
      <div className="flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-primary" />
        <h2 className="font-heading font-bold text-lg">Request your Ride X Card</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Your Ride X Card is created instantly. The full fee breakdown is shown below before you confirm.
      </p>
      <div>
        <Label className="text-xs">Card currency</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {pill("NGN", <Banknote className="w-4 h-4 text-primary" />, "Naira card", "For local payments")}
          {pill("USD", <Globe2 className="w-4 h-4 text-primary" />, "Dollar card", "For TikTok, ads & online shopping")}
        </div>
      </div>
      <div>
        <Label className="text-xs">Cardholder name</Label>
        <Input className="rounded-xl mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required />
      </div>
      <div>
        <Label className="text-xs">Email</Label>
        <Input className="rounded-xl mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
      </div>
      <div>
        <Label className="text-xs">Phone number</Label>
        <Input className="rounded-xl mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08012345678" required />
      </div>
      <div>
        <Label className="text-xs">Address</Label>
        <Input className="rounded-xl mt-1" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="City, country" required />
      </div>
      <div>
        <Label className="text-xs">Initial card top-up (optional)</Label>
        <Input
          className="rounded-xl mt-1"
          type="number"
          min="0"
          value={topUp}
          onChange={(e) => setTopUp(e.target.value)}
          placeholder={currency === "USD" ? "Amount in $ to start the card with" : "Amount in ₦ to start the card with"}
        />
      </div>

      {/* Fee breakdown — shown BEFORE the customer confirms */}
      {schedule && (
        <div className="rounded-2xl bg-secondary p-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Fee breakdown</p>
          {line("Card creation fee", creationFee > 0 ? `${sym(currency)}${creationFee.toFixed(2)}` : "Free", true)}
          {schedule.activation_fee > 0 && line("Activation fee", `${sym(currency)}${schedule.activation_fee.toFixed(2)}`, true)}
          {fundingAmt > 0 && line("Initial top-up", `${sym(currency)}${fundingAmt.toFixed(2)}`, true)}
          {fundingFee > 0 && line(`Funding fee (${schedule.funding_percentage}%)`, `${sym(currency)}${fundingFee.toFixed(2)}`, true)}
          {fxMarkup > 0 && line(`FX markup (${schedule.fx_markup_percentage}%)`, `${sym(currency)}${fxMarkup.toFixed(2)}`, true)}
          {line("Charged from your Ride X wallet", `₦${walletDebit.toLocaleString()}`)}
          <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/60">
            Then {sym(currency)}{schedule.maintenance_fee.toFixed(2)}/month maintenance and {schedule.transaction_percentage}% per purchase
            (minimum {sym(currency)}{schedule.min_transaction_fee.toFixed(2)}).
            {currency === "USD" && ` Dollar fees convert to naira at the current ${rate ? `₦${rate.toLocaleString()}/$1` : "live"} rate.`}
            {currency === "USD" && " No FX fee on dollar purchases from your dollar card — only when a conversion actually happens."}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full rounded-full h-11 font-semibold" disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : schedule ? `Confirm — ${sym(currency)}${fundingAmt > 0 ? (feeTotal + fundingAmt).toFixed(2) : feeTotal.toFixed(2)} from wallet` : "Request my card"}
      </Button>
    </form>
  );
}