import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { validatePromoCode } from "../../shared/promoCode.ts";

// Validates a promo code and returns the discount a customer would receive.
// Does NOT increment usage — usage is tallied by the Paystack webhook on
// successful charge, so a code is only "used" when actually paid for.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const code = body?.code || "";
    const service = body?.service || "";
    const amount = Number(body?.amount) || 0;

    const result = await validatePromoCode(base44, code, service, amount);
    if (!result.valid) {
      return Response.json({ valid: false, reason: result.reason });
    }
    return Response.json({
      valid: true,
      code: result.code,
      promo_id: result.promo_id,
      discount_type: result.promo.discount_type,
      value: result.promo.value,
      discount: result.discount,
    });
  } catch (error) {
    console.error('validate-promo-code error:', error.message);
    return Response.json({ valid: false, reason: error.message }, { status: 500 });
  }
}