import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { findOfficialEmailCached, sendDirectEmail, esc } from "../../shared/officialEmailSearch.ts";
import { getAutomationConfig } from '../../shared/automation.ts';

// Weekly roster & ticket-availability broadcast — auto-sent EVERY MONDAY
// 08:00 Lagos by the scheduled cron (weekly_monday_08am_lagos).
//
// Modes:
//   • Scheduled (cron, no user) — uses the saved recipient list and honours
//     the auto_broadcast_roster toggle.
//   • Manual — admin pastes recipients (or uses the saved list) and sends.
//   • AUTO EMAIL SEARCH — when no list is saved, the real official contact
//     emails of Nigerian promoters & entertainment media directors are
//     found by LIVE WEB SEARCH (cached in AutomationSetting so each target
//     is searched once, ever) and saved as the broadcast list. Works for the
//     scheduled Monday run and for manual "Auto-find" from the admin page.
//     dry_run=true performs the search/save WITHOUT sending.
//
// Delivery goes straight through the app's own email channel (Brevo →
// Resend) — never Base44 Core.SendEmail, so workspace credit limits can
// never block the Monday dispatch, and everything runs server-side (no
// browser CORS concerns).

// Promoter & media-director discovery targets — each is searched once, ever.
const APP_BASE = 'https://ridex-all-go.base44.app';
const IND_SUBJECT = 'Everything you can do on Ride X this week';

function lagosDate(d = Date.now()) {
  return new Date(d + 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Weekly services-overview email for subscribed individuals — a tour of
// everything Ride X offers, with a one-tap unsubscribe.
function individualsHtml(email: string): string {
  const svc = (name: string, desc: string) =>
    `<tr><td style="padding:7px 10px;font-weight:600;white-space:nowrap">${esc(name)}</td><td style="padding:7px 10px;color:#374151">${esc(desc)}</td></tr>`;
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:0 auto">
    <div style="background:#0d0d12;padding:18px 22px;border-radius:12px 12px 0 0">
      <p style="margin:0;color:#f7c948;font-weight:bold;font-size:16px">RIDE X</p>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:12px">One app, every service you need</p>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:18px 22px">
      <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Hi! Here's a quick tour of everything you can do on <strong>Ride X</strong> this week:</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:14px">
        ${svc('Ride X', 'Book city rides with live tracking')}
        ${svc('Logistics X', 'Same-day package delivery anywhere')}
        ${svc('Equipment', 'Rent excavators, generators & heavy machinery')}
        ${svc('Carwash X', 'On-demand car wash at your location')}
        ${svc('Vibe & Tap', 'Find restaurants and book venues')}
        ${svc('Movies, TV & Music', 'Stream movies, live TV stations and music')}
        ${svc('Live Sports', 'Live scores, predictions & match streams')}
        ${svc('Events & Tickets', 'Concerts, events and instant QR tickets')}
        ${svc('Marketplace', 'Buy and sell with escrow protection')}
        ${svc('Talent & Promotions', 'Book artists, influencers & studio services')}
        ${svc('Rewards', 'Earn points on every service')}
      </table>
      <p style="margin:0"><a href="${APP_BASE}" style="display:inline-block;background:#f7c948;color:#0d0d12;font-weight:bold;padding:10px 18px;border-radius:999px;text-decoration:none">Open Ride X</a></p>
      <p style="font-size:11px;color:#888;margin:18px 0 0">You're receiving this because you subscribed to Ride X updates. <a href="${APP_BASE}/functions/email-unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe here</a>.</p>
    </div>
  </body></html>`;
}

// Individual-consumer discovery — searched fresh EVERY Monday (the cache key
// carries the week's date, so unlike the promoter targets these are re-searched
// weekly). Every genuinely new email is saved as an EmailSubscriber record
// (source 'web-search') so it dedupes automatically and joins the rotation.
const INDIVIDUAL_QUERIES = [
  'the public contact email address of an individual freelance event planner or MC in Lagos, Nigeria who books artists and event venues',
  'the public contact email address of an individual small-business owner in Nigeria who needs logistics, equipment rental or car wash services',
  'the public contact email address of an individual music fan, content creator or movie lover in Nigeria',
];

async function discoverIndividuals(base44: any): Promise<{ found: number; created: number }> {
  const subs = await base44.asServiceRole.entities.EmailSubscriber.list('-created_date', 1000).catch(() => []);
  const existing = new Set((subs || []).map((s: any) => String(s.email || '').toLowerCase()));
  let found = 0; let created = 0;
  for (let i = 0; i < INDIVIDUAL_QUERIES.length; i++) {
    const hit = await findOfficialEmailCached(base44, `individual:${lagosDate()}:${i + 1}`, INDIVIDUAL_QUERIES[i]).catch(() => null);
    if (!hit?.email || existing.has(hit.email)) continue;
    found++;
    try {
      await base44.asServiceRole.entities.EmailSubscriber.create({ email: hit.email, country: 'Discovered', source: 'web-search' });
      existing.add(hit.email);
      created++;
    } catch {}
  }
  return { found, created };
}

const BROADCAST_TARGETS = [
  { key: 'flytime', query: 'the official contact email address of Flytime Promotions, the Nigerian live-event promotions company' },
  { key: 'duke-concept', query: 'the official contact email address of Duke Concept, the Nigerian event promotions company' },
  { key: 'pulse-nigeria', query: 'the official contact email address of Pulse Nigeria, the Nigerian entertainment media company' },
  { key: 'bellanaija', query: 'the official contact email address of BellaNaija, the Nigerian entertainment media company' },
  { key: 'the-net-ng', query: 'the official contact email address of The NET NG (thenet.ng), the Nigerian entertainment news company' },
  { key: 'notjustok', query: 'the official contact email address of NotJustOk, the Nigerian music media company' },
  { key: 'guardian-life', query: 'the official contact email address of Guardian Life, The Guardian Nigeria entertainment magazine' },
  { key: 'soundcity', query: 'the official contact email address of Soundcity TV, the Nigerian music television network' },
];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    const isScheduled = !user; // no user context = cron / system run
    if (!isScheduled && user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const cfg = await getAutomationConfig(base44);
    // Scheduled runs honour the master toggle (explicit off is respected).
    if (isScheduled && cfg && cfg.auto_broadcast_roster === false) {
      return Response.json({ skipped: 'auto_broadcast_roster off' });
    }

    const body = (await req.json().catch(() => ({}))) || {};
    let recipients: string[] = Array.isArray(body?.recipients)
      ? body.recipients
      : typeof body?.recipients === 'string'
        ? body.recipients.split(/[\n,]/).map((s: string) => s.trim()).filter(Boolean)
        : [];
    // Fall back to the saved default list.
    if (!recipients.length) {
      recipients = String(cfg?.broadcast_recipients || '').split(/[\n,]/).map((s: string) => s.trim()).filter(Boolean);
    }

    // AUTO EMAIL SEARCH — no saved list: discover the real, official contact
    // emails of promoters & media directors by live web search, then save
    // them so every future Monday run sends without searching again.
    let autoFound = 0;
    if (!recipients.length) {
      const searchLimit = Math.min(Math.max(Number(body?.search_limit) || 3, 1), 5);
      let fresh = 0;
      const discovered: string[] = [];
      for (const t of BROADCAST_TARGETS) {
        if (fresh >= searchLimit) break;
        const found = await findOfficialEmailCached(base44, `broadcast:${t.key}`, t.query).catch(() => null);
        if (!found?.email) continue;
        if (!found.cached) fresh++;
        if (!discovered.includes(found.email)) discovered.push(found.email);
      }
      recipients = discovered;
      autoFound = discovered.length;
      if (discovered.length) {
        await base44.asServiceRole.entities.AutomationSetting.updateMany(
          { name: 'global' },
          { $set: { broadcast_recipients: discovered.join('\n') } }
        ).catch(() => {});
      }
    }

    if (!recipients.length) {
      return Response.json({ error: 'No recipients available yet — the automatic email search found none this run. It retries next Monday, or use Auto-find emails on the Roster Broadcast page.', scheduled: isScheduled }, { status: 400 });
    }

    // Admin dry-run: search + save only — no emails are sent. Also previews
    // how many active individuals would get the weekly services email.
    if (body?.dry_run) {
      const discovery = await discoverIndividuals(base44);
      const subs = await base44.asServiceRole.entities.EmailSubscriber.list('-created_date', 1000).catch(() => []);
      const eligible = (subs || []).filter((s: any) => s.email && s.opted_out !== true);
      const cap = Number(cfg?.daily_email_cap ?? 290);
      const sentToday = cfg?.daily_email_date === lagosDate() ? Number(cfg?.daily_email_count || 0) : 0;
      return Response.json({
        ok: true, dry_run: true, autoFound, recipients,
        individualsPreview: { eligible: eligible.length, discovered: discovery.created, wouldSend: Math.min(50, Math.max(0, cap - sentToday - recipients.length)) },
      });
    }

    const artists: any[] = await base44.asServiceRole.entities.TalentArtist
      .filter({ status: 'active' }, '-booking_price', 60);

    const lines = artists.slice(0, 12).map((a: any) => {
      const gross = Math.round(Number(a.booking_price) || 0);
      const net = Math.round(gross / 1.2);
      const intl = a.international_fee
        ? `$${Number(a.international_fee).toLocaleString()} net ($${Math.round(Number(a.international_fee) * 1.2).toLocaleString()} gross)`
        : 'On request';
      return `• ${a.stage_name} (${a.talent_type}) — Local: NGN ${net.toLocaleString()} net -> NGN ${gross.toLocaleString()} gross | Int'l: ${intl}`;
    }).join('\n');

    const subject = 'Live Performance Slot Availability & Ticket Inventory Update – Q3/Q4 2026';
    const text =
      `Good morning Promoters and Media Directors,\n\n` +
      `Please find the updated baseline local performance show-fee structures and routing windows for our active talent pool for the upcoming event cycle. All fees are net to artist and require logistical rider clearance:\n\n` +
      lines + `\n\n` +
      `For instant calendar locks, review the official Artist-Venue-Promoter Escrow Framework, submit your executed LOI to our routing desk, or audit current festival tickets via the Flytime Fest Box Office Portal.\n\n` +
      `Best regards,\nThe Lead Routing Desk\nRIDE X Live Routing Desk · +234 902 004 2099`;

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:0 auto"><div style="padding:18px 20px;font-size:14px;line-height:1.6">${esc(text).replace(/\n/g, '<br>')}</div></body></html>`;

    let sent = 0; let failed = 0; const results: any[] = [];
    for (const email of recipients) {
      try {
        const _e = await sendDirectEmail({ to: email, subject, body: html, from_name: 'RIDE X Live Routing Desk' });
        if (_e.ok) { sent++; results.push({ email, status: 'sent' }); }
        else { failed++; results.push({ email, status: 'failed', error: (_e.error || 'failed').slice(0, 200) }); }
      } catch (e: any) {
        failed++; results.push({ email, status: 'failed', error: (e?.message || 'failed').slice(0, 200) });
      }
    }

    // ---------- ACTIVE INDIVIDUALS — weekly services blast ----------
    // A rotating sample of subscribed individuals also receives a
    // what-Ride-X-offers email, so the service catalog reaches real people
    // every Monday — not just the promoter network. last_sent_date rotation
    // gives everyone a turn without repeating the same people weekly, and
    // the global daily cap keeps the Brevo limit safe.
    let indSent = 0; let indFailed = 0; let indSkipped = 0; let indDiscovered = 0;
    const today = lagosDate();
    const cap = Number(cfg?.daily_email_cap ?? 290);
    const sentToday = cfg?.daily_email_date === today ? Number(cfg?.daily_email_count || 0) : 0;
    const remainingBudget = Math.max(0, cap - sentToday - sent - failed);
    if (remainingBudget > 0) {
      // AUTO-SEARCH INDIVIDUALS — every run (Monday cron included) live web
      // search discovers genuinely new individual contact emails first, so
      // the blast reaches fresh people every week, not subscribers alone.
      indDiscovered = (await discoverIndividuals(base44)).created;
      const subs = await base44.asServiceRole.entities.EmailSubscriber.list('-created_date', 1000).catch(() => []);
      const eligible = (subs || []).filter((s: any) => s.email && s.opted_out !== true);
      eligible.sort((a: any, b: any) => String(a.last_sent_date || '').localeCompare(String(b.last_sent_date || '')));
      const limit = Math.min(50, remainingBudget);
      for (const s of eligible.slice(0, limit)) {
        try {
          const r = await sendDirectEmail({ to: s.email, subject: IND_SUBJECT, body: individualsHtml(s.email), from_name: 'RIDE X' });
          if (r.ok) {
            indSent++;
            await base44.asServiceRole.entities.EmailSubscriber.update(s.id, { last_sent_date: today }).catch(() => {});
          } else indFailed++;
        } catch { indFailed++; }
      }
      indSkipped = Math.max(0, eligible.length - Math.min(eligible.length, limit));
    }

    const totalSent = sent + indSent;
    if (totalSent > 0) {
      await base44.asServiceRole.entities.AutomationSetting.updateMany(
        { name: 'global' },
        { $inc: { daily_email_count: totalSent }, $set: { daily_email_date: today } }
      ).catch(() => {});
    }

    // Weekly log row for the Admin delivery-trends chart — one row per
    // dispatch day, upserted so a re-run never duplicates the week.
    try {
      const logs = await base44.asServiceRole.entities.BroadcastLog.filter({ week_key: today });
      const logPayload = {
        promoter_sent: sent, promoter_failed: failed,
        individuals_sent: indSent, individuals_failed: indFailed, individuals_discovered: indDiscovered,
        recipients: recipients.length, total_sent: totalSent, scheduled: isScheduled,
      };
      if (logs?.[0]?.id) await base44.asServiceRole.entities.BroadcastLog.update(logs[0].id, logPayload);
      else await base44.asServiceRole.entities.BroadcastLog.create({ week_key: today, ...logPayload });
    } catch {}
    return Response.json({ ok: true, sent, failed, autoFound, individuals: { sent: indSent, failed: indFailed, skipped: indSkipped, discovered: indDiscovered }, totalSent, results, scheduled: isScheduled });
  } catch (error: any) {
    console.error('[broadcast-roster]', error?.message);
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}