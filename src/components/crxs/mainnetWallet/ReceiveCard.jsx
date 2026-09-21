import React from "react";
import { Button } from "@/components/ui/button";
import { Copy, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { BASE_MAINNET } from "@/lib/baseMainnetNetwork";

// RECEIVE CRXS — the connected wallet's real address (from the provider,
// never typed), the verified Crix ID, a QR code, and copy. Network is shown
// unambiguously: this is for the PRODUCTION asset on Base MAINNET.
export default function ReceiveCard({ account, identity }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) { /* clipboard unavailable */ }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold">Receive CRXS</p>
      {!account ? (
        <p className="text-[11px] text-muted-foreground">Connect your wallet to see your receiving address and QR code.</p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-2xl bg-white p-3">
              <QRCodeSVG value={account} size={148} level="M" />
            </div>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><QrCode className="w-3 h-3" /> Scan to pay this wallet</p>
          </div>
          <div className="grid gap-1.5 text-[11px]">
            {identity?.wallet_verified && identity?.crix_id && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Crix ID</span>
                <span className="font-mono font-semibold">{identity.crix_id}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Receiving address</span>
              <span className="font-mono break-all text-right">{account}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="w-4 h-4" /> {copied ? "Copied" : "Copy address"}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Your Crix ID is the easy way to receive — it routes payments straight to your verified address.
          </p>
        </>
      )}
    </div>
  );
}