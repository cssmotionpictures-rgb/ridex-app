import React from "react";
import { invokeCrixFunction, newIdempotencyKey } from "@/lib/crix";
import { useToast } from "@/components/ui/use-toast";
import PinDialog from "@/components/crix/PinDialog";
import { Loader2, Plus, BadgeCheck } from "lucide-react";

const MIN_USD = 10;
const MAX_USD = 500;
const field = "flex h-11 w-full rounded-xl bg-secondary border border-border px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const ngn = (v) => "₦" + Number(v || 0).toLocaleString("en-NG");

// Top up an existing dollar card from the Naira wallet — live rate, transparent
// fee, PIN-confirmed, atomic debit on the secured server.
export default function DollarCardTopUpDialog({ card, onClose, onChanged }) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState("10");
  const [quote, setQuote] = React.useState(null);
  const [pinMode, setPinMode] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);

  const fetchQuote = async () => {
    const usdAmount = Number(amount);
    if (!(usdAmount >= MIN_USD) || usdAmount > MAX_USD) {
      toast({ title: "Invalid amount", description: "Top-ups must be between $10 and $500.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const d = await invokeCrixFunction("crix-dollar-card", { action: "quote", funding_usd: usdAmount, kind: "fund" });
      setQuote(d.quote);
    } catch (e) {
      toast({ title: "Could not price the top-up", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  const submitFund = async (pin) => {
    setBusy(true);
    try {
      const d = await invokeCrixFunction("crix-dollar-card", {
        action: "fund",
        fund_key: newIdempotencyKey(),
        card_key: card.card_key,
        amount_usd: Number(amount),
        pin,
      });
      setDone(d);
      onChanged && onChanged();
    } catch (e) {
      const msg = String(e.message || e);
      if (/create your crixcoin transaction pin/i.test(msg)) {
        setPinMode("set");
        setBusy(false);
        return;
      }
      toast({ title: "Top-up failed", description: msg, variant: "destructive" });
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-3" onClick={onClose}>
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center" onClick={(e) => e.stopPropagation()}>
          <BadgeCheck className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold">Top-up submitted</h3>
          <p className="text-sm text-muted-foreground mt-2">
            ${done.amount_usd.toLocaleString()} is loading onto {card.masked_pan || "your card"} for {ngn(done.total_debit_ngn)}.
            {done.card_balance_usd !== null && done.card_balance_usd !== undefined ? " Card balance: $" + Number(done.card_balance_usd).toLocaleString() + "." : ""}
          </p>
          <button onClick={onClose} className="mt-5 w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold min-h-[44px]">Done</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-3" onClick={onClose}>
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-1">
            <Plus className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Top up {card.masked_pan || "your dollar card"}</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Paid from your Naira wallet at the live rate.</p>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Amount to add (USD)</label>
              <input className={field + " mt-1"} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(null); }} placeholder="10" />
              <p className="text-[11px] text-muted-foreground mt-1.5 rounded-xl bg-secondary/50 border border-border px-3 py-2">
                💡 Top up just what you need for this purchase — small loads, quick spends. Whatever you are not using yet stays in your CRIXCOIN wallet, ready whenever you need it again.
              </p>
            </div>
            <button onClick={fetchQuote} disabled={busy} className="w-full h-11 rounded-xl bg-secondary border border-border text-sm font-semibold disabled:opacity-50 min-h-[44px]">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "See the exact charge"}
            </button>
            {quote ? (
              <div className="rounded-2xl border border-border bg-secondary/50 p-4 text-xs space-y-1.5">
                <p className="flex justify-between"><span className="text-muted-foreground">Top-up</span><span className="font-semibold">${quote.funding_usd.toLocaleString()}</span></p>
                <p className="flex justify-between"><span className="text-muted-foreground">Live rate</span><span className="font-semibold">₦{quote.fx_rate.toLocaleString()} / $1</span></p>
                <p className="flex justify-between"><span className="text-muted-foreground">Cost</span><span className="font-semibold">{ngn(quote.ngn_cost)}</span></p>
                <p className="flex justify-between"><span className="text-muted-foreground">Funding fee</span><span className="font-semibold">{ngn(quote.olaform_fee)}</span></p>
                <p className="flex justify-between border-t border-border pt-1.5"><span className="font-semibold">Total from wallet</span><span className="font-bold text-primary">{ngn(quote.total_debit_ngn)}</span></p>
              </div>
            ) : null}
            <button onClick={() => setPinMode("verify")} disabled={busy || !quote} className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 min-h-[44px]">
              Continue to PIN
            </button>
          </div>
        </div>
      </div>

      {pinMode ? (
        <PinDialog
          mode={pinMode}
          hasPin={pinMode === "set"}
          onDone={(pin) => { setPinMode(null); submitFund(pin); }}
          onClose={() => setPinMode(null)}
        />
      ) : null}
    </>
  );
}