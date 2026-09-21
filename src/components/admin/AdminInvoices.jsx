import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/pricing";
import ReceiptDialog from "@/components/shared/ReceiptDialog";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Mail, FileText, Search, Send, Ban } from "lucide-react";

export default function AdminInvoices() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [svc, setSvc] = React.useState("all");
  const [active, setActive] = React.useState(null);
  const [txInput, setTxInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.Invoice.list("-created_date", 200);
      setRows(all);
    } catch { setRows([]); }
    setLoading(false);
  };

  React.useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (svc !== "all" && r.service !== svc) return false;
    if (q) {
      const s = `${r.invoice_number} ${r.customer_name} ${r.customer_email} ${r.reference_id}`.toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const resend = async (id) => {
    try {
      const res = await base44.functions.invoke("email-invoice", { invoice_id: id });
      toast({ title: "Receipt emailed", description: `Sent to ${(res?.data || res).email || "customer"}` });
      load();
    } catch (e) { toast({ title: "Email failed", description: e.message, variant: "destructive" }); }
  };

  const voidInv = async (id) => {
    try { await base44.entities.Invoice.update(id, { status: "void" }); load(); } catch {}
  };

  const genFromTx = async () => {
    if (!txInput.trim()) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("create-invoice", { transaction_id: txInput.trim() });
      toast({ title: "Invoice generated", description: (res?.data || res).invoice?.invoice_number || "Created" });
      setTxInput("");
      load();
    } catch (e) {
      toast({ title: "Generate failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const services = ["all", ...Array.from(new Set(rows.map((r) => r.service)))];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-primary/25 bg-primary/5 p-5 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Generate invoice from a Transaction ID</label>
          <Input value={txInput} onChange={(e) => setTxInput(e.target.value)} placeholder="Paste transaction id…" className="rounded-xl mt-1" />
        </div>
        <Button className="rounded-full" disabled={busy} onClick={genFromTx}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Generate
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, name, email…" className="rounded-full pl-9" />
        </div>
        <select value={svc} onChange={(e) => setSvc(e.target.value)} className="rounded-full bg-secondary border border-border px-3 py-2 text-sm">
          {services.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No invoices yet. They auto-generate on every Paystack payment.</p>
      ) : (
        <div className="rounded-2xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-xs uppercase">
              <tr>
                <th className="text-left p-3">Receipt #</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Service</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border/40 hover:bg-secondary/40">
                  <td className="p-3 font-mono text-xs">{r.invoice_number}</td>
                  <td className="p-3"><div className="font-medium">{r.customer_name || "—"}</div><div className="text-xs text-muted-foreground">{r.customer_email || ""}</div></td>
                  <td className="p-3">{r.service}</td>
                  <td className="p-3 text-right font-semibold">{money(r.total, r.currency)}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "emailed" ? "bg-emerald-500/15 text-emerald-300" : r.status === "void" ? "bg-red-500/15 text-red-300" : "bg-secondary text-muted-foreground"}`}>{r.status}</span></td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setActive(r)}>View</Button>
                    <Button size="sm" variant="ghost" className="rounded-full" disabled={r.status === "void" || !r.customer_email} onClick={() => resend(r.id)}><Send className="w-3.5 h-3.5" /></Button>
                    {r.status !== "void" && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => voidInv(r.id)}><Ban className="w-3.5 h-3.5" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReceiptDialog open={!!active} onOpenChange={(v) => !v && setActive(null)} invoiceId={active?.id} />
    </div>
  );
}