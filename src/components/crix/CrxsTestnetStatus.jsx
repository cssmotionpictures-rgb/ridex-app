import React from "react";
import { base44 } from "@/api/base44Client";
import { ExternalLink } from "lucide-react";

// Public, honest on-chain status. Shows REAL deployed values only — before the
// owner signs, it says NOT YET DEPLOYED. Nothing here is ever simulated, and
// internal Crix ledger balances are never shown as blockchain CRXS.
export default function CrxsTestnetStatus() {
  const [rec, setRec] = React.useState(undefined);
  React.useEffect(() => {
    const load = () =>
      base44.entities.CrixsDeploymentRecord.filter({ registry_key: "crxs-deployment" })
        .then((r) => setRec(r[0] || null))
        .catch(() => setRec(null));
    load();
    return base44.entities.CrxsDeploymentRecord.subscribe(load);
  }, []);

  const deployed = rec && rec.deployment_status === "DEPLOYED" && rec.contract_address;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">CRXS on Base Sepolia (TESTNET)</p>
      {rec === undefined ? (
        <div className="h-4 w-2/3 rounded bg-secondary animate-pulse" />
      ) : deployed ? (
        <div className="space-y-1.5 text-xs">
          <p className="text-emerald-400 font-bold">TESTNET DEPLOYED — real on-chain record</p>
          <p>Contract: <span className="font-mono break-all">{rec.contract_address}</span></p>
          <p>Tx: <span className="font-mono break-all">{rec.deployment_tx_hash}</span> · block {rec.block_number}</p>
          <p>Total supply: 500,000,000,000 CRXS · decimals {rec.decimals}</p>
          <p>Deployer: <span className="font-mono break-all">{rec.deployer}</span></p>
          <a href={rec.explorer_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
            View on BaseScan <ExternalLink className="w-3 h-3" />
          </a>
          <p className="text-[10px] text-muted-foreground pt-1">
            Testnet tokens have no monetary value. No price, liquidity or exchange listing is claimed.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          NOT YET DEPLOYED — no CRXS contract, address or transaction exists on any blockchain yet. This card shows only real on-chain values after the owner signs the deployment; nothing is simulated, and internal Crix wallet balances are never displayed as blockchain CRXS.
        </p>
      )}
    </div>
  );
}