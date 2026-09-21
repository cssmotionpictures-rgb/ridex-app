import React from "react";
import { fmtDate } from "./shared";

export default function LedgerFeed({ entries, note }) {
  const list = entries || [];
  const debit = list.filter((e) => e.direction === "debit").reduce((s, e) => s + (e.amount || 0), 0);
  const credit = list.filter((e) => e.direction === "credit").reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-primary">Double-entry ledger</p>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Σ debit {debit.toFixed(2)} · Σ credit {credit.toFixed(2)}</span>
      </div>
      {list.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">No ledger entries yet — every entry comes from a real settled movement.</p>
      ) : (
        <div className="divide-y divide-border max-h-96 overflow-y-auto noir-scrollbar">
          {list.map((e) => (
            <div key={e.entry_key} className="px-4 py-2.5 grid gap-0.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono truncate">{e.account}</span>
                <span className={(e.direction === "debit" ? "text-red-400" : "text-emerald-400") + " font-bold whitespace-nowrap tabular-nums"}>
                  {e.direction === "debit" ? "−" : "+"}{Number(e.amount || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="truncate">{e.crix_id}{e.memo ? " · " + e.memo : ""}</span>
                <span className="whitespace-nowrap">{fmtDate(e.created_date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {note ? <p className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border">{note}</p> : null}
    </section>
  );
}