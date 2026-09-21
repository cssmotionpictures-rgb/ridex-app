import React from "react";
import { base44 } from "@/api/base44Client";

const STATUS = {
  paid: { label: "Paid", cls: "text-emerald-400" },
  refunded: { label: "Refunded", cls: "text-muted-foreground" },
  failed: { label: "Failed", cls: "text-destructive" },
  unknown: { label: "Confirming…", cls: "text-amber-400" },
  created: { label: "Processing…", cls: "text-amber-400" },
};

const ngn = (v) => "₦" + Number(v || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });

export default function BillHistory() {
  const [rows, setRows] = React.useState(null);

  React.useEffect(() => {
    const load = () => base44.entities.CrixBillPayment.list("-created_date", 20).then(setRows).catch(() => setRows([]));
    load();
    const unsub = base44.entities.CrixBillPayment.subscribe(load);
    return unsub;
  }, []);

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5">
      <h3 className="font-semibold mb-3">Bill payments</h3>
      {rows === null ? (
        <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bill payments yet — your paid bills appear here.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((b) => {
            const s = STATUS[b.status] || STATUS.created;
            return (
              <div key={b.id} className="rounded-xl border border-border bg-secondary/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{b.biller_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{b.customer_reference}{b.customer_name ? " · " + b.customer_name : ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums">{ngn(b.amount_ngn)}</p>
                    <p className={"text-[10px] font-bold uppercase tracking-wide " + s.cls}>{s.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}