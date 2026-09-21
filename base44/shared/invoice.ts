import { safeEmail } from "./safeIntegration.ts";

// Central invoice/receipt engine — shared by paystack-webhook, create-invoice,
// email-invoice and the admin hubs. One source of truth for every service.

export const CONTACT = {
  email: "cssmotionpictures@gmail.com",
  website: "www.cssmotionpictures.com",
  social: "@CSSMotionPictures",
  phone: "+234 902 004 2099",
  banks: "Zenith Bank PLC / Guaranty Trust Bank",
  agency: "Ride X Live Routing Desk",
};

export const SERVICE_LABELS: Record<string, string> = {
  ride: "Ride X Trip",
  logistics: "Logistics X Delivery",
  equipment: "CSS Constructions — Equipment Rental",
  carwash: "Carwash X Booking",
  movie: "CSS Motion Pictures — Movie Unlock",
  music: "RIDE X Sounds — Music Purchase",
  subscription: "Sports Membership",
  ads: "Ad Placement",
  marketplace: "Marketplace Purchase",
  boost: "Listing Boost",
  card: "Ride X Card Top-up",
  talent_booking: "Talent Booking (20% gross-up)",
  event_ticket: "Live Event Ticket",
  curator_submission: "Curator Submission",
  influencer_submission: "Influencer Campaign",
  tour_run: "Multi-City Tour Run",
  licensing: "Song License",
  vip: "VIP Subscription",
};

export function genInvoiceNumber(): string {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `RDX-${d.getFullYear()}-${rand}`;
}

export function buildLineItems(tx: any): any[] {
  const total = Number(tx?.amount) || 0;
  const commission = Number(tx?.commission) || 0;
  const net = Math.max(0, total - commission);
  const label = SERVICE_LABELS[tx?.service] || tx?.description || "Ride X Service";
  return [{ label, net, commission, total }];
}

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function fmt(n: number, currency: string): string {
  const sym = currency === "USD" ? "$" : "₦";
  return `${sym}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function buildReceiptHtml(inv: any): string {
  let lines: any[] = [];
  try { lines = JSON.parse(inv.line_items || "[]"); } catch { lines = []; }
  if (!lines.length) lines = buildLineItems(inv);
  const cur = inv.currency || "NGN";
  const rows = lines
    .map(
      (l) => `<tr>
        <td style="padding:10px 8px;border-bottom:1px solid #f0e6c8">${esc(l.label)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0e6c8;text-align:right">${fmt(l.net, cur)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0e6c8;text-align:right">${fmt(l.commission, cur)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0e6c8;text-align:right;font-weight:700">${fmt(l.total, cur)}</td>
      </tr>`
    )
    .join("");

  const issued = inv.created_date ? new Date(inv.created_date).toLocaleString() : new Date().toLocaleString();

  return `<!doctype html>
<html><body style="margin:0;background:#0a0a0a;font-family:Manrope,Segoe UI,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#121212;color:#f5f1e6;border:1px solid #2a2418;border-radius:16px;overflow:hidden">
  <div style="padding:24px 28px;background:linear-gradient(120deg,#1a140a,#12100a);border-bottom:1px solid #c5a05933">
    <div style="font-size:22px;font-weight:800;letter-spacing:.04em">RIDE <span style="color:#f7c948">X</span></div>
    <div style="font-size:11px;color:#b9a98a;letter-spacing:.16em;text-transform:uppercase;margin-top:2px">Official Payment Receipt</div>
  </div>
  <div style="padding:24px 28px">
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#b9a98a;margin-bottom:16px">
      <span>Receipt #${esc(inv.invoice_number)}</span>
      <span>${issued}</span>
    </div>
    <div style="background:#1a1a1a;border-radius:12px;padding:14px 16px;margin-bottom:18px">
      <div style="font-size:11px;color:#8a7d5e;text-transform:uppercase;letter-spacing:.12em">Billed To</div>
      <div style="font-weight:700;margin-top:2px">${esc(inv.customer_name || "Customer")}</div>
      <div style="font-size:12px;color:#b9a98a">${esc(inv.customer_email || "")}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="color:#8a7d5e;text-transform:uppercase;font-size:10px;letter-spacing:.1em">
          <td style="padding:6px 8px">Description</td>
          <td style="padding:6px 8px;text-align:right">Net</td>
          <td style="padding:6px 8px;text-align:right">Fee</td>
          <td style="padding:6px 8px;text-align:right">Total</td>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:14px;border-top:1px solid #c5a05933;padding-top:12px;display:flex;justify-content:space-between;font-size:15px;font-weight:800">
      <span>TOTAL PAID</span><span style="color:#f7c948">${fmt(inv.total, cur)}</span>
    </div>
    <div style="font-size:11px;color:#8a7d5e;margin-top:6px">Payment method: ${esc(inv.payment_method || "card")} · ${esc(inv.paystack_reference || inv.transaction_id || "")}</div>
    <div style="margin-top:18px;padding:12px 14px;background:#1a1a1a;border-radius:10px;font-size:11px;color:#b9a98a;line-height:1.6">
      Funds held in customer-protection escrow until you confirm service delivery. Platform fee captured immediately.
      <br/>Questions? ${CONTACT.email} · ${CONTACT.phone}
    </div>
    <div style="margin-top:16px;font-size:10px;color:#6a5e44;text-align:center;letter-spacing:.06em">
      ${CONTACT.agency} · ${CONTACT.website} · ${CONTACT.social}
    </div>
  </div>
</div>
</body></html>`;
}

export async function getAutomationSettings(base44: any): Promise<any> {
  const list = await base44.asServiceRole.entities.AutomationSetting.filter({ name: "global" }).catch(() => []);
  if (list && list.length) return list[0];
  return await base44.asServiceRole.entities.AutomationSetting.create({ name: "global" });
}

export async function createInvoiceFromTransaction(base44: any, opts: any): Promise<any> {
  const { tx, paystackData, userId, userName, issuedBy = "system" } = opts;
  if (!tx || !tx.id) throw new Error("Transaction required");
  const lines = buildLineItems(tx);
  const subtotal = lines.reduce((s: number, l: any) => s + Number(l.net || 0), 0);
  const commission = Number(tx.commission) || 0;
  const total = Number(tx.amount) || 0;
  const customerEmail = (paystackData?.customer?.email) || tx.customer_email || "";
  const customerName = userName || paystackData?.customer?.name || tx.customer_name || "";
  const inv = await base44.asServiceRole.entities.Invoice.create({
    invoice_number: genInvoiceNumber(),
    type: "receipt",
    transaction_id: tx.id,
    service: tx.service || "ride",
    reference_id: tx.reference_id || "",
    customer_name: customerName,
    customer_email: customerEmail,
    customer_id: userId || tx.created_by_id || "",
    line_items: JSON.stringify(lines),
    subtotal,
    commission,
    total,
    currency: tx.currency || "NGN",
    payment_method: tx.method || "card",
    paystack_reference: paystackData?.reference || "",
    status: "issued",
    issued_by: issuedBy,
  });
  return inv;
}

export async function emailInvoice(base44: any, invoiceId: string): Promise<any> {
  const inv = await base44.asServiceRole.entities.Invoice.get(invoiceId);
  if (!inv) throw new Error("Invoice not found");
  if (!inv.customer_email) throw new Error("No customer email on invoice");
  const html = buildReceiptHtml(inv);
  const _e = await safeEmail(base44, { to: inv.customer_email, subject: `Ride X Receipt ${inv.invoice_number}`, body: html });
  if (!_e.ok) throw new Error(_e.error || 'email failed');
  await base44.asServiceRole.entities.Invoice.update(invoiceId, {
    status: "emailed",
    emailed_at: new Date().toISOString(),
  });
  return { ok: true, email: inv.customer_email, invoice_number: inv.invoice_number };
}