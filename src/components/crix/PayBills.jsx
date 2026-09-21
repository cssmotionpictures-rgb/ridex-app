import React from "react";
import { base44 } from "@/api/base44Client";
import { invokeCrixFunction, invokeCrix, newIdempotencyKey } from "@/lib/crix";
import PinDialog from "@/components/crix/PinDialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Phone, Globe, Tv, Lightbulb, Ticket, GraduationCap, Trophy, Zap, BadgeCheck, RefreshCw } from "lucide-react";
import BillHistory from "@/components/crix/BillHistory";
import BettingTopup from "@/components/crix/BettingTopup";

const SECTIONS = [
  { id: "airtime", label: "Airtime", icon: Phone },
  { id: "data", label: "Data", icon: Globe },
  { id: "tv", label: "TV", icon: Tv },
  { id: "power", label: "Electricity", icon: Lightbulb },
  { id: "epin", label: "Recharge PINs", icon: Ticket },
  { id: "education", label: "Exams", icon: GraduationCap },
  { id: "betting", label: "Betting", icon: Trophy },
];

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000];
const ngn = (v) => "₦" + Number(v || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });

export default function PayBills({ user, onChanged }) {
  const { toast } = useToast();
  const [items, setItems] = React.useState(null);
  const [catalogError, setCatalogError] = React.useState("");
  const [balance, setBalance] = React.useState(null);
  const [section, setSection] = React.useState("airtime");
  const [provider, setProvider] = React.useState("");
  const [item, setItem] = React.useState(null);
  const [customer, setCustomer] = React.useState("");
  const [validatedName, setValidatedName] = React.useState("");
  const [validating, setValidating] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [meterType, setMeterType] = React.useState("prepaid");
  const [quote, setQuote] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [pinPrompt, setPinPrompt] = React.useState(null); // "set" | "verify"
  const [pinHas, setPinHas] = React.useState(false);
  const afterPin = React.useRef(null);

  React.useEffect(() => {
    invokeCrixFunction("crix-bill-payment", { action: "catalog" })
      .then((d) => setItems(d.items || []))
      .catch((e) => setCatalogError(e.message));
  }, []);

  React.useEffect(() => {
    const load = () => base44.entities.CrixWallet.filter({ user_id: user?.id, currency: "NGN" })
      .then((w) => setBalance((w || [])[0] || null)).catch(() => {});
    load();
    const unsub = base44.entities.CrixWallet.subscribe(load);
    return unsub;
  }, [user?.id]);

  const sectionItems = React.useMemo(() => (items || []).filter((i) => i.section === section), [items, section]);
  const providers = React.useMemo(() => {
    const map = new Map();
    for (const i of sectionItems) if (!map.has(i.provider)) map.set(i.provider, i.provider_name || i.provider);
    return [...map.entries()].map(([slug, name]) => ({ slug, name }));
  }, [sectionItems]);
  const providerItems = React.useMemo(() => sectionItems.filter((i) => i.provider === provider), [sectionItems, provider]);

  React.useEffect(() => {
    setProvider(providers.length ? providers[0].slug : "");
    setItem(null); setCustomer(""); setValidatedName(""); setQuote(null); setAmount(""); setResult(null);
    setQuantity("1");
  }, [section, items]);

  React.useEffect(() => {
    setItem(providerItems.length === 1 ? providerItems[0] : null);
    setValidatedName(""); setQuote(null);
  }, [provider, providerItems]);

  const payable = React.useMemo(() => {
    if (!item) return 0;
    if (item.fixed) return Number(item.amount) * (section === "epin" ? Math.max(1, Number(quantity) || 1) : 1);
    return Number(amount) || 0;
  }, [item, section, quantity, amount]);

  React.useEffect(() => {
    if (!item || !(payable > 0)) { setQuote(null); return; }
    const t = setTimeout(() => {
      invokeCrixFunction("crix-bill-payment", { action: "quote", amount_ngn: payable, section, provider: item.provider })
        .then((d) => setQuote(d.quote)).catch(() => setQuote(null));
    }, 600);
    return () => clearTimeout(t);
  }, [item, payable, section]);

  const validate = async () => {
    if (!item || !item.verifiable || !customer.trim() || validating) return;
    setValidating(true); setValidatedName("");
    try {
      const d = await invokeCrixFunction("crix-bill-payment", {
        action: "validate", section, provider: item.provider, item_code: item.code,
        customer: customer.trim(), meter_type: meterType,
      });
      if (d.valid) setValidatedName(d.name || "Confirmed");
      else toast({ title: "Could not confirm", description: d.reason, variant: "destructive" });
    } catch (e) {
      toast({ title: "Could not confirm", description: e.message, variant: "destructive" });
    }
    setValidating(false);
  };

  const doPay = async (pin) => {
    if (!item || !(payable > 0) || busy) return;
    setBusy(true); setResult(null);
    try {
      const d = await invokeCrixFunction("crix-bill-payment", {
        action: "pay",
        bill_key: newIdempotencyKey(),
        section, provider: item.provider, item_code: item.code,
        customer_reference: customer.trim(),
        customer_name: validatedName,
        amount_ngn: payable,
        quantity: Math.max(1, Number(quantity) || 1),
        meter_type: meterType,
        pin,
      });
      setResult(d);
      if (d.status === "paid") {
        toast({ title: "Bill paid ✓", description: item.name + " — " + ngn(d.amount_ngn) });
        setCustomer(""); setAmount(""); setValidatedName(""); setQuote(null);
      }
      if (onChanged) onChanged();
    } catch (e) {
      toast({ title: "Payment not completed", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  // TRANSACTION PIN — every purchase is confirmed by the customer's own PIN
  // before any money moves
  const startPay = async () => {
    if (!item || !(payable > 0) || busy) return;
    setBusy(true); setResult(null);
    try {
      const st = await invokeCrix({ action: "pin_status" });
      setPinHas(!!st.has_pin);
      afterPin.current = doPay;
      setPinPrompt(st.has_pin ? "verify" : "set");
    } catch (e) {
      toast({ title: "Cannot start the payment", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  const resolveStatus = async () => {
    if (!result || !result.bill_key || busy) return;
    setBusy(true);
    try {
      const d = await invokeCrixFunction("crix-bill-payment", { action: "resolve", bill_key: result.bill_key });
      setResult((prev) => ({ ...prev, ...d }));
      if (d.status === "paid") toast({ title: "Bill paid ✓", description: "The biller confirmed your payment." });
      if (d.status === "refunded") toast({ title: "Refunded", description: d.message || "Your wallet was refunded in full." });
      if (onChanged) onChanged();
    } catch (e) {
      toast({ title: "Still confirming", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  if (catalogError) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-6">
        <div className="flex items-center gap-2 mb-2"><Zap className="w-4 h-4 text-primary" /><h3 className="font-semibold">Pay bills instantly</h3></div>
        <p className="text-sm text-muted-foreground">{catalogError}</p>
      </div>
    );
  }

  const customerRequired = item && item.label && String(item.label).indexOf("optional") === -1 && section !== "epin";
  const charge = quote ? Number(quote.provider_charge) || 0 : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Pay bills instantly</h3>
          {balance ? <span className="ml-auto text-xs text-muted-foreground">Wallet: {ngn(balance.available)}</span> : null}
        </div>

        {!items ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const on = section === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSection(s.id)}
                    className={"inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap min-h-[36px] " + (on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
                  >
                    <Icon className="w-4 h-4" /> {s.label}
                  </button>
                );
              })}
            </div>

            {section === "betting" ? (
              <BettingTopup onChanged={onChanged} />
            ) : !providers.length ? (
              <p className="text-sm text-muted-foreground">No providers available for this category right now — please check back shortly.</p>
            ) : (
              <div className="space-y-3">
                {providers.length > 1 ? (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">{section === "epin" ? "Network" : section === "education" ? "Exam" : "Provider"}</label>
                    <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full h-11 rounded-xl bg-secondary text-foreground px-3 text-sm border border-border">
                      {providers.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                    </select>
                  </div>
                ) : null}

                {providerItems.length > 1 ? (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Package</label>
                    <select value={item ? item.code : ""} onChange={(e) => setItem(providerItems.find((x) => x.code === e.target.value) || null)} className="w-full h-11 rounded-xl bg-secondary text-foreground px-3 text-sm border border-border">
                      <option value="">Choose a package…</option>
                      {providerItems.map((x) => <option key={x.code} value={x.code}>{x.name}{x.amount > 0 ? " — " + ngn(x.amount) : ""}</option>)}
                    </select>
                  </div>
                ) : null}

                {item && section === "epin" ? (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Quantity</label>
                    <input
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                      inputMode="numeric"
                      className="flex h-11 w-full rounded-xl bg-secondary px-3 text-sm border border-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                ) : null}

                {item && item.meter_types ? (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Meter type</label>
                    <div className="flex gap-1.5">
                      {item.meter_types.map((mt) => (
                        <button key={mt} onClick={() => setMeterType(mt)} className={"rounded-full px-4 py-2 text-sm font-semibold capitalize min-h-[36px] " + (meterType === mt ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{mt}</button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {item && item.label && customerRequired ? (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">{item.label}</label>
                    <div className="flex gap-2">
                      <input
                        value={customer}
                        onChange={(e) => { setCustomer(e.target.value); setValidatedName(""); }}
                        placeholder={"Enter " + item.label.toLowerCase()}
                        className="flex h-11 w-full rounded-xl bg-secondary px-3 text-sm border border-border placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <button onClick={validate} disabled={validating || !customer.trim()} className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 text-sm font-semibold bg-secondary text-foreground border border-border disabled:opacity-50 min-h-[36px]">
                        {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                      </button>
                    </div>
                    {validatedName ? (
                      <p className="text-xs text-emerald-400 mt-1.5 inline-flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" /> {validatedName}</p>
                    ) : null}
                  </div>
                ) : item && item.label ? (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">{item.label}</label>
                    <input
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                      placeholder="Optional"
                      className="flex h-11 w-full rounded-xl bg-secondary px-3 text-sm border border-border placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                ) : null}

                {item && !item.fixed ? (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Amount</label>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      inputMode="decimal"
                      placeholder={item.min ? "Between " + ngn(item.min) + " and " + ngn(item.max) : "Enter amount"}
                      className="flex h-11 w-full rounded-xl bg-secondary px-3 text-sm border border-border placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <div className="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar">
                      {QUICK_AMOUNTS.map((q) => (
                        <button key={q} onClick={() => setAmount(String(q))} className="shrink-0 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground min-h-[28px]">{ngn(q)}</button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {quote && payable > 0 ? (
                  <div className="rounded-xl bg-secondary/40 border border-border p-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Bill</span><span className="font-semibold">{ngn(payable)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Fee ({quote.fee_statement})</span><span className="font-semibold">{ngn(quote.fee)}</span></div>
                    {charge > 0 ? (
                      <div className="flex justify-between"><span className="text-muted-foreground">Electricity network charge</span><span className="font-semibold">{ngn(charge)}</span></div>
                    ) : null}
                    <div className="flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">Total from wallet</span><span className="font-bold text-primary">{ngn(quote.total_debit)}</span></div>
                  </div>
                ) : null}

                <button
                  onClick={startPay}
                  disabled={busy || !item || !(payable > 0) || (customerRequired && !customer.trim())}
                  className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 min-h-[44px]"
                >
                  {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Paying…</span> : "Pay " + (quote && payable > 0 ? ngn(quote.total_debit) : "now")}
                </button>
                <p className="text-[11px] text-muted-foreground">Paid instantly from your wallet — if a biller ever refuses a payment, your wallet is refunded automatically.</p>
              </div>
            )}
          </>
        )}
      </div>

      {result ? (
        <div className={"rounded-3xl border p-5 " + (result.status === "paid" ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5")}>
          {result.status === "paid" ? (
            <>
              <p className="font-bold text-emerald-400 mb-1">Bill paid ✓</p>
              <p className="text-sm">{result.biller_name || item?.name} — {ngn(result.amount_ngn || payable)}</p>
              {result.customer_reference ? <p className="text-xs text-muted-foreground mt-0.5">{result.customer_reference}</p> : null}
              {result.token ? (
                <div className="mt-3 rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-semibold mb-1.5">Your electricity token</p>
                  <p className="font-mono text-sm break-all">{result.token}</p>
                  {result.units ? <p className="text-xs text-muted-foreground mt-1">{result.units} kWh</p> : null}
                </div>
              ) : null}
              {result.pins && result.pins.length ? (
                <div className="mt-3 rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-semibold mb-1.5">Your recharge PINs</p>
                  {result.pins.map((p, i) => (
                    <p key={i} className="font-mono text-sm">{typeof p === "string" ? p : (p.pin || p.code || JSON.stringify(p))}{typeof p === "object" && p.serial ? " · " + p.serial : ""}</p>
                  ))}
                </div>
              ) : null}
            </>
          ) : result.status === "unknown" ? (
            <>
              <p className="font-bold text-amber-400 mb-1">Confirming your payment</p>
              <p className="text-sm text-muted-foreground mb-3">{result.message || "The biller network is confirming your payment. Do not pay the same bill again."}</p>
              <button onClick={resolveStatus} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-secondary border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 min-h-[36px]">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Check status
              </button>
            </>
          ) : (
            <>
              <p className="font-bold text-amber-400 mb-1">{result.status === "refunded" ? "Payment returned" : "Payment not completed"}</p>
              <p className="text-sm text-muted-foreground">{result.message || "The biller refused this payment — your wallet was refunded in full."}</p>
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

      <BillHistory />
    </div>
  );
}