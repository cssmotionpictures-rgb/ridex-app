import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const code = (body?.code || '').toString().trim().toUpperCase();
    if (!code) return Response.json({ error: 'Referral code required' }, { status: 400 });

    const referrers = await base44.asServiceRole.entities.Referrer.filter({ referral_code: code }, '-created_date', 5);
    const referrer = referrers.find((r) => r.status === 'approved') || referrers[0];
    if (!referrer) return Response.json({ error: 'Invalid referral code' }, { status: 404 });
    if (referrer.status !== 'approved') return Response.json({ error: 'Referrer not active yet' }, { status: 403 });

    const existing = await base44.asServiceRole.entities.ReferralCustomer.filter({ customer_id: user.id }, '-created_date', 5);
    if (existing.length) return Response.json({ ok: true, message: 'Already referred' });

    await base44.asServiceRole.entities.ReferralCustomer.create({
      referrer_id: referrer.id,
      customer_id: user.id,
      customer_name: user.full_name || '',
      customer_email: user.email || '',
      referral_code: code,
      commission_earned: 0,
      rides_completed: 0,
      status: 'active',
    });
    await base44.asServiceRole.entities.Referrer.update(referrer.id, {
      total_customers: (referrer.total_customers || 0) + 1,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}