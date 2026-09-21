import React from "react";
import { ShieldCheck, Unlock, RotateCcw, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { money } from "@/lib/pricing";

// Customer-protection escrow.
// Only the PROVIDER's earnings (amount - platform fee) are held in escrow.
// The platform fee / commission / processing fee is captured immediately on
// payment and is never escrowed or refundable from here.
export default function EscrowActions({ tx, isAdmin, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState("");
  const held = tx.status === "paid" && (tx.escrow_status === "held" || !tx.escrow_status);

  const fee = Number(tx.commission) || 0;
  const heldAmount = Math.max(0, Number(tx.amount) - fee);

  const release = async () => {
    setBusy("release");
    try {
      const me = await base44.auth.me().catch(() => null);
      await base44.entities.Transaction.update(tx.id, {
        escrow_status: "released",
        escrow_released_at: new Date().toISOString(),
        escrow_released_by_name: me?.full_name || me?.email || "customer",
        settled_to_opay: true,
      });
      toast({ title: "Escrow released", description: "Provider earnings released to the provider." });
      onChanged?.();
    } catch (e) {
      toast({ title: e.message || "Release failed", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const refund = async () => {
    setBusy("refund");
    try {
      // Only the provider portion is refunded; the platform fee stays captured.
      await base44.entities.Transaction.update(tx.id, {
        escrow_status: "refunded",
        status: "refunded",
        settled_to_opay: false,
        refund_reason: isAdmin ? "Admin refund (provider portion only)" : "Customer reported issue (provider portion refunded)",
      });
      toast({
        title: "Provider portion refunded",
        description: fee > 0
          ? `${money(heldAmount)} returned to you. Platform fee of ${money(fee)} was already captured.`
          : "Funds returned to you.",
      });
      onChanged?.();
    } catch (e) {
      toast({ title: e.message || "Refund failed", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  if (!tx.escrow_status && !held) return null;

  const state = tx.escrow_status || (held ? "held" : "released");
  const styles = {
    held: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    released: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    refunded: "bg-destructive/15 text-destructive border-destructive/30",
  }[state];

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${styles}`}>
          <ShieldCheck className="w-3 h-3" /> Escrow · {state}
        </span>
        {fee > 0 && tx.platform_fee_settled && (
          <span className="text-[10px] text-muted-foreground">
            Platform fee {money(fee)} captured · {money(heldAmount)} held for provider
          </span>
        )}
      </div>
      {held && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-full h-8 text-xs gap-1" disabled={!!busy} onClick={refund}>
            {busy === "refund" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            {isAdmin ? "Refund provider" : "Report issue"}
          </Button>
          <Button size="sm" className="rounded-full h-8 text-xs gap-1" disabled={!!busy} onClick={release}>
            {busy === "release" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />}
            {isAdmin ? "Release to provider" : "Confirm received"}
          </Button>
        </div>
      )}
    </div>
  );
}