import React from "react";
import { base44 } from "@/api/base44Client";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";

// CRXS WALLET SECTION — real-time balances plus the recent on-chain transfers
// verified by the server-side indexing logic (crxs-transfer-verify). Every
// transfer row below was independently re-read from Base Sepolia before being
// indexed; nothing is typed in manually and internal ledger money is never
// shown as on-chain CRXS.
function fmtAmount(rawString) {
  try {
    return Number(BigInt(String(rawString || "0")) / 10n ** 12n) / 1e6;
  } catch {
    return 0;
  }
}

function short(addr) {
  const a = String(addr || "");
  return a.length > 12 ? a.slice(0, 8) + "…" + a.slice(-6) : a;
}

export default function CrxsTransferIndex({ userId, limit = 5 }) {
  const [deploy, setDeploy] = React.useState(null);
  const [transfers, setTransfers] = React.useState(null);
  const [wallet, setWallet] = React.useState(null);

  React.useEffect(() => {
    const loadDeploy = () =>
      base44.entities.CrxsDeploymentRecord.filter({ registry_key: "crxs-deployment" })
        .then((r) => setDeploy(r[0] || null)).catch(() => {});
    const loadTransfers = () =>
      base44.entities.CrxsOnchainTransfer.list("-created_date", limit)
        .then(setTransfers).catch(() => setTransfers([]));
    const loadWallet = () => {
      if (!userId) return;
      base44.entities.CrixWallet.filter({ user_id: userId, currency: "CRX" })
        .then((w) => setWallet(w[0] || null)).catch(() => {});
    };
    loadDeploy(); loadTransfers(); loadWallet();
    const u1 = base44.entities.CrxsDeploymentRecord.subscribe(loadDeploy);
    const u2 = base44.entities.CrxsOnchainTransfer.subscribe(loadTransfers);
    const u3 = base44.entities.CrixWallet.subscribe(loadWallet);
    return () => { u1(); u2(); u3(); };
  }, [userId, limit]);

  const deployed = deploy?.deployment_status === "DEPLOYED" && !!deploy?.contract_address;
  const internalBalance = wallet?.available || 0;

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Your CRIXCOIN wallet — balances &amp; verified transfers</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl border border-border bg-secondary/40 p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Your CRIXCOIN balance</p>
          <p className="text-xl font-extrabold tabular-nums gold-text mt-1">{internalBalance.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">CRX</span></p>
        </div>
        <div className="rounded-2xl border border-border bg-secondary/40 p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CRXS network</p>
          {deployed ? (
            <p className="text-sm font-bold text-emerald-400 mt-1">Live</p>
          ) : (
            <p className="text-sm font-bold mt-1">Launching soon</p>
          )}
        </div>
      </div>

      <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Recent transfers — verified</p>
      {transfers === null ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : transfers.length === 0 ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-sm text-muted-foreground">
            {deployed
              ? "No verified transfers yet — new activity appears here automatically."
              : "No CRXS network transfers yet — verified activity appears here automatically as the network goes live."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {transfers.map((t) => (
            <a key={t.id} href={"https://sepolia.basescan.org/tx/" + t.tx_hash} target="_blank" rel="noreferrer" className="block rounded-xl border border-border bg-secondary/30 p-3 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold tabular-nums">{fmtAmount(t.amount_raw).toLocaleString(undefined, { maximumFractionDigits: 4 })} CRXS</p>
                  <p className="text-[10px] text-muted-foreground font-mono break-all">{short(t.from_address)} → {short(t.to_address)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wide">Verified</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground mt-3">Your CRIXCOIN balance and CRXS network activity are tracked separately and never mixed.</p>
    </div>
  );
}