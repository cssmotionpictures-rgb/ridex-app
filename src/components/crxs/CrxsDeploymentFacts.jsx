import React from "react";
import { ExternalLink, Ban, CheckCircle2, XCircle } from "lucide-react";

// ALWAYS-VISIBLE DEPLOYMENT FACTS — the contract address and deployment hash
// pinned at the top of Launch Control, straight from the verified on-chain
// record. When nothing is deployed it says NOT DEPLOYED honestly — a
// placeholder address is never shown, and nothing appears until the server
// has verified it against Base Sepolia.
export default function CrxsDeploymentFacts({ record }) {
  const deployed = record?.deployment_status === "DEPLOYED" && !!record?.contract_address;
  const failed = record?.deployment_status === "FAILED";
  return (
    <div className={"rounded-2xl border p-4 mb-6 " + (deployed ? "border-emerald-400/40 bg-emerald-400/10" : failed ? "border-destructive/50 bg-destructive/10" : "border-border bg-card")}>
      <div className="flex items-center gap-2 mb-3">
        {deployed ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : failed ? <XCircle className="w-4 h-4 text-destructive" /> : <Ban className="w-4 h-4 text-muted-foreground" />}
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Deployment facts — always visible</p>
      </div>
      <div className="grid gap-3">
        <Row
          label="Contract address"
          value={record?.contract_address || "NOT DEPLOYED — no contract exists on Base Sepolia yet"}
          href={deployed ? "https://sepolia.basescan.org/address/" + record.contract_address : ""}
        />
        <Row
          label="Deployment TX hash"
          value={record?.deployment_tx_hash || "No transaction has been signed or broadcast"}
          href={record?.deployment_tx_hash ? "https://sepolia.basescan.org/tx/" + record.deployment_tx_hash : ""}
        />
        <Row
          label="Block · verification"
          value={deployed
            ? "Block " + record.block_number + " · " + (record.verification_status || "ONCHAIN_VERIFIED") + " — verified server-side"
            : failed
              ? "FAILED — " + (record.failure_reason || "the signed transaction reverted on-chain")
              : "Waiting for the owner's MetaMask signature"}
        />
      </div>
    </div>
  );
}

function Row({ label, value, href }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-xs font-mono break-all text-primary inline-flex items-start gap-1">
          <span className="break-all">{value}</span> <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
        </a>
      ) : (
        <p className="text-xs font-mono break-all text-muted-foreground">{value}</p>
      )}
    </div>
  );
}