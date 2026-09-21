import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Tallies a promo-code redemption for a FREE (₦0) checkout. Paid checkouts are
// tallied by the Paystack webhook; this covers the free path so a 100%-off
// promo still increments used_count. Idempotent per transaction_id: a free
// transaction only confirms once, so a single increment is correct.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || '').trim().toUpperCase();
    const transaction_id = String(body?.transaction_id || '').trim();
    if (!code) return Response.json({ ok: false, reason: 'code required' });

    const found = await base44.asServiceRole.entities.PromoCode.filter({ code }, '-created_date', 5).catch(() => []);
    const promo = Array.isArray(found) && found.length ? found[0] : null;
    if (!promo) return Response.json({ ok: false, reason: 'promo not found' });

    await base44.asServiceRole.entities.PromoCode.updateMany(
      { id: promo.id },
      { $inc: { used_count: 1 } }
    );

    return Response.json({ ok: true, code, transaction_id, used_count: (promo.used_count || 0) + 1 });
  } catch (error) {
    console.error('redeem-promo-code error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}