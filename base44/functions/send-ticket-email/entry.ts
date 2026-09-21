import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { sendDirectEmail, esc } from "../../shared/officialEmailSearch.ts";

// Send-Ticket-Email — automatic ticket delivery. After a successful purchase
// the buyer's ticket (QR image + entry code + event details) is emailed
// straight to their inbox through the app's own email channel (Brevo/Resend —
// zero Base44 integration credits). Only the buyer (or an admin) can trigger
// it, and each ticket is emailed at most once.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (!body.ticket_id) return Response.json({ error: "ticket_id required" }, { status: 400 });

    const t = await base44.asServiceRole.entities.EventTicket.get(body.ticket_id);
    const ticket = t?.data || t;
    if (!ticket?.id) return Response.json({ error: "Ticket not found" }, { status: 404 });
    if (ticket.user_id !== user.id && user.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!ticket.user_email) return Response.json({ ok: false, error: "No buyer email on this ticket" });
    if (ticket.emailed_at) return Response.json({ ok: true, already: true, email: ticket.user_email });

    const ev = await base44.asServiceRole.entities.LiveEvent.get(ticket.event_id).catch(() => null);
    const event = (ev?.data || ev) || {};

    const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(ticket.qr_code || ticket.id)}`;
    const dateLine = event.event_date ? new Date(event.event_date).toUTCString() : "";
    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:0 auto">
      <div style="background:#0d0d12;padding:18px 22px;border-radius:12px 12px 0 0">
        <p style="margin:0;color:#f7c948;font-weight:bold;font-size:16px">RIDE X EVENTS</p>
        <p style="margin:4px 0 0;color:#9ca3af;font-size:12px">Your ticket is confirmed — show the QR at entry</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:20px 22px;text-align:center">
        <p style="font-size:18px;font-weight:bold;margin:0 0 2px">${esc(ticket.event_title || "Ride X Event")}</p>
        ${dateLine ? `<p style="font-size:13px;color:#4b5563;margin:0 0 4px">${esc(dateLine)}</p>` : ""}
        ${event.venue ? `<p style="font-size:13px;color:#4b5563;margin:0 0 14px">${esc(event.venue)}${event.city ? ", " + esc(event.city) : ""}</p>` : ""}
        <img src="${qrImg}" alt="Ticket QR code" width="220" height="220" style="border:1px solid #e5e7eb;border-radius:12px;padding:8px" />
        <p style="font-size:15px;font-weight:bold;letter-spacing:2px;margin:12px 0 2px">${esc(ticket.qr_code)}</p>
        <p style="font-size:12px;color:#6b7280;margin:0 0 16px">Show this code / QR at the entrance</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;text-align:left;margin-bottom:6px">
          <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Ticket type</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${esc(ticket.ticket_type)}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Admissions</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${esc(ticket.quantity)}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Buyer</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${esc(ticket.user_name || "")}</td></tr>
        </table>
        <p style="font-size:11px;color:#9ca3af;margin:14px 0 0">Purchased through the Ride X app. Open the app → Events to view this ticket anytime.</p>
      </div>
    </body></html>`;

    const res = await sendDirectEmail({
      to: ticket.user_email,
      subject: `Your Ride X ticket — ${ticket.event_title}`,
      body: html,
      from_name: "RIDE X Events",
    });

    if (res.ok) {
      await base44.asServiceRole.entities.EventTicket.update(ticket.id, {
        emailed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, email: ticket.user_email, provider: res.bypassed });
    }
    return Response.json({ ok: false, error: res.error || "Email delivery failed" });
  } catch (error) {
    console.error("[send-ticket-email]", error?.message);
    return Response.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}