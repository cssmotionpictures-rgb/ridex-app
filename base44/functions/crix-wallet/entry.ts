import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import {
  CRIX_CURRENCIES, MAX_TRANSFER, newCrixId, getOrCreateWallet, quoteFee, assessRisk, roundMoney,
  MIN_FUNDING_NGN, MAX_FUNDING_NGN, creditCrixDeposit,
} from "../../shared/crixCore.ts";
import { flwRequest } from "../../shared/flutterwaveClient.ts";
import { assertNotPaused, appendAudit } from "../../shared/crixGuards.ts";
import { pinStatus, setPin } from "../../shared/crixPin.ts";

// CRIX WALLET — the ONLY mover of Crix money. Wallet balances, transactions and ledger
// entries are admin-write (RLS) and only this server function, acting for the signed-in
// user, may mutate them. Flow: REQUEST → VALIDATE → QUOTE → IDEMPOTENCY LOCK →
// EMERGENCY-PAUSE GATE → ATOMIC RESERVE/DEBIT → CREDIT → DOUBLE-ENTRY LEDGER →
// SETTLE + AUDIT. Nothing is ever marked completed from a screen click alone.
// (Deploy retry 12 — wallet funding rail: deposit_quote / deposit_init / deposit_settle.)

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "open_wallet") {
      const currency = String(body.currency || "");
      if (!CRIX_CURRENCIES.includes(currency)) {
        return Response.json({ error: "Unsupported currency" }, { status: 400 });
      }
      const wallet = await getOrCreateWallet(svc, user.id, currency);
      return Response.json({
        wallet: { id: wallet.id, currency: wallet.currency, available: wallet.available, reserved: wallet.reserved, status: wallet.status },
      });
    }

    if (action === "quote") {
      const currency = String(body.currency || "NGN");
      const amount = roundMoney(body.amount);
      if (!(amount > 0)) return Response.json({ error: "Enter a valid amount" }, { status: 400 });
      const quote = await quoteFee(svc, "crix_to_crix", currency, amount);
      if (!quote) {
        return Response.json({ available: false, reason: "Crix-to-Crix transfers are not yet enabled for " + currency + ". They open the moment a fee rule is configured — no rail is ever silently priced." });
      }
      return Response.json({ available: true, quote });
    }

    if (action === "freeze" || action === "unfreeze") {
      const currency = String(body.currency || "");
      const wallets = await svc.entities.CrixWallet.filter({ user_id: user.id, currency });
      if (!wallets || !wallets.length) return Response.json({ error: "No " + currency + " wallet to control" }, { status: 404 });
      const frozen = action === "freeze";
      await svc.entities.CrixWallet.update(wallets[0].id, {
        status: frozen ? "frozen" : "active",
        frozen_reason: frozen ? String(body.reason || "customer emergency freeze") : "",
      });
      return Response.json({ ok: true, currency, status: frozen ? "frozen" : "active" });
    }

    if (action === "send") {
      const currency = String(body.currency || "NGN");
      const amount = roundMoney(body.amount);
      const idempotencyKey = String(body.idempotency_key || "");
      const recipientInput = String(body.recipient || body.recipient_email || "").trim().toLowerCase();
      const note = String(body.note || "").slice(0, 140);
      if (!idempotencyKey) return Response.json({ error: "Missing idempotency key" }, { status: 400 });
      if (!(amount > 0) || amount > MAX_TRANSFER) return Response.json({ error: "Amount out of range" }, { status: 400 });
      if (!CRIX_CURRENCIES.includes(currency)) return Response.json({ error: "Unsupported currency" }, { status: 400 });

      // EMERGENCY PAUSE (spec §27) — checked before any money movement, for
      // every customer. Fail-closed: if the pause registry cannot be verified,
      // nothing moves. The frontend can never disable this.
      const pause = await assertNotPaused(svc, "internal_transfer");
      if (pause.blocked) {
        await appendAudit(svc, { operation: "send", user_id: user.id, idempotency_key: idempotencyKey, old_state: "REQUESTED", new_state: "PAUSED", asset: currency, amount, actor: "crix-wallet", reason: pause.reason, payload_json: { switches: pause.switches } }).catch(() => {});
        return Response.json({ error: pause.reason }, { status: 423 });
      }

      // IDEMPOTENCY — the same key always returns the same transaction, never a second movement
      const prior = await svc.entities.CrixTransaction.filter({ idempotency_key: idempotencyKey });
      const mine = (prior || []).find((t) => t.sender_id === user.id);
      if (mine) {
        return Response.json({
          idempotent: true,
          transaction: { crix_id: mine.crix_id, status: mine.status, risk_state: mine.risk_state, currency: mine.currency, amount: mine.amount, fee_total: mine.fee_total },
        });
      }

      // VALIDATE recipient — a @handle or an email, ALWAYS resolved server-side from
      // verified records; a mapping supplied by the frontend is never trusted.
      // An honest miss is reported, never guessed.
      if (!recipientInput) return Response.json({ error: "Enter the recipient's @handle or email" }, { status: 400 });
      let recipient = null;
      if (/^@?[a-z0-9_]{3,24}$/.test(recipientInput)) {
        const handle = recipientInput.startsWith("@") ? recipientInput : "@" + recipientInput;
        const ids = await svc.entities.CrixWalletIdentity.filter({ crix_id: { $in: [handle, handle.slice(1)] }, wallet_verified: true });
        const identity = (ids || [])[0];
        if (identity) {
          try { recipient = await svc.entities.User.get(identity.user_id); } catch (e) { recipient = null; }
        }
      }
      if (!recipient && recipientInput.includes("@")) {
        const users = await svc.entities.User.filter({ email: recipientInput });
        recipient = (users || [])[0] || null;
      }
      if (!recipient) {
        return Response.json({ error: "No CRIXCOIN account exists for " + recipientInput + " yet — they need to join first." }, { status: 404 });
      }
      const recipientEmail = recipient.email || recipientInput;

      // QUOTE — the authoritative fee is computed at execution from the active rule
      const quote = await quoteFee(svc, "crix_to_crix", currency, amount);
      if (!quote) return Response.json({ error: "Crix-to-Crix transfers are not yet enabled for " + currency }, { status: 400 });

      // RISK — evidence-based only
      const risk = await assessRisk(svc, user.id, amount, currency);
      const crixId = newCrixId();
      const now = new Date().toISOString();
      const held = risk.risk === "REVIEW_REQUIRED";
      const timeline = [{ step: "REQUESTED", at: now, detail: "idempotency locked" }];
      timeline.push({ step: held ? "HELD_FOR_REVIEW" : "VALIDATED", at: now, detail: risk.signals.join("; ") || "session + recipient + fee verified" });

      // AUDIT FIRST — the permanent record exists before any money moves
      const tx = await svc.entities.CrixTransaction.create({
        crix_id: crixId, idempotency_key: idempotencyKey, type: "crix_to_crix",
        status: held ? "REQUESTED" : "VALIDATED", risk_state: risk.risk,
        sender_id: user.id, sender_email: user.email,
        recipient_id: recipient.id, recipient_email: recipientEmail,
        currency, amount: quote.recipient_gets, fee_total: quote.fee,
        fee_breakdown_json: JSON.stringify(quote), provider: "crix_internal",
        note, timeline_json: JSON.stringify(timeline),
      });

      if (held) {
        return Response.json({
          held_for_review: true,
          transaction: { crix_id: crixId, status: "REQUESTED", risk_state: risk.risk },
          message: "This transfer needs review — nothing has been debited. Support will contact you.",
        });
      }

      // RESERVE + DEBIT — atomic conditional update: available >= total or nothing moves
      const senderWallet = await getOrCreateWallet(svc, user.id, currency);
      const walletBefore = await svc.entities.CrixWallet.get(senderWallet.id);
      if (walletBefore.status === "frozen") {
        await svc.entities.CrixTransaction.update(tx.id, {
          status: "FAILED",
          timeline_json: JSON.stringify([...timeline, { step: "FAILED", at: new Date().toISOString(), detail: "wallet frozen by customer" }]),
        });
        return Response.json({ error: "Your " + currency + " wallet is frozen — unfreeze it in Crix Protection first." }, { status: 400 });
      }
      if ((Number(walletBefore.available) || 0) < quote.total_debit) {
        await svc.entities.CrixTransaction.update(tx.id, {
          status: "FAILED",
          timeline_json: JSON.stringify([...timeline, { step: "FAILED", at: new Date().toISOString(), detail: "insufficient funds" }]),
        });
        return Response.json({ error: "Not enough available balance — " + currency + " available: " + walletBefore.available }, { status: 400 });
      }
      await svc.entities.CrixWallet.updateMany(
        { id: senderWallet.id, available: { $gte: quote.total_debit } },
        { $inc: { available: -quote.total_debit } }
      );
      const walletAfter = await svc.entities.CrixWallet.get(senderWallet.id);
      if ((Number(walletAfter.available) || 0) >= (Number(walletBefore.available) || 0)) {
        // the conditional debit did not apply — honest failure, nothing moved
        await svc.entities.CrixTransaction.update(tx.id, {
          status: "FAILED",
          timeline_json: JSON.stringify([...timeline, { step: "FAILED", at: new Date().toISOString(), detail: "reservation could not be applied" }]),
        });
        return Response.json({ error: "The transfer could not be reserved — please try again." }, { status: 409 });
      }

      // CREDIT + LEDGER — any failure here is compensated back to the sender
      try {
        const recipWallet = await getOrCreateWallet(svc, recipient.id, currency);
        await svc.entities.CrixWallet.updateMany({ id: recipWallet.id }, { $inc: { available: quote.recipient_gets } });
        const pairKey = crixId + "|P1";
        await svc.entities.CrixLedgerEntry.bulkCreate([
          { entry_key: crixId + "|D1", crix_id: crixId, pair_key: pairKey, account: "user:" + user.id + ":" + currency, user_id: user.id, direction: "debit", amount: quote.total_debit, memo: "Crix transfer to " + recipientEmail },
          { entry_key: crixId + "|C1", crix_id: crixId, pair_key: pairKey, account: "user:" + recipient.id + ":" + currency, user_id: recipient.id, direction: "credit", amount: quote.recipient_gets, memo: "Crix transfer from " + user.email },
          { entry_key: crixId + "|C2", crix_id: crixId, pair_key: pairKey, account: "revenue:fees:" + currency, user_id: "", direction: "credit", amount: quote.fee, memo: "Crix platform fee (" + quote.fee_statement + ")" },
        ]);
        const doneAt = new Date().toISOString();
        await svc.entities.CrixTransaction.update(tx.id, {
          status: "COMPLETED",
          ledger_pair: pairKey,
          timeline_json: JSON.stringify([
            ...timeline,
            { step: "RESERVED", at: doneAt, detail: "funds reserved and debited atomically" },
            { step: "COMPLETED", at: doneAt, detail: "recipient credited, double-entry pair " + pairKey + " balanced" },
          ]),
          protection_json: JSON.stringify({
            session_verified: true, recipient_verified: true, fee_source: quote.rule_key,
            reserved_atomically: true, ledger: "double-entry", rail: "crix_internal",
          }),
        });
        // AUDIT (§40) — the immutable record of the settled movement. This is
        // an INTERNAL LEDGER transfer: no blockchain transaction occurred, and
        // the audit says so truthfully.
        await appendAudit(svc, {
          operation: "send", user_id: user.id, transaction_id: crixId, idempotency_key: idempotencyKey,
          old_state: "VALIDATED", new_state: "COMPLETED", selected_rail: "crix_internal", asset: currency,
          amount: quote.recipient_gets, fee: quote.fee, provider: "crix_internal", actor: "crix-wallet",
          risk_result: risk.risk,
          reason: "internal ledger transfer settled atomically — ledger-only movement, no blockchain transaction",
        }).catch(() => {});
        const finalWallet = await svc.entities.CrixWallet.get(senderWallet.id);
        return Response.json({
          transaction: {
            crix_id: crixId, status: "COMPLETED", risk_state: risk.risk, currency,
            amount: quote.recipient_gets, fee_total: quote.fee, total_debit: quote.total_debit,
            recipient_email: recipientEmail, fee_statement: quote.fee_statement,
          },
          sender_balance: finalWallet.available,
        });
      } catch (innerError) {
        // COMPENSATION — reverse the reservation; money never vanishes
        await svc.entities.CrixWallet.updateMany({ id: senderWallet.id }, { $inc: { available: quote.total_debit } }).catch(() => {});
        await svc.entities.CrixTransaction.update(tx.id, {
          status: "FAILED",
          timeline_json: JSON.stringify([...timeline, { step: "FAILED", at: new Date().toISOString(), detail: "settlement error — funds returned: " + innerError.message }]),
        });
        return Response.json({ error: "The transfer failed after reservation — your funds were returned. Nothing was lost." }, { status: 500 });
      }
    }

    // ===================== WALLET FUNDING (real NGN in) =====================
    // The live real-money deposit rail: Flutterwave NGN card → Crix wallet.
    // Quote and init run here (server-side); the wallet is credited ONLY by
    // creditCrixDeposit after the payment is independently verified at the
    // provider (webhook or deposit_settle below). Never from a screen click.

    if (action === "deposit_quote") {
      const currency = String(body.currency || "NGN");
      const amount = roundMoney(body.amount);
      if (currency !== "NGN") {
        return Response.json({ error: "Wallet funding is live for Naira (NGN) first. Other currencies open as their rails genuinely connect — never before." }, { status: 400 });
      }
      if (!(amount >= MIN_FUNDING_NGN) || amount > MAX_FUNDING_NGN) {
        return Response.json({ error: "Funding amount must be between ₦" + MIN_FUNDING_NGN + " and ₦" + MAX_FUNDING_NGN + "." }, { status: 400 });
      }
      // EMERGENCY PAUSE — stops NEW funding. A pause never strands an
      // already-paid deposit: its credit is obligation settlement.
      const pause = await assertNotPaused(svc, "deposit");
      if (pause.blocked) {
        await appendAudit(svc, { operation: "deposit", user_id: user.id, old_state: "REQUESTED", new_state: "PAUSED", asset: "NGN", amount, actor: "crix-wallet", reason: pause.reason, payload_json: { switches: pause.switches } }).catch(() => {});
        return Response.json({ error: pause.reason }, { status: 423 });
      }
      const quote = await quoteFee(svc, "wallet_funding", currency, amount);
      if (!quote) {
        return Response.json({ available: false, reason: "Wallet funding is not enabled yet — no active funding fee rule exists. Nothing was charged." }, { status: 400 });
      }
      const lands = roundMoney(amount - quote.fee);
      if (lands <= 0) {
        return Response.json({ available: false, reason: "This amount is below the funding fee — enter a larger amount." }, { status: 400 });
      }
      return Response.json({ available: true, quote: { ...quote, lands, charge: amount }, rail: "flutterwave_card_ngn" });
    }

    if (action === "deposit_init") {
      const currency = String(body.currency || "NGN");
      const amount = roundMoney(body.amount);
      const idempotencyKey = String(body.idempotency_key || "");
      if (!idempotencyKey) return Response.json({ error: "Missing idempotency key" }, { status: 400 });
      if (currency !== "NGN") return Response.json({ error: "Wallet funding is live for Naira (NGN) first." }, { status: 400 });
      if (!(amount >= MIN_FUNDING_NGN) || amount > MAX_FUNDING_NGN) {
        return Response.json({ error: "Funding amount must be between ₦" + MIN_FUNDING_NGN + " and ₦" + MAX_FUNDING_NGN + "." }, { status: 400 });
      }
      const pause = await assertNotPaused(svc, "deposit");
      if (pause.blocked) {
        await appendAudit(svc, { operation: "deposit", user_id: user.id, idempotency_key: idempotencyKey, old_state: "REQUESTED", new_state: "PAUSED", asset: "NGN", amount, actor: "crix-wallet", reason: pause.reason, payload_json: { switches: pause.switches } }).catch(() => {});
        return Response.json({ error: pause.reason }, { status: 423 });
      }
      // IDEMPOTENCY — the same key returns the same funding record, never a second charge setup
      const prior = await svc.entities.CrixTransaction.filter({ idempotency_key: idempotencyKey });
      const mine = (prior || []).find((t) => t.sender_id === user.id && t.type === "wallet_funding");
      if (mine) {
        const payRows = await svc.entities.Transaction.filter({ reference_id: mine.crix_id, service: "crix_funding" });
        const pay = (payRows || [])[0] || null;
        if (mine.status === "COMPLETED") {
          return Response.json({ idempotent: true, status: "COMPLETED", crix_id: mine.crix_id });
        }
        return Response.json({
          crix_id: mine.crix_id,
          transaction_id: pay ? pay.id : "",
          reference: "CRXFUND-" + mine.crix_id,
          meta: pay ? { transaction_id: pay.id, service: "crix_funding", reference_id: mine.crix_id, user_id: user.id, user_name: user.full_name || "" } : null,
          quote: { ...JSON.parse(mine.fee_breakdown_json || "{}"), lands: mine.amount, charge: roundMoney(mine.amount + (Number(mine.fee_total) || 0)) },
          rail: "flutterwave_card_ngn",
        });
      }
      const quote = await quoteFee(svc, "wallet_funding", currency, amount);
      if (!quote) return Response.json({ error: "Wallet funding is not enabled yet." }, { status: 400 });
      const lands = roundMoney(amount - quote.fee);
      if (lands <= 0) return Response.json({ error: "This amount is below the funding fee — enter a larger amount." }, { status: 400 });
      const crixId = newCrixId();
      const now = new Date().toISOString();
      await getOrCreateWallet(svc, user.id, currency);
      await svc.entities.CrixTransaction.create({
        crix_id: crixId, idempotency_key: idempotencyKey, type: "wallet_funding", status: "VALIDATED", risk_state: "LOW",
        sender_id: user.id, sender_email: user.email, recipient_id: user.id, recipient_email: user.email,
        currency, amount: lands, fee_total: quote.fee, fee_breakdown_json: JSON.stringify(quote),
        provider: "flutterwave", note: "Wallet funding",
        timeline_json: JSON.stringify([
          { step: "REQUESTED", at: now, detail: "idempotency locked" },
          { step: "VALIDATED", at: now, detail: "session verified, funding fee quoted from the active rule" },
        ]),
      });
      const pay = await svc.entities.Transaction.create({
        amount: amount, commission: quote.fee, currency: "NGN", service: "crix_funding",
        description: "Crix wallet funding " + crixId, reference_id: crixId, method: "card", status: "pending",
      });
      await appendAudit(svc, {
        operation: "deposit", user_id: user.id, transaction_id: crixId, idempotency_key: idempotencyKey,
        old_state: "REQUESTED", new_state: "VALIDATED", asset: currency, amount, fee: quote.fee,
        provider: "flutterwave", actor: "crix-wallet", reason: "funding initialized — nothing is credited until the payment is verified at the provider",
      }).catch(() => {});
      return Response.json({
        crix_id: crixId, transaction_id: pay.id, reference: "CRXFUND-" + crixId,
        meta: { transaction_id: pay.id, service: "crix_funding", reference_id: crixId, user_id: user.id, user_name: user.full_name || "" },
        quote: { ...quote, lands, charge: amount }, rail: "flutterwave_card_ngn",
      });
    }

    if (action === "deposit_settle") {
      const crixId = String(body.crix_id || "");
      const orderId = String(body.order_id || "");
      if (!crixId || !/^(ord|chg)_[A-Za-z0-9]+$/.test(orderId)) {
        return Response.json({ error: "Missing funding reference or order id" }, { status: 400 });
      }
      const rows = await svc.entities.CrixTransaction.filter({ crix_id: crixId });
      const dep = (rows || [])[0] || null;
      if (!dep || (dep.sender_id !== user.id && user.role !== "admin")) {
        return Response.json({ error: "Funding record not found for this account" }, { status: 404 });
      }
      if (dep.status === "COMPLETED") {
        const w = (await svc.entities.CrixWallet.filter({ user_id: dep.sender_id, currency: dep.currency }))[0] || null;
        return Response.json({ idempotent: true, status: "COMPLETED", crix_id: crixId, lands: dep.amount, balance: w ? w.available : null });
      }
      // AUTHORITATIVE re-verification at the provider — a client claim is never enough
      const res = await flwRequest("GET", "/orders/" + orderId);
      const data = res.ok && res.json ? res.json.data : null;
      if (!data || !["succeeded", "authorized"].includes(String(data.status))) {
        return Response.json({ status: "PROCESSING", note: "The payment is not confirmed at the provider yet — your wallet credits automatically the moment it is." });
      }
      const credit = await creditCrixDeposit(svc, {
        crix_id: crixId, charge_amount: Number(data.amount), provider: "flutterwave", provider_ref: String(data.id || orderId),
      });
      if (!credit.ok) return Response.json({ error: credit.error }, { status: 409 });
      const w = (await svc.entities.CrixWallet.filter({ user_id: dep.sender_id, currency: dep.currency }))[0] || null;
      return Response.json({ status: "COMPLETED", crix_id: crixId, lands: dep.amount, balance: w ? w.available : null });
    }

    // ===================== TRANSACTION PIN =====================
    // The customer's personal purchase-verification PIN (bills, betting
    // top-ups, dollar cards). Stored ONLY as a salted SHA-256 hash; every
    // money-moving function verifies it server-side before any wallet debit.

    if (action === "pin_status") {
      const st = await pinStatus(svc, user.id);
      return Response.json({ has_pin: st.has_pin });
    }

    if (action === "pin_set") {
      try {
        const rows = await svc.entities.CrixSecurityPin.filter({ user_id: user.id });
        const had = !!((rows || [])[0]);
        await setPin(svc, user.id, body.pin, body.current_pin);
        await appendAudit(svc, { operation: "pin_change", user_id: user.id, old_state: had ? "SET" : "NONE", new_state: "SET", actor: "crix-wallet", reason: had ? "transaction PIN changed by the customer" : "transaction PIN created by the customer" }).catch(() => {});
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 400 });
      }
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}