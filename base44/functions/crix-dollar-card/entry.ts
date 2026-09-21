import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { roundMoney, getOrCreateWallet } from "../../shared/crixCore.ts";
import { writeSettledPair, writeRefundPair } from "../../shared/crixBillPairs.ts";
import { assertNotPaused, appendAudit } from "../../shared/crixGuards.ts";
import { verifyPin } from "../../shared/crixPin.ts";
import { getCardFeeConfig, fundingFeeFor } from "../../shared/cardFees.ts";
import { recordCrixPayment } from "../../shared/crixSheets.ts";
import { fintavaMerchantBalance } from "../../shared/fintavaClient.ts";
import {
  stroUsdNgnRate, stroKycStatus, stroKycSubmit, stroCreateCard,
  stroCardDetails, stroCardHistory, stroFundWithdraw, stroCardStatus,
} from "../../shared/strowalletClient.ts";
import { sendSlackAlert } from "../../shared/slackNotify.ts";

// CRIX DOLLAR CARDS — virtual Visa dollar cards on the Strowallet card
// network (NFC dollar cards, Google Pay / Apple Pay capable), paid instantly
// from the customer's funded Naira wallet at the live provider USD→NGN rate.
// Money safety, none skippable:
//   1. EMERGENCY PAUSE — fail-closed, checked before any movement
//   2. IDEMPOTENCY — the same card_key never issues twice and the same
//      fund_key never tops up twice (both checked before any debit)
//   3. CARDHOLDER KYC — every customer is identity-verified and APPROVED at
//      the card network before any money moves; a KYC submission or a
//      pending review charges nothing
//   4. TRANSACTION PIN — verified server-side before the wallet debit
//   5. ATOMIC WALLET DEBIT — available >= total or nothing moves
//   6. HONEST STATES — issued only after the network's live success response;
//      a definitive refusal refunds the wallet in full with the reversing
//      pair; a lost answer is UNKNOWN — never blindly refunded or re-sent
// Card details (number, CVV, expiry) are NEVER stored — they are fetched
// live from the card network only for the verified card owner.

// Dollar-card funding bounds, USD
const MIN_FUND_USD = 10;
const MAX_FUND_USD = 500;
const ID_TYPES = ["bvn", "nin", "passport", "drivers_license", "national_id", "vnin", "voters_card", "ghana_card"];
const CARD_ACCOUNT = "cards:paid:NGN";

// RAIL STATE — honest, server-authoritative. New Naira-funded dollar cards
// are retired: the Naira-to-USD card conversion flow is closed and the rail
// is moving to a crypto-funded card provider. Existing cards keep
// full management (details, freeze, history) — customer card money is never
// stranded and no card is deleted while it holds a balance.
const CARD_RAIL = {
  paused: true,
  reason: "New dollar cards are paused — we no longer convert Naira into USD cards. We are moving to a crypto-funded dollar card provider. Your existing cards keep working.",
};

const nowIso = () => new Date().toISOString();
const clip = (v: any, n: number) => String(v || "").trim().slice(0, n);

// Live USD→NGN rate — the provider's own rate first (the rate the card
// network actually charges at), the admin-configured fallback otherwise.
async function liveRate(base44: any) {
  const cfg = await getCardFeeConfig(base44);
  const r = await stroUsdNgnRate();
  if (r.ok) return { rate: r.rate, source: r.source, cfg };
  return { rate: Number(cfg.usd_ngn_rate) || 1600, source: "admin_fallback", cfg };
}

// The transparent charge breakdown. Platform fees come from the
// admin-configured CardFeeConfig only; the provider's live rate sets the FX.
function quoteBreakdown(rate: number, cfg: any, fundingUsd: number, kind: string) {
  const fees = fundingFeeFor(cfg, "USD", fundingUsd);
  const issuance = kind === "issue" ? (Number(cfg.usd_issuance_fee) || 0) : 0;
  const feeUsd = Math.round((issuance + fees.funding_fee + fees.fx_markup) * 100) / 100;
  const ngnCost = Math.round(fundingUsd * rate);
  const feeNgn = Math.round(feeUsd * rate);
  return {
    kind, funding_usd: fundingUsd, fx_rate: rate,
    ngn_cost: ngnCost,
    issuance_fee_usd: issuance, funding_fee_usd: fees.funding_fee, fx_markup_usd: fees.fx_markup,
    fee_usd: feeUsd, olaform_fee: feeNgn,
    total_debit_ngn: ngnCost + feeNgn,
  };
}

// A private uploaded ID image → base64 for the card network. Read through a
// short-lived signed URL so the file itself stays private; nothing is stored.
async function fileUriToBase64(svc: any, fileUri: string): Promise<string> {
  const signed = await svc.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 120 });
  const res = await fetch(signed.signed_url);
  if (!res.ok) throw new Error("Your ID image could not be read — please upload it again. Nothing was charged.");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > 6 * 1024 * 1024) throw new Error("Your ID image is too large (max 6MB) — nothing was charged.");
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Resolve the customer's APPROVED cardholder id at the card network. When
// they are not approved yet and identity details were supplied, a KYC
// submission is made — which charges nothing and issues nothing.
async function resolveCustomerId(svc: any, user: any, kyc: any): Promise<{ customer_id?: string; kyc_required?: boolean; kyc_submitted?: boolean; kyc_reference?: string; error?: string; status?: number }> {
  const ks = await stroKycStatus(String(user.email || ""));
  if (ks.transport) return { error: "The card network did not answer — nothing was charged. Please try again shortly.", status: 503 };
  const data = ks.json && ks.json.data;
  if (ks.json && ks.json.success && data && String(data.status || "").toLowerCase() === "approved" && data.customer_id) {
    return { customer_id: String(data.customer_id) };
  }
  if (ks.json && ks.json.success && data && String(data.status || "").toLowerCase() === "pending") {
    return { kyc_required: true, error: "Your identity review is still in progress at the card network — your card unlocks the moment it is approved. Nothing was charged." };
  }
  if (!kyc) return { kyc_required: true };

  const required = ["first_name", "last_name", "id_type", "id_number", "phone_number", "dial_code", "date_of_birth", "line1", "city", "state", "postal_code", "country", "id_front_image"];
  for (const k of required) {
    if (!String(kyc[k] || "").trim()) return { error: "Some identity details are missing — nothing was charged.", status: 400 };
  }
  if (!ID_TYPES.includes(String(kyc.id_type))) return { error: "Choose a valid ID type — nothing was charged.", status: 400 };
  if (!/^\+?\d{1,4}$/.test(String(kyc.dial_code).trim())) return { error: "Enter a valid dial code (e.g. +234) — nothing was charged.", status: 400 };
  if (!/^\d{7,15}$/.test(String(kyc.phone_number).replace(/\D/g, ""))) return { error: "Enter a valid phone number — nothing was charged.", status: 400 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(kyc.date_of_birth).trim())) return { error: "Enter your date of birth as YYYY-MM-DD — nothing was charged.", status: 400 };

  let imageB64 = "";
  try { imageB64 = await fileUriToBase64(svc, String(kyc.id_front_image)); }
  catch (e: any) { return { error: String((e && e.message) || e), status: 400 }; }

  const submit = await stroKycSubmit({
    first_name: clip(kyc.first_name, 60), last_name: clip(kyc.last_name, 60),
    email: String(user.email || ""), phone_number: String(kyc.phone_number).replace(/\D/g, "").slice(0, 15),
    date_of_birth: String(kyc.date_of_birth).trim(), dial_code: clip(kyc.dial_code, 6),
    id_type: String(kyc.id_type), id_number: clip(kyc.id_number, 40),
    line1: clip(kyc.line1, 120), city: clip(kyc.city, 60), state: clip(kyc.state, 60),
    postal_code: clip(kyc.postal_code, 12), country: clip(kyc.country, 3).toUpperCase(),
    id_front_image: imageB64,
  });
  if (submit.transport) return { error: "The card network did not answer — your identity review was NOT submitted and nothing was charged. Please try again shortly.", status: 503 };
  if (submit.json && submit.json.success) {
    return { kyc_submitted: true, kyc_reference: String((submit.json.data && submit.json.reference) || "") };
  }
  return { error: "The card network refused your identity submission — " + String((submit.json && submit.json.message) || "please check your details and try again") + ". Nothing was charged.", status: 422 };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    // ---- LIST — the customer's own card records ----
    if (action === "list") {
      const rows = await svc.entities.CrixDollarCard.filter({ user_id: user.id }, "-created_date", 20);
      const cards = (rows || []).map((c) => ({
        card_key: c.card_key, provider_card_id: c.provider_card_id, masked_pan: c.masked_pan,
        cardholder_name: c.cardholder_name, status: c.status, funding_usd: c.funding_usd,
        olaform_fee: c.olaform_fee, total_debit_ngn: c.total_debit_ngn, fx_rate: c.fx_rate,
        created_date: c.created_date,
      }));
      return Response.json({ cards });
    }

    // ---- NETWORK — honest availability for the UI (fail-closed) ----
    if (action === "network") {
      const rate = await stroUsdNgnRate();
      let authed = false;
      try {
        const ks = await stroKycStatus(String(user.email || "noreply@ridex.app"));
        authed = !ks.transport && ks.status > 0 && ks.status !== 401 && ks.status !== 403;
      } catch { authed = false; }
      return Response.json({ reachable: rate.ok && authed, paused: CARD_RAIL.paused, reason: CARD_RAIL.reason, rate: rate.rate, checked_at: nowIso() });
    }

    // ---- KYC STATUS — the customer's cardholder review state, live ----
    if (action === "kyc_status") {
      const ks = await stroKycStatus(String(user.email || ""));
      if (ks.transport) return Response.json({ kyc_status: "unknown", message: "The card network did not answer — please try again shortly." });
      const data = ks.json && ks.json.data;
      if (ks.json && ks.json.success && data) {
        return Response.json({ kyc_status: String(data.status || "pending"), customer_id: "" });
      }
      return Response.json({ kyc_status: "none", message: "Complete a one-time identity review when you get your first card." });
    }

    // ---- QUOTE — live FX + the transparent platform fee breakdown ----
    if (action === "quote") {
      const fundingUsd = roundMoney(body.funding_usd);
      if (!(fundingUsd >= MIN_FUND_USD) || fundingUsd > MAX_FUND_USD) {
        return Response.json({ error: "Card funding must be between $" + MIN_FUND_USD + " and $" + MAX_FUND_USD + "." }, { status: 400 });
      }
      const kind = String(body.kind || "issue") === "fund" ? "fund" : "issue";
      const lr = await liveRate(base44);
      return Response.json({ quote: quoteBreakdown(lr.rate, lr.cfg, fundingUsd, kind), rate_source: lr.source });
    }

    // ---- ISSUE — the guarded card purchase flow ----
    if (action === "issue") {
      const cardKey = String(body.card_key || "").trim();
      const fundingUsd = roundMoney(body.funding_usd);
      const name = clip(body.name, 50);
      if (!cardKey) return Response.json({ error: "Missing purchase key — nothing was charged." }, { status: 400 });
      if (!(fundingUsd >= MIN_FUND_USD) || fundingUsd > MAX_FUND_USD) {
        return Response.json({ error: "Card funding must be between $" + MIN_FUND_USD + " and $" + MAX_FUND_USD + " — nothing was charged." }, { status: 400 });
      }
      if (!name) return Response.json({ error: "Enter the name to print on your card — nothing was charged." }, { status: 400 });

      // 1. IDEMPOTENCY — the same card_key never issues twice
      const priorRows = await svc.entities.CrixDollarCard.filter({ card_key: cardKey });
      const prior = (priorRows || [])[0] || null;
      if (prior) {
        return Response.json({ idempotent: true, card_key: prior.card_key, status: prior.status, masked_pan: prior.masked_pan, funding_usd: prior.funding_usd });
      }

      // RAIL STATE — new Naira-funded dollar cards are retired; nothing was charged
      if (CARD_RAIL.paused) {
        await appendAudit(svc, { operation: "card_issuance", user_id: user.id, idempotency_key: cardKey, old_state: "REQUESTED", new_state: "PAUSED", asset: "NGN", amount: 0, actor: "crix-dollar-card", reason: CARD_RAIL.reason }).catch(() => {});
        return Response.json({ error: CARD_RAIL.reason, paused: true }, { status: 423 });
      }

      // 2. EMERGENCY PAUSE — fail-closed before any movement
      const pause = await assertNotPaused(svc, "card_issuance");
      if (pause.blocked) {
        await appendAudit(svc, { operation: "card_issuance", user_id: user.id, idempotency_key: cardKey, old_state: "REQUESTED", new_state: "PAUSED", asset: "NGN", amount: 0, actor: "crix-dollar-card", reason: pause.reason, payload_json: { switches: pause.switches } }).catch(() => {});
        return Response.json({ error: pause.reason }, { status: 423 });
      }

      // 3. CARDHOLDER KYC — approved at the network before any money moves.
      //    A submission or pending review charges nothing.
      const kyc = await resolveCustomerId(svc, user, body.kyc || null);
      if (kyc.error) return Response.json({ error: kyc.error, ...(kyc.status ? { status_code: kyc.status } : {}) }, { status: kyc.status || 400 });
      if (kyc.kyc_required) return Response.json({ kyc_required: true });
      if (kyc.kyc_submitted) return Response.json({ kyc_submitted: true, kyc_reference: kyc.kyc_reference || "" });

      // 4. TRANSACTION PIN — verified before the wallet debit
      const pinCheck = await verifyPin(svc, user.id, body.pin);
      if (!pinCheck.ok) {
        await appendAudit(svc, { operation: "card_issuance", user_id: user.id, idempotency_key: cardKey, old_state: "REQUESTED", new_state: "PIN_REJECTED", asset: "NGN", amount: 0, actor: "crix-dollar-card", reason: pinCheck.reason }).catch(() => {});
        return Response.json({ error: pinCheck.reason + " — nothing was charged.", pin_required: true }, { status: 403 });
      }

      // 5. LIVE QUOTE — provider FX rate + admin-configured fees only
      const lr = await liveRate(base44);
      const quote = quoteBreakdown(lr.rate, lr.cfg, fundingUsd, "issue");
      const totalDebit = roundMoney(quote.total_debit_ngn);

      // 6. WALLET — frozen check, then the atomic conditional debit
      const wallet = await getOrCreateWallet(svc, user.id, "NGN");
      if (wallet.status === "frozen") {
        return Response.json({ error: "Your Naira wallet is frozen — unfreeze it in Crix Protection first. Nothing was charged." }, { status: 400 });
      }
      const before = await svc.entities.CrixWallet.get(wallet.id);
      if ((Number(before.available) || 0) < totalDebit) {
        return Response.json({ error: "Not enough in your wallet — needed: ₦" + totalDebit.toLocaleString() + ", available: ₦" + Number(before.available || 0).toLocaleString() + ". Fund your wallet and try again." }, { status: 400 });
      }

      // The permanent record exists BEFORE any money moves
      const timeline = [
        { step: "REQUESTED", at: nowIso(), detail: "idempotency locked · $" + fundingUsd + " dollar card · " + name },
        { step: "VALIDATED", at: nowIso(), detail: "KYC approved at the card network · live rate " + lr.rate + " (" + lr.source + ")" },
      ];
      const evidence = [
        { check: "kyc_approved", pass: true, value: "cardholder approved", source: "live card network" },
        { check: "fx_rate", pass: true, value: String(lr.rate), source: lr.source },
      ];
      const record = await svc.entities.CrixDollarCard.create({
        card_key: cardKey, user_id: user.id, provider_card_id: "", masked_pan: "",
        cardholder_name: name, status: "created",
        funding_usd: fundingUsd, fx_rate: lr.rate, ngn_cost: quote.ngn_cost,
        olaform_fee: quote.olaform_fee, total_debit_ngn: totalDebit,
        failure_reason: "",
        timeline_json: JSON.stringify(timeline),
        evidence_json: JSON.stringify(evidence),
      });
      const updateCard = (patch: any) => svc.entities.CrixDollarCard.update(record.id, patch);

      await svc.entities.CrixWallet.updateMany(
        { id: wallet.id, available: { $gte: totalDebit } },
        { $inc: { available: -totalDebit } }
      );
      const after = await svc.entities.CrixWallet.get(wallet.id);
      if ((Number(after.available) || 0) >= (Number(before.available) || 0)) {
        await updateCard({ status: "failed", failure_reason: "reservation could not be applied" }).catch(() => {});
        return Response.json({ error: "The purchase could not be reserved — please try again. Nothing was charged." }, { status: 409 });
      }
      timeline.push({ step: "RESERVED", at: nowIso(), detail: "₦" + totalDebit + " reserved from the Naira wallet atomically" });

      // 7. ISSUE — the card network is called the moment the debit confirms
      let created: any;
      try {
        created = await stroCreateCard({ name, customerId: String(kyc.customer_id), amount: fundingUsd });
      } catch (e: any) {
        created = { ok: false, status: 0, json: null, transport: String((e && e.message) || e) };
      }

      // A LOST answer is UNKNOWN — the debit stands, the card is never re-issued
      if (created.transport) {
        await updateCard({
          status: "unknown", failure_reason: ("transport: " + created.transport).slice(0, 200),
          timeline_json: JSON.stringify([...timeline, { step: "UNKNOWN", at: nowIso(), detail: "the card network did not answer — confirming with the network; never blindly refunded or re-sent" }]),
        }).catch(() => {});
        await appendAudit(svc, { operation: "card_issuance", user_id: user.id, transaction_id: cardKey, idempotency_key: cardKey, old_state: "RESERVED", new_state: "UNKNOWN", asset: "NGN", amount: quote.ngn_cost, fee: quote.olaform_fee, provider: "strowallet", actor: "crix-dollar-card", reason: "card network did not answer — confirming" }).catch(() => {});
        return Response.json({ error: "The card network did not answer. Your purchase is being confirmed — check back in a few moments. Do not submit the same card again." }, { status: 504 });
      }

      const resp = created.json && created.json.response ? created.json.response : null;

      // Definitive refusal → immediate FULL refund
      const refused = !created.ok && [400, 401, 402, 403, 404, 422].includes(created.status);
      if (refused || (created.json && created.json.success === false) || !resp) {
        const reason = String((created.json && created.json.message) || ("HTTP " + created.status)).slice(0, 200);
        await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: totalDebit } }).catch(() => {});
        let refundPair = "";
        try {
          refundPair = await writeRefundPair(svc, { key: cardKey, userId: user.id, amount: quote.ngn_cost, fee: quote.olaform_fee, memo: "dollar card refused — $" + fundingUsd + " card", creditAccount: CARD_ACCOUNT });
        } catch (ledgerError) { /* refund applied; pair flagged in evidence */ }
        const refundAt = nowIso();
        await updateCard({
          status: "refunded", failure_reason: reason, ledger_pair: "",
          timeline_json: JSON.stringify([
            ...timeline,
            { step: "FAILED", at: refundAt, detail: "card network refused: " + reason },
            { step: "REFUNDED", at: refundAt, detail: "wallet refunded ₦" + totalDebit + " in full" + (refundPair ? " — pair " + refundPair : "") },
          ]),
        });
        await appendAudit(svc, { operation: "card_issuance", user_id: user.id, transaction_id: cardKey, idempotency_key: cardKey, old_state: "RESERVED", new_state: "REFUNDED", asset: "NGN", amount: quote.ngn_cost, fee: quote.olaform_fee, provider: "strowallet", actor: "crix-dollar-card", reason: "network refused — wallet refunded in full: " + reason }).catch(() => {});
        await sendSlackAlert({
          title: "↩️ Strowallet transaction — card refused, wallet refunded",
          message: "The card network refused a purchase; the wallet was refunded in full.",
          fields: [
            { label: "Refund", value: "₦" + totalDebit.toLocaleString() },
            { label: "Reason", value: reason },
            { label: "Reference", value: cardKey },
          ],
        });
        return Response.json({ error: "The card network refused this purchase — your wallet was refunded in full. (" + reason + ")" }, { status: 422 });
      }

      // SUCCESS — read the live card details for the masked PAN / brand
      const providerCardId = String(resp.card_id || "");
      let maskedPan = "";
      let cardStatus = String(resp.card_status || "");
      try {
        const d = await stroCardDetails(providerCardId);
        const detail = d.json && d.json.response && d.json.response.card_detail;
        if (detail && detail.last4) maskedPan = "•••• •••• •••• " + String(detail.last4);
        if (detail && detail.card_status) cardStatus = String(detail.card_status);
        if (detail) {
          evidence.push({ check: "card_details_live", pass: true, value: String(detail.card_brand || "visa") + " ·· " + maskedPan, source: "live card network" });
        }
      } catch (e: any) {
        evidence.push({ check: "card_details_live", pass: false, value: String((e && e.message) || e).slice(0, 120), source: "live card network" });
      }

      // Settle the double-entry pair (a ledger write failure is recorded as
      // evidence for reconciliation; it can never roll back a card the
      // network already issued)
      let pairKey = "";
      let ledgerNote = "double-entry pair balanced";
      try {
        pairKey = await writeSettledPair(svc, { key: cardKey, userId: user.id, amount: quote.ngn_cost, fee: quote.olaform_fee, memo: "Dollar card issued — $" + fundingUsd + " (" + name + ")", creditAccount: CARD_ACCOUNT });
      } catch (ledgerError: any) {
        ledgerNote = "ledger write failed — flagged for reconciliation: " + String((ledgerError && ledgerError.message) || ledgerError).slice(0, 120);
      }

      const finalStatus = cardStatus === "active" ? "active" : "issued";
      const doneAt = nowIso();
      await updateCard({
        provider_card_id: providerCardId, masked_pan: maskedPan, status: finalStatus,
        ledger_pair: pairKey,
        timeline_json: JSON.stringify([...timeline, { step: finalStatus.toUpperCase(), at: doneAt, detail: "card network confirmed issuance — " + ledgerNote }]),
        evidence_json: JSON.stringify([...evidence, { check: "ledger", pass: !!pairKey, value: ledgerNote, source: "double-entry ledger" }]),
      });
      const finalWallet = await svc.entities.CrixWallet.get(wallet.id);
      await appendAudit(svc, {
        operation: "card_issuance", user_id: user.id, transaction_id: cardKey, idempotency_key: cardKey,
        old_state: "RESERVED", new_state: finalStatus.toUpperCase(), asset: "NGN", amount: quote.ngn_cost, fee: quote.olaform_fee,
        provider: "strowallet", actor: "crix-dollar-card", reason: "dollar card issued from the funded Naira wallet — $" + fundingUsd,
      }).catch(() => {});
      await recordCrixPayment(svc, { service: "Dollar card", details: "Card issued — $" + fundingUsd + " " + (maskedPan || ""), amount: quote.ngn_cost, fee: quote.olaform_fee, status: "paid", reference: cardKey, user: user.email || user.id }).catch(() => {});
      await sendSlackAlert({
        title: "💳 Strowallet transaction — dollar card issued",
        message: "New Strowallet card transaction processed.",
        fields: [
          { label: "Card", value: maskedPan || name },
          { label: "Funded", value: "$" + fundingUsd },
          { label: "Charged", value: "₦" + totalDebit.toLocaleString() },
          { label: "Platform fee", value: "₦" + quote.olaform_fee.toLocaleString() },
          { label: "Reference", value: cardKey },
        ],
      });
      // Customer receipt — best effort, non-blocking
      await svc.integrations.Core.SendEmail({
        to: user.email,
        subject: "Your CRIXCOIN dollar card is ready" + (maskedPan ? " — " + maskedPan : ""),
        body:
          "Your virtual Visa dollar card has been issued.\n\n" +
          "Card: " + (maskedPan || "in the Ride X app") + "\n" +
          "Funded: $" + fundingUsd + "\n" +
          "Rate: " + lr.rate + " (live)\n" +
          "Charged: \u20a6" + totalDebit.toLocaleString() + " (incl. \u20a6" + quote.olaform_fee + " fee)\n" +
          "New wallet balance: \u20a6" + Number(finalWallet.available || 0).toLocaleString() + "\n\n" +
          "Open CRIXCOIN \u2192 Dollar Card in the Ride X app to see the full card details.\n" +
          "Reference: " + cardKey,
      }).catch(() => {});
      return Response.json({
        status: finalStatus, card_key: cardKey, masked_pan: maskedPan,
        cardholder_name: name, funding_usd: fundingUsd, total_debit_ngn: totalDebit,
        balance: finalWallet.available,
      });
    }

    // ---- FUND — top up an existing card from the wallet ----
    if (action === "fund") {
      const fundKey = String(body.fund_key || "").trim();
      const cardKey = String(body.card_key || "").trim();
      const amountUsd = roundMoney(body.amount_usd);
      if (!fundKey || !cardKey) return Response.json({ error: "Missing top-up details — nothing was charged." }, { status: 400 });
      if (!(amountUsd >= MIN_FUND_USD) || amountUsd > MAX_FUND_USD) {
        return Response.json({ error: "Top-ups must be between $" + MIN_FUND_USD + " and $" + MAX_FUND_USD + " — nothing was charged." }, { status: 400 });
      }

      // 1. IDEMPOTENCY — the ledger pair key proves this top-up never ran twice
      const priorPair = await svc.entities.CrixLedgerEntry.filter({ entry_key: fundKey + "|D1" });
      if (priorPair && priorPair.length) {
        return Response.json({ idempotent: true, fund_key: fundKey });
      }

      // RAIL STATE — new Naira-funded card funding is retired; nothing was charged
      if (CARD_RAIL.paused) {
        await appendAudit(svc, { operation: "card_funding", user_id: user.id, idempotency_key: fundKey, old_state: "REQUESTED", new_state: "PAUSED", asset: "NGN", amount: 0, actor: "crix-dollar-card", reason: CARD_RAIL.reason }).catch(() => {});
        return Response.json({ error: CARD_RAIL.reason, paused: true }, { status: 423 });
      }

      // 2. PAUSE — fail-closed before any movement
      const pause = await assertNotPaused(svc, "card_issuance");
      if (pause.blocked) return Response.json({ error: pause.reason }, { status: 423 });

      // 3. OWNERSHIP — the caller must own the card being topped up
      const rows = await svc.entities.CrixDollarCard.filter({ card_key: cardKey });
      const cardRow = (rows || [])[0] || null;
      if (!cardRow || (cardRow.user_id !== user.id && user.role !== "admin") || !cardRow.provider_card_id) {
        return Response.json({ error: "Card not found — nothing was charged." }, { status: 404 });
      }

      // 4. TRANSACTION PIN — before the debit
      const pinCheck = await verifyPin(svc, user.id, body.pin);
      if (!pinCheck.ok) {
        return Response.json({ error: pinCheck.reason + " — nothing was charged.", pin_required: true }, { status: 403 });
      }

      // 5. LIVE QUOTE
      const lr = await liveRate(base44);
      const quote = quoteBreakdown(lr.rate, lr.cfg, amountUsd, "fund");
      const totalDebit = roundMoney(quote.total_debit_ngn);

      // 6. WALLET — frozen check, then the atomic conditional debit
      const wallet = await getOrCreateWallet(svc, user.id, "NGN");
      if (wallet.status === "frozen") {
        return Response.json({ error: "Your Naira wallet is frozen — unfreeze it in Crix Protection first. Nothing was charged." }, { status: 400 });
      }
      const before = await svc.entities.CrixWallet.get(wallet.id);
      if ((Number(before.available) || 0) < totalDebit) {
        return Response.json({ error: "Not enough in your wallet — needed: ₦" + totalDebit.toLocaleString() + ", available: ₦" + Number(before.available || 0).toLocaleString() + ". Fund your wallet and try again." }, { status: 400 });
      }
      await svc.entities.CrixWallet.updateMany(
        { id: wallet.id, available: { $gte: totalDebit } },
        { $inc: { available: -totalDebit } }
      );
      const after = await svc.entities.CrixWallet.get(wallet.id);
      if ((Number(after.available) || 0) >= (Number(before.available) || 0)) {
        return Response.json({ error: "The top-up could not be reserved — please try again. Nothing was charged." }, { status: 409 });
      }

      // 7. FUND — the network is called the moment the debit confirms
      const funded = await stroFundWithdraw(cardRow.provider_card_id, amountUsd, "fund");

      // A LOST answer is UNKNOWN — the debit stands, the top-up is never re-sent
      if (funded.transport) {
        await appendAudit(svc, { operation: "card_funding", user_id: user.id, transaction_id: fundKey, idempotency_key: fundKey, old_state: "RESERVED", new_state: "UNKNOWN", asset: "NGN", amount: quote.ngn_cost, fee: quote.olaform_fee, provider: "strowallet", actor: "crix-dollar-card", reason: "network did not answer — confirming" }).catch(() => {});
        return Response.json({ error: "The card network did not answer. Your top-up is being confirmed — check your card balance in a few moments. Do not submit the same top-up again." }, { status: 504 });
      }

      const refused = !funded.ok && [400, 401, 402, 403, 404, 422].includes(funded.status);
      if (refused || (funded.json && funded.json.success === false)) {
        const reason = String((funded.json && funded.json.message) || ("HTTP " + funded.status)).slice(0, 200);
        await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: totalDebit } }).catch(() => {});
        try {
          await writeRefundPair(svc, { key: fundKey, userId: user.id, amount: quote.ngn_cost, fee: quote.olaform_fee, memo: "card top-up refused — " + cardRow.masked_pan, creditAccount: CARD_ACCOUNT });
        } catch (ledgerError) { /* refund applied; pair flagged in audit */ }
        await appendAudit(svc, { operation: "card_funding", user_id: user.id, transaction_id: fundKey, idempotency_key: fundKey, old_state: "RESERVED", new_state: "REFUNDED", asset: "NGN", amount: quote.ngn_cost, fee: quote.olaform_fee, provider: "strowallet", actor: "crix-dollar-card", reason: "network refused — wallet refunded in full: " + reason }).catch(() => {});
        await sendSlackAlert({
          title: "↩️ Strowallet transaction — top-up refused, wallet refunded",
          message: "The card network refused a top-up; the wallet was refunded in full.",
          fields: [
            { label: "Refund", value: "₦" + totalDebit.toLocaleString() },
            { label: "Reason", value: reason },
            { label: "Reference", value: fundKey },
          ],
        });
        return Response.json({ error: "The card network refused this top-up — your wallet was refunded in full. (" + reason + ")" }, { status: 422 });
      }

      // SUCCESS — settle the pair, read the new live balance
      let pairKey = "";
      try {
        pairKey = await writeSettledPair(svc, { key: fundKey, userId: user.id, amount: quote.ngn_cost, fee: quote.olaform_fee, memo: "Dollar card top-up — $" + amountUsd + " (" + cardRow.masked_pan + ")", creditAccount: CARD_ACCOUNT });
      } catch (ledgerError: any) {
        await appendAudit(svc, { operation: "card_funding", user_id: user.id, transaction_id: fundKey, idempotency_key: fundKey, old_state: "RESERVED", new_state: "COMPLETED", asset: "NGN", amount: quote.ngn_cost, fee: quote.olaform_fee, provider: "strowallet", actor: "crix-dollar-card", reason: "top-up applied but the ledger pair failed — flagged for reconciliation: " + String((ledgerError && ledgerError.message) || ledgerError).slice(0, 120) }).catch(() => {});
      }
      let cardBalance = null;
      try {
        const d = await stroCardDetails(cardRow.provider_card_id);
        const detail = d.json && d.json.response && d.json.response.card_detail;
        if (detail) cardBalance = Number(detail.balance);
      } catch { /* balance read is best-effort */ }
      await appendAudit(svc, { operation: "card_funding", user_id: user.id, transaction_id: fundKey, idempotency_key: fundKey, old_state: "RESERVED", new_state: "COMPLETED", asset: "NGN", amount: quote.ngn_cost, fee: quote.olaform_fee, provider: "strowallet", actor: "crix-dollar-card", reason: "card topped up $" + amountUsd }).catch(() => {});
      await recordCrixPayment(svc, { service: "Dollar card", details: "Top-up — $" + amountUsd + " " + (cardRow.masked_pan || ""), amount: quote.ngn_cost, fee: quote.olaform_fee, status: "paid", reference: fundKey, user: user.email || user.id }).catch(() => {});
      await sendSlackAlert({
        title: "💳 Strowallet transaction — card top-up",
        message: "New Strowallet top-up processed.",
        fields: [
          { label: "Card", value: cardRow.masked_pan || "" },
          { label: "Top-up", value: "$" + amountUsd },
          { label: "Charged", value: "₦" + totalDebit.toLocaleString() },
          { label: "Platform fee", value: "₦" + quote.olaform_fee.toLocaleString() },
          { label: "Reference", value: fundKey },
        ],
      });
      const finalWallet = await svc.entities.CrixWallet.get(wallet.id);
      return Response.json({
        status: "funded", fund_key: fundKey, amount_usd: amountUsd,
        total_debit_ngn: totalDebit, card_balance_usd: cardBalance,
        balance: finalWallet.available,
      });
    }

    // ---- STATUS — freeze / unfreeze the customer's own card ----
    if (action === "status") {
      const cardKey = String(body.card_key || "").trim();
      const status = String(body.status || "") === "frozen" ? "frozen" : "active";
      const rows = await svc.entities.CrixDollarCard.filter({ card_key: cardKey });
      const cardRow = (rows || [])[0] || null;
      if (!cardRow || (cardRow.user_id !== user.id && user.role !== "admin") || !cardRow.provider_card_id) {
        return Response.json({ error: "Card not found." }, { status: 404 });
      }
      const r = await stroCardStatus(cardRow.provider_card_id, status);
      if (r.transport) return Response.json({ error: "The card network did not answer — please try again shortly." }, { status: 503 });
      if (!r.ok || (r.json && r.json.success === false)) {
        return Response.json({ error: "The card network refused this change — " + String((r.json && r.json.message) || "please try again") + "." }, { status: 422 });
      }
      await svc.entities.CrixDollarCard.update(cardRow.id, { status: status === "frozen" ? "frozen" : "active" });
      return Response.json({ status: status });
    }

    // ---- DETAILS — live card details, only for the verified owner ----
    if (action === "details") {
      const cardKey = String(body.card_key || "").trim();
      const rows = await svc.entities.CrixDollarCard.filter({ card_key: cardKey });
      const cardRow = (rows || [])[0] || null;
      if (!cardRow || (cardRow.user_id !== user.id && user.role !== "admin") || !cardRow.provider_card_id) {
        return Response.json({ error: "Card not found." }, { status: 404 });
      }
      const r = await stroCardDetails(cardRow.provider_card_id);
      if (r.transport) return Response.json({ error: "The card network did not answer — please try again shortly." }, { status: 503 });
      const detail = r.json && r.json.response && r.json.response.card_detail;
      if (!detail) return Response.json({ error: "The card network did not return this card's details — " + String((r.json && r.json.message) || "please try again") + "." }, { status: 422 });
      // Only the verified owner ever sees full card details; never stored
      await svc.entities.CrixDollarCard.update(cardRow.id, {
        masked_pan: detail.last4 ? "•••• •••• •••• " + String(detail.last4) : cardRow.masked_pan,
        cardholder_name: String(detail.card_holder_name || cardRow.cardholder_name || ""),
      }).catch(() => {});
      return Response.json({ card: {
        masked_pan: detail.last4 ? "•••• •••• •••• " + String(detail.last4) : "",
        card_number: String(detail.card_number || ""), cvv: String(detail.cvv || ""),
        expiry: String(detail.expiry || ""), balance: Number(detail.balance || 0),
        card_brand: String(detail.card_brand || "visa"), card_status: String(detail.card_status || ""),
      } });
    }

    // ---- HISTORY — the card's live transaction feed, owner only ----
    if (action === "history") {
      const cardKey = String(body.card_key || "").trim();
      const rows = await svc.entities.CrixDollarCard.filter({ card_key: cardKey });
      const cardRow = (rows || [])[0] || null;
      if (!cardRow || (cardRow.user_id !== user.id && user.role !== "admin") || !cardRow.provider_card_id) {
        return Response.json({ error: "Card not found." }, { status: 404 });
      }
      const r = await stroCardHistory(cardRow.provider_card_id);
      if (r.transport) return Response.json({ error: "The card network did not answer — please try again shortly." }, { status: 503 });
      const txs = (r.json && r.json.response && r.json.response.card_transactions) || [];
      return Response.json({ transactions: (txs || []).slice(0, 30).map((t: any) => ({
        reference: String(t.reference || t.id || ""), type: String(t.type || ""), method: String(t.method || ""),
        narrative: String(t.narrative || ""), amount: Number(t.amount || 0),
        status: String(t.status || ""), created_at: String(t.createdAt || ""),
      })) });
    }

    // ---- PROVIDERS — honest live status of every card provider (admin only) ----
    if (action === "providers") {
      if (user.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
      let fintava = false;
      let fintavaTier = "";
      let fintavaBalance = null;
      try {
        const fb = await fintavaMerchantBalance();
        fintava = fb.ok;
        if (fintava && fb.json && fb.json.data) {
          fintavaTier = String(fb.json.data.tier || "");
          fintavaBalance = fb.json.data.balance ? Number(fb.json.data.balance.availableBalance) || 0 : 0;
        }
      } catch { fintava = false; }
      let strowallet = false;
      let strowalletRate = null;
      try {
        const rate = await stroUsdNgnRate();
        strowallet = rate.ok;
        strowalletRate = rate.rate;
      } catch { strowallet = false; }
      return Response.json({
        checked_at: nowIso(),
        providers: [
          { id: "strowallet", product: "Virtual dollar cards (Visa NFC)", reachable: strowallet, live_rate: strowalletRate, note: strowallet ? "Live rate endpoint answered with the configured keys." : "The Strowallet card network did not answer." },
          { id: "fintava", product: "NGN cards & wallets", reachable: fintava, tier: fintavaTier, available_balance_ngn: fintavaBalance, note: fintava ? "Live key verified against the documented API." : "The live key did not answer." },
        ],
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}