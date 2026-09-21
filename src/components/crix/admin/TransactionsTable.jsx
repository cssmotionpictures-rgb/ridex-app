import React from "react";
import { formatCrix } from "@/lib/crix";
import { StatusBadge, fmtDate } from "./shared";

const CHIPS = [
  { key: "all", label: "All" },
  { key: "crix_to_crix", label: "Transfers" },
  { key: "wallet_funding", label: "Funding" },
  { key: "other", label: "Other rails" },
];

export default function TransactionsTable({ rows }) {
  const [chip, setChip] = React.useState("all");
  const list = (rows || []).filter((t) => {
    if (chip === "all") return true;
    if (chip === "other") return !["crix_to_crix", "wallet_funding"].includes(t.type);
    return t.type === chip;
  });

  return (
    <section className="rounded-2xl border border-border bg-card">
      <p className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-primary border-b border-border">All Crix transactions</p>
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
        <p className="p-4 text-xs text-muted-foreground">No transactions in this view yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {list.map((t) => (
            <div key={t.id} className="px-4 py-3 grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs truncate">{t.crix_id}</span>
                  <span className="text-[9px] uppercase tracking-[0.14em] text-primary border border-primary/40 rounded-full px-1.5 py-0.5 whitespace-nowrap">{t.type.replace(/_/g, " ")}</span>
                </div>
                <StatusBadge status={t.status} />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{t.sender_email || t.sender_id} → {t.recipient_email || "—"}</span>
                <span className="whitespace-nowrap">{fmtDate(t.created_date)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold">{formatCrix(t.amount, t.currency)}</span>
                <span className="text-muted-foreground">fee {formatCrix(t.fee_total || 0, t.currency)} · {t.provider}{t.risk_state === "LOW" ? "" : " · risk " + t.risk_state}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}