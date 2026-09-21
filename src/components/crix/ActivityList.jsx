import React from "react";
import { base44 } from "@/api/base44Client";
import { formatCrix } from "@/lib/crix";
import TransactionReceipt from "@/components/crix/TransactionReceipt";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

export default function ActivityList({ myId }) {
  const [txs, setTxs] = React.useState(null);
  const [selected, setSelected] = React.useState(null);

  React.useEffect(() => {
    const load = () => base44.entities.CrixTransaction.list("-created_date", 50).then(setTxs).catch(() => setTxs([]));
    load();
    const unsub = base44.entities.CrixTransaction.subscribe(load);
    return unsub;
  }, []);

  if (txs === null) return <p className="text-sm text-muted-foreground animate-pulse">Loading your Crix activity…</p>;

  if (!txs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <p className="font-heading font-bold">No transactions yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Every CRIXCOIN movement appears here with its receipt — nothing is ever hidden from your history.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {txs.map((t) => {
          const sent = t.sender_id === myId;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="w-full text-left rounded-2xl border border-border bg-card p-3.5 flex items-center gap-3 card-lift"
            >
              <span className={"w-9 h-9 rounded-full flex items-center justify-center shrink-0 " + (sent ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary")}>
                {sent ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{sent ? "To " + (t.recipient_email || "recipient") : "From " + (t.sender_email || "sender")}</span>
                <span className="block text-[11px] text-muted-foreground">{t.crix_id} · {new Date(t.created_date).toLocaleString("en-NG")}</span>
              </span>
              <span className="text-right shrink-0">
                <span className={"block text-sm font-bold tabular-nums " + (sent ? "" : "text-primary")}>
                  {sent ? "−" : "+"}{formatCrix(t.amount, t.currency)}
                </span>
                <span className={"block text-[10px] font-semibold " + statusClass(t.status)}>{statusLabel(t.status)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <TransactionReceipt tx={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function statusLabel(status) {
  if (status === "COMPLETED") return "Completed";
  if (status === "FAILED" || status === "REVERSED") return "Failed";
  if (status === "VALIDATED" || status === "REQUESTED") return "Processing";
  return status.replace("_", " ").toLowerCase();
}

function statusClass(status) {
  if (status === "COMPLETED") return "text-primary";
  if (status === "FAILED" || status === "REVERSED") return "text-destructive";
  return "text-muted-foreground";
}