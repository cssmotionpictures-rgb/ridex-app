import { base44 } from "@/api/base44Client";

// Client helpers for the Ride X Card backend service.

const call = async (payload) => {
  try {
    const res = await base44.functions.invoke("flutterwave-cards", payload);
    return res?.data !== undefined ? res.data : res;
  } catch (err) {
    // Surface the backend's own error message (e.g. Card Issuing not enabled)
    const msg =
      err?.response?.data?.error ||
      err?.data?.error ||
      err?.error ||
      err?.response?.data ||
      "Card service unavailable — please try again";
    throw new Error(typeof msg === "string" ? msg : "Card service unavailable — please try again");
  }
};

export async function issueVirtualCard(details) {
  const d = await call({ action: "issue", ...details });
  if (!d?.ok) throw new Error(d?.error || "Card request failed");
  return d.card;
}

export async function fundVirtualCard(cardId, amount) {
  const d = await call({ action: "fund", card_id: cardId, amount });
  if (!d?.ok) throw new Error(d?.error || "Funding failed");
  return d;
}

export async function setVirtualCardStatus(cardId, status) {
  const d = await call({ action: "status", card_id: cardId, status });
  if (!d?.ok) throw new Error(d?.error || "Could not update the card");
  return d.card;
}

export async function getVirtualCardHistory(cardId) {
  const d = await call({ action: "history", card_id: cardId });
  if (!d?.ok) throw new Error(d?.error || "Could not load card activity");
  return d.transactions || [];
}

export async function freezeAllVirtualCards() {
  const d = await call({ action: "freeze_all" });
  if (!d?.ok) throw new Error(d?.error || "Could not freeze all cards");
  return d;
}

export async function getSpendingSummary() {
  const d = await call({ action: "spending" });
  if (!d?.ok) throw new Error(d?.error || "Could not load spending data");
  return d;
}

export async function setCardMonthlyLimit(cardId, monthlyLimit) {
  const d = await call({ action: "set_limit", card_id: cardId, monthly_limit: monthlyLimit });
  if (!d?.ok) throw new Error(d?.error || "Could not save the limit");
  return d.card;
}

export async function setCardBalanceThreshold(cardId, threshold) {
  const d = await call({ action: "set_threshold", card_id: cardId, low_balance_threshold: threshold });
  if (!d?.ok) throw new Error(d?.error || "Could not save the alert level");
  return d.card;
}

export async function diagnoseCardSheetLogging() {
  const d = await call({ action: "diagnose_sheet" });
  return d;
}

// The active platform fee schedule (issuance, maintenance, transaction, funding
// and FX/cross-border percentages per currency) plus the current USD→NGN
// rate — powers the transparent fee breakdowns shown before confirmation.
export async function getCardFeeConfig() {
  const d = await call({ action: "fee_config" });
  if (!d?.ok) throw new Error(d?.error || "Could not load the fee schedule");
  return d;
}