import React from "react";
import { CRIX_FIAT, formatCrix } from "@/lib/crix";
import { Plus, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { CRIX_BRAND_IMAGE } from "@/components/crix/CrixBrandHero";
import AddMoney from "@/components/crix/AddMoney";

export default function WalletOverview({ wallets, busy, onOpenWallet, user }) {
  const [addOpen, setAddOpen] = React.useState(false);
  const opened = new Set((wallets || []).map((w) => w.currency));
  const closed = CRIX_FIAT.filter((c) => !opened.has(c.code));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(wallets || []).map((w) => (
          <div key={w.id} className="rounded-2xl border border-border bg-card p-4 card-lift">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{crixFlag(w.currency)}</span>
                <span className="font-heading font-bold">{w.currency}</span>
              </div>
              {w.status === "frozen" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive border border-destructive/40 rounded-full px-2 py-0.5">
                  <Snowflake className="w-3 h-3" /> FROZEN
                </span>
              )}
            </div>
            <p className="text-2xl font-extrabold mt-2 tabular-nums">{formatCrix(w.balance_crxs, w.currency)}</p>
            <p className="text-[11px] text-muted-foreground">Available to spend</p>
          </div>
        ))}
        <div className="relative rounded-2xl border border-primary/40 overflow-hidden min-h-[7rem]">
          <Image
            src={CRIX_BRAND_IMAGE}
            alt="CrixCoin — the native CRX asset"
            fittingType="fill"
            focalPointX={0.5}
            focalPointY={0.4}
            className="absolute inset-0 w-full h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/25" />
          <div className="relative p-4">
            <div className="flex items-center gap-2">
              <span className="text-xl gold-text">◆</span>
              <span className="font-heading font-bold">CRX</span>
              <span className="text-[9px] tracking-[0.18em] text-primary border border-primary/40 rounded-full px-1.5 py-0.5">NATIVE ASSET</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2 max-w-[26ch]">
              CRIXCOIN (CRX) is your in-app credit for CRIXCOIN features. The public CRXS network launches soon.
            </p>
          </div>
        </div>
      </div>

      {closed.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-primary mb-3">Open another currency wallet</p>
          <div className="flex flex-wrap gap-2">
            {closed.map((c) => (
              <button
                key={c.code}
                disabled={busy}
                onClick={() => onOpenWallet(c.code)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3.5 py-2 text-xs font-semibold hover:border-primary/50 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> {c.flag} {c.code}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Add money</p>
            <p className="text-sm text-muted-foreground max-w-[30ch]">Fund your Naira wallet by card — your full deposit lands instantly and can be sent to anyone on Crix.</p>
          </div>
          <Button className="rounded-full shrink-0" onClick={() => setAddOpen(true)}>Add money</Button>
        </div>
        <AddMoney open={addOpen} onOpenChange={setAddOpen} user={user} />
        <p className="text-[11px] text-muted-foreground mt-2">More currencies are coming soon.</p>
      </div>
    </div>
  );
}

function crixFlag(code) {
  return (CRIX_FIAT.find((c) => c.code === code) || { flag: "◆" }).flag;
}