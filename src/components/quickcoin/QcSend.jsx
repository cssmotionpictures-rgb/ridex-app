import React from "react";
import { invokeCrix, newIdempotencyKey } from "@/lib/crix";
import { formatCrxs, isHandle, isEmail, normalizeHandle } from "@/lib/quickcoin";
import { Loader2, Zap, ShieldCheck } from "lucide-react";

// SEND CRXS — the fee is quoted from the active rule BEFORE the user confirms,
// the exact quoted total is what moves, and one idempotency key means a double
// click or a retry can never create a second transfer.
export default function QcSend({ wallet, onDone }) {
  const [recipient, setRecipient] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [quote, setQuote] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");
  const idemRef = React.useRef(null);

  const valid = (isHandle(recipient) || isEmail(recipient)) && Number(amount) > 0;

  const getQuote = async () => {
    if (!Number(amount)) return;
    setError(""); setResult(null); setQuote(null);
    try {
      const q = await invokeCrix({ action: "quote", currency: "CRXS", amount: Number(amount) });
      if (!q.available) { setError(q.reason || "CRIXCOIN transfers are not enabled right now."); return; }
      setQuote(q.quote);
    } catch (e) { setError(e.message); }
  };

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true); setError("");
    if (!idemRef.current) idemRef.current = newIdempotencyKey();
    try {
      const res = await invokeCrix({
        action: "send", currency: "CRXS", amount: Number(amount),
        recipient: isHandle(recipient) ? normalizeHandle(recipient) : recipient.trim(),
        idempotency_key: idemRef.current,
      });
      setResult(res);
      setRecipient(""); setAmount(""); setQuote(null); idemRef.current = null;
      if (onDone) onDone();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <p className="text-xs text-muted-foreground">Available: <span className="text-foreground font-semibold">{formatCrxs(wallet?.balance_crxs)}</span></p>
      <input value={recipient} onChange={(e) => { setRecipient(e.target.value); setQuote(null); }}
        placeholder="@handle or email" className="w-full h-10 rounded-xl border border-input bg-transparent px-3 text-sm" />
      <input value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, "")); setQuote(null); }}
        inputMode="decimal" placeholder="Amount in CRXS" className="w-full h-10 rounded-xl border border-input bg-transparent px-3 text-sm" />
      {!quote && (
        <button onClick={getQuote} disabled={!Number(amount) || busy} className="w-full h-10 rounded-full bg-secondary text-foreground text-sm font-semibold disabled:opacity-50">
          Check fee
        </button>
      )}
      {quote && (
        <div className="rounded-xl bg-secondary/40 p-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Recipient gets</span><span className="font-semibold">{formatCrxs(quote.recipient_gets)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">CRIXCOIN fee</span><span className="font-semibold">{formatCrxs(quote.fee)}</span></div>
          <div className="flex justify-between border-t border-border/50 pt-1.5"><span className="text-muted-foreground">Total deducted</span><span className="font-bold text-primary">{formatCrxs(quote.total_debit)}</span></div>
          <p className="text-[10px] text-muted-foreground pt-1">Instant CRIXCOIN transfer. The fee can never increase after you confirm.</p>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={send} disabled={!valid || !quote || busy}
        className="w-full h-11 rounded-full bg-primary text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Zap className="w-4 h-4" /> Confirm & Send</>}
      </button>
      {result && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm space-y-1">
          <p className="font-bold text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> {formatCrxs(result.transaction.amount)} sent</p>
          <p className="text-xs text-muted-foreground">Fee: {formatCrxs(result.transaction.fee_total)} · Ref: {result.transaction.crix_id}</p>
          {result.idempotent && <p className="text-[11px] text-amber-300">Duplicate request — the original transfer was returned. Nothing moved twice.</p>}
          {typeof result.sender_balance !== "undefined" && <p className="text-xs text-muted-foreground">New balance: {formatCrxs(result.sender_balance)}</p>}
        </div>
      )}
    </div>
  );
}