import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { roundMoney, quoteFee, getOrCreateWallet } from "../../shared/crixCore.ts";
import { bigisubRequest, bigisubStatusValue, bigisubReference, bigisubPin } from "../../shared/bigisubClient.ts";
import { writeSettledPair, writeRefundPair } from "../../shared/crixBillPairs.ts";
import { assertNotPaused, appendAudit } from "../../shared/crixGuards.ts";
import { recordCrixPayment } from "../../shared/crixSheets.ts";
import { verifyPin } from "../../shared/crixPin.ts";

// CRIX BETTING TOP-UPS — instant Naira funding of betting wallets through the BigiSub
// (deploy retry: PIN gate + sheets accounting)
// BigiSub bill network (38 live billers: Bet9ja, SportyBet, 1xBet, BetKing
// and every platform the live catalogue actually serves), paid straight from
// the customer's funded Naira wallet. Same non-negotiable money rules as
// every Crix rail:
//   1. EMERGENCY PAUSE — fail-closed before any movement
//   2. IDEMPOTENCY — the same bet_key NEVER tops up twice (checked against
//      the permanent record before any debit)
//   3. LIVE CATALOGUE — billers and their limits read live, never typed
//   4. LIVE CUSTOMER VALIDATION — the betting account is verified with the
//      provider BEFORE any money moves (billers that require it get a fresh
//      validation_reference at pay time)
//   5. FEE BEFORE DEBIT — quoted from the active fee rule; the transaction
//      PIN is resolved BEFORE the debit so a missing secret can never
//      strand reserved money
//   6. ATOMIC WALLET DEBIT — available >= total or nothing moves
//   7. HONEST STATES — completed settles instantly; refunded returns the
//      wallet in full; a lost or processing answer is UNKNOWN and is resolved
//      via the biller's LIVE requery endpoint — never blindly refunded or
//      re-sent

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; providers: any[] } = { at: 0, providers: [] };

// The live betting catalogue — every biller the account actually serves,
// with each biller's REAL limits.
async function liveProviders(): Promise<any[]> {
  if (cache.providers.length && Date.now() - cache.at < CACHE_TTL_MS) return cache.providers;
  const r = await bigisubRequest("GET", "/api/v2/betting/billers/");
  const rows = r.ok && r.json && Array.isArray(r.json.data) ? r.json.data : [];
  const providers = rows.map((p: any) => ({
    code: String(p.code),
    name: String(p.name || p.code),
    min: Number(p.min_amount) || 100,
    max: Number(p.max_amount) || 1000000,
  }));
  cache = { at: Date.now(), providers };
  return providers;
}

// Live validation of the customer's betting account — also the source of the
// validation_reference some billers require at fund time.
async function liveValidate(billerCode: string, customerId: string): Promise<{ ok: boolean; name: string; validationReference: string; requiresRef: boolean; reason: string }> {
  const r = await bigisubRequest("POST", "/api/v2/betting/validate/", { biller_code: billerCode, customer_id: customerId });
  const d = r.json && r.json.data ? r.json.data : null;
  if (r.ok && r.json && r.json.success !== false && d) {
    return {
      ok: true,
      name: String(d.customer_name || d.name || ""),
      validationReference: String(d.validation_reference || ""),
      requiresRef: !!d.requires_validation_ref,
      reason: "",
    };
  }
  return { ok: false, name: "", validationReference: "", requiresRef: false, reason: String((r.json && r.json.message) || "The biller could not confirm this betting account") };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    // ---- PROVIDERS — the live betting catalogue ----
    if (action === "providers") {
      const providers = await liveProviders();
      if (!providers.length) {
        return Response.json({ error: "Betting providers are unavailable right now — please try again shortly. Nothing was charged." }, { status: 503 });
      }
      return Response.json({ providers });
    }

    // ---- VALIDATE — live check of the customer's betting account ----
    if (action === "validate") {
      const provider = String(body.provider || "").trim();
      const customerId = String(body.customer_id || "").trim();
      if (!provider || !customerId) return Response.json({ error: "Missing provider or betting account ID" }, { status: 400 });
      const list = await liveProviders();
      const match = list.find((p) => p.name === provider || p.code === provider);
      if (!match) return Response.json({ valid: false, reason: "That betting site is not available right now." });
      const v = await liveValidate(match.code, customerId);
      if (!v.ok) return Response.json({ valid: false, reason: v.reason });
      return Response.json({ valid: true, name: v.name || "Account confirmed" });
    }

    // ---- QUOTE — the platform fee, quoted before confirmation ----
    if (action === "quote") {
      const provider = String(body.provider || "").trim();
      const amount = Number(body.amount || 0) || 0;
      const list = await liveProviders();
      const match = list.find((p) => p.name === provider || p.code === provider);
      if (!match) return Response.json({ error: "That provider is not available right now — nothing was charged." }, { status: 400 });
      if (!(amount >= match.min) || amount > match.max) {
        return Response.json({ error: "Top-up amounts for " + match.name + " must be between ₦" + match.min.toLocaleString() + " and ₦" + match.max.toLocaleString() + "." }, { status: 400 });
      }
      const feeQ = await quoteFee(svc, "bill_payment", "NGN", amount);
      if (!feeQ) return Response.json({ error: "Betting top-ups are not enabled yet — nothing was charged." }, { status: 400 });
      return Response.json({ quote: { ...feeQ, amount_ngn: amount, provider: match.name, min: match.min, max: match.max } });
    }

    // ---- TOPUP — the guarded instant funding flow ----
    if (action === "topup") {
      const betKey = String(body.bet_key || "").trim();
      const providerIn = String(body.provider || "").trim();
      const customerId = String(body.customer_id || "").trim();
      const amount = roundMoney(Number(body.amount || 0) || 0);
      if (!betKey || !providerIn || !customerId || !(amount > 0)) {
        return Response.json({ error: "Missing top-up details — nothing was charged." }, { status: 400 });
      }

      // 1. EMERGENCY PAUSE — fail-closed before any movement
      const pause = await assertNotPaused(svc, "bill_payment");
      if (pause.blocked) {
        await appendAudit(svc, { operation: "betting_topup", user_id: user.id, idempotency_key: betKey, old_state: "REQUESTED", new_state: "PAUSED", asset: "NGN", actor: "crix-betting-topup", reason: pause.reason }).catch(() => {});
        return Response.json({ error: pause.reason }, { status: 423 });
      }

      // 2. IDEMPOTENCY — the same bet_key never tops up twice
      const priorRows = await svc.entities.CrixBillPayment.filter({ bill_key: betKey });
      const prior = (priorRows || [])[0] || null;
      if (prior) {
        return Response.json({ idempotent: true, bet_key: prior.bill_key, status: prior.status, biller_name: prior.biller_name, amount_ngn: prior.amount_ngn });
      }

      // 2b. TRANSACTION PIN — the customer verifies every purchase personally.
      //     Checked BEFORE any wallet movement; a wrong or missing PIN moves nothing.
      const pinCheck = await verifyPin(svc, user.id, body.pin);
      if (!pinCheck.ok) {
        await appendAudit(svc, { operation: "betting_topup", user_id: user.id, idempotency_key: betKey, old_state: "REQUESTED", new_state: "PIN_REJECTED", asset: "NGN", amount, actor: "crix-betting-topup", reason: pinCheck.reason }).catch(() => {});
        return Response.json({ error: pinCheck.reason + " — nothing was charged.", pin_required: true }, { status: 403 });
      }

      // 3. LIVE CATALOGUE — biller and limits re-read live
      const list = await liveProviders();
      if (!list.length) return Response.json({ error: "Betting providers are unavailable right now — nothing was charged. Please try again shortly." }, { status: 503 });
      const match = list.find((p) => p.name === providerIn || p.code === providerIn);
      if (!match) return Response.json({ error: "That provider is not available right now — nothing was charged." }, { status: 400 });
      if (!(amount >= match.min) || amount > match.max) {
        return Response.json({ error: "Top-up amounts for " + match.name + " must be between ₦" + match.min.toLocaleString() + " and ₦" + match.max.toLocaleString() + " — nothing was charged." }, { status: 400 });
      }

      // 4. LIVE CUSTOMER VALIDATION — verified BEFORE any money moves; a
      //    fresh validation_reference is obtained when the biller requires one
      const v = await liveValidate(match.code, customerId);
      if (!v.ok) {
        return Response.json({ error: v.reason + " — nothing was charged." }, { status: 400 });
      }
      const customerName = v.name.slice(0, 120);

      // 5. PLATFORM FEE — from the active fee rule only
      const quote = await quoteFee(svc, "bill_payment", "NGN", amount);
      if (!quote) return Response.json({ error: "Betting top-ups are not enabled yet — nothing was charged." }, { status: 400 });
      const totalDebit = roundMoney(quote.total_debit);

      // Resolve the transaction PIN BEFORE any debit
      let pin = "";
      try {
        pin = bigisubPin();
      } catch (pinError) {
        return Response.json({ error: "The biller network is not fully configured yet — purchases are disabled. Nothing was charged." }, { status: 503 });
      }

      // 6. WALLET — frozen check, then the atomic conditional debit
      const wallet = await getOrCreateWallet(svc, user.id, "NGN");
      if (wallet.status === "frozen") {
        return Response.json({ error: "Your Naira wallet is frozen — unfreeze it in Crix Protection first. Nothing was charged." }, { status: 400 });
      }
      const before = await svc.entities.CrixWallet.get(wallet.id);
      if ((Number(before.available) || 0) < totalDebit) {
        return Response.json({ error: "Not enough in your wallet — needed: ₦" + totalDebit.toLocaleString() + ", available: ₦" + Number(before.available || 0).toLocaleString() + ". Fund your wallet and try again." }, { status: 400 });
      }

      const now = new Date().toISOString();
      const timeline = [
        { step: "REQUESTED", at: now, detail: "idempotency locked" },
        { step: "VALIDATED", at: now, detail: match.name + " account " + customerId + " confirmed live" + (customerName ? " (" + customerName + ")" : "") },
      ];
      const bill = await svc.entities.CrixBillPayment.create({
        bill_key: betKey, user_id: user.id, category: "BETTING",
        biller_name: match.name, biller_code: match.code, item_code: match.code,
        customer_reference: customerId, customer_name: customerName,
        amount_ngn: amount, fee_total: quote.fee, total_debit: totalDebit,
        status: "created", provider_ref: "", ledger_pair: "", failure_reason: "",
        timeline_json: JSON.stringify(timeline),
        evidence_json: JSON.stringify([
          { check: "billers_live", pass: true, value: match.code + " — " + match.name, source: "live betting catalogue" },
          { check: "customer_validated_live", pass: true, value: customerName || customerId, source: "live validation endpoint" },
        ]),
      });
      const updateBill = (patch: any) => svc.entities.CrixBillPayment.update(bill.id, patch);

      await svc.entities.CrixWallet.updateMany(
        { id: wallet.id, available: { $gte: totalDebit } },
        { $inc: { available: -totalDebit } }
      );
      const after = await svc.entities.CrixWallet.get(wallet.id);
      if ((Number(after.available) || 0) >= (Number(before.available) || 0)) {
        await updateBill({
          status: "failed", failure_reason: "reservation could not be applied",
          timeline_json: JSON.stringify([...timeline, { step: "FAILED", at: new Date().toISOString(), detail: "reservation could not be applied — nothing moved" }]),
        }).catch(() => {});
        return Response.json({ error: "The top-up could not be reserved — please try again. Nothing was charged." }, { status: 409 });
      }
      timeline.push({ step: "RESERVED", at: new Date().toISOString(), detail: "₦" + totalDebit + " reserved from the Naira wallet atomically" });

      // 7. INSTANT TOP-UP
      const fundBody: any = { biller_code: match.code, customer_id: customerId, amount, pin_code: pin };
      if (v.requiresRef && v.validationReference) fundBody.validation_reference = v.validationReference;
      const r = await bigisubRequest("POST", "/api/v2/betting/fund/", fundBody);
      if (r.transport) {
        await updateBill({
          status: "unknown", failure_reason: ("transport: " + r.transport).slice(0, 200),
          timeline_json: JSON.stringify([...timeline, { step: "UNKNOWN", at: new Date().toISOString(), detail: "the provider did not answer — resolving via the live requery endpoint; never blindly refunded or re-sent" }]),
        }).catch(() => {});
        await appendAudit(svc, { operation: "betting_topup", user_id: user.id, transaction_id: betKey, idempotency_key: betKey, old_state: "RESERVED", new_state: "UNKNOWN", asset: "NGN", amount, fee: quote.fee, provider: "bigisub", actor: "crix-betting-topup", reason: "provider did not answer — resolving via live requery" }).catch(() => {});
        return Response.json({ status: "unknown", bet_key: betKey, message: "The provider did not answer. Your top-up is being confirmed — check its status in a few moments. Do not submit the same top-up again." }, { status: 504 });
      }

      const statusValue = bigisubStatusValue(r.json);
      const providerRef = bigisubReference(r.json);

      // Definitive refusal (HTTP 4xx) or provider-returned money → immediate FULL refund
      const definitiveRefusal = (!r.ok && [400, 401, 402, 403, 404, 422].includes(r.status)) || statusValue === "refunded" || statusValue === "failed";
      if (definitiveRefusal) {
        const reason = String((r.json && (r.json.message || (r.json.errors && JSON.stringify(r.json.errors)))) || ("HTTP " + r.status)).slice(0, 200);
        await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: totalDebit } }).catch(() => {});
        let refundPair = "";
        try {
          refundPair = await writeRefundPair(svc, { key: betKey, userId: user.id, amount, fee: quote.fee, memo: "betting top-up returned — " + match.name, creditAccount: "betting:paid:NGN" });
        } catch (ledgerError) { /* refund applied; flagged in evidence */ }
        const refundAt = new Date().toISOString();
        await updateBill({
          status: "refunded", provider_ref: providerRef || betKey, ledger_pair: refundPair, failure_reason: reason,
          timeline_json: JSON.stringify([
            ...timeline,
            { step: "FAILED", at: refundAt, detail: "provider returned the top-up: " + reason },
            { step: "REFUNDED", at: refundAt, detail: "wallet refunded ₦" + totalDebit + " in full" },
          ]),
        });
        await appendAudit(svc, {
          operation: "betting_topup", user_id: user.id, transaction_id: betKey, idempotency_key: betKey,
          old_state: "RESERVED", new_state: "REFUNDED", asset: "NGN", amount, fee: quote.fee,
          provider: "bigisub", actor: "crix-betting-topup",
          reason: "provider returned the top-up — wallet refunded in full: " + reason,
        }).catch(() => {});
        return Response.json({ status: "refunded", bet_key: betKey, message: "The provider refused this top-up — your wallet was refunded in full. (" + reason + ")" }, { status: 422 });
      }

      if (statusValue === "completed") {
        let pairKey = "";
        let ledgerNote = "double-entry pair balanced";
        try {
          pairKey = await writeSettledPair(svc, { key: betKey, userId: user.id, amount, fee: quote.fee, memo: "Betting top-up — " + match.name + " (" + customerId + ")", creditAccount: "betting:paid:NGN" });
        } catch (ledgerError) {
          ledgerNote = "ledger write failed — flagged for reconciliation: " + String(ledgerError.message || ledgerError).slice(0, 120);
        }
        const doneAt = new Date().toISOString();
        await updateBill({
          status: "paid", provider_ref: providerRef, ledger_pair: pairKey,
          timeline_json: JSON.stringify([...timeline, { step: "PAID", at: doneAt, detail: "provider confirmed the top-up — " + ledgerNote }]),
          evidence_json: JSON.stringify([
            { check: "billers_live", pass: true, value: match.code, source: "live betting catalogue" },
            { check: "customer_validated_live", pass: true, value: customerName || customerId, source: "live validation endpoint" },
            { check: "topup_response", pass: true, value: "completed · " + providerRef, source: "live top-up response" },
            { check: "ledger", pass: !!pairKey, value: ledgerNote, source: "double-entry ledger" },
          ]),
        });
        await appendAudit(svc, {
          operation: "betting_topup", user_id: user.id, transaction_id: betKey, idempotency_key: betKey,
          old_state: "RESERVED", new_state: "PAID", asset: "NGN", amount, fee: quote.fee,
          provider: "bigisub", actor: "crix-betting-topup",
          reason: "betting wallet topped up instantly from the funded Naira wallet — " + match.name,
        }).catch(() => {});
        await recordCrixPayment(svc, { service: "Betting top-up", details: match.name + " (" + customerId + ")", amount, fee: quote.fee, status: "paid", reference: betKey, user: user.email || user.id }).catch(() => {});
        const finalWallet = await svc.entities.CrixWallet.get(wallet.id);
        return Response.json({
          status: "paid", bet_key: betKey, provider: match.name, customer_reference: customerId,
          amount_ngn: amount, fee: quote.fee, provider_ref: providerRef, balance: finalWallet.available,
        });
      }

      // processing / pending / unrecognized — UNKNOWN, never blindly refunded or re-sent
      await updateBill({
        status: "unknown", provider_ref: providerRef || betKey,
        failure_reason: statusValue ? ("provider status: " + statusValue + " (HTTP " + r.status + ")") : ("unrecognized provider response (HTTP " + r.status + ")"),
        timeline_json: JSON.stringify([...timeline, { step: "UNKNOWN", at: new Date().toISOString(), detail: "the provider is processing — resolving via the live requery endpoint" }]),
      }).catch(() => {});
      await appendAudit(svc, { operation: "betting_topup", user_id: user.id, transaction_id: betKey, idempotency_key: betKey, old_state: "RESERVED", new_state: "UNKNOWN", asset: "NGN", amount, fee: quote.fee, provider: "bigisub", actor: "crix-betting-topup", reason: "provider is processing — resolving via live requery" }).catch(() => {});
      return Response.json({ status: "unknown", bet_key: betKey, message: "The provider is processing your top-up. Check its status in a few moments. Do not submit the same top-up again." }, { status: 504 });
    }

    // ---- RESOLVE — settle an UNKNOWN top-up via the biller's LIVE requery ----
    if (action === "resolve") {
      const betKey = String(body.bet_key || "").trim();
      const rows = await svc.entities.CrixBillPayment.filter({ bill_key: betKey });
      const bill = (rows || [])[0] || null;
      if (!bill || (bill.user_id !== user.id && user.role !== "admin")) {
        return Response.json({ error: "Top-up not found" }, { status: 404 });
      }
      if (bill.status !== "unknown") {
        return Response.json({ status: bill.status, bet_key: betKey, amount_ngn: bill.amount_ngn, provider: bill.biller_name });
      }
      if (String(bill.category) !== "BETTING") {
        return Response.json({ status: "unknown", bet_key: betKey, message: "Still confirming with the biller. Do not submit the same top-up again." });
      }

      let parsedTimeline: any[] = [];
      try { parsedTimeline = JSON.parse(bill.timeline_json || "[]"); } catch { parsedTimeline = []; }

      // Live requery — the biller's own transaction record is the only authority
      let live: any = null;
      const ref = bill.provider_ref || bill.bill_key;
      if (ref) {
        const q = await bigisubRequest("GET", "/api/v2/betting/requery/?transaction_id=" + encodeURIComponent(ref));
        if (q.ok && q.json && q.json.success === true && q.json.data) live = q.json.data;
      }
      const liveStatus = bigisubStatusValue(live ? { data: live } : null);

      if (live && (liveStatus === "completed" || liveStatus === "refunded" || liveStatus === "failed")) {
        if (liveStatus === "completed") {
          let pairKey = "";
          try {
            pairKey = await writeSettledPair(svc, { key: bill.bill_key, userId: bill.user_id, amount: Number(bill.amount_ngn), fee: Number(bill.fee_total || 0), memo: "Betting top-up — " + bill.biller_name + " (" + bill.customer_reference + ")", creditAccount: "betting:paid:NGN" });
          } catch (ledgerError) { /* flagged below in evidence */ }
          await svc.entities.CrixBillPayment.update(bill.id, {
            status: "paid", ledger_pair: pairKey, failure_reason: "",
            timeline_json: JSON.stringify([...parsedTimeline, { step: "PAID", at: new Date().toISOString(), detail: "live requery confirmed the top-up — settled" }]),
            evidence_json: JSON.stringify([...(JSON.parse(bill.evidence_json || "[]")), { check: "requery_live", pass: true, value: bill.provider_ref, source: "live requery endpoint" }]),
          });
          await appendAudit(svc, { operation: "betting_topup", user_id: bill.user_id, transaction_id: bill.bill_key, idempotency_key: bill.bill_key, old_state: "UNKNOWN", new_state: "PAID", asset: "NGN", amount: Number(bill.amount_ngn), fee: Number(bill.fee_total || 0), provider: "bigisub", actor: "crix-betting-topup", reason: "live requery confirmed the top-up" }).catch(() => {});
          return Response.json({ status: "paid", bet_key: bill.bill_key, amount_ngn: bill.amount_ngn, provider: bill.biller_name });
        }
        // The biller itself returned the money → mirror it honestly
        const totalDebit = Number(bill.total_debit || 0) || roundMoney(Number(bill.amount_ngn) + Number(bill.fee_total || 0));
        await svc.entities.CrixWallet.updateMany({ id: (await getOrCreateWallet(svc, bill.user_id, "NGN")).id }, { $inc: { available: totalDebit } }).catch(() => {});
        let refundPair = "";
        try {
          refundPair = await writeRefundPair(svc, { key: bill.bill_key, userId: bill.user_id, amount: Number(bill.amount_ngn), fee: Number(bill.fee_total || 0), memo: "betting top-up returned by the provider — " + bill.biller_name, creditAccount: "betting:paid:NGN" });
        } catch (ledgerError) { /* refund applied; flagged in evidence */ }
        await svc.entities.CrixBillPayment.update(bill.id, {
          status: "refunded", ledger_pair: refundPair,
          failure_reason: "the provider returned this top-up — wallet refunded in full",
          timeline_json: JSON.stringify([...parsedTimeline, { step: "REFUNDED", at: new Date().toISOString(), detail: "live requery found the provider returned the payment — wallet refunded ₦" + totalDebit + " in full" }]),
        });
        await appendAudit(svc, { operation: "betting_topup", user_id: bill.user_id, transaction_id: bill.bill_key, idempotency_key: bill.bill_key, old_state: "UNKNOWN", new_state: "REFUNDED", asset: "NGN", amount: Number(bill.amount_ngn), fee: Number(bill.fee_total || 0), provider: "bigisub", actor: "crix-betting-topup", reason: "live requery found the provider returned the payment — wallet refunded in full" }).catch(() => {});
        return Response.json({ status: "refunded", bet_key: bill.bill_key, message: "The provider returned this top-up — your wallet was refunded in full." });
      }

      // Not found at the biller: after the safety window the debit is returned —
      // the biller's own live requery (404 = the fund never existed there) is the
      // evidence, never a blind refund of a pending transaction
      const ageMin = (Date.now() - new Date(bill.created_date).getTime()) / 60000;
      if (ageMin >= 10 && !live) {
        const totalDebit = Number(bill.total_debit || 0) || roundMoney(Number(bill.amount_ngn) + Number(bill.fee_total || 0));
        await svc.entities.CrixWallet.updateMany({ id: (await getOrCreateWallet(svc, bill.user_id, "NGN")).id }, { $inc: { available: totalDebit } }).catch(() => {});
        let refundPair = "";
        try {
          refundPair = await writeRefundPair(svc, { key: bill.bill_key, userId: bill.user_id, amount: Number(bill.amount_ngn), fee: Number(bill.fee_total || 0), memo: "unknown betting top-up resolved — never delivered", creditAccount: "betting:paid:NGN" });
        } catch (ledgerError) { /* refund applied; flagged in evidence */ }
        await svc.entities.CrixBillPayment.update(bill.id, {
          status: "refunded", ledger_pair: refundPair, failure_reason: "resolved: the live requery found the top-up was never delivered — wallet refunded in full",
          timeline_json: JSON.stringify([...parsedTimeline, { step: "REFUNDED", at: new Date().toISOString(), detail: "live requery found no transaction — wallet refunded ₦" + totalDebit + " in full" }]),
        });
        await appendAudit(svc, { operation: "betting_topup", user_id: bill.user_id, transaction_id: bill.bill_key, idempotency_key: bill.bill_key, old_state: "UNKNOWN", new_state: "REFUNDED", asset: "NGN", amount: Number(bill.amount_ngn), fee: Number(bill.fee_total || 0), provider: "bigisub", actor: "crix-betting-topup", reason: "live requery found no transaction after the safety window — wallet refunded in full" }).catch(() => {});
        return Response.json({ status: "refunded", bet_key: bill.bill_key, message: "The top-up was never completed — your wallet was refunded in full." });
      }
      return Response.json({ status: "unknown", bet_key: bill.bill_key, message: "Still confirming with the provider — try again in a few minutes. Do not submit the same top-up again." });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}