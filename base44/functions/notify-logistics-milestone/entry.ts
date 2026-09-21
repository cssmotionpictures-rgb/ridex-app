import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { safeEmail } from "../../shared/safeIntegration.ts";

// Automatic Logistics X milestone notifier. Fires one branded email to the
// receiver per delivery status change (pickup, in_transit, arriving_soon,
// delivered…). Dedup'd via notified_milestones so a status never emails twice.
// Routed through safeEmail (Brevo → Resend → Base44 → local) so it never
// breaks on a credit limit.

const MILESTONES: Record<string, { title: string; line: string }> = {
  driver_assigned: { title: "Courier assigned", line: "A courier has been assigned to your package and is heading to the pickup point." },
  pickup: { title: "Package picked up", line: "Your package has been collected and is now on its way." },
  in_transit: { title: "On the way", line: "Your package is on the move and heading toward the delivery address." },
  arriving_soon: { title: "Arriving soon", line: "Your courier is nearby and will arrive shortly. Have the 6-digit delivery code ready." },
  delivered: { title: "Delivered", line: "Your package has been delivered. Thank you for using RIDE X Logistics." },
  cancelled: { title: "Cancelled", line: "This delivery has been cancelled. Contact RIDE X support if this wasn't you." },
};

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const id = body.logistics_id || body.id;
    const status = body.status;
    if (!id || !status) return Response.json({ error: "logistics_id and status required" }, { status: 400 });

    const log = await base44.asServiceRole.entities.LogisticsRequest.get(id).catch(() => null);
    if (!log) return Response.json({ error: "not found" }, { status: 404 });

    const to = (log.receiver_email || "").trim();
    if (!to) return Response.json({ skipped: "no receiver email" });

    // Dedup: never email the same milestone twice
    const already = String(log.notified_milestones || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (already.includes(status)) return Response.json({ skipped: "already notified", status });

    const m = MILESTONES[status] || { title: status.replace(/_/g, " "), line: "Your delivery status has been updated." };
    // Receiver-friendly tracking page — works with just the tracking number, no login to an internal id needed.
    const trackUrl = `https://ridex-all-go.base44.app/track?number=${log.tracking_number || id}`;
    const html = `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:Manrope,Segoe UI,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#121212;color:#f5f1e6;border:1px solid #2a2418;border-radius:16px;overflow:hidden">
  <div style="padding:24px 28px;background:linear-gradient(120deg,#1a140a,#12100a);border-bottom:1px solid #c5a05933">
    <div style="font-size:22px;font-weight:800;letter-spacing:.04em">RIDE <span style="color:#f7c948">X</span></div>
    <div style="font-size:11px;color:#b9a98a;letter-spacing:.16em;text-transform:uppercase;margin-top:2px">Logistics X · Status Update</div>
  </div>
  <div style="padding:24px 28px">
    <h1 style="font-size:20px;margin:0 0 8px">${m.title}</h1>
    <p style="color:#b9a98a;font-size:14px;line-height:1.6">${m.line}</p>
    <div style="background:#1a1a1a;border-radius:12px;padding:14px 16px;margin:18px 0">
      <div style="font-size:11px;color:#8a7d5e;text-transform:uppercase;letter-spacing:.12em">Tracking #</div>
      <div style="font-family:monospace;font-weight:700;margin-top:2px">${log.tracking_number || id}</div>
      <div style="font-size:12px;color:#b9a98a;margin-top:10px">${log.pickup_address || ""} &rarr; ${log.delivery_address || ""}</div>
    </div>
    <p style="margin-top:18px"><a href="${trackUrl}" style="background:#f7c948;color:#0b0b12;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:999px">Track on the map</a></p>
    <p style="font-size:11px;color:#6a5e44;margin-top:20px">RIDE X Live Routing Desk &middot; +234 902 004 2099</p>
  </div>
</div></body></html>`;

    const subject = `RIDE X Logistics — ${m.title} · ${log.tracking_number || ""}`;
    const res = await safeEmail(base44, { to, subject, body: html });
    already.push(status);
    await base44.asServiceRole.entities.LogisticsRequest.update(id, { notified_milestones: already.join(",") }).catch(() => {});

    return Response.json({ sent: true, status, to, source: res.source, ok: res.ok });
  } catch (e: any) {
    console.error("notify-logistics-milestone error:", e?.message);
    return Response.json({ error: e?.message || "failed" }, { status: 500 });
  }
}