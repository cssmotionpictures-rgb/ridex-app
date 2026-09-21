import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, ShieldAlert } from "lucide-react";
import { payUri, normalizeHandle } from "@/lib/quickcoin";

function CopyBtn({ text, label }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch (e) {} }}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-secondary text-foreground font-semibold">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : label}
    </button>
  );
}

// RECEIVE CRXS — the QR encodes the user's verified Quick Coin @handle
// (quickcoin://pay/@handle), which routes the payment over the internal rail.
export default function QcReceive({ identity }) {
  const verified = identity && identity.wallet_verified && identity.crix_id;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-4 text-center">
      {verified ? (
        <>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Your CRIXCOIN handle</p>
            <p className="text-2xl font-extrabold gold-text font-heading">{normalizeHandle(identity.crix_id)}</p>
          </div>
          <div className="mx-auto w-fit p-3 rounded-2xl bg-white">
            <QRCodeSVG value={payUri(identity.crix_id)} size={160} level="M" />
          </div>
          <p className="text-[11px] text-muted-foreground">Anyone with a CRIXCOIN account can scan this and pay you instantly.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <CopyBtn text={normalizeHandle(identity.crix_id)} label="Copy handle" />
            <CopyBtn text={identity.wallet_address} label="Copy CRIXCOIN address" />
          </div>
          <p className="text-[10px] text-muted-foreground break-all">CRIXCOIN address: {identity.wallet_address}</p>
        </>
      ) : (
        <div className="py-4 space-y-2">
          <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-sm font-semibold">No verified CRIXCOIN handle yet</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Complete the wallet verification in CRIXCOIN to claim your @handle and CRIXCOIN address — they're created once and stay yours.
          </p>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-3">
        Paying out to external wallets is temporarily unavailable.
      </p>
    </div>
  );
}