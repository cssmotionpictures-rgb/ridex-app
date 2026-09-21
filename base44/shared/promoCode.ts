// Shared promo-code validation + discount helpers.
// Used by the validate-promo-code function (preview discount to the customer)
// and by paystack-checkout (authoritative server-side enforcement, so a code
// can never be bypassed client-side). The paystack webhook increments used_count.

export function computeDiscount(promo, amount) {
  const a = Number(amount) || 0;
  if (!promo || a <= 0) return 0;
  let d =
    promo.discount_type === "percent"
      ? Math.round(a * (Number(promo.value) / 100))
      : Math.round(Number(promo.value) || 0);
  if (d > a) d = a; // never discount more than the charge
  return Math.max(0, d);
}

export function isPromoValid(promo, service, amount, now) {
  const t = now || new Date();
  if (!promo || promo.active === false) {
    return { valid: false, reason: "This code is no longer active." };
  }
  if (promo.expires_at && new Date(promo.expires_at) < t) {
    return { valid: false, reason: "This code has expired." };
  }
  if (Number(promo.max_uses) > 0 && Number(promo.used_count || 0) >= Number(promo.max_uses)) {
    return { valid: false, reason: "This code has reached its usage limit." };
  }
  if (Number(promo.min_amount) > 0 && Number(amount) < Number(promo.min_amount)) {
    return { valid: false, reason: `Minimum spend of \u20a6${Number(promo.min_amount).toLocaleString()} required.` };
  }
  if (promo.applicable_services && String(promo.applicable_services).trim() !== "all") {
    const list = String(promo.applicable_services).split(",").map((s) => s.trim()).filter(Boolean);
    if (service && !list.includes(service)) {
      return { valid: false, reason: "This code does not apply to this service." };
    }
  }
  return { valid: true };
}

// Looks up + validates a promo code. `base44` must be a service-role client.
// Returns { valid, reason } or { valid, code, promo, promo_id, discount }.
export async function validatePromoCode(base44, code, service, amount) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return { valid: false, reason: "Enter a promo code." };
  const list = await base44.asServiceRole.entities.PromoCode.filter({ code: c }, "-created_date", 5).catch(() => []);
  const promo = Array.isArray(list) && list.length ? list[0] : null;
  if (!promo) return { valid: false, reason: "Invalid promo code." };
  const check = isPromoValid(promo, service, amount);
  if (!check.valid) return { valid: false, reason: check.reason };
  return { valid: true, code: c, promo, promo_id: promo.id, discount: computeDiscount(promo, amount) };
}