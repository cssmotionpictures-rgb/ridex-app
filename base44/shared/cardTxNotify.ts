// Ride X Card transaction alerts — every money movement on a Ride X virtual
// card emails the card owner a fully Ride X branded notice. The payment
// processor behind the card service is never mentioned. Sends via the direct
// email proxy (Brevo/Resend), never the credit-metered platform integration.
// Never throws: a failed alert must never break the card action behind it.
import { emailProxy } from "./emailProxy.ts";

const money = (n: any, cur?: string) => `${cur === "USD" ? "$" : "₦"}${Number(n || 0).toLocaleString("en-NG")}`;

function html(o: { title: string; name?: string; description: string; amount: number; balance?: number; currency?: string }) {
  const rows = [
    `<tr><td style="color:#8a8f98;padding:8px 0;font-size:14px;">Amount</td><td style="text-align:right;color:#f7c948;font-weight:700;padding:8px 0;font-size:14px;">${money(o.amount, o.currency)}</td></tr>`,
  ];
  if (typeof o.balance === "number") {
    rows.push(
      `<tr><td style="color:#8a8f98;padding:8px 0;border-top:1px solid #1e2230;font-size:14px;">Card balance</td>` +
      `<td style="text-align:right;color:#ffffff;font-weight:700;padding:8px 0;border-top:1px solid #1e2230;font-size:14px;">${money(o.balance, o.currency)}</td></tr>`
    );
  }
  return `<!doctype html><html><body style="margin:0;background:#0a0a10;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a10;padding:28px 12px;"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#101018;border:1px solid #23263a;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:22px 26px;border-bottom:1px solid #1c1f2e;">
        <span style="font-size:18px;font-weight:800;letter-spacing:2px;color:#f7c948;">RIDE X</span>
        <span style="font-size:11px;font-weight:700;letter-spacing:4px;color:#b8b0d9;margin-left:8px;">CARD</span>
      </td></tr>
      <tr><td style="padding:26px;">
        <h2 style="margin:0 0 6px;color:#ffffff;font-size:19px;">${o.title}</h2>
        ${o.name ? `<p style="margin:0 0 14px;color:#8a8f98;font-size:13px;">Hi ${o.name},</p>` : ""}
        <p style="margin:0 0 18px;color:#c6cad3;font-size:14px;line-height:1.6;">${o.description}</p>
        <table width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>
      </td></tr>
      <tr><td style="padding:16px 26px;border-top:1px solid #1c1f2e;color:#6b7180;font-size:11px;line-height:1.6;">
        This is an automated Ride X notification about your Ride X Card. If you did not make this transaction, freeze your card immediately in the Ride X app and contact Ride X Support.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendCardTxAlert(o: {
  to: string;
  name?: string;
  title: string;
  description: string;
  amount: number;
  balance?: number;
  currency?: string;
}): Promise<void> {
  if (!o || !o.to) return;
  try {
    const res = await emailProxy({
      to: o.to,
      subject: `Ride X Card — ${o.title}`,
      body: html(o),
    });
    if (!res.ok) console.error("[cardTxAlert] send failed:", res.error || res.bypassed);
  } catch (e: any) {
    console.error("[cardTxAlert] send failed:", e?.message);
  }
}