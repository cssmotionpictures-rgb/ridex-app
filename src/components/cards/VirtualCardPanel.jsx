import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CardFace from "@/components/card/CardFace";
import { money } from "@/lib/pricing";
import { fundVirtualCard, setVirtualCardStatus, setCardMonthlyLimit, setCardBalanceThreshold, getCardFeeConfig } from "@/lib/virtualCards";
import { BellRing, Eye, EyeOff, Gauge, Loader2, Plus, Snowflake, Sun } from "lucide-react";

const pad2 = (n) => String(n).padStart(2, "0");

export default function VirtualCardPanel({ card, wallet, spentThisMonth = 0, onChanged }) {
  const [flipped, setFlipped] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [limitInput, setLimitInput] = React.useState("");
  const [thresholdInput, setThresholdInput] = React.useState("");
  const [fees, setFees] = React.useState(null);

  React.useEffect(() => {
    getCardFeeConfig().then(setFees).catch(() => {});
  }, []);

  const bin = (card.card_number || "").slice(0, 4) || "5399";
  const masked = `${bin} **** **** ${card.card_last4}`;
  const exp = card.expiry_month ? `${pad2(card.expiry_month)}/${String(card.expiry_year).slice(-2)}` : "—";
  const frozen = card.status === "frozen";
  const walletBal = wallet?.balance || 0;

  const fund = async () => {
    setErr("");
    const n = Math.round(Number(amount));
    if (!n || n <= 0) { setErr(card.currency === "USD" ? "Enter a valid amount in $" : "Enter a valid amount in ₦"); return; }
    setBusy("fund");
    try {
      await fundVirtualCard(card.id, n);
      setAmount("");
      onChanged();
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  const toggleFreeze = async () => {
    setErr("");
    setBusy("freeze");
    try {
      await setVirtualCardStatus(card.id, frozen ? "unfreeze" : "freeze");
      onChanged();
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  const saveLimit = async () => {
    setErr("");
    const n = Math.round(Number(limitInput));
    if (!Number.isFinite(n) || n <= 0) { setErr("Enter a valid monthly limit above zero"); return; }
    setBusy("limit");
    try {
      await setCardMonthlyLimit(card.id, n);
      setLimitInput("");
      onChanged();
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  const removeLimit = async () => {
    setErr("");
    setBusy("limit");
    try {
      await setCardMonthlyLimit(card.id, 0);
      onChanged();
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  const saveThreshold = async () => {
    setErr("");
    const n = Math.round(Number(thresholdInput));
    if (!Number.isFinite(n) || n <= 0) { setErr("Enter a valid alert level above zero"); return; }
    setBusy("threshold");
    try {
      await setCardBalanceThreshold(card.id, n);
      setThresholdInput("");
      onChanged();
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  const removeThreshold = async () => {
    setErr("");
    setBusy("threshold");
    try {
      await setCardBalanceThreshold(card.id, 0);
      onChanged();
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      {/* Card face */}
      <div className="flex flex-col items-center">
        <div onClick={() => setFlipped((f) => !f)} className="relative w-full max-w-sm cursor-pointer select-none" style={{ aspectRatio: "1.586" }}>
          <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transition: "transform .6s ease", transform: flipped ? "rotateY(180deg)" : "none", opacity: frozen ? 0.65 : 1 }}>
            <CardFace card={card} side="front" />
            <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
              <CardFace card={card} side="back" />
            </div>
          </div>
          {frozen && (
            <div className="absolute inset-0 rounded-3xl flex items-center justify-center bg-black/45 backdrop-blur-[1px] z-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500/20 text-sky-200 text-xs font-semibold">
                <Snowflake className="w-3.5 h-3.5" /> Frozen
              </span>
            </div>
          )}
        </div>
        <button onClick={() => setFlipped((f) => !f)} className="mt-4 text-xs text-muted-foreground hover:text-primary transition-colors">
          Tap card to flip
        </button>
      </div>

      {/* Controls */}
      <div className="space-y-6">
        <div className="glass rounded-3xl p-6 border border-border/60 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Card balance</p>
              <p className="text-4xl font-extrabold gold-text">{money(card.balance || 0, card.currency || "NGN")}</p>
            </div>
            <button onClick={() => setRevealed((r) => !r)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-primary transition-colors">
              {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {revealed ? "Hide details" : "Reveal details"}
            </button>
          </div>

          <div className={`rounded-2xl bg-secondary p-4 space-y-2 font-mono text-sm transition-opacity ${revealed ? "" : "opacity-40"}`}>
            <div className="flex justify-between"><span className="text-muted-foreground">Number</span><span className="tracking-wider">{revealed ? (card.card_number || masked) : masked}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Expiry</span><span>{revealed ? exp : "••/••"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">CVV</span><span>{revealed ? (card.cvv || "—") : "•••"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Wallet balance</span><span>{money(walletBal, "NGN")}</span></div>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <Button variant={frozen ? "default" : "outline"} className="rounded-full w-full" disabled={busy === "freeze"} onClick={toggleFreeze}>
            {busy === "freeze" ? <Loader2 className="w-4 h-4 animate-spin" /> : frozen ? <Sun className="w-4 h-4 mr-1" /> : <Snowflake className="w-4 h-4 mr-1" />}
            {frozen ? "Unfreeze card" : "Freeze card"}
          </Button>
        </div>

        <div className="glass rounded-3xl p-6 border border-border/60 space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            <h2 className="font-heading font-bold text-lg">Transfer from wallet</h2>
          </div>
          <div className="flex gap-2">
            <Input
              className="rounded-xl"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={card.currency === "USD" ? "Amount in $" : "Amount in ₦"}
            />
            <Button className="rounded-full px-6" disabled={busy === "fund"} onClick={fund}>
              {busy === "fund" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Transfer"}
            </Button>
          </div>
          {(card.currency === "USD" ? [10, 25, 50] : [1000, 5000, 10000]).filter((q) => card.currency === "USD" || walletBal >= q).map((q) => (
            <button key={q} onClick={() => setAmount(String(q))} className="mr-2 px-3 py-1 rounded-full text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
              {card.currency === "USD" ? "$" : "₦"}{q.toLocaleString()}
            </button>
          ))}
          {!wallet && <p className="text-xs text-amber-300/80">You need a Ride X wallet first — create one on the Card page.</p>}
          {wallet && <p className="text-xs text-muted-foreground">Instantly moves money from your Ride X wallet to this card.</p>}
          {/* Transparent fee breakdown — the exact schedule the backend charges */}
          {amount && fees?.fees?.[card.currency] && (
            <div className="rounded-2xl bg-secondary p-4 space-y-1.5">
              {(() => {
                const s = fees.fees[card.currency];
                const n = Math.round(Number(amount)) || 0;
                const fee = Math.round(n * (s.funding_percentage / 100) * 100) / 100;
                const fx = card.currency === "USD" ? Math.round(n * (s.fx_markup_percentage / 100) * 100) / 100 : 0;
                const rate = fees.usd_ngn_rate || 0;
                const debit = card.currency === "USD" ? Math.round((n + fee + fx) * rate) : Math.round(n + fee);
                return (
                  <>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Top-up</span><span>{card.currency === "USD" ? "$" : "₦"}{n.toLocaleString()}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Platform funding fee ({s.funding_percentage}%)</span><span>{card.currency === "USD" ? "$" : "₦"}{fee.toFixed(2)}</span></div>
                    {fx > 0 && (
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">FX markup ({s.fx_markup_percentage}%)</span><span>${fx.toFixed(2)}</span></div>
                    )}
                    <div className="flex justify-between text-xs font-semibold"><span>Wallet debit</span><span>₦{debit.toLocaleString()}{card.currency === "USD" && rate ? ` (at ₦${rate.toLocaleString()}/$1)` : ""}</span></div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div className="glass rounded-3xl p-6 border border-border/60 space-y-4">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            <h2 className="font-heading font-bold text-lg">Monthly spending limit</h2>
          </div>
          {card.monthly_limit > 0 ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Spent this month</span>
                <span>
                  {money(spentThisMonth, card.currency)} of {money(card.monthly_limit, card.currency)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (spentThisMonth / card.monthly_limit) * 100)}%`,
                    background:
                      spentThisMonth >= card.monthly_limit
                        ? "hsl(var(--destructive))"
                        : "linear-gradient(90deg,#ffe9a8,#f7c948)",
                  }}
                />
              </div>
              {spentThisMonth >= card.monthly_limit ? (
                <p className="text-xs text-destructive">Limit reached — the card freezes itself automatically.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The card freezes itself automatically once monthly spending reaches this limit.
                </p>
              )}
              <button
                onClick={removeLimit}
                className="text-xs text-muted-foreground underline hover:text-foreground"
                disabled={busy === "limit"}
              >
                Remove limit
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Set a monthly cap — the card freezes itself automatically once spending reaches it.
            </p>
          )}
          <div className="flex gap-2">
            <Input
              className="rounded-xl"
              type="number"
              min="1"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              placeholder={card.currency === "USD" ? "Monthly limit in $" : "Monthly limit in ₦"}
            />
            <Button variant="outline" className="rounded-full px-6 shrink-0" disabled={busy === "limit"} onClick={saveLimit}>
              {busy === "limit" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>

        <div className="glass rounded-3xl p-6 border border-border/60 space-y-4">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-primary" />
            <h2 className="font-heading font-bold text-lg">Low balance alert</h2>
          </div>
          {card.low_balance_threshold > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                You'll get an email the moment this card's balance drops below{" "}
                <span className="text-foreground font-semibold">{money(card.low_balance_threshold, card.currency)}</span>.
              </p>
              <button
                onClick={removeThreshold}
                className="text-xs text-muted-foreground underline hover:text-foreground"
                disabled={busy === "threshold"}
              >
                Turn off alert
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Set a balance level — we'll email you as soon as the card drops below it.
            </p>
          )}
          <div className="flex gap-2">
            <Input
              className="rounded-xl"
              type="number"
              min="1"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              placeholder={card.currency === "USD" ? "Alert me below ($)" : "Alert me below (₦)"}
            />
            <Button variant="outline" className="rounded-full px-6 shrink-0" disabled={busy === "threshold"} onClick={saveThreshold}>
              {busy === "threshold" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}