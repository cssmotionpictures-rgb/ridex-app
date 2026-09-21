import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const round2 = (n: number) => Math.round(n * 100) / 100;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const referrerId = (body?.referrer_id || '').toString();
    if (!referrerId) return Response.json({ error: 'referrer_id required' }, { status: 400 });

    const referrer = await base44.asServiceRole.entities.Referrer.get(referrerId).catch(() => null);
    if (!referrer) return Response.json({ error: 'Referrer not found' }, { status: 404 });

    const pending = await base44.asServiceRole.entities.ReferralCommission.filter({ referrer_id: referrerId, status: 'pending' }, '-created_date', 500);
    const total = round2(pending.reduce((s, c) => s + (c.amount || 0), 0));
    if (total <= 0) return Response.json({ ok: true, message: 'No pending commissions' });
    if (total < 20000) return Response.json({ error: 'Minimum payout is ₦20,000' }, { status: 400 });

    const now = new Date();
    const periodStart = new Date(now); periodStart.setMonth(now.getMonth() - 2);
    const payout = await base44.asServiceRole.entities.ReferralPayout.create({
      referrer_id: referrerId,
      referrer_name: referrer.full_name || referrer.email,
      amount: total,
      period_start: periodStart.toISOString(),
      period_end: now.toISOString(),
      status: 'paid',
      payment_date: now.toISOString(),
      payment_method: body?.payment_method || referrer.payment_method || 'bank',
      reference_number: body?.reference_number || '',
    });

    await base44.asServiceRole.entities.ReferralCommission.updateMany(
      { referrer_id: referrerId, status: 'pending' },
      { $set: { status: 'paid' } }
    );
    await base44.asServiceRole.entities.Referrer.update(referrerId, {
      pending_payout: 0,
      paid_out: round2((referrer.paid_out || 0) + total),
    });

    return Response.json({ ok: true, payout, total });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}