import React from "react";
import { invokeCrix } from "@/lib/crix";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";

// CRIXCOIN transaction PIN dialog.
//   mode "set"    — create (or change) the PIN; the change requires the current one
//   mode "verify" — collect the PIN for this purchase; the server verifies it

export default function PinDialog({ mode, hasPin, onDone, onClose }) {
  const { toast } = useToast();
  const [pin, setPin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [current, setCurrent] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const digits = (v) => v.replace(/\D/g, "").slice(0, 6);

  const submit = async () => {
    if (busy) return;
    if (mode === "verify") {
      if (pin.length < 4) {
        toast({ title: "Enter your PIN", description: "Your transaction PIN is 4 to 6 digits.", variant: "destructive" });
        return;
      }
      onDone(pin);
      return;
    }
    if (pin.length < 4) {
      toast({ title: "PIN too short", description: "Your PIN must be 4 to 6 digits.", variant: "destructive" });
      return;
    }
    if (pin !== confirm) {
      toast({ title: "PINs do not match", description: "Enter the same PIN twice.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await invokeCrix({ action: "pin_set", pin, ...(hasPin ? { current_pin: current } : {}) });
      toast({ title: "Transaction PIN set ✓", description: "You'll enter this PIN to confirm every purchase." });
      onDone(pin);
    } catch (e) {
      toast({ title: "PIN not saved", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  const inputCls = "flex h-12 w-full rounded-xl bg-secondary px-3 text-lg tracking-[0.5em] text-center border border-border placeholder:text-muted-foreground placeholder:tracking-normal placeholder:text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">{mode === "verify" ? "Confirm your purchase" : "Set your transaction PIN"}</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {mode === "verify"
            ? "Enter your CRIXCOIN transaction PIN to complete this payment."
            : "You'll enter this PIN to confirm every purchase — bills, betting and cards. Never share it with anyone."}
        </p>

        <div className="space-y-3">
          {mode === "set" && hasPin ? (
            <input
              value={current}
              onChange={(e) => setCurrent(digits(e.target.value))}
              type="password"
              inputMode="numeric"
              placeholder="Current PIN"
              className={inputCls}
            />
          ) : null}
          <input
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder={mode === "verify" ? "Transaction PIN" : "New PIN (4–6 digits)"}
            className={inputCls}
          />
          {mode === "set" ? (
            <input
              value={confirm}
              onChange={(e) => setConfirm(digits(e.target.value))}
              type="password"
              inputMode="numeric"
              placeholder="Confirm new PIN"
              className={inputCls}
            />
          ) : null}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl bg-secondary border border-border text-sm font-semibold min-h-[44px]">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 min-h-[44px]">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : mode === "verify" ? "Confirm" : "Save PIN"}
          </button>
        </div>
      </div>
    </div>
  );
}