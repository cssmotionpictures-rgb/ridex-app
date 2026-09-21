import { flwCardsRequest } from "./flwCardApi.ts";

// Ride X Card platform fee engine.
//
// OUR platform fees live in the admin-configurable CardFeeConfig record
// (seeded with the product's default pricing below). Provider fees are NEVER
// invented here — they are only ever taken from the actual card-program
// response and stored separately from ours.
//
// Core rules enforced by this engine:
//   • A USD purchase on a USD card is NOT an FX conversion — no FX fee just
//     because the merchant is outside Nigeria.
//   • Our FX markup applies ONLY when an actual currency conversion occurred.
//   • Cross-border classification comes ONLY from the provider/card program.
//   • Minimum transaction fee rule: charge whichever is HIGHER — the
//     percentage fee or the configured minimum (never both).
//   • Flutterwave's 4.8% Nigerian international COLLECTION fee is for
//     collections/inflows and is NEVER applied to card purchases.

export const DEFAULT_CARD_FEES = {
  // NAIRA CARD
  ngn_issuance_fee: 1000,
  ngn_activation_fee: 0,
  ngn_maintenance_fee: 200,
  ngn_replacement_fee: 500,
  ngn_transaction_percentage: 1,
  ngn_min_transaction_fee: 50,
  ngn_funding_percentage: 1,
  ngn_closure_fee: 200,
  // DOLLAR CARD
  usd_issuance_fee: 3,
  usd_activation_fee: 0,
  usd_maintenance_fee: 1,
  usd_replacement_fee: 2,
  usd_transaction_percentage: 1.5,
  usd_min_transaction_fee: 0.3,
  usd_funding_percentage: 1.5,
  usd_fx_markup_percentage: 1.5,
  usd_cross_border_markup_percentage: 0.5,
  usd_closure_fee: 1,
  // GLOBAL
  maintenance_enabled: true,
  use_live_fx_rate: true,
  usd_ngn_rate: 1600,
};

const FEE_NUMBER_KEYS = Object.keys(DEFAULT_CARD_FEES).filter((k) => k !== "maintenance_enabled" && k !== "use_live_fx_rate");

// The active fee schedule — admin's CardFeeConfig record overrides the
// defaults; anything missing falls back to the default pricing.
export async function getCardFeeConfig(base44) {
  const cfg = { ...DEFAULT_CARD_FEES, _id: "" };
  try {
    const rows = await base44.asServiceRole.entities.CardFeeConfig.filter({ name: "global" });
    const row = rows && rows[0];
    if (!row) return cfg;
    for (const k of FEE_NUMBER_KEYS) {
      const v = row[k];
      if (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v))) cfg[k] = Number(v);
    }
    cfg.maintenance_enabled = row.maintenance_enabled !== false;
    cfg.use_live_fx_rate = row.use_live_fx_rate !== false;
    cfg._id = row.id || "";
    return cfg;
  } catch {
    return cfg; // config table unreachable → default pricing still applies
  }
}

// Rounding — dollar fees to 2dp, naira fees to whole naira.
export const usd = (n) => Math.round(Number(n) * 100) / 100;
export const ngn = (n) => Math.round(Number(n));
export const roundFor = (currency, n) => (currency === "USD" ? usd(n) : ngn(n));
export const usdToNgn = (usdAmount, rate) => Math.round(Number(usdAmount) * Number(rate));

// Live USD→NGN rate from the card provider's rates endpoint; falls back to the
// admin-configured rate when the provider is unreachable. The source is always
// reported so every converted charge is auditable.
export async function getUsdNgnRate(cfg) {
  if (!cfg || cfg.use_live_fx_rate === false) {
    return { rate: Number(cfg && cfg.usd_ngn_rate) || 1600, source: "admin_config" };
  }
  try {
    const r = await flwCardsRequest("POST", "/transfers/rates", {
      amount: 1, destination_currency: "NGN", source_currency: "USD",
    });
    const rate = Number(r.json && r.json.data && r.json.data.rate);
    if (r.ok && rate > 0) return { rate, source: "provider_live" };
  } catch { /* fall through to the configured rate */ }
  return { rate: Number(cfg.usd_ngn_rate) || 1600, source: "admin_fallback" };
}

// The full platform fee schedule for one card currency (what the admin panel
// and the customer-facing fee breakdowns are built from).
export function issuanceQuote(cfg, currency) {
  const p = currency === "USD" ? "usd" : "ngn";
  return {
    currency: currency === "USD" ? "USD" : "NGN",
    issuance_fee: Number(cfg[`${p}_issuance_fee`]) || 0,
    activation_fee: Number(cfg[`${p}_activation_fee`]) || 0,
    maintenance_fee: cfg.maintenance_enabled !== false ? (Number(cfg[`${p}_maintenance_fee`]) || 0) : 0,
    replacement_fee: Number(cfg[`${p}_replacement_fee`]) || 0,
    transaction_percentage: Number(cfg[`${p}_transaction_percentage`]) || 0,
    min_transaction_fee: Number(cfg[`${p}_min_transaction_fee`]) || 0,
    funding_percentage: Number(cfg[`${p}_funding_percentage`]) || 0,
    fx_markup_percentage: currency === "USD" ? (Number(cfg.usd_fx_markup_percentage) || 0) : 0,
    cross_border_markup_percentage: currency === "USD" ? (Number(cfg.usd_cross_border_markup_percentage) || 0) : 0,
    closure_fee: Number(cfg[`${p}_closure_fee`]) || 0,
  };
}

// Platform fee for one card purchase — percentage of the purchase amount, or
// the configured minimum when the minimum is HIGHER (never both).
export function platformTransactionFee(cfg, currency, amount) {
  const q = issuanceQuote(cfg, currency);
  if (!q.transaction_percentage) return 0;
  const pct = Number(amount || 0) * (q.transaction_percentage / 100);
  return roundFor(currency, Math.max(pct, q.min_transaction_fee || 0));
}

// Platform fee on a wallet→card top-up. Funding a DOLLAR card from the naira
// wallet IS a currency conversion, so the FX markup applies to dollar top-ups.
// Both fees are returned in the CARD currency (convert with usdToNgn for the
// naira wallet debit).
export function fundingFeeFor(cfg, currency, amount) {
  const q = issuanceQuote(cfg, currency);
  const fundingFee = (Number(amount) || 0) * (q.funding_percentage / 100);
  const fxMarkup = currency === "USD" ? (Number(amount) || 0) * (q.fx_markup_percentage / 100) : 0;
  return {
    funding_fee: roundFor(currency, fundingFee),
    fx_markup: roundFor(currency, fxMarkup),
  };
}

// The complete fee breakdown for one card purchase. Provider figures are only
// ever what the card program actually reported — never invented, never the
// collections fee schedule.
//
// input: {
//   card_currency, transaction_currency, transaction_amount,
//   provider_fee, provider_fx_fee,            // provider-reported, if any
//   cross_border_transaction,                 // provider classification ONLY
//   provider_cross_border_fee,                // provider-reported, if any
//   fx_rate                                   // provider-reported, if any
// }
export function purchaseFeeBreakdown(cfg, input) {
  const cardCur = input.card_currency === "USD" ? "USD" : "NGN";
  const rawTxCur = String(input.transaction_currency || cardCur).toUpperCase();
  const txCur = rawTxCur === "USD" || rawTxCur === "NGN" ? rawTxCur : cardCur;
  const amount = Number(input.transaction_amount) || 0;

  // FX ONLY when an actual conversion occurs — USD/USD never converts, no
  // matter where the merchant is located.
  const fxRequired = txCur !== cardCur;
  // When a conversion occurs the caller supplies the converted card-currency
  // amount (converted at the provider's actual rate) — that is the fee base.
  const feeBase = fxRequired ? Math.max(0, Number(input.converted_amount) || 0) : amount;
  const providerFxFee = fxRequired ? Math.max(0, Number(input.provider_fx_fee) || 0) : 0;
  const providerFxRate = fxRequired ? Math.max(0, Number(input.fx_rate) || 0) : 0;

  // Cross-border ONLY when the provider/card program explicitly classifies it.
  const crossBorder = input.cross_border_transaction === true;
  const crossBorderFee = crossBorder ? Math.max(0, Number(input.provider_cross_border_fee) || 0) : 0;
  const providerFee = Math.max(0, Number(input.provider_fee) || 0);

  const q = issuanceQuote(cfg, cardCur);
  const platformFee = platformTransactionFee(cfg, cardCur, feeBase);
  const platformFxMarkup = fxRequired
    ? roundFor(cardCur, feeBase * (q.fx_markup_percentage / 100))
    : 0; // no conversion → our FX markup is $0 / ₦0
  const platformCrossBorderMarkup = crossBorder
    ? roundFor(cardCur, feeBase * (q.cross_border_markup_percentage / 100))
    : 0;

  const total = roundFor(cardCur,
    feeBase + providerFee + providerFxFee + crossBorderFee +
    platformFee + platformFxMarkup + platformCrossBorderMarkup);

  return {
    card_currency: cardCur,
    transaction_currency: txCur,
    converted_amount: feeBase,
    fx_conversion_required: fxRequired,
    fx_rate: providerFxRate,
    provider_fee: roundFor(cardCur, providerFee),
    provider_fx_fee: roundFor(cardCur, providerFxFee),
    cross_border_transaction: crossBorder,
    cross_border_fee: roundFor(cardCur, crossBorderFee),
    platform_transaction_fee: platformFee,
    platform_fx_markup: platformFxMarkup,
    platform_cross_border_markup: platformCrossBorderMarkup,
    customer_total: total,
  };
}