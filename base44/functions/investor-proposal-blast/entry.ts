// Investor proposal distribution — sends the professional Ride X business
// proposal email to the admin-managed investor list (active LenderDirectory
// entries) through the app's own email proxy (Brevo/Resend keys), so it never
// spends Base44 integration credits. Admin-only, capped at 50 recipients per
// run; dry_run=true previews the recipient list without sending anything.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { emailProxy } from "../../shared/emailProxy.ts";

const MAX_SEND_PER_RUN = 50;
const CONCURRENCY = 5;
const SUBJECT = "Ride X — Investment Opportunity: Nigeria's All-in-One Lifestyle Super-App";

function proposalHtml(recipientName) {
  const greet = recipientName ? `Dear ${recipientName} team,` : "Hello,";
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f4f5;">
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;">
  <div style="background:#0d0d12;padding:26px 32px;">
    <p style="margin:0;font-size:12px;letter-spacing:4px;color:#f7c948;font-weight:bold;">RIDE X</p>
    <h1 style="margin:8px 0 0;color:#ffffff;font-size:21px;line-height:1.35;">Investment Opportunity — Nigeria's All-in-One Lifestyle Super-App</h1>
  </div>
  <div style="padding:28px 32px;color:#1a1a1a;font-size:14px;line-height:1.6;">
    <p>${greet}</p>
    <p>I am reaching out from <strong>Ride X</strong>, a live consumer platform that bundles the services Nigerians pay for every day into one app and one wallet:</p>
    <ul style="padding-left:20px;">
      <li>Ride-hailing — cars and bikes with a name-your-fare marketplace model</li>
      <li>Logistics X — same-hour parcel delivery with live tracking</li>
      <li>Heavy equipment rental (Caterpillar-class machinery)</li>
      <li>Restaurant discovery and car-wash bookings</li>
      <li>Movie streaming, live sports and TV</li>
      <li>A general marketplace and virtual card services</li>
    </ul>
    <h3 style="color:#0d0d12;font-size:15px;">How the business earns</h3>
    <ul style="padding-left:20px;">
      <li>Commission on every ride, delivery, rental, booking and marketplace sale</li>
      <li>Membership subscriptions (premium, ad-free tiers)</li>
      <li>Advertising and sponsored placements across the platform</li>
      <li>Card funding and transaction fees</li>
    </ul>
    <h3 style="color:#0d0d12;font-size:15px;">Why now</h3>
    <p>Nigeria is Africa's largest digital economy, and demand for consolidated, affordable everyday services keeps accelerating. Ride X is already built and operating — the platform is live end to end with payments, logistics and streaming running in production.</p>
    <h3 style="color:#0d0d12;font-size:15px;">The opportunity</h3>
    <p>We are opening a conversation with a select group of investors to fund our next growth phase: city-by-city expansion, fleet and logistics scale-up, and user acquisition. I would welcome the chance to walk you through the full business plan, traction data and financial model.</p>
    <p>Simply reply to this email and we will schedule a call at your convenience.</p>
    <p style="margin-bottom:0;">Warm regards,<br/><strong>The Ride X Team</strong><br/>cssmotionpictures@gmail.com · www.cssmotionpictures.com</p>
  </div>
  <div style="background:#0d0d12;color:#8a8a8a;font-size:11px;padding:14px 32px;">
    You are receiving this note as a professional investment outreach from Ride X. Reply with "unsubscribe" to opt out of future correspondence.
  </div>
</div>
</body></html>`;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Admins only" }, { status: 403 });

    let payload = {};
    try { payload = await req.json(); } catch { payload = {}; }
    const dryRun = payload.dry_run === true;

    // The investor list = active funding-directory entries (admin-managed)
    // PLUS any investor emails pasted directly from the dashboard.
    const lenders = await base44.entities.LenderDirectory.filter({ active: true }, "name", 500).catch(() => []);
    const seen = new Set();
    const recipients = [];
    const addRecipient = (name, email) => {
      const clean = String(email || "").trim().toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) && !seen.has(clean)) {
        seen.add(clean);
        recipients.push({ name: name || "", email: clean });
      }
    };
    for (const l of lenders) addRecipient(l.name, l.email);
    const pasted = Array.isArray(payload.emails) ? payload.emails : [];
    for (const e of pasted) addRecipient("", e);
    const slice = recipients.slice(0, MAX_SEND_PER_RUN);

    if (dryRun) {
      return Response.json({
        ok: true,
        dry_run: true,
        total: recipients.length,
        would_send_to: slice.map((r) => r.email),
      });
    }

    const results = { sent: 0, failed: 0, failures: [] };
    for (let i = 0; i < slice.length; i += CONCURRENCY) {
      const batch = slice.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (r) => {
        const res = await emailProxy({ to: r.email, subject: SUBJECT, body: proposalHtml(r.name) });
        if (res.ok) {
          results.sent++;
        } else {
          results.failed++;
          results.failures.push({ email: r.email, error: String(res.error || res.bypassed).slice(0, 120) });
        }
      }));
    }

    return Response.json({
      ok: results.failed === 0,
      total: recipients.length,
      attempted: slice.length,
      sent: results.sent,
      failed: results.failed,
      skipped: recipients.length - slice.length,
      failures: results.failures.slice(0, 10),
    });
  } catch (error) {
    console.error("[investor-proposal-blast]", error?.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}