import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { safeEmail } from '../../shared/safeIntegration.ts';

const APP_BASE = 'https://ridex-all-go.base44.app';

// Public subscription endpoint. No login required — creates an EmailSubscriber
// with a country tag and a unique referral code, attributes the referral if a
// valid code was supplied, and sends a welcome email (+ referral notification).
// Delivery runs through the Brevo/Resend backdoor (zero Base44 credits).
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').toLowerCase().trim();
    const country = String(body?.country || '').trim();
    const referralCode = String(body?.referralCode || '').trim().toUpperCase();
    if (!email.includes('@') || !country) {
      return Response.json({ error: 'Missing or invalid email/country' }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.EmailSubscriber.filter({ email }, undefined, 1);
    if (existing.length) {
      return Response.json({ error: 'Email already subscribed' }, { status: 409 });
    }

    let referrerRecord: any = null;
    if (referralCode) {
      const refs = await base44.asServiceRole.entities.EmailSubscriber.filter({ ref_code: referralCode }, undefined, 1);
      if (!refs.length) {
        return Response.json({ error: 'Invalid referral code' }, { status: 400 });
      }
      referrerRecord = refs[0];
    }

    const refCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await base44.asServiceRole.entities.EmailSubscriber.create({
      email, country, ref_code: refCode,
      referrer: referrerRecord ? referrerRecord.email : '',
      referrals: 0, opted_out: false,
    });

    if (referrerRecord) {
      await base44.asServiceRole.entities.EmailSubscriber.update(referrerRecord.id, {
        referrals: Number(referrerRecord.referrals || 0) + 1,
      });
      waitSafe(base44, referrerRecord.email, 'You earned a referral!',
        `<p>Great news! A friend subscribed to Ride X using your referral link. You're one step closer to rewards.</p><p>— RIDE X</p>`);
    }

    const referralLink = `${APP_BASE}/subscribe-email?ref=${refCode}`;
    waitSafe(base44, email, 'Welcome to Ride X!',
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#f7c948">Welcome to Ride X!</h2>
        <p>You're now subscribed to our weekly updates (${country}).</p>
        <p>Share your unique referral link with friends and earn rewards:</p>
        <p><a href="${referralLink}">${referralLink}</a></p>
        <p>Each friend who subscribes increases your rewards.</p>
        <p>— RIDE X</p>
      </div>`);

    return Response.json({ success: true, referralCode: refCode, referralLink });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}

// Fire-and-forget email helper — never blocks the subscribe response.
function waitSafe(base44: any, to: string, subject: string, html: string) {
  safeEmail(base44, { to, subject, body: html }).catch(() => {});
}