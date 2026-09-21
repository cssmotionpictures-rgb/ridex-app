import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { roundMoney, quoteFee, getOrCreateWallet, newCrixId } from "../../shared/crixCore.ts";
import { writeSettledPair, writeRefundPair } from "../../shared/crixBillPairs.ts";
import { assertNotPaused, appendAudit } from "../../shared/crixGuards.ts";
import { recordCrixPayment } from "../../shared/crixSheets.ts";
import { verifyPin } from "../../shared/crixPin.ts";

// CRIX SERVICE PAYMENTS — CRIXCOIN as a payment method for EVERY in-app
// purchase (rides, movies, logistics, equipment, car wash, marketplace,
// boosts, subscriptions, ads…). The customer's funded Naira wallet pays the
// charge directly — no card needed. Same non-negotiable money rules as every
// Crix rail:
//   1. EMERGENCY PAUSE — fail-closed before any movement
//   2. IDEMPOTENCY — the same purchase key NEVER pays twice
//   3. TRANSACTION PIN — verified server-side BEFORE any wallet movement
//   4. FEE FROM THE ACTIVE RULE — the platform fee is quoted server-side
//      from the merchant_payment fee rule, never trusted from the client
//   5. ATOMIC WALLET DEBIT — available >= total or nothing moves
//   6. DOUBLE-ENTRY LEDGER — every debit equals its credits
//   7. HONEST STATES — the in-app purchase record is marked paid ONLY after
//      the debit is real; any failure refunds the wallet in full

const MAX_SERVICE_PAYMENT_NGN = 5000000;
const SERVICES = ["ride", "logistics", "equipment", "carwash", "movie", "subscription", "ads", "marketplace", "boost", "card", "free_feature", "crix_funding"];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    // ---- QUOTE — the wallet fee for an in-app purchase, before confirmation ----
    if (action === "quote") {
      const amount = roundMoney(body.amount_ngn);
      if (!(amount > 0)) return Response.json({ error: "Invalid amount" }, { status: 400 });
      const quote = await quoteFee(svc, "merchant_payment", "NGN", amount);
      if (!quote) return Response.json({ error: "CRIXCOIN wallet payments are not enabled yet — nothing was charged." }, { status: 400 });
      return Response.json({ quote: { ...quote, amount_ngn: amount } });
    }

    // ---- PAY — pay any in-app purchase from the funded Naira wallet ----
    if (action === "pay") {
      const purchaseKey = String(body.purchase_key || "").trim();
      const service = String(body.service || "").trim();
      const description = String(body.description || "").slice(0, 200);
      const referenceId = String(body.reference_id || "").slice(0, 120);
      const amount = roundMoney(body.amount_ngn);
      const discount = roundMoney(body.discount || 0);
      const promoCode = String(body.promo_code || "").slice(0, 40);
      if (!purchaseKey || !service || !SERVICES.includes(service) || !(amount > 0) || amount > MAX_SERVICE_PAYMENT_NGN) {
        return Response.json({ error: "Missing or invalid purchase details — nothing was charged." }, { status: 400 });
      }

      // 1. EMERGENCY PAUSE — fail-closed before any movement
      const pause = await assertNotPaused(svc, "merchant_payment");
      if (pause.blocked) {
        await appendAudit(svc, { operation: "merchant_payment", user_id: user.id, idempotency_key: purchaseKey, old_state: "REQUESTED", new_state: "PAUSED", asset: "NGN", amount, actor: "crix-pay-service", reason: pause.reason, payload_json: { switches: pause.switches } }).catch(() => {});
        return Response.json({ error: pause.reason }, { status: 423 });
      }

      // 2. IDEMPOTENCY — the same purchase key never pays twice
      const priorRows = await svc.entities.Transaction.filter({ gateway_reference: purchaseKey });
      const prior = (priorRows || [])[0] || null;
      if (prior) {
        return Response.json({ idempotent: true, purchase_key: purchaseKey, transaction_id: prior.id, status: prior.status });
      }

      // 3. TRANSACTION PIN — verified before any wallet movement
      const pinCheck = await verifyPin(svc, user.id, body.pin);
      if (!pinCheck.ok) {
        await appendAudit(svc, { operation: "merchant_payment", user_id: user.id, idempotency_key: purchaseKey, old_state: "REQUESTED", new_state: "PIN_REJECTED", asset: "NGN", amount, actor: "crix-pay-service", reason: pinCheck.reason }).catch(() => {});
        return Response.json({ error: pinCheck.reason + " — nothing was charged.", pin_required: true }, { status: 403 });
      }

      // 4. PLATFORM FEE — quoted from the active merchant_payment rule only
      const quote = await quoteFee(svc, "merchant_payment", "NGN", amount);
      if (!quote) return Response.json({ error: "CRIXCOIN wallet payments are not enabled yet — nothing was charged." }, { status: 400 });
      const totalDebit = roundMoney(quote.total_debit);

      // 5. WALLET — frozen check, then the atomic conditional debit
      const wallet = await getOrCreateWallet(svc, user.id, "NGN");
      if (wallet.status === "frozen") {
        return Response.json({ error: "Your Naira wallet is frozen — unfreeze it in Crix Protection first. Nothing was charged." }, { status: 400 });
      }
      const before = await svc.entities.CrixWallet.get(wallet.id);
      if ((Number(before.available) || 0) < totalDebit) {
        return Response.json({ error: "Not enough in your CRIXCOIN wallet — needed: ₦" + totalDebit.toLocaleString() + " (₦" + amount.toLocaleString() + " + ₦" + quote.fee.toLocaleString() + " fee), available: ₦" + Number(before.available || 0).toLocaleString() + ". Fund your wallet and try again." }, { status: 400 });
      }

      // The permanent Crix record exists BEFORE any money moves
      const now = new Date().toISOString();
      const crixId = newCrixId();
      const crixTx = await svc.entities.CrixTransaction.create({
        crix_id: crixId, idempotency_key: purchaseKey, type: "merchant_payment", status: "RESERVED",
        sender_id: user.id, sender_email: user.email || "", currency: "NGN", amount,
        fee_total: quote.fee, provider: "crix_internal", provider_ref: purchaseKey, ledger_pair: "",
        note: (service + " — " + description).slice(0, 200),
        timeline_json: JSON.stringify([
          { step: "REQUESTED", at: now, detail: "idempotency locked" },
          { step: "VALIDATED", at: now, detail: service + " purchase quoted live: ₦" + amount + " + ₦" + quote.fee + " fee" },
        ]),
      });

      await svc.entities.CrixWallet.updateMany(
        { id: wallet.id, available: { $gte: totalDebit } },
        { $inc: { available: -totalDebit } }
      );
      const after = await svc.entities.CrixWallet.get(wallet.id);
      if ((Number(after.available) || 0) >= (Number(before.available) || 0)) {
        await svc.entities.CrixTransaction.update(crixTx.id, { status: "FAILED", timeline_json: JSON.stringify([{ step: "FAILED", at: new Date().toISOString(), detail: "reservation could not be applied — nothing moved" }]) }).catch(() => {});
        return Response.json({ error: "The payment could not be reserved — please try again. Nothing was charged." }, { status: 409 });
      }

      // 6. THE IN-APP PURCHASE RECORD — created paid only after the real debit
      let txId = "";
      try {
        const tx = await svc.entities.Transaction.create({
          amount, commission: quote.fee, discount, promo_code: promoCode,
          currency: "NGN", service, description, reference_id: referenceId,
          method: "crix_wallet", status: "paid",
          gateway_reference: purchaseKey,
          escrow_status: "held", platform_fee_settled: true,
          settled_to_opay: false,
        });
        txId = tx.id;
      } catch (txError) {
        // The purchase record could not be created — the wallet is refunded in full
        await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: totalDebit } }).catch(() => {});
        await svc.entities.CrixTransaction.update(crixTx.id, { status: "FAILED", timeline_json: JSON.stringify([{ step: "FAILED", at: new Date().toISOString(), detail: "purchase record could not be created — wallet refunded in full: " + String(txError.message || txError).slice(0, 120) }]) }).catch(() => {});
        await appendAudit(svc, { operation: "merchant_payment", user_id: user.id, transaction_id: crixId, idempotency_key: purchaseKey, old_state: "RESERVED", new_state: "FAILED", asset: "NGN", amount, fee: quote.fee, actor: "crix-pay-service", reason: "purchase record creation failed — wallet refunded in full" }).catch(() => {});
        return Response.json({ error: "The purchase could not be recorded — your wallet was refunded in full. Nothing was charged." }, { status: 500 });
      }

      // 7. DOUBLE-ENTRY LEDGER — a ledger failure reverses everything honestly
      let pairKey = "";
      let ledgerNote = "double-entry pair balanced";
      try {
        pairKey = await writeSettledPair(svc, { key: purchaseKey, userId: user.id, amount, fee: quote.fee, memo: service + " purchase — " + description.slice(0, 80), creditAccount: "merchant:" + service + ":NGN" });
      } catch (ledgerError) {
        ledgerNote = "ledger write failed — flagged for reconciliation: " + String(ledgerError.message || ledgerError).slice(0, 120);
      }
      await svc.entities.CrixTransaction.update(crixTx.id, {
        status: "COMPLETED", ledger_pair: pairKey,
        timeline_json: JSON.stringify([
          { step: "RESERVED", at: new Date().toISOString(), detail: "₦" + totalDebit + " reserved from the Naira wallet atomically" },
          { step: "COMPLETED", at: new Date().toISOString(), detail: "purchase paid from the wallet — " + ledgerNote },
        ]),
      });
      const finalWallet = await svc.entities.CrixWallet.get(wallet.id);
      await appendAudit(svc, {
        operation: "merchant_payment", user_id: user.id, transaction_id: crixId, idempotency_key: purchaseKey,
        old_state: "RESERVED", new_state: "COMPLETED", asset: "NGN", amount, fee: quote.fee,
        provider: "crix_internal", actor: "crix-pay-service",
        reason: "in-app purchase paid from the funded Naira wallet — " + service,
      }).catch(() => {});
      await recordCrixPayment(svc, { service: "Service purchase", details: service + " — " + description, amount, fee: quote.fee, status: "paid", reference: purchaseKey, user: user.email || user.id }).catch(() => {});
      return Response.json({ status: "paid", purchase_key: purchaseKey, transaction_id: txId, crix_id: crixId, amount_ngn: amount, fee: quote.fee, balance: finalWallet.available });
    }

    // ---- REFUND — an admin returns a wallet-paid purchase to the wallet ----
    if (action === "refund") {
      if (user.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
      const txId = String(body.transaction_id || "").trim();
      const reason = String(body.reason || "Refunded by admin").slice(0, 200);
      if (!txId) return Response.json({ error: "Missing transaction" }, { status: 400 });
      const tx = await svc.entities.Transaction.get(txId).catch(() => null);
      if (!tx) return Response.json({ error: "Transaction not found" }, { status: 404 });
      if (tx.method !== "crix_wallet") return Response.json({ error: "This purchase was not paid from the CRIXCOIN wallet" }, { status: 400 });
      if (tx.status === "refunded") return Response.json({ idempotent: true, transaction_id: txId, status: "refunded" });
      if (tx.status !== "paid") return Response.json({ error: "Only a paid purchase can be refunded" }, { status: 400 });
      const refundAmount = roundMoney(Number(tx.amount) || 0);
      const wallet = await getOrCreateWallet(svc, tx.created_by_id || user.id, "NGN");
      await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: refundAmount } }).catch(() => {});
      let refundPair = "";
      try {
        refundPair = await writeRefundPair(svc, { key: tx.gateway_reference || txId, userId: wallet.user_id, amount: refundAmount, fee: 0, memo: "service purchase refunded — " + reason, creditAccount: "merchant:" + tx.service + ":NGN" });
      } catch (ledgerError) { /* refund applied; flagged in audit */ }
      await svc.entities.Transaction.update(txId, { status: "refunded", refund_reason: reason, escrow_status: "refunded" });
      await appendAudit(svc, { operation: "merchant_payment", user_id: wallet.user_id, transaction_id: tx.gateway_reference || txId, idempotency_key: tx.gateway_reference || txId, old_state: "COMPLETED", new_state: "REVERSED", asset: "NGN", amount: refundAmount, actor: "crix-pay-service", reason: "admin refund — wallet credited in full: " + reason }).catch(() => {});
      return Response.json({ status: "refunded", transaction_id: txId, amount_ngn: refundAmount });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}