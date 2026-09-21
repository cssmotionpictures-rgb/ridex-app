import React from "react";
import { base44 } from "@/api/base44Client";
import { invokeCrixFunction, newIdempotencyKey } from "@/lib/crix";
import { useToast } from "@/components/ui/use-toast";
import PinDialog from "@/components/crix/PinDialog";
import { Loader2, CreditCard, Upload, BadgeCheck } from "lucide-react";

const ID_TYPES = [
  { value: "nin", label: "NIN (National Identity Number)" },
  { value: "vnin", label: "Virtual NIN" },
  { value: "bvn", label: "BVN" },
  { value: "passport", label: "International Passport" },
  { value: "drivers_license", label: "Driver's Licence" },
  { value: "voters_card", label: "Voter's Card" },
];

const MIN_USD = 10;
const MAX_USD = 500;

const field = "flex h-11 w-full rounded-xl bg-secondary border border-border px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// Get a CRIXCOIN dollar card: choose the funding amount, complete the card
// network's one-time identity review if needed, confirm with the transaction
// PIN — the secured server issues the card and debits the wallet atomically.
export default function IssueDollarCardDialog({ user, kycStatus, onClose, onChanged }) {
  const { toast } = useToast();
  const cardKey = React.useRef(newIdempotencyKey());
  const [amount, setAmount] = React.useState("10");
  const [name, setName] = React.useState(user?.full_name || "");
  const [quote, setQuote] = React.useState(null);
  const [step, setStep] = React.useState("form"); // form | kyc
  const [pinMode, setPinMode] = React.useState(null); // null | verify | set
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const [kycForm, setKycForm] = React.useState({
    first_name: "", last_name: "", id_type: "nin", id_number: "",
    phone_number: "", dial_code: "+234", date_of_birth: "",
    line1: "", city: "", state: "", postal_code: "", country: "NGA", id_front_image: "",
  });

  const ngn = (v) => "₦" + Number(v || 0).toLocaleString("en-NG");

  const fetchQuote = async () => {
    const usdAmount = Number(amount);
    if (!(usdAmount >= MIN_USD) || usdAmount > MAX_USD) {
      toast({ title: "Invalid amount", description: "Card funding must be between $10 and $500.", variant: "destructive" });
      return;
    }
    if (!name.trim()) {
      toast({ title: "Card name needed", description: "Enter the name to print on your card.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const d = await invokeCrixFunction("crix-dollar-card", { action: "quote", funding_usd: usdAmount, kind: "issue" });
      setQuote(d.quote);
    } catch (e) {
      toast({ title: "Could not price the card", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  const submitIssue = async (pin, kyc) => {
    setBusy(true);
    try {
      const d = await invokeCrixFunction("crix-dollar-card", {
        action: "issue",
        card_key: cardKey.current,
        funding_usd: Number(amount),
        name: name.trim(),
        pin: pin || "",
        ...(kyc ? { kyc } : {}),
      });
      if (d.kyc_submitted) {
        setDone({ kyc_submitted: true });
      } else if (d.kyc_required) {
        setStep("kyc");
        setBusy(false);
        return;
      } else if (d.status === "issued" || d.status === "active" || d.idempotent) {
        setDone(d);
        onChanged && onChanged();
      } else {
        throw new Error("Unexpected response from the card service.");
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (/create your crixcoin transaction pin/i.test(msg)) {
        setPinMode("set");
        setBusy(false);
        return;
      }
      toast({ title: "Card not issued", description: msg, variant: "destructive" });
    }
    setBusy(false);
  };

  const continueFromForm = () => {
    if (!quote) { fetchQuote(); return; }
    if (kycStatus === "approved") setPinMode("verify");
    else submitIssue(""); // resolves identity first — charges nothing before approval
  };

  const uploadId = async (file) => {
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      setKycForm((f) => ({ ...f, id_front_image: file_uri }));
      toast({ title: "ID uploaded", description: "Your ID is stored privately and sent only to the card network." });
    } catch (e) {
      toast({ title: "Upload failed", description: String(e.message || e), variant: "destructive" });
    }
    setUploading(false);
  };

  const submitKyc = async () => {
    const f = kycForm;
    const missing = ["first_name", "last_name", "id_type", "id_number", "phone_number", "dial_code", "date_of_birth", "line1", "city", "state", "postal_code", "country"].find((k) => !String(f[k] || "").trim());
    if (missing || !f.id_front_image) {
      toast({ title: "Incomplete details", description: "Fill in every identity field and upload a clear photo of the front of your ID.", variant: "destructive" });
      return;
    }
    await submitIssue("", f);
  };

  const setK = (k) => (e) => setKycForm((f) => ({ ...f, [k]: e.target.value }));

  // ---- success / KYC-submitted view ----
  if (done) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-3" onClick={onClose}>
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center" onClick={(e) => e.stopPropagation()}>
          <BadgeCheck className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          {done.kyc_submitted ? (
            <>
              <h3 className="text-lg font-bold">Identity review submitted</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Nothing was charged. The card network is reviewing your identity — come back and finish your card the moment it is approved.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold">Your dollar card is ready 🎉</h3>
              <p className="text-sm text-muted-foreground mt-2">
                {done.masked_pan || "Your card"} · funded ${Number(amount).toLocaleString()} for {ngn(done.total_debit_ngn)}.
              </p>
              <p className="text-xs text-muted-foreground mt-1">Full card details are in your Dollar Card list — tap Details.</p>
            </>
          )}
          <button onClick={onClose} className="mt-5 w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold min-h-[44px]">Done</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-3" onClick={onClose}>
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">{step === "kyc" ? "One-time identity review" : "Get your dollar card"}</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {step === "kyc"
              ? "The card network requires a one-time identity check before your first card. Nothing is charged for this review."
              : "A virtual Visa card funded from your Naira wallet at the live rate."}
          </p>

          {step === "form" ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Amount to load (USD)</label>
                <input className={field + " mt-1"} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(null); }} placeholder="10" />
                <p className="text-[11px] text-muted-foreground mt-1.5 rounded-xl bg-secondary/50 border border-border px-3 py-2">
                  💡 Load only what you plan to spend right away — think of it as topping up for this shopping trip, not a savings account. Money you are not using yet stays safer in your CRIXCOIN wallet, where it is always yours to spend, top up again in seconds, or pull back any time.
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Name on card</label>
                <input className={field + " mt-1"} value={name} onChange={(e) => { setName(e.target.value); setQuote(null); }} placeholder="e.g. John Doe" />
              </div>
              <button onClick={fetchQuote} disabled={busy} className="w-full h-11 rounded-xl bg-secondary border border-border text-sm font-semibold disabled:opacity-50 min-h-[44px]">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "See the exact charge"}
              </button>
              {quote ? (
                <div className="rounded-2xl border border-border bg-secondary/50 p-4 text-xs space-y-1.5">
                  <p className="flex justify-between"><span className="text-muted-foreground">Card funding</span><span className="font-semibold">${quote.funding_usd.toLocaleString()}</span></p>
                  <p className="flex justify-between"><span className="text-muted-foreground">Live rate</span><span className="font-semibold">₦{quote.fx_rate.toLocaleString()} / $1</span></p>
                  <p className="flex justify-between"><span className="text-muted-foreground">Card cost</span><span className="font-semibold">{ngn(quote.ngn_cost)}</span></p>
                  <p className="flex justify-between"><span className="text-muted-foreground">Issuance + funding fee</span><span className="font-semibold">{ngn(quote.olaform_fee)}</span></p>
                  <p className="flex justify-between border-t border-border pt-1.5"><span className="font-semibold">Total from wallet</span><span className="font-bold text-primary">{ngn(quote.total_debit_ngn)}</span></p>
                </div>
              ) : null}
              <button onClick={continueFromForm} disabled={busy || !quote} className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 min-h-[44px]">
                {kycStatus === "approved" ? "Continue to PIN" : "Continue"}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <input className={field} placeholder="First name" value={kycForm.first_name} onChange={setK("first_name")} />
                <input className={field} placeholder="Last name" value={kycForm.last_name} onChange={setK("last_name")} />
              </div>
              <select className={field} value={kycForm.id_type} onChange={setK("id_type")}>
                {ID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input className={field} placeholder="ID number" value={kycForm.id_number} onChange={setK("id_number")} />
              <div className="grid grid-cols-[88px_1fr] gap-2.5">
                <input className={field} placeholder="+234" value={kycForm.dial_code} onChange={setK("dial_code")} />
                <input className={field} inputMode="numeric" placeholder="Phone number" value={kycForm.phone_number} onChange={setK("phone_number")} />
              </div>
              <input className={field} type="date" value={kycForm.date_of_birth} onChange={setK("date_of_birth")} />
              <input className={field} placeholder="Address (street)" value={kycForm.line1} onChange={setK("line1")} />
              <div className="grid grid-cols-2 gap-2.5">
                <input className={field} placeholder="City" value={kycForm.city} onChange={setK("city")} />
                <input className={field} placeholder="State" value={kycForm.state} onChange={setK("state")} />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <input className={field} placeholder="Postal code" value={kycForm.postal_code} onChange={setK("postal_code")} />
                <input className={field} placeholder="Country (e.g. NGA)" value={kycForm.country} onChange={setK("country")} />
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Photo of the FRONT of your ID</span>
                <input
                  type="file" accept="image/*"
                  onChange={(e) => e.target.files && e.target.files[0] && uploadId(e.target.files[0])}
                  className="mt-1 w-full text-xs text-muted-foreground file:mr-3 file:h-10 file:px-4 file:rounded-xl file:border-0 file:bg-secondary file:text-foreground file:text-xs file:font-semibold"
                />
                {uploading ? <p className="text-[11px] text-primary mt-1 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading privately…</p> : null}
                {kycForm.id_front_image && !uploading ? <p className="text-[11px] text-emerald-400 mt-1 inline-flex items-center gap-1"><Upload className="w-3 h-3" /> ID attached</p> : null}
              </label>
              <button onClick={submitKyc} disabled={busy || uploading} className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 min-h-[44px]">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Submit identity review"}
              </button>
              <p className="text-[10px] text-muted-foreground text-center">Your ID goes only to the card network — never stored in the app.</p>
            </div>
          )}
        </div>
      </div>

      {pinMode ? (
        <PinDialog
          mode={pinMode}
          hasPin={pinMode === "set"}
          onDone={(pin) => { setPinMode(null); submitIssue(pin); }}
          onClose={() => setPinMode(null)}
        />
      ) : null}
    </>
  );
}