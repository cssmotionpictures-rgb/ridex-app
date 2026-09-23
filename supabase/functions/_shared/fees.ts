// Internal fee split — user NEVER sees this breakdown
export const FEE_CONFIG = {
  monthly: {
    user_charged_usd: 2.50,
    provider_gets_usd: 1.50,
    platform_keeps_usd: 1.00,
  },
  platform_cut_pct: 1.0,

  provider_costs: {
    flutterwave_local_pct: 2.0,
    flutterwave_vat_on_fees: 7.5,
    flutterwave_bill_flat_ngn: 100,
    flutterwave_cross_border_pct: 3.8,

    kripicard_topup_min_usd: 3.0,
    kripicard_topup_pct: 4.0,
    kripicard_monthly_usd: 1.50,
    kripicard_crypto_conversion_pct: 1.0,
    kripicard_fx_fee_pct: 1.0,

    bigisub_electricity_pct: 1.0,
    bigisub_betting_pct: 1.0,

    naira_card_issuance: 0,
    naira_card_monthly: 0,
  },
};

export function calculateFee(grossAmount: number, providerCost: number, providerType: string) {
  const platformFee = grossAmount * (FEE_CONFIG.platform_cut_pct / 100);
  let finalProviderCost = providerCost;
  if (providerType === "flutterwave") {
    finalProviderCost = providerCost * (1 + FEE_CONFIG.provider_costs.flutterwave_vat_on_fees / 100);
  }
  const totalFee = finalProviderCost + platformFee;
  const netAmount = grossAmount - totalFee;
  return {
    gross_amount: grossAmount,
    user_visible_fee: totalFee,
    platform_fee: platformFee,
    provider_cost: finalProviderCost,
    net_amount: netAmount,
  };
}

export function calculateKripicardTopup(amount: number) {
  const topupFee = Math.max(amount * 0.04, 3.0);
  const platformFee = amount * 0.01;
  const totalFee = topupFee + platformFee;
  const netAmount = amount - totalFee;
  return {
    user_visible_fee: totalFee,
    platform_fee: platformFee,
    provider_cost: topupFee,
    net_amount: netAmount,
  };
}

export function calculateMonthlySplit() {
  return {
    user_charged: FEE_CONFIG.monthly.user_charged_usd,
    provider_gets: FEE_CONFIG.monthly.provider_gets_usd,
    platform_keeps: FEE_CONFIG.monthly.platform_keeps_usd,
  };
}
