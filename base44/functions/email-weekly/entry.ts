import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailProxy } from '../../shared/emailProxy.ts';
import { validateEmail } from '../../shared/emailValidate.ts';

const APP_BASE = 'https://ridex-all-go.base44.app';
const B2B_WEEKLY_TARGET = 200;
const B2B_SUBJECT = 'Ride X for Your Business — Weekly Partner Update';

// Weekly send — subscriber newsletter + B2B outreach.
//
// ZERO-credit trigger model: the Base44 scheduled automation was REMOVED (every
// scheduled run costs 1 integration credit). Instead this function is fired by
// (a) the admin app-open heartbeat in AppShell and (b) the GitHub Actions Monday
// cron — both are plain function invocations, not automations, so 0 credits. All
// email goes through the Brevo/Resend backdoor (emailProxy), never Core.SendEmail.
//
// Guards:
//   - Idempotency: if last_weekly_send_date === today, no-op (fires once/week max).
//   - Cadence: only actually sends on Mondays (Lagos), unless an admin passes force.
//   - Daily cap: reads AutomationSetting.daily_email_count and caps total sends to
//     (daily_email_cap - count) so the Brevo 300/day limit is never exceeded.

function lagosDate(d = Date.now()) {
  return new Date(d + 60 * 60 * 1000).toISOString().slice(0, 10);
}
function lagosNow(d = Date.now()) {
  return new Date(d + 60 * 60 * 1000);
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    const isScheduled = !user;
    const body = await req.json?.().catch(() => ({})) || {};
    const force = !!body.force && user?.role === 'admin';

    const today = lagosDate();
    const isMonday = lagosNow().getDay() === 1; // 0=Sun..6=Sat

    // ---------- load global config (cap + idempotency) ----------
    const cfgList = await base44.asServiceRole.entities.AutomationSetting.filter({ name: 'global' });
    const cfg: any = cfgList[0] || {};
    const cap = Number(cfg.daily_email_cap ?? 290);
    const alreadyToday = cfg.last_weekly_send_date === today;
    const sentToday = cfg.daily_email_date === today ? Number(cfg.daily_email_count || 0) : 0;

    // Idempotency: already ran this Monday.
    if (alreadyToday && !force) {
      return Response.json({ ok: true, skipped: 'already-run-today', date: today, scheduled: isScheduled });
    }
    // Cadence: only Mondays (unless admin force).
    if (!isMonday && !force) {
      return Response.json({ ok: true, skipped: 'not-monday', date: today, scheduled: isScheduled });
    }

    const budget = Math.max(0, cap - sentToday);
    if (budget <= 0) {
      // Mark ran so we don't keep retrying today; the cap reset tomorrow frees it.
      await base44.asServiceRole.entities.AutomationSetting.updateMany(
        { name: 'global' },
        { $set: { last_weekly_send_date: today } }
      ).catch(() => {});
      return Response.json({ ok: true, skipped: 'daily-cap-reached', cap, sentToday, scheduled: isScheduled });
    }

    // ---------- 1) Subscriber newsletter ----------
    let subSent = 0, subFailed = 0, subSkipped = 0;
    const subs = await base44.asServiceRole.entities.EmailSubscriber.list('-created_date', 1000);
    for (const s of subs as any[]) {
      if (subSent >= budget) break;
      if (s.opted_out) { subSkipped++; continue; }
      const nigeria = String(s.country || '').startsWith('Nigeria');
      const subject = nigeria ? 'Ride X Nigeria – Weekly Updates' : 'Ride X – Weekly Updates';
      const html = nigeria ? nigeriaWeekly(s.email) : globalWeekly(s.email);
      try {
        const r = await emailProxy({ to: s.email, subject, body: html });
        if (r.ok) subSent++; else subFailed++;
      } catch { subFailed++; }
    }

    // ---------- 2) B2B outreach (validated + rotated) ----------
    let b2bSent = 0, b2bFailed = 0, b2bInvalid = 0, b2bSkipped = 0;
    const remaining = budget - subSent;
    if (remaining > 0) {
      const bizAll = await base44.asServiceRole.entities.BusinessEmail.list('-created_date', 2000);
      const eligible = (bizAll as any[]).filter((b) => !b.opted_out);
      eligible.sort((a, b) => String(a.last_sent_date || '').localeCompare(String(b.last_sent_date || '')));
      const b2bLimit = Math.min(B2B_WEEKLY_TARGET, remaining);
      for (const b of eligible) {
        if (b2bSent >= b2bLimit) break;
        const v = await validateEmail(b.email);
        if (!v.valid) { b2bInvalid++; continue; }
        const html = b2bWeekly(b.email, b.country);
        try {
          const r = await emailProxy({ to: b.email, subject: B2B_SUBJECT, body: html });
          if (r.ok) {
            await base44.asServiceRole.entities.BusinessEmail.update(b.id, { last_sent_date: today });
            b2bSent++;
          } else { b2bFailed++; }
        } catch { b2bFailed++; }
      }
      b2bSkipped = eligible.length - b2bSent - b2bFailed - b2bInvalid;
    }

    const totalSent = subSent + b2bSent;

    // ---------- persist cap + idempotency atomically ----------
    const newCount = sentToday + totalSent;
    const setOps: any = { daily_email_date: today, last_weekly_send_date: today };
    if (cfg.daily_email_date !== today) {
      // new day → reset the counter to this run's sends
      setOps.daily_email_count = newCount;
      await base44.asServiceRole.entities.AutomationSetting.updateMany(
        { name: 'global' }, { $set: setOps }
      ).catch(() => {});
    } else {
      await base44.asServiceRole.entities.AutomationSetting.updateMany(
        { name: 'global' },
        { $inc: { daily_email_count: totalSent }, $set: { daily_email_date: today, last_weekly_send_date: today } }
      ).catch(() => {});
    }

    return Response.json({
      ok: true,
      scheduled: isScheduled,
      date: today,
      cap,
      budget,
      subscribers: { sent: subSent, failed: subFailed, skipped: subSkipped },
      b2b: { sent: b2bSent, failed: b2bFailed, invalid: b2bInvalid, target: B2B_WEEKLY_TARGET, available: remaining > 0 ? (await base44.asServiceRole.entities.BusinessEmail.list('-created_date', 1)).length : 0 },
      totalSent,
      runningDailyTotal: newCount,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}

function unsubLink(email: string) {
  return `${APP_BASE}/functions/email-unsubscribe?email=${encodeURIComponent(email)}`;
}

function nigeriaWeekly(email: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
    <h2 style="color:#b8964d">Ride X Nigeria</h2>
    <p>Hello from Ride X! Here's what's new this week for our Nigerian community:</p>
    <ul><li>Exclusive offers for Lagos and beyond</li><li>Local events and partnerships</li><li>Tips to get the most out of Ride X</li></ul>
    <p>Stay connected and enjoy the ride!</p>
    <p><a href="https://ridex-all-go.base44.app">Visit Ride X Nigeria</a></p>
    <p style="margin-top:24px;font-size:11px;color:#888">If you no longer wish to receive these emails, <a href="${unsubLink(email)}">unsubscribe here</a>.</p>
  </div>`;
}

function globalWeekly(email: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
    <h2 style="color:#b8964d">Ride X</h2>
    <p>Hello from Ride X! Here's what's new this week:</p>
    <ul><li>Global platform updates</li><li>Tips and tricks</li><li>Special offers</li></ul>
    <p>Stay tuned and enjoy the ride!</p>
    <p><a href="https://ridex-all-go.base44.app">Visit Ride X</a></p>
    <p style="margin-top:24px;font-size:11px;color:#888">If you no longer wish to receive these emails, <a href="${unsubLink(email)}">unsubscribe here</a>.</p>
  </div>`;
}

function b2bWeekly(email: string, country: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
    <h2 style="color:#b8964d">Ride X for Your Business</h2>
    <p>Dear Business Partner,</p>
    <p>Ride X is the all-in-one platform for rides, logistics, equipment rental, car wash, entertainment and live events${country ? ` in ${country}` : ''}. Partner with us to reach new customers and streamline your operations.</p>
    <ul><li>List your business on the Ride X marketplace</li><li>Access a national logistics & delivery network</li><li>Sponsor live events and reach engaged audiences</li></ul>
    <p>Reply to this email or visit our website to learn more.</p>
    <p><a href="https://ridex-all-go.base44.app">Visit Ride X</a></p>
    <p style="margin-top:24px;font-size:11px;color:#888">If you no longer wish to receive emails from us, <a href="${unsubLink(email)}">unsubscribe here</a>.</p>
  </div>`;
}