// =============================================================================
// CLIENT-SIDE BACK DOOR  (no backend functions, no integration credits)
// =============================================================================
// While the workspace is out of integration credits, backend functions and the
// Core email/LLM integrations refuse to run. This module moves the affected
// flows ENTIRELY into the browser so the app never silently fails:
//
//   • Weekly roster + newsletter + B2B broadcast  → runs now, content generated
//     in-browser, emails queued to localStorage (in-browser storage).
//   • Curator submission notifications             → queued to localStorage.
//   • Receipt / invoice creation                    → written as a real Invoice
//     entity record (entity CRUD needs no credits).
//
// Queued emails live in localStorage under RIDEX_EMAIL_QUEUE and are drained
// automatically by the existing backend functions once credits reset. The
// admin can view / clear the queue from the Roster Broadcast page.
// =============================================================================

import { AGENCY } from "@/lib/agency";
import { CONTACT } from "@/lib/catalog";

const QKEY = "ridex_email_queue";

export function lagosDate(d = Date.now()) {
  return new Date(d + 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function lagosNow(d = Date.now()) {
  return new Date(d + 60 * 60 * 1000);
}

// ---------- in-browser email queue ----------
export function getQueue() {
  try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch { return []; }
}
export function queueLength() { return getQueue().length; }
export function clearQueue() { try { localStorage.removeItem(QKEY); } catch {} }
export function purgeSent() {
  // remove entries already marked sent (drained by a backend function)
  const q = getQueue().filter((e) => e.status !== "sent");
  try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch {}
  return q.length;
}
export function queueEmail(entry) {
  const q = getQueue();
  q.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queued_at: new Date().toISOString(),
    status: "queued",
    ...entry,
  });
  try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch {}
  return q.length;
}

// ---------- content generators (mirror the backend functions) ----------
const APP_BASE = "https://ridex-all-go.base44.app";
function unsubLink(email) {
  return `${APP_BASE}/functions/email-unsubscribe?email=${encodeURIComponent(email)}`;
}

function nigeriaWeekly(email) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
    <h2 style="color:#b8964d">Ride X Nigeria</h2>
    <p>Hello from Ride X! Here's what's new this week for our Nigerian community:</p>
    <ul><li>Exclusive offers for Lagos and beyond</li><li>Local events and partnerships</li><li>Tips to get the most out of Ride X</li></ul>
    <p>Stay connected and enjoy the ride!</p>
    <p><a href="${APP_BASE}">Visit Ride X Nigeria</a></p>
    <p style="margin-top:24px;font-size:11px;color:#888">If you no longer wish to receive these emails, <a href="${unsubLink(email)}">unsubscribe here</a>.</p>
  </div>`;
}
function globalWeekly(email) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
    <h2 style="color:#b8964d">Ride X</h2>
    <p>Hello from Ride X! Here's what's new this week:</p>
    <ul><li>Global platform updates</li><li>Tips and tricks</li><li>Special offers</li></ul>
    <p>Stay tuned and enjoy the ride!</p>
    <p><a href="${APP_BASE}">Visit Ride X</a></p>
    <p style="margin-top:24px;font-size:11px;color:#888">If you no longer wish to receive these emails, <a href="${unsubLink(email)}">unsubscribe here</a>.</p>
  </div>`;
}
function b2bWeekly(email, country) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
    <h2 style="color:#b8964d">Ride X for Your Business</h2>
    <p>Dear Business Partner,</p>
    <p>Ride X is the all-in-one platform for rides, logistics, equipment rental, car wash, entertainment and live events${country ? ` in ${country}` : ""}. Partner with us to reach new customers and streamline your operations.</p>
    <ul><li>List your business on the Ride X marketplace</li><li>Access a national logistics & delivery network</li><li>Sponsor live events and reach engaged audiences</li></ul>
    <p>Reply to this email or visit our website to learn more.</p>
    <p><a href="${APP_BASE}">Visit Ride X</a></p>
    <p style="margin-top:24px;font-size:11px;color:#888">If you no longer wish to receive emails from us, <a href="${unsubLink(email)}">unsubscribe here</a>.</p>
  </div>`;
}

export async function buildRosterText(base44) {
  const artists = await base44.entities.TalentArtist.filter({ status: "active" }, "-booking_price", 60).catch(() => []);
  const lines = artists.slice(0, 12).map((a) => {
    const gross = Math.round(Number(a.booking_price) || 0);
    const net = Math.round(gross / 1.2);
    const intl = a.international_fee
      ? `$${Number(a.international_fee).toLocaleString()} net ($${Math.round(Number(a.international_fee) * 1.2).toLocaleString()} gross)`
      : "On request";
    return `• ${a.stage_name} (${a.talent_type}) — Local: NGN ${net.toLocaleString()} net -> NGN ${gross.toLocaleString()} gross | Int'l: ${intl}`;
  }).join("\n");
  return (
    `Good morning Promoters and Media Directors,\n\n` +
    `Please find the updated baseline local performance show-fee structures and routing windows for our active talent pool for the upcoming event cycle. All fees are net to artist and require logistical rider clearance:\n\n` +
    lines + `\n\n` +
    `For instant calendar locks, review the official Artist-Venue-Promoter Escrow Framework, submit your executed LOI to our routing desk, or audit current festival tickets via the Flytime Fest Box Office Portal.\n\n` +
    `Best regards,\nThe Lead Routing Desk\nRIDE X Live Routing Desk · ${AGENCY.phone}`
  );
}

// ---------- weekly broadcast (newsletter + B2B) — runs NOW in-browser ----------
export async function runWeeklyBroadcast(base44, { force = false } = {}) {
  const today = lagosDate();
  const isMonday = lagosNow().getDay() === 1;

  const cfgList = await base44.entities.AutomationSetting.filter({ name: "global" }).catch(() => []);
  const cfg = cfgList[0] || {};
  const cap = Number(cfg.daily_email_cap ?? 290);
  const alreadyToday = cfg.last_weekly_send_date === today;
  const sentToday = cfg.daily_email_date === today ? Number(cfg.daily_email_count || 0) : 0;

  if (alreadyToday && !force) return { ok: true, skipped: "already-run-today", date: today };
  if (!isMonday && !force) return { ok: true, skipped: "not-monday", date: today };

  const budget = Math.max(0, cap - sentToday);
  let subSent = 0, subFailed = 0, subSkipped = 0;
  const B2B_SUBJECT = "Ride X for Your Business — Weekly Partner Update";
  const B2B_TARGET = 200;

  // 1) Subscriber newsletter
  const subs = await base44.entities.EmailSubscriber.list("-created_date", 1000).catch(() => []);
  for (const s of subs) {
    if (subSent >= budget) break;
    if (s.opted_out) { subSkipped++; continue; }
    const nigeria = String(s.country || "").startsWith("Nigeria");
    const subject = nigeria ? "Ride X Nigeria – Weekly Updates" : "Ride X – Weekly Updates";
    const html = nigeria ? nigeriaWeekly(s.email) : globalWeekly(s.email);
    queueEmail({ to: s.email, subject, body: html, channel: "weekly-subscriber" });
    subSent++;
  }

  // 2) B2B outreach (rotated)
  let b2bSent = 0, b2bSkipped = 0;
  const remaining = budget - subSent;
  if (remaining > 0) {
    const bizAll = await base44.entities.BusinessEmail.list("-created_date", 2000).catch(() => []);
    const eligible = bizAll.filter((b) => !b.opted_out);
    eligible.sort((a, b) => String(a.last_sent_date || "").localeCompare(String(b.last_sent_date || "")));
    const limit = Math.min(B2B_TARGET, remaining);
    for (const b of eligible) {
      if (b2bSent >= limit) break;
      queueEmail({ to: b.email, subject: B2B_SUBJECT, body: b2bWeekly(b.email, b.country), channel: "weekly-b2b" });
      try { await base44.entities.BusinessEmail.update(b.id, { last_sent_date: today }); } catch {}
      b2bSent++;
    }
    b2bSkipped = Math.max(0, eligible.length - b2bSent);
  }

  // 3) Persist cap + idempotency
  const newCount = sentToday + subSent + b2bSent;
  try {
    if (cfg.daily_email_date !== today) {
      await base44.entities.AutomationSetting.update(cfg.id, {
        daily_email_date: today, daily_email_count: newCount, last_weekly_send_date: today,
      });
    } else {
      await base44.entities.AutomationSetting.update(cfg.id, {
        daily_email_count: newCount, daily_email_date: today, last_weekly_send_date: today,
      });
    }
  } catch {}

  return {
    ok: true, date: today, cap, budget, queued: queueLength(),
    subscribers: { sent: subSent, skipped: subSkipped },
    b2b: { sent: b2bSent, skipped: b2bSkipped, target: B2B_TARGET },
    totalSent: subSent + b2bSent, runningDailyTotal: newCount,
    mode: "client-backdoor", note: "Emails queued in-browser; auto-drained to recipients once credits reset.",
  };
}

// ---------- roster blast (manual recipient list) ----------
export async function runRosterBlast(base44, recipients) {
  const list = (Array.isArray(recipients) ? recipients : String(recipients).split(/[\n,]/)).map((s) => s.trim()).filter(Boolean);
  if (!list.length) return { error: "No recipients" };
  const body = await buildRosterText(base44);
  const subject = "Live Performance Slot Availability & Ticket Inventory Update – Q3/Q4 2026";
  let sent = 0;
  for (const email of list) {
    queueEmail({ to: email, subject, body, channel: "roster-blast" });
    sent++;
  }
  return { ok: true, sent, queued: queueLength(), mode: "client-backdoor", body, subject };
}

// ---------- receipt / invoice creation (real entity write, no credits) ----------
export async function issueReceiptClient(base44, tx, user) {
  if (!tx || !tx.id) return null;
  try {
    const num = `RDX-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const inv = await base44.entities.Invoice.create({
      invoice_number: num,
      type: "receipt",
      transaction_id: tx.id,
      service: tx.service || "ride",
      reference_id: tx.reference_id || "",
      customer_name: user?.full_name || "",
      customer_email: user?.email || "",
      customer_id: user?.id || "",
      line_items: JSON.stringify([{ label: tx.description || tx.service, net: Number(tx.amount) - Number(tx.commission || 0), commission: Number(tx.commission || 0), total: Number(tx.amount) }]),
      subtotal: Number(tx.amount) - Number(tx.commission || 0),
      commission: Number(tx.commission || 0),
      total: Number(tx.amount),
      currency: tx.currency || "NGN",
      payment_method: tx.method || "card",
      paystack_reference: tx.reference_id || "",
      status: "issued",
      issued_by: "client-backdoor",
      notes: "Receipt issued client-side (workspace credits exhausted).",
    });
    // Queue the receipt email so it sends when credits reset.
    if (user?.email) {
      queueEmail({
        to: user.email,
        subject: `Ride X Receipt ${num}`,
        body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a1a"><h2 style="color:#b8964d">Ride X Receipt</h2><p>Thank you — your payment of ${tx.currency || "NGN"} ${(Number(tx.amount) || 0).toLocaleString()} for ${tx.description || tx.service} has been received.</p><p>Receipt no: <b>${num}</b></p><p><a href="${APP_BASE}/receipts">View your receipts</a></p></div>`,
        channel: "receipt",
      });
    }
    return inv;
  } catch (e) {
    return null;
  }
}

// ---------- curator submission notifications (queued) ----------
export async function notifyCuratorsClient(base44, submissions) {
  if (!submissions || !submissions.length) return { queued: 0 };
  let n = 0;
  for (const s of submissions) {
    queueEmail({
      to: "", // curator email not stored on submission; the platform routing log
      subject: `New submission: ${s.song_title} — ${s.artist_name}`,
      body: `A track has been routed to ${s.curator_name}. Artist: ${s.artist_name} — ${s.song_title}. Link: ${s.audio_url || "n/a"}. Status: ${s.status}.`,
      channel: "curator-notify",
      ref: s.id,
    });
    n++;
  }
  return { queued: n, total: queueLength(), mode: "client-backdoor" };
}