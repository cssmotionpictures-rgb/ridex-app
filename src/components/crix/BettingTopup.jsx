import React from "react";
import { invokeCrixFunction, invokeCrix, newIdempotencyKey } from "@/lib/crix";
import PinDialog from "@/components/crix/PinDialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Trophy, BadgeCheck, RefreshCw } from "lucide-react";

const ngn = (v) => "₦" + Number(v || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
const QUICK_AMOUNTS = [200, 500, 1000, 2000, 5000];

export default function BettingTopup({ onChanged }) {
  const { toast } = useToast();
  const [state, setState] = React.useState("loading"); // loading | ready | activating | error
  const [providers, setProviders] = React.useState([]);
  const [provider, setProvider] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [validatedName, setValidatedName] = React.useState("");
  const [validating, setValidating] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [quote, setQuote] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [pinPrompt, setPinPrompt] = React.useState(null); // "set" | "verify"
  const [pinHas, setPinHas] = React.useState(false);
  const afterPin = React.useRef(null);

  React.useEffect(() => {
    invokeCrixFunction("crix-betting-topup", { action: "providers" })
      .then((d) => {
        const list = d.providers || [];
        setProviders(list);
        setState("ready");
        if (list.length) setProvider(list[0].name);
      })
      .catch(() => setState("activating"));
  }, []);

  React.useEffect(() => {
    if (!provider || !(Number(amount) > 0)) { setQuote(null); return; }
    const t = setTimeout(() => {
      invokeCrixFunction("crix-betting-topup", { action: "quote", provider, amount: Number(amount) })
        .then((d) => setQuote(d.quote)).catch(() => setQuote(null));
    }, 600);
    return () => clearTimeout(t);
  }, [provider, amount]);

  const validate = async () => {
    if (!provider || !customerId.trim()) return;
    setValidating(true); setValidatedName("");
    try {
      const d = await invokeCrixFunction("crix-betting-topup", { action: "validate", provider, customer_id: customerId.trim() });
      if (d.valid) setValidatedName(d.name || "Account confirmed");
      else toast({ title: "Could not confirm", description: d.reason, variant: "destructive" });
    } catch (e) {
      toast({ title: "Could not confirm", description: e.message, variant: "destructive" });
    }
    setValidating(false);
  };

  const doTopup = async (pin) => {
    if (!provider || !customerId.trim() || !(Number(amount) > 0) || busy) return;
    setBusy(true); setResult(null);
    try {
      const d = await invokeCrixFunction("crix-betting-topup", {
        action: "topup",
        bet_key: newIdempotencyKey(),
        provider,
        customer_id: customerId.trim(),
        amount: Number(amount),
        pin,
      });
      setResult(d);
      if (d.status === "paid") {
        toast({ title: "Top-up sent ✓", description: provider + " — " + ngn(d.amount_ngn) });
        setCustomerId(""); setAmount(""); setValidatedName(""); setQuote(null);
      }
      if (onChanged) onChanged();
    } catch (e) {
      toast({ title: "Top-up not completed", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  // TRANSACTION PIN — every betting top-up is confirmed by the customer's PIN
  const startTopup = async () => {
    if (!provider || !customerId.trim() || !(Number(amount) > 0) || busy) return;
    setBusy(true); setResult(null);
    try {
      const st = await invokeCrix({ action: "pin_status" });
      setPinHas(!!st.has_pin);
      afterPin.current = doTopup;
      setPinPrompt(st.has_pin ? "verify" : "set");
    } catch (e) {
      toast({ title: "Cannot start the top-up", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  const resolveStatus = async () => {
    if (!result || !result.bet_key || busy) return;
    setBusy(true);
    try {
      const d = await invokeCrixFunction("crix-betting-topup", { action: "resolve", bet_key: result.bet_key });
      setResult((prev) => ({ ...prev, ...d }));
      if (d.status === "paid") toast({ title: "Top-up sent ✓", description: "The provider confirmed your top-up." });
      if (d.status === "refunded") toast({ title: "Refunded", description: d.message || "Your wallet was refunded in full." });
      if (onChanged) onChanged();
    } catch (e) {
      toast({ title: "Still confirming", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  if (state === "loading") {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }
  if (state === "activating" || state === "error") {
    return (
      <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
        <p className="inline-flex items-center gap-2 font-semibold text-foreground"><Trophy className="w-4 h-4 text-primary" /> Betting top-ups</p>
        <p className="mt-1">Betting top-ups are being activated — they will be available here shortly. Nothing was charged.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Fund your betting wallet — Bet9ja, SportyBet, 1xBet, Betway, NairaBet and more, paid instantly from your wallet.</p>
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Betting site</label>
        <select value={provider} onChange={(e) => { setProvider(e.target.value); setValidatedName(""); }} className="w-full h-11 rounded-xl bg-secondary text-foreground px-3 text-sm border border-border">
          {providers.map((p) => <option key={p.code} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Betting account ID (customer ID)</label>
        <div className="flex gap-2">
          <input
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setValidatedName(""); }}
            placeholder="Enter your betting account ID"
            className="flex h-11 w-full rounded-xl bg-secondary px-3 text-sm border border-border placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button onClick={validate} disabled={validating || !customerId.trim()} className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 text-sm font-semibold bg-secondary text-foreground border border-border disabled:opacity-50 min-h-[36px]">
            {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
          </button>
        </div>
        {validatedName ? (
          <p className="text-xs text-emerald-400 mt-1.5 inline-flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" /> {validatedName}</p>
        ) : null}
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Amount</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          placeholder="Enter amount"
          className="flex h-11 w-full rounded-xl bg-secondary px-3 text-sm border border-border placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar">
          {QUICK_AMOUNTS.map((q) => (
            <button key={q} onClick={() => setAmount(String(q))} className="shrink-0 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground min-h-[28px]">{ngn(q)}</button>
          ))}
        </div>
      </div>
      {quote ? (
        <div className="rounded-xl bg-secondary/40 border border-border p-3 space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Top-up</span><span className="font-semibold">{ngn(quote.amount_ngn)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Fee ({quote.fee_statement})</span><span className="font-semibold">{ngn(quote.fee)}</span></div>
          <div className="flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">Total from wallet</span><span className="font-bold text-primary">{ngn(quote.total_debit)}</span></div>
        </div>
      ) : null}
      <button
        onClick={startTopup}
        disabled={busy || !provider || !customerId.trim() || !(Number(amount) > 0) || !quote}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 min-h-[44px]"
      >
        {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending…</span> : quote ? "Top up " + ngn(quote.total_debit) : "Enter an amount"}
      </button>
      <p className="text-[11px] text-muted-foreground">Paid instantly from your wallet — if a provider ever refuses a top-up, your wallet is refunded automatically.</p>

      {result ? (
        <div className={"rounded-3xl border p-5 " + (result.status === "paid" ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5")}>
          {result.status === "paid" ? (
            <>
              <p className="font-bold text-emerald-400 mb-1">Top-up sent ✓</p>
              <p className="text-sm">{result.provider || provider} — {ngn(result.amount_ngn)}</p>
              {result.customer_reference ? <p className="text-xs text-muted-foreground mt-0.5">Account {result.customer_reference}</p> : null}
            </>
          ) : result.status === "unknown" ? (
            <>
              <p className="font-bold text-amber-400 mb-1">Confirming your top-up</p>
              <p className="text-sm text-muted-foreground mb-3">{result.message || "The provider is confirming your top-up. Do not submit the same top-up again."}</p>
              <button onClick={resolveStatus} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-secondary border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 min-h-[36px]">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Check status
              </button>
            </>
          ) : (
            <>
              <p className="font-bold text-amber-400 mb-1">{result.status === "refunded" ? "Top-up returned" : "Top-up not completed"}</p>
              <p className="text-sm text-muted-foreground">{result.message || "The provider refused this top-up — your wallet was refunded in full."}</p>
            </>
          )}
        </div>
      ) : null}

      {pinPrompt ? (
        <PinDialog
          mode={pinPrompt}
          hasPin={pinHas}
          onDone={(pin) => { const run = afterPin.current; afterPin.current = null; setPinPrompt(null); if (run) run(pin); }}
          onClose={() => { afterPin.current = null; setPinPrompt(null); }}
        />
      ) : null}
    </div>
  );
}