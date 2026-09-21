import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/pricing";
import { CONTACT } from "@/lib/catalog";
import { Loader2, Printer, Mail, XCircle } from "lucide-react";

export default function ReceiptDialog({ open, onOpenChange, invoiceId, transactionId }) {
  const [inv, setInv] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    if (!open) { setInv(null); setMsg(""); return; }
    base44.auth.me().then((u) => setIsAdmin(u?.role === "admin")).catch(() => {});
    setLoading(true);
    const q = invoiceId
      ? base44.entities.Invoice.get(invoiceId)
      : base44.entities.Invoice.filter({ transaction_id: transactionId }).then((r) => r[0] || null);
    q.then((r) => setInv(r)).catch(() => setInv(null)).finally(() => setLoading(false));
  }, [open, invoiceId, transactionId]);

  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Ride X Receipt</title></head><body style="margin:0">${receiptHtml(inv)}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const resend = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await base44.functions.invoke("email-invoice", { invoice_id: inv.id });
      const data = res?.data || res;
      setMsg(`Receipt emailed to ${data.email || inv.customer_email}`);
    } catch (e) {
      setMsg(e.message || "Could not send email (non-registered addresses may require a paid plan)");
    } finally { setBusy(false); }
  };

  const receiptHtml = (i) => {
    if (!i) return "";
    let lines = [];
    try { lines = JSON.parse(i.line_items || "[]"); } catch { lines = []; }
    const cur = i.currency || "NGN";
    const rows = lines.map((l) => `<tr><td style="padding:8px 6px;border-bottom:1px solid #2a2418">${l.label}</td><td style="padding:8px 6px;text-align:right">${money(l.net, cur)}</td><td style="padding:8px 6px;text-align:right">${money(l.commission, cur)}</td><td style="padding:8px 6px;text-align:right;font-weight:700">${money(l.total, cur)}</td></tr>`).join("");
    return `<div style="font-family:Manrope,Arial,sans-serif;max-width:520px;margin:0 auto;color:#f5f1e6;background:#0a0a0a;padding:20px">
      <div style="font-size:20px;font-weight:800">RIDE <span style="color:#f7c948">X</span> <span style="font-size:10px;color:#8a7d5e;letter-spacing:.14em;margin-left:8px">RECEIPT</span></div>
      <div style="font-size:11px;color:#8a7d5e;margin:8px 0 14px">${i.invoice_number} · ${new Date(i.created_date).toLocaleString()}</div>
      <div style="background:#161616;border-radius:10px;padding:12px;margin-bottom:14px"><div style="font-size:10px;color:#8a7d5e;text-transform:uppercase">Billed to</div><div style="font-weight:700">${i.customer_name || "Customer"}</div><div style="font-size:12px;color:#b9a98a">${i.customer_email || ""}</div></div>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="color:#8a7d5e;font-size:10px;text-transform:uppercase"><td style="padding:6px">Description</td><td style="text-align:right">Net</td><td style="text-align:right">Fee</td><td style="text-align:right">Total</td></tr></thead><tbody>${rows}</tbody></table>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid #2a2418;display:flex;justify-content:space-between;font-weight:800"><span>TOTAL PAID</span><span style="color:#f7c948">${money(i.total, cur)}</span></div>
      <div style="font-size:11px;color:#8a7d5e;margin-top:6px">Method: ${i.payment_method || "card"} · ${i.paystack_reference || i.transaction_id || ""}</div>
      <div style="font-size:10px;color:#6a5e44;margin-top:16px;text-align:center">${CONTACT.email} · ${CONTACT.phone}</div>
    </div>`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !inv ? (
          <div className="text-center py-8 text-muted-foreground">
            <XCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No receipt found for this transaction yet.</p>
            <p className="text-xs mt-1">Receipts are generated automatically on successful payment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div dangerouslySetInnerHTML={{ __html: receiptHtml(inv) }} />
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full flex-1" onClick={print}><Printer className="w-4 h-4" /> Download</Button>
              <Button className="rounded-full flex-1" disabled={busy || !inv.customer_email} onClick={resend}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Email
              </Button>
            </div>
            {msg && <p className="text-xs text-center text-muted-foreground">{msg}</p>}
            <p className="text-[11px] text-center text-muted-foreground">
              {inv.status === "emailed" ? `Emailed ${new Date(inv.emailed_at).toLocaleString()}` : "Not yet emailed"}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}