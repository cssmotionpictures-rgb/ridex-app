import React from "react";
import { formatCrix } from "@/lib/crix";
import { StatusBadge, fmtDate } from "./shared";

const CHIPS = [
  { key: "all", label: "All" },
  { key: "COMPLETED", label: "Credited" },
  { key: "HELD", label: "Held" },
  { key: "FAILED", label: "Failed" },
];

export default function DepositsTable({ rows }) {
  const [chip, setChip] = React.useState("all");
  const list = (rows || []).filter((d) => {
    if (chip === "all") return true;
    if (chip === "COMPLETED") return d.status === "COMPLETED";
    if (chip === "FAILED") return d.status === "FAILED";
    return ["REQUESTED", "VALIDATED", "PROCESSING", "UNKNOWN"].includes(d.status);
  });

  return (
    <section className="rounded-2xl border border-border bg-card">
      <p className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-primary border-b border-border">NGN deposits (wallet funding)</p>
      <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto no-scrollbar border-b border-border">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => setChip(c.key)}
            className={"rounded-full px-3 py-1 text-[11px] font-semibold min-h-[32px] whitespace-nowrap " + (chip === c.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
          >
            {c.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">No deposits in this view yet — the ledger only records real, provider-verified funding.</p>
      ) : (
        <div className="divide-y divide-border">
          {list.map((d) => (
            <div key={d.id} className="px-4 py-3 grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{d.crix_id}</span>
                <StatusBadge status={d.status} />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{d.sender_email || d.sender_id}</span>
                <span className="whitespace-nowrap">{fmtDate(d.created_date)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold">{formatCrix(d.amount, d.currency)} credited</span>
                <span className="text-muted-foreground text-right">fee {formatCrix(d.fee_total || 0, d.currency)} · {d.provider}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}