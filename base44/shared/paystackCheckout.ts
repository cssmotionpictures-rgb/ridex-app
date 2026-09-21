import { validatePromoCode } from "./promoCode.ts";

// Shared param parsing + promo validation + pending Transaction creation for
// the Paystack checkout entry points (hosted redirect + inline modal). Both
// `paystack-checkout` and `paystack-inline` call this so the validation, promo
// handling and Transaction shape stay identical.

export function parseCheckoutBody(body = {}) {
  return {
    amount: Number(body.amount),
    service: body.service || 'ride',
    description: body.description || 'Ride X payment',
    referenceId: body.referenceId || '',
    currency: (body.currency || 'NGN').toUpperCase(),
    email: (body.email || '').trim(),
    method: ['card', 'bank_transfer', 'opay_wallet'].includes(body.method) ? body.method : 'card',
    commission: Number(body.commission) || 0,
    userId: (body.userId || '').toString(),
    userName: (body.userName || '').toString(),
    promoCodeInput: (body.promoCode || '').toString().trim(),
  };
}

// Returns { p, tx, charged, reference, channels, promoCodeUsed, promoId, discount }
// on success, or { error } on a validation failure.
export async function preparePendingTransaction(base44, body) {
  const p = parseCheckoutBody(body);
  let discount = 0, promoCodeUsed = '', promoId = '';
  if (p.promoCodeInput) {
    const r = await validatePromoCode(base44, p.promoCodeInput, p.service, p.amount);
    if (!r.valid) return { error: r.reason || 'Invalid promo code' };
    discount = r.discount; promoCodeUsed = r.code; promoId = r.promo_id;
  }
  const charged = Math.max(0, p.amount - discount);
  if (!p.amount || p.amount <= 0) return { error: 'Invalid amount' };
  if (!p.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) {
    return { error: 'A valid email is required' };
  }
  const tx = await base44.asServiceRole.entities.Transaction.create({
    amount: charged,
    commission: p.commission,
    discount,
    promo_code: promoCodeUsed,
    currency: p.currency,
    service: p.service,
    description: p.description,
    reference_id: p.referenceId,
    method: p.method,
    status: 'pending',
    settled_to_opay: true,
    opay_account: '8061197339',
  });
  const reference = `RX-${tx.id.slice(-10)}-${Date.now().toString(36)}`;
  const channels = p.method === 'bank_transfer'
    ? ['bank_transfer']
    : p.method === 'opay_wallet'
      ? ['mobile_money', 'bank_transfer']
      : ['card'];
  return { p, tx, charged, reference, channels, promoCodeUsed, promoId, discount };
}