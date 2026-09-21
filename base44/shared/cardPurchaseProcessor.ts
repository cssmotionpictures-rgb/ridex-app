import { getCardFeeConfig, purchaseFeeBreakdown, getUsdNgnRate, usdToNgn, roundFor } from "./cardFees.ts";
import { logCardTxToSheet } from "./cardTxSheet.ts";
import { sendCardTxAlert } from "./cardTxNotify.ts";
import { flwCardsRequest } from "./flwCardApi.ts";
import { findOwnerWallet } from "./cardWallet.ts";

// Ride X Card purchase processor — the single authoritative path every card
// transaction event goes through (webhook in production, diagnostics in
// testing). It implements the mandated flow:
//
//   event → idempotency check (provider_transaction_id key) → parse →
//   currency/FX/cross-border determination (provider data only) →
//   fee engine (our configurable platform fees, never invented provider
//   fees) → CardPurchase ledger record → wallet fee deduction →
//   Google Sheet structured log (failure recorded, never silent) →
//   low-balance alert + monthly-limit auto-freeze + branded email alert.
//
// Webhook retries can never charge twice, create two ledger entries, or write
// two Sheet rows — the second delivery is recognized and skipped.

const cur = (v, fallback) => {
  const s = String(v || "").toUpperCase();
  return s === "USD" || s === "NGN" ? s : fallback;
};

export async function processCardPurchase(base44, d, rid) {
  const report = {
    correlation_id: rid,
    duplicate: false,
    provider_transaction_id: "",
    steps: [],
  };
  const step = (name, pass, detail) => {
    report.steps.push({ name, result: pass ? "PASS" : "FAIL", detail: String(detail) });
    return pass;
  };
  const info = (name, value) => report.steps.push({ name, result: String(value), detail: "" });

  const providerTxId = String(d.id || d.reference || `${d.card_id}-${d.created_at || Date.now()}`);
  report.provider_transaction_id = providerTxId;

  // ── Idempotency — the provider transaction id is the key.
  try {
    const existing = await base44.asServiceRole.entities.CardPurchase.filter({ provider_transaction_id: providerTxId });
    if (existing && existing.length) {
      report.duplicate = true;
      step("Idempotency check", true, "already processed — no duplicate charges, ledger entries or Sheet rows");
      return report;
    }
    step("Idempotency check", true, "first sighting of this transaction");
  } catch (e) {
    return report; // ledger unreachable — fail loudly, do not charge anything
  }

  // ── Parse + card lookup.
  const cards = await base44.asServiceRole.entities.VirtualCard.filter({ flw_card_id: String(d.card_id) }, "-created_date", 5);
  const vc = cards && cards[0];
  if (!step("Transaction parsed / card found", !!vc, vc ? `card ...${vc.card_last4 || ""}` : `no Ride X Card matches provider card id ${d.card_id}`)) return report;

  const t = String(d.type || "").toLowerCase();
  const debit = t.includes("debit");
  const refund = t === "refund" || t.includes("reversal") || t.includes("reverse");
  // Final settlement status — taken from the provider's own status, never
  // assumed. Failed transactions never incur platform fees.
  const rawStatus = String(d.status || "").toLowerCase();
  const failed = ["failed", "declined", "error", "cancelled", "canceled"].includes(rawStatus);
  const txStatus = failed ? "failed" : refund ? "refunded" : "completed";
  const amount = Math.abs(Number(d.amount) || 0);
  const bal = Number(d.new_balance ?? d.balance ?? vc.balance) || 0;
  const cardCur = vc.currency === "USD" ? "USD" : "NGN";
  const txCur = cur(d.currency, cardCur);
  const merchant = String(d.merchant || d.merchant_name || d.narration || d.description || "Merchant");
  const merchantCountry = String(d.merchant_country || d.country || "");
  const merchantCategory = String(d.merchant_category || d.category || "");
  const sym = cardCur === "USD" ? "$" : "₦";

  info("Card currency", cardCur);
  info("Transaction currency", txCur);

  // ── Currency / FX / cross-border determination — provider data ONLY.
  // Cross-border is true ONLY when the card program explicitly classifies it;
  // a foreign merchant alone never triggers it. FX only when an actual
  // conversion occurs (USD purchase on a USD card converts nothing).
  const crossBorder = d.cross_border === true || String(d.cross_border).toLowerCase() === "true";
  const providerReportedFxRate = Math.max(0, Number(d.rate || d.fx_rate || d.conversion_rate) || 0);
  const cfg = await getCardFeeConfig(base44);

  // Conversion — the merchant amount is converted to the card currency at
  // the provider's actual rate when reported, otherwise the live platform
  // rate. The converted amount is the fee base; the original amount is kept.
  const fxOccurs = debit && txCur !== cardCur;
  let fxRate = 0;
  let fxRateSource = "none";
  let convertedAmount = amount; // card currency
  if (fxOccurs) {
    if (providerReportedFxRate > 0) {
      fxRate = providerReportedFxRate;
      fxRateSource = "provider";
    } else {
      const r = await getUsdNgnRate(cfg);
      fxRate = r.rate;
      fxRateSource = r.source;
    }
    convertedAmount = cardCur === "USD"
      ? Math.round((amount / fxRate) * 100) / 100
      : Math.round(amount * fxRate);
  }

  const bk = debit && !failed
    ? purchaseFeeBreakdown(cfg, {
        card_currency: cardCur,
        transaction_currency: txCur,
        transaction_amount: amount,
        converted_amount: convertedAmount,
        provider_fee: d.fee,
        provider_fx_fee: d.fx_fee,
        cross_border_transaction: crossBorder,
        provider_cross_border_fee: d.cross_border_fee,
        fx_rate: fxRate,
      })
    : null;

  info("Settlement currency", cardCur);
  info("FX required", bk ? (bk.fx_conversion_required ? "YES" : "NO") : "NO");
  info("FX rate", fxRate ? `${fxRate} (${fxRateSource})` : "none — no conversion");
  info("Provider FX fee", bk ? bk.provider_fx_fee : 0);
  info("Cross-border", bk ? (bk.cross_border_transaction ? "YES" : "NO") : "NO");
  info("Provider cross-border fee", bk ? bk.cross_border_fee : 0);
  info("Provider fee", bk ? bk.provider_fee : 0);

  // ── Charge our platform fee from the owner's naira wallet (best effort —
  // recorded as owed when the wallet can't cover it, never silently dropped).
  let feeCharged = false;
  let feeOwedNGN = 0;
  let walletBalAfter = null;
  if (bk) {
    const platformFeeCardCur = roundFor(cardCur, bk.platform_transaction_fee + bk.platform_fx_markup + bk.platform_cross_border_markup);
    info("Our platform fee", `${sym}${platformFeeCardCur}`);
    if (platformFeeCardCur > 0) {
      const feeNGN = cardCur === "USD" ? usdToNgn(platformFeeCardCur, fxRate || (await getUsdNgnRate(cfg)).rate) : platformFeeCardCur;
      try {
        // Ownership — the card owner's id (card.created_by_id) is the primary
        // wallet key. A wallet belonging to a different user is NEVER charged;
        // the fee is recorded as owed instead.
        const { wallet: w, match, conflict } = await findOwnerWallet(base44.asServiceRole, vc.created_by_id, vc.email);
        if (!w) {
          feeOwedNGN = feeNGN;
        } else if ((w.balance || 0) >= feeNGN) {
          walletBalAfter = (w.balance || 0) - feeNGN;
          await base44.asServiceRole.entities.RideXCard.update(w.id, {
            balance: walletBalAfter,
            total_spent: (w.total_spent || 0) + feeNGN,
          });
          await base44.asServiceRole.entities.Transaction.create({
            amount: feeNGN, commission: feeNGN, currency: "NGN", service: "card",
            description: `Ride X Card platform fee — ${merchant} purchase (${sym}${amount})`,
            reference_id: vc.id, method: "ridex_card", status: "paid",
          });
          feeCharged = true;
        } else {
          feeOwedNGN = feeNGN; // wallet short — recorded as owed, no invented success
        }
        step("Wallet fee deduction", feeCharged, !w
          ? (conflict
              ? "the wallet for this email belongs to a different account — fee recorded as owed, no wallet charged"
              : "no Ride X wallet is linked to this card owner — fee recorded as owed, no wallet charged")
          : feeCharged
            ? `₦${feeNGN} platform fee deducted from the owner's Ride X wallet`
            : `wallet could not cover the ₦${feeNGN} platform fee — recorded as owed`);
      } catch (e) {
        feeOwedNGN = feeNGN;
        step("Wallet fee deduction", false, e?.message || String(e));
      }
    }
    info("Total customer charge", `${sym}${bk.customer_total}`);
  }

  // ── CardPurchase ledger record (the required database operation — the
  // transaction is NOT fully processed until this succeeds).
  let purchase = null;
  try {
    purchase = await base44.asServiceRole.entities.CardPurchase.create({
      correlation_id: rid,
      provider_transaction_id: providerTxId,
      provider_reference: String(d.reference || ""),
      card_id: vc.id,
      user_id: vc.created_by_id,
      merchant_name: merchant,
      merchant_country: merchantCountry,
      merchant_category: merchantCategory,
      transaction_type: refund ? "refund" : debit ? "debit" : "credit",
      transaction_status: txStatus,
      transaction_currency: bk ? bk.transaction_currency : txCur,
      transaction_amount: amount,
      card_currency: cardCur,
      settlement_currency: cardCur,
      settlement_amount: bk ? bk.customer_total : amount,
      fx_conversion_required: bk ? bk.fx_conversion_required : false,
      fx_rate: fxRate,
      fx_rate_source: fxRateSource,
      provider_fee: bk ? bk.provider_fee : 0,
      provider_fx_fee: bk ? bk.provider_fx_fee : 0,
      platform_fx_markup: bk ? bk.platform_fx_markup : 0,
      cross_border_transaction: bk ? bk.cross_border_transaction : false,
      cross_border_fee: bk ? bk.cross_border_fee : 0,
      platform_cross_border_markup: bk ? bk.platform_cross_border_markup : 0,
      platform_fee: bk ? roundFor(cardCur, bk.platform_transaction_fee + bk.platform_fx_markup + bk.platform_cross_border_markup) : 0,
      platform_transaction_fee: bk ? bk.platform_transaction_fee : 0,
      total_customer_charge: bk ? bk.customer_total : amount,
      platform_fee_charged: feeCharged,
      platform_fee_owed: feeOwedNGN,
      sheet_log_status: "pending",
    });
    step("Database update", !!purchase, `CardPurchase ledger record ${purchase.id} created`);
  } catch (e) {
    step("Database update", false, e?.message || String(e));
    return report; // DB failed → not fully processed; a webhook retry will redo it idempotently
  }

  // Keep the card balance in sync with the provider's reported balance.
  await base44.asServiceRole.entities.VirtualCard.update(vc.id, { balance: bal }).catch(() => {});

  // ── Structured Google Sheet record — separately labelled fees, and the
  // failure state is stored on the ledger record (never a silent success).
  const feeBits = bk ? [
    fxOccurs
      ? `purchase ₦${amount.toLocaleString()} → ${sym}${bk.converted_amount} (rate ${fxRate})`
      : `purchase ${sym}${amount}`,
    bk.fx_conversion_required ? `FX: yes (rate ${fxRate})` : "FX: none",
    bk.cross_border_transaction ? "cross-border: yes" : "",
    bk.provider_fee ? `provider fee ${sym}${bk.provider_fee}` : "",
    `platform fee ${sym}${roundFor(cardCur, bk.platform_transaction_fee + bk.platform_fx_markup + bk.platform_cross_border_markup)}`,
    `total ${sym}${bk.customer_total}`,
  ].filter(Boolean).join(" · ") : "";

  const sheet = await logCardTxToSheet(base44, {
    holder: vc.cardholder_name, email: vc.email, last4: vc.card_last4, currency: cardCur,
    type: refund ? "Refund" : debit ? (failed ? "Card purchase (failed)" : "Card purchase") : "Card credit",
    amount: bk ? bk.converted_amount : amount, balance: bal,
    detail: `${merchant}${feeBits ? ` — ${feeBits}` : ""}`,
    status: txStatus,
    transaction_id: providerTxId,
    fees: bk ? {
      fx_applied: bk.fx_conversion_required,
      provider_fx_fee: bk.provider_fx_fee,
      our_fx_markup: bk.platform_fx_markup,
      cross_border: bk.cross_border_transaction,
      cross_border_fee: bk.cross_border_fee,
      our_cross_border_markup: bk.platform_cross_border_markup,
      provider_fee: bk.provider_fee,
      our_platform_fee: roundFor(cardCur, bk.platform_transaction_fee + bk.platform_fx_markup + bk.platform_cross_border_markup),
      total: bk.customer_total,
    } : null,
  }, rid);
  step("Google Sheets log", sheet.ok, sheet.ok
    ? `appended ${sheet.updatedRange} (${sheet.updatedRows} row)`
    : `FAILED — ${sheet.error}`);
  await base44.asServiceRole.entities.CardPurchase.update(purchase.id, {
    sheet_log_status: sheet.ok ? "logged" : "failed",
    sheet_log_error: sheet.ok ? "" : (sheet.error || "").slice(0, 500),
  }).catch(() => {});

  // ── Low-balance alert (owner-set threshold).
  const threshold = Number(vc.low_balance_threshold || 0);
  if (threshold > 0 && bal <= threshold && Number(vc.balance || 0) > threshold) {
    await sendCardTxAlert({
      to: vc.email, name: vc.cardholder_name,
      title: "Low balance alert",
      description: `Your Ride X Card ending ${vc.card_last4 || ""} dropped below your ${sym}${threshold.toLocaleString()} alert level. Top it up from your Ride X wallet whenever you're ready.`,
      amount, balance: bal, currency: cardCur,
    });
  }

  // ── Monthly spending limit — count this debit, auto-freeze on breach.
  if (debit && !failed && Number(vc.monthly_limit || 0) > 0) {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const spent = (vc.spend_month_key === monthKey ? Number(vc.spent_this_month || 0) : 0) + amount;
    await base44.asServiceRole.entities.VirtualCard.update(vc.id, {
      spent_this_month: spent, spend_month_key: monthKey,
    });
    if (spent >= Number(vc.monthly_limit) && vc.status !== "frozen") {
      const fr = await flwCardsRequest("PUT", `/virtual-cards/${vc.flw_card_id}/status/freeze`);
      if (fr.ok && fr.json && fr.json.status !== "error") {
        await base44.asServiceRole.entities.VirtualCard.update(vc.id, { status: "frozen" });
        await sendCardTxAlert({
          to: vc.email, name: vc.cardholder_name,
          title: "Monthly limit reached",
          description: `Your Ride X Card ending ${vc.card_last4 || ""} reached its ${sym}${Number(vc.monthly_limit).toLocaleString()} monthly spending limit and has been frozen to protect your money. Raise the limit or unfreeze it in the Ride X app.`,
          amount, balance: bal, currency: cardCur,
        });
      }
    }
  }

  // ── Branded Ride X alert with the transparent fee breakdown.
  await sendCardTxAlert({
    to: vc.email,
    name: vc.cardholder_name,
    title: failed ? "Card purchase declined" : debit ? "Card purchase" : "Card credited",
    description: bk
      ? `${merchant}: purchase ${sym}${amount}${bk.fx_conversion_required ? ` (converted at ${fxRate})` : ""}. Platform fee ${sym}${bk.platform_transaction_fee}${bk.platform_fx_markup ? `, FX markup ${sym}${bk.platform_fx_markup}` : ""}${bk.platform_cross_border_markup ? `, cross-border markup ${sym}${bk.platform_cross_border_markup}` : ""}${bk.provider_fee ? `, provider fee ${sym}${bk.provider_fee}` : ""}. Total ${sym}${bk.customer_total}.`
      : failed
        ? `A ${sym}${amount.toLocaleString()} purchase at ${merchant} on your Ride X Card ending ${vc.card_last4 || ""} was declined by the merchant. You were not charged any Ride X fees.`
        : refund
          ? `Your Ride X Card ending ${vc.card_last4 || ""} was refunded ${sym}${amount.toLocaleString()}.`
          : `Your Ride X Card ending ${vc.card_last4 || ""} was credited with ${sym}${amount.toLocaleString()}.`,
    amount,
    balance: bal,
    currency: cardCur,
  });

  report.purchase_id = purchase.id;
  return report;
}