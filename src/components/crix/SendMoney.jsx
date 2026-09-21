import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ShieldCheck, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { formatCrix, invokeCrix, newIdempotencyKey } from "@/lib/crix";

export default function SendMoney({ wallets, myEmail, onDone }) {
  const [step, setStep] = React.useState(1);
  const [recipient, setRecipient] = React.useState("");
  const [note, setNote] = React.useState("");
  const [currency, setCurrency] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [quote, setQuote] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const keyRef = React.useRef(newIdempotencyKey());

  const sendable = (wallets || []).filter((w) => w.status !== "frozen");
  const selfSend = !!myEmail && recipient.trim().toLowerCase() === myEmail.toLowerCase();

  const startAmountStep = () => {
    if (!recipient.trim()) return setError("Enter the recipient's email first.");
    setError("");
    if (!currency && sendable.length) setCurrency(sendable[0].currency);
    setStep(2);
  };

  const getQuote = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) return setError("Enter a valid amount.");
    setError(""); setBusy(true);
    try {
      const res = await invokeCrix({ action: "quote", currency, amount: amt });
      if (!res.available) {
        setError(res.reason || "Transfers are not yet enabled for " + currency + ".");
      } else {
        setQuote(res.quote);
        setStep(3);
      }
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const confirmSend = async () => {
    setError(""); setBusy(true);
    try {
      const res = await invokeCrix({
        action: "send",
        idempotency_key: keyRef.current,
        recipient_email: recipient.trim(),
        currency,
        amount: Number(amount),
        note,
      });
      setResult(res);
      setStep(4);
      onDone && onDone();
    } catch (e) {
      setError(e.message);
      keyRef.current = newIdempotencyKey();
    }
    setBusy(false);
  };

  const resetAll = () => {
    setStep(1); setRecipient(""); setNote(""); setAmount("");
    setQuote(null); setResult(null); setError("");
    keyRef.current = newIdempotencyKey();
  };

  return (
    <div className="max-w-xl mx-auto rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-1.5 mb-5">
        {[1, 2, 3].map((s) => (
          <div key={s} className={"h-1 flex-1 rounded-full " + (step >= s ? "bg-primary" : "bg-secondary")} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="crix-recipient">Who are you sending to?</Label>
            <Input
              id="crix-recipient" type="email" inputMode="email" placeholder="their@email.com"
              value={recipient} onChange={(e) => setRecipient(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              They need a CRIXCOIN account — money is never sent to a guessed recipient.
            </p>
            {selfSend && (
              <p className="text-[11px] text-primary mt-1.5">That's you — the transfer stays inside your own wallet (only the fee is charged).</p>
            )}
          </div>
          <div>
            <Label htmlFor="crix-note">Note (optional)</Label>
            <Input id="crix-note" maxLength={140} placeholder="e.g. Lunch money" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}
          <Button className="w-full rounded-full" onClick={startAmountStep}>Continue <ArrowRight className="w-4 h-4" /></Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <Label>From which wallet?</Label>
            <div className="flex flex-wrap gap-2">
              {sendable.length === 0 && <p className="text-sm text-muted-foreground">No sendable wallet — open one on the Wallets tab (a frozen wallet cannot send).</p>}
              {sendable.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setCurrency(w.currency)}
                  className={"rounded-full border px-4 py-2 text-sm font-semibold " + (currency === w.currency ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary")}
                >
                  {w.currency} · {formatCrix(w.available, w.currency)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="crix-amount">Amount</Label>
            <Input id="crix-amount" type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setStep(1)}>Back</Button>
            <Button className="flex-1 rounded-full" disabled={busy || !currency} onClick={getQuote}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get exact fee <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && quote && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border divide-y divide-border text-sm">
            <Row label="Recipient" value={recipient} />
            <Row label="They receive" value={formatCrix(quote.recipient_gets, currency)} strong />
            <Row label={"Crix fee"} value={formatCrix(quote.fee, currency) + " · " + (quote.fee_statement || "per live fee rule")} />
            <Row label="You pay (total debit)" value={formatCrix(quote.total_debit, currency)} strong />
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5">
            <p className="text-sm font-semibold flex items-center gap-1.5 text-primary"><ShieldCheck className="w-4 h-4" /> Crix Protected — what that really means</p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1">
              <li>· Session verified · recipient's account verified before anything moves</li>
              <li>· Funds are locked first — your balance can never go negative</li>
              <li>· Tapping Send twice never moves money twice</li>
              <li>· A permanent transaction record is kept for every transfer</li>
            </ul>
            <p className="text-[11px] text-muted-foreground mt-2">
              Crix Protection means your transfer is processed through verified systems. It is not deposit insurance and not a guarantee of the payment's outcome.
            </p>
          </div>
          {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setStep(2)} disabled={busy}>Back</Button>
            <Button className="flex-1 rounded-full" onClick={confirmSend} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Send {formatCrix(quote.total_debit, currency)}</>}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="text-center space-y-3 py-2">
          {result.held_for_review ? (
            <>
              <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
              <p className="font-heading font-bold text-lg">Held for review</p>
              <p className="text-sm text-muted-foreground">{result.message || "This transfer needs review — nothing has been debited."}</p>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
              <p className="font-heading font-bold text-lg">Sent</p>
              <p className="text-sm text-muted-foreground">
                {formatCrix(result.transaction.amount, result.transaction.currency)} to {result.transaction.recipient_email}
              </p>
            </>
          )}
          <p className="text-xs font-mono text-primary">{result.transaction?.crix_id}</p>
          <p className="text-[11px] text-muted-foreground">Track it any time in Activity — your permanent receipt is saved.</p>
          <Button variant="outline" className="rounded-full" onClick={resetAll}>Send another</Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={"text-right " + (strong ? "font-bold" : "")}>{value}</span>
    </div>
  );
}