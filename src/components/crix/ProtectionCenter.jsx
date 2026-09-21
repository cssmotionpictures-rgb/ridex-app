import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { invokeCrix, formatCrix } from "@/lib/crix";
import { Snowflake, ShieldCheck, LifeBuoy, Lock } from "lucide-react";

export default function ProtectionCenter({ wallets, onChanged }) {
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");

  const toggle = async (w) => {
    setError(""); setBusy(w.currency);
    try {
      await invokeCrix({ action: w.status === "frozen" ? "unfreeze" : "freeze", currency: w.currency });
      onChanged && onChanged();
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-destructive mb-1">Emergency controls</p>
        <p className="text-sm text-muted-foreground mb-3">Freezing a wallet stops all sends from it immediately. Unfreezing is always in your hands.</p>
        {(wallets || []).length === 0 && <p className="text-sm text-muted-foreground">Open a wallet first on the Wallets tab.</p>}
        <div className="space-y-2">
          {(wallets || []).map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2.5">
              <div>
                <p className="text-sm font-semibold">{w.currency} wallet · {formatCrix(w.available, w.currency)}</p>
                <p className="text-[11px] text-muted-foreground">{w.status === "frozen" ? "Frozen — sending blocked" : "Active — sending allowed"}</p>
              </div>
              <Button
                size="sm" variant={w.status === "frozen" ? "outline" : "destructive"} className="rounded-full shrink-0"
                disabled={busy === w.currency} onClick={() => toggle(w)}
              >
                {busy === w.currency ? "…" : w.status === "frozen" ? "Unfreeze" : "Freeze"}
              </Button>
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> What Crix Protection checks</p>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li>· Transfers only ever run from your signed-in account</li>
          <li>· Recipient — the account is verified to exist before any money moves</li>
          <li>· Fee — shown in full before you confirm</li>
          <li>· Funds are locked first — a balance can never go negative</li>
          <li>· A retried or double-tapped send never moves money twice</li>
          <li>· Every movement gets a permanent transaction record</li>
        </ul>
        <p className="text-[11px] text-muted-foreground mt-3 border-t border-border pt-3">
          Crix Protection means your money is processed through verified systems. It is not deposit insurance and not a guarantee of any payment's outcome.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-1.5"><Lock className="w-4 h-4" /> Account security</p>
        <p className="text-sm text-muted-foreground">
          Sign-in and sessions are handled by your RideX account login. Extra Crix controls — trusted devices, login history, passkeys — open as they are genuinely built, not before.
        </p>
      </div>

      <Button asChild variant="outline" className="rounded-full">
        <Link to="/support"><LifeBuoy className="w-4 h-4" /> Report an unauthorized transaction</Link>
      </Button>
    </div>
  );
}