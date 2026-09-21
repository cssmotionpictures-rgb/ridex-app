import React from "react";
import { StatusBadge, fmtDate, shortAddr } from "./shared";

function OnchainRow({ r, explorer }) {
  let human = "—";
  try {
    human = (Number(r.amount_raw) / 1e18).toFixed(2);
  } catch (e) {
    human = "—";
  }
  return (
    <div className="px-4 py-3 grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs">{shortAddr(r.to_address)}</span>
        <StatusBadge status={r.state || r.status} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{human} CRXS{r.gas_mode ? " · " + r.gas_mode : ""}{r.provider ? " · " + r.provider : ""}</span>
        <span className="whitespace-nowrap">{fmtDate(r.created_date)}</span>
      </div>
      {r.tx_hash ? (
        <a href={explorer + "/tx/" + r.tx_hash} target="_blank" rel="noreferrer" className="text-[10px] text-primary truncate">{r.tx_hash}</a>
      ) : (
        <span className="text-[10px] text-muted-foreground">No on-chain hash yet — never fabricated.</span>
      )}
    </div>
  );
}

function OnchainList({ rows, label, explorer }) {
  const list = rows || [];
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <p className="px-4 py-2.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground border-b border-border">{label}</p>
      {list.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">No transfers recorded on this rail — nothing is simulated.</p>
      ) : (
        <div className="divide-y divide-border">
          {list.map((r) => (
            <OnchainRow key={r.id} r={r} explorer={explorer} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OnchainTransfersPanel({ sepolia, sponsored }) {
  return (
    <section className="space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-primary">On-chain CRXS transfers</p>
      <OnchainList rows={sepolia} label="Base Sepolia — testnet rail" explorer="https://sepolia.basescan.org" />
      <OnchainList rows={sponsored} label="Base Mainnet — sponsored rail" explorer="https://basescan.org" />
    </section>
  );
}