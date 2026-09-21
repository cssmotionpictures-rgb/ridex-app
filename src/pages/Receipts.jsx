import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { money } from "@/lib/pricing";
import ReceiptDialog from "@/components/shared/ReceiptDialog";
import { FileText, Mail, Loader2 } from "lucide-react";

export default function Receipts() {
  const [user, setUser] = React.useState(null);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [active, setActive] = React.useState(null);

  const load = async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);
      const all = await base44.entities.Invoice.list("-created_date", 100);
      setRows(all);
    } catch { setRows([]); }
    setLoading(false);
  };

  React.useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader eyebrow="Your records" title="My Receipts" subtitle="Every Ride X payment receipt in one place — view, download or email." />
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-border/60 bg-card p-10 text-center text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No receipts yet. Receipts appear here automatically after each successful payment.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <button key={r.id} onClick={() => setActive(r)} className="text-left rounded-2xl border border-border/60 bg-card p-4 card-lift flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">{r.invoice_number}</p>
                <p className="text-xs text-muted-foreground">{r.service} · {new Date(r.created_date).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="font-extrabold text-primary">{money(r.total, r.currency)}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end">
                  {r.status === "emailed" ? <><Mail className="w-3 h-3" /> Emailed</> : "Issued"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      <ReceiptDialog open={!!active} onOpenChange={(v) => !v && setActive(null)} invoiceId={active?.id} />
    </div>
  );
}