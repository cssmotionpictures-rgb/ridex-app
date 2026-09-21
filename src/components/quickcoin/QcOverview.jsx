import React from "react";
import { formatCrxs } from "@/lib/quickcoin";
import { Coins, Loader2 } from "lucide-react";

// CRIXCOIN balance — the product surface users see. Operational and chain
// detail stays on the admin screens; this card shows only the balance and
// what the user can do with it.
export default function QcOverview({ wallet, loading }) {
  return (
    <div className="space-y-3 mb-6">
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 to-transparent p-5">
        <div className="flex items-center gap-2 mb-1">
          <Coins className="w-4 h-4 text-primary" />
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Your CRIXCOIN balance</p>
        </div>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
        ) : (
          <p className="text-4xl font-extrabold gold-text font-heading">{formatCrxs(wallet?.available)}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">
          Instant transfers between CRIXCOIN users. Moving CRIXCOIN out to external wallets is temporarily unavailable.
        </p>
      </div>
    </div>
  );
}