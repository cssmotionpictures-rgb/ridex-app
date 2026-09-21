import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldCheck, LifeBuoy } from "lucide-react";
import { formatCrix } from "@/lib/crix";

export default function TransactionReceipt({ tx, onClose }) {
  const quote = safeParse(tx?.fee_breakdown_json);
  const timeline = safeParse(tx?.timeline_json);
  const protection = safeParse(tx?.protection_json);

  return (
    <Dialog open={!!tx} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        {tx && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">CRIXCOIN Receipt</DialogTitle>
            </DialogHeader>
            <p className="text-center font-mono text-primary text-sm font-semibold">{tx.crix_id}</p>
            <p className="text-center text-[11px] text-muted-foreground">
              {new Date(tx.created_date).toLocaleString("en-NG")} · {tx.type === "crix_to_crix" ? "Crix-to-Crix transfer" : tx.type.replace("_", " ")}
            </p>

            <div className="rounded-xl border border-border divide-y divide-border text-sm mt-3">
              <Row label="Status" value={<span className={tx.status === "COMPLETED" ? "text-primary font-bold" : ""}>{tx.status}</span>} />
              <Row label="From" value={tx.sender_email || "—"} />
              <Row label="To" value={tx.recipient_email || "—"} />
              <Row label="Recipient gets" value={<span className="font-bold">{formatCrix(tx.amount, tx.currency)}</span>} />
              <Row label="Crix fee" value={formatCrix(tx.fee_total, tx.currency)} />
              {quote?.total_debit != null && <Row label="Total debited" value={formatCrix(quote.total_debit, tx.currency)} />}
              {tx.note && <Row label="Note" value={tx.note} />}
            </div>

            {Array.isArray(timeline) && timeline.length > 0 && (
              <div className="mt-3">
                <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Journey</p>
                <div className="space-y-1.5">
                  {timeline.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={"mt-1 w-1.5 h-1.5 rounded-full shrink-0 " + (s.step === "FAILED" ? "bg-destructive" : "bg-primary")} />
                      <span>
                        <span className="font-semibold">{s.step}</span>
                        <span className="text-muted-foreground"> · {s.at ? new Date(s.at).toLocaleTimeString("en-NG") : ""}</span>
                        {s.detail && <span className="block text-muted-foreground">{s.detail}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {protection && Object.keys(protection).length > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                Crix Protected: session verified, recipient verified, fee shown up front, permanent record kept. Real processing checks — not insurance, not a payment guarantee.
              </p>
            )}

            <Button asChild variant="outline" className="w-full rounded-full mt-3">
              <Link to="/support"><LifeBuoy className="w-4 h-4" /> I have a problem with this transaction</Link>
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function safeParse(json) {
  try { return JSON.parse(json || "{}"); } catch { return {}; }
}