// Flutterwave payment gateway — creates card orders, authorizes PIN/OTP steps,
// checks status, and settles redirect returns by transaction.
// Secrets: FLW_CLIENT_ID, FLW_CLIENT_SECRET, FLW_ENCRYPTION_KEY (FLW_API_BASE optional).

import {
  flwRequest,
  importFlwKey,
  makeNonce,
  encryptField,
  normalizeOrder,
  flwErrorMessage,
} from "../../shared/flutterwaveClient.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const MAX_AMOUNT = 100000000; // hard cap: ₦100M per charge
const PAID_STATUSES = ["succeeded", "authorized"];

function badRequest(message) {
  return Response.json({ error: message }, { status: 400 });
}

// Bounded meta passed through to Flutterwave (returned in webhooks).
function cleanMeta(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  return {
    transaction_id: str(m.transaction_id, 64),
    service: str(m.service, 40),
    reference_id: str(m.reference_id, 64),
    promo_code_id: str(m.promo_code_id, 64),
    user_id: str(m.user_id, 64),
    user_name: str(m.user_name, 120),
  };
}

export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "pay";

    // --- Create a card payment order ---
    if (action === "pay") {
      const { amount, email, reference, currency, card, redirect_url } = body;
      const meta = cleanMeta(body.meta);
      const amt = Number(amount);
      if (!amt || amt < 1 || amt > MAX_AMOUNT) return badRequest("Invalid amount");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || ""))) return badRequest("A valid email is required");
      if (!reference || String(reference).length > 100) return badRequest("Missing payment reference");
      const cur = currency === "USD" ? "USD" : "NGN";
      if (String(cur) === "USD") meta.currency = "USD";

      const c = card || {};
      const num = String(c.number || "").replace(/\D/g, "");
      const month = String(c.expiry_month || "").replace(/\D/g, "");
      const year = String(c.expiry_year || "").replace(/\D/g, "");
      const cvv = String(c.cvv || "").replace(/\D/g, "");
      if (num.length < 12 || num.length > 19) return badRequest("Card number is invalid");
      if (Number(month) < 1 || Number(month) > 12 || month.length !== 2) return badRequest("Card expiry month is invalid");
      if (year.length !== 2) return badRequest("Card expiry year must be 2 digits (MM/YY)");
      if (cvv.length < 3 || cvv.length > 4) return badRequest("Card security code is invalid");

      const key = await importFlwKey();
      const nonce = makeNonce();
      const paymentMethod = {
        type: "card",
        card: {
          nonce,
          encrypted_card_number: await encryptField(key, nonce, num),
          encrypted_expiry_month: await encryptField(key, nonce, month),
          encrypted_expiry_year: await encryptField(key, nonce, year),
          encrypted_cvv: await encryptField(key, nonce, cvv),
        },
      };

      const payload = {
        amount: amt,
        currency: cur,
        reference: String(reference),
        customer: { email: String(email).slice(0, 200) },
        payment_method: paymentMethod,
        redirect_url: typeof redirect_url === "string" ? redirect_url.slice(0, 500) : undefined,
        meta,
      };

      const res = await flwRequest("POST", "/orchestration/direct-orders", payload);
      if (!res.ok) {
        return Response.json({ error: flwErrorMessage(res.json), flwStatus: res.status }, { status: 400 });
      }
      return Response.json({ ok: true, order: normalizeOrder(res.json.data) });
    }

    // --- Authorize a PIN / OTP step on an order ---
    if (action === "authorize") {
      const orderId = String(body.order_id || "");
      const type = String(body.type || "");
      const value = String(body.value || "").replace(/\D/g, "");
      if (!/^(ord|chg)_[A-Za-z0-9]+$/.test(orderId)) return badRequest("Invalid order id");
      let authorization;
      if (type === "pin") {
        if (value.length < 4 || value.length > 6) return badRequest("Enter your card PIN");
        const key = await importFlwKey();
        const nonce = makeNonce();
        authorization = { type: "pin", pin: { nonce, encrypted_pin: await encryptField(key, nonce, value) } };
      } else if (type === "otp") {
        if (value.length < 4 || value.length > 8) return badRequest("Enter the OTP sent to you");
        authorization = { type: "otp", otp: { code: value } };
      } else {
        return badRequest("Unsupported authorization type");
      }

      // Orders authorize via PUT /orders/{id}; fall back to the charge endpoint.
      let res = await flwRequest("PUT", `/orders/${orderId}`, { authorization });
      if (!res.ok && res.status !== 400) {
        res = await flwRequest("PUT", `/charges/${orderId}`, { authorization });
      }
      if (!res.ok) {
        return Response.json({ error: flwErrorMessage(res.json), flwStatus: res.status }, { status: 400 });
      }
      const data = res.json.data || res.json;
      return Response.json({ ok: true, order: normalizeOrder(data) });
    }

    // --- Check an order's status ---
    if (action === "status") {
      const orderId = String(body.order_id || "");
      if (!/^(ord|chg)_[A-Za-z0-9]+$/.test(orderId)) return badRequest("Invalid order id");
      const res = await flwRequest("GET", `/orders/${orderId}`);
      if (!res.ok && res.status === 404) {
        const alt = await flwRequest("GET", `/charges/${orderId}`);
        if (!alt.ok) return Response.json({ error: "Payment not found" }, { status: 404 });
        return Response.json({ ok: true, order: normalizeOrder(alt.json.data) });
      }
      if (!res.ok) return Response.json({ error: flwErrorMessage(res.json) }, { status: 400 });
      return Response.json({ ok: true, order: normalizeOrder(res.json.data) });
    }

    // --- Settle a redirect return by transaction (3DS comebacks) ---
    if (action === "settleByTx") {
      const txId = String(body.transaction_id || "");
      if (!/^[a-f0-9]{16,40}$/i.test(txId)) return badRequest("Invalid transaction id");
      const base44 = createClientFromRequest(req);
      const tx = await base44.asServiceRole.entities.Transaction.get(txId).catch(() => null);
      if (!tx) return Response.json({ error: "Transaction not found" }, { status: 404 });
      if (tx.status === "paid") return Response.json({ ok: true, paid: true });
      const gwRef = String(tx.gateway_reference || "");
      if (!gwRef) return Response.json({ ok: true, paid: false, pending: true });
      const res = await flwRequest("GET", `/orders/${gwRef}`);
      const data = res.ok ? res.json.data : null;
      if (data && PAID_STATUSES.includes(data.status)) {
        await base44.asServiceRole.entities.Transaction.update(txId, {
          status: "paid",
          escrow_status: "held",
          platform_fee_settled: true,
          settled_to_opay: false,
        });
        return Response.json({ ok: true, paid: true });
      }
      return Response.json({ ok: true, paid: false, status: data ? data.status : "unknown" });
    }

    return badRequest("Unknown action");
  } catch (error) {
    console.error("flutterwave-pay error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}