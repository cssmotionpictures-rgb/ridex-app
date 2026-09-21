// Flutterwave webhook — authoritative settlement of completed charges
// (direct card orders + v3 hosted payment links).
// Signature: HMAC-SHA256 (base64) of the raw body with the FLW_WEBHOOK_SECRET
// hash from the Flutterwave dashboard, in the 'flutterwave-signature' header.
// Even with a signature, the charge is re-verified against the Flutterwave API
// before any money state changes (Flutterwave best practice).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets, waitUntil } from "base44:runtime";
import { flwRequest } from "../../shared/flutterwaveClient.ts";
import { getAutomationSettings, createInvoiceFromTransaction, emailInvoice } from "../../shared/invoice.ts";
import { freeFeatureScore } from "../../shared/freeFeatureScore.ts";
import { processCardPurchase } from "../../shared/cardPurchaseProcessor.ts";
import { flwV3Request } from "../../shared/flutterwaveV3.ts";
import { creditCrixDeposit } from "../../shared/crixCore.ts";

const ENTITY_BY_SERVICE = {
  ride: "Ride",
  logistics: "LogisticsRequest",
  equipment: "EquipmentRental",
  carwash: "CarwashBooking",
  marketplace: "MarketplaceListing",
};
const PAID_STATUSES = ["succeeded", "authorized"];

async function verifySignature(raw, signature) {
  const secretHash = secrets.get("FLW_WEBHOOK_SECRET");
  if (!secretHash) return { ok: true, enforced: false };
  if (!signature) return { ok: false, enforced: true };
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretHash),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  const hash = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { ok: hash === signature, enforced: true };
}

export default async function (req: Request): Promise<Response> {
  try {
    const rid = crypto.randomUUID();
    const raw = await req.text();
    const signature = req.headers.get("flutterwave-signature") || "";
    const sig = await verifySignature(raw, signature);
    if (!sig.ok) {
      console.error("flutterwave-webhook: invalid signature");
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
    if (!sig.enforced) {
      console.warn("flutterwave-webhook: FLW_WEBHOOK_SECRET not set — relying on API re-verification only");
    }

    const event = JSON.parse(raw);
    // Flutterwave sends the event name in `event` (v3) — `event.type` is kept
    // for the older card-issuing payload shape.
    const evType = String(event.type || event.event || "").toLowerCase();
    console.log(`flutterwave-webhook [rid=${rid}] received type=${evType || "unknown"}`);
    const d = event.data || {};
    const meta = d.meta || {};
    const txId = meta.transaction_id;
    const service = meta.service;
    const refId = meta.reference_id;

    const isPaidEvent =
      ((evType === "charge.completed" || evType === "order.authorization") &&
        PAID_STATUSES.includes(d.status)) ||
      // v3 hosted payments: numeric transaction id with status "successful"
      (evType === "charge.completed" &&
        String(d.status).toLowerCase() === "successful" &&
        /^\d+$/.test(String(d.id || "")));

    if (isPaidEvent && txId) {
      // Authoritative re-query: the charge must exist and be approved at Flutterwave.
      let verified = false;
      let charge = d;
      if (d.id && String(d.id).startsWith("chg_")) {
        const v = await flwRequest("GET", `/charges/${d.id}`);
        if (v.ok && v.json && v.json.data) {
          charge = v.json.data;
          verified = PAID_STATUSES.includes(charge.status);
        }
      } else if (d.id && String(d.id).startsWith("ord_")) {
        const v = await flwRequest("GET", `/orders/${d.id}`);
        if (v.ok && v.json && v.json.data) {
          charge = v.json.data;
          verified = PAID_STATUSES.includes(charge.status);
        }
      } else if (d.id && /^\d+$/.test(String(d.id))) {
        // v3 hosted payment — re-verify against the v3 transactions API
        const v = await flwV3Request("GET", "/v3/transactions/" + d.id);
        if (v.ok && v.json && v.json.data) {
          charge = { ...d, ...v.json.data };
          verified = String(charge.status).toLowerCase() === "successful";
        }
      }
      if (!verified) {
        console.error("flutterwave-webhook: could not verify charge at Flutterwave — ignoring event");
        return Response.json({ received: true, ignored: true });
      }

      const base44 = createClientFromRequest(req);
      // DUPLICATE-WEBHOOK GUARD (customer protection — never double credit):
      // Flutterwave re-delivers events on retry. If this exact charge was
      // already settled (gateway_reference already matches this charge id),
      // this is a retry — acknowledge it and change NOTHING (no double card
      // credit, no double promo tally, no duplicate invoice).
      const chargeRef = String(charge.id || d.id || "");
      const existingTx = await base44.asServiceRole.entities.Transaction.get(txId).catch(() => null);
      if (existingTx && existingTx.gateway_reference && existingTx.gateway_reference === chargeRef) {
        console.log(`flutterwave-webhook [rid=${rid}] duplicate charge ${chargeRef} — acknowledged, no state change`);
        return Response.json({ received: true, duplicate: true, correlationId: rid });
      }
      // Customer-protection escrow: mark paid but HOLD the provider portion
      // until the customer confirms and releases it.
      await base44.asServiceRole.entities.Transaction.update(txId, {
        status: "paid",
        escrow_status: "held",
        platform_fee_settled: true,
        settled_to_opay: false,
        gateway_reference: String(charge.id || d.id || ""),
      });

      // CRIX WALLET FUNDING — a verified, non-duplicate paid charge credits the
      // user's Crix wallet through the shared double-entry engine
      // (creditCrixDeposit is idempotent on the funding record's status and
      // matches the verified amount against the quote). This branch runs only
      // AFTER signature verification, provider re-verification and the
      // duplicate-charge guard above. A deposit pause never strands an
      // already-paid deposit — money the customer already paid is always
      // credited (customer protection, spec §39).
      if (service === "crix_funding" && refId) {
        const credit = await creditCrixDeposit(base44.asServiceRole, {
          crix_id: refId,
          charge_amount: Number(charge.amount ?? d.amount ?? 0),
          provider: "flutterwave",
          provider_ref: chargeRef,
        });
        if (!credit.ok) {
          console.error(`flutterwave-webhook [rid=${rid}] crix funding credit failed for ${refId}: ${credit.error}`);
        } else {
          console.log(`flutterwave-webhook [rid=${rid}] crix wallet ${refId} credited ${credit.lands} NGN${credit.duplicate ? " (duplicate acknowledge)" : ""}`);
        }
      }

      if (refId && ENTITY_BY_SERVICE[service]) {
        if (service === "marketplace") {
          await base44.asServiceRole.entities.MarketplaceListing.update(refId, { status: "sold" });
        } else {
          await base44.asServiceRole.entities[ENTITY_BY_SERVICE[service]].update(refId, {
            payment_status: "paid",
          });
        }
      }
      if (refId && service === "boost") {
        const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await base44.asServiceRole.entities.MarketplaceListing.update(refId, { featured: true, boost_until: until });
      }
      if (refId && service === "subscription") {
        const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await base44.asServiceRole.entities.SportsMembership.update(refId, {
          status: "active",
          expires_at: until,
          payment_reference: String(d.tx_ref || d.reference || ""),
        }).catch((e) => console.error("membership activate failed:", e.message));
      }
      if (refId && service === "card") {
        const amt = Number(d.amount || 0); // Flutterwave amounts are decimal naira — no kobe conversion
        const cardRec = await base44.asServiceRole.entities.RideXCard.get(refId).catch(() => null);
        if (cardRec) {
          await base44.asServiceRole.entities.RideXCard.update(refId, {
            balance: (cardRec.balance || 0) + amt,
            total_loaded: (cardRec.total_loaded || 0) + amt,
          });
        }
      }
      if (refId && service === "free_feature") {
        await base44.asServiceRole.entities.FreeFeatureApplication.update(refId, {
          payment_status: "paid",
        }).catch((e) => console.error("free feature mark-paid failed:", e.message));
        waitUntil((async () => {
          try {
            const app = await base44.asServiceRole.entities.FreeFeatureApplication.get(refId).catch(() => null);
            if (!app || app.status !== "pending") return;
            const result = await freeFeatureScore(base44, app);
            await base44.asServiceRole.entities.FreeFeatureApplication.update(refId, result.patch);
          } catch (e) {
            console.error("free feature scoring failed:", e.message);
          }
        })());
      }

      // Tally promo-code redemptions on every successful charge.
      if (meta.promo_code_id) {
        await base44.asServiceRole.entities.PromoCode.updateMany({ id: meta.promo_code_id }, { $inc: { used_count: 1 } })
          .catch((e) => console.error("promo usage increment failed:", e.message));
      }

      // Centralized auto-invoice + auto-email receipt.
      try {
        const settings = await getAutomationSettings(base44);
        if (settings.auto_invoice !== false) {
          const fullTx = await base44.asServiceRole.entities.Transaction.get(txId).catch(() => null);
          if (fullTx) {
            const inv = await createInvoiceFromTransaction(base44, {
              tx: fullTx,
              paystackData: { customer: { email: d.customer && d.customer.email, name: "" }, reference: String(d.reference || "") },
              userId: meta.user_id, userName: meta.user_name, issuedBy: "system:flutterwave",
            });
            if (settings.auto_email_receipt !== false && inv && inv.customer_email) {
              await emailInvoice(base44, inv.id).catch((e) => console.error("auto-email receipt failed:", e.message));
            }
          }
        }
      } catch (e) {
        console.error("auto-invoice flow failed:", e.message);
      }
    }

    // CRIXCOIN bill payments — a bill event settles the matching bill record
    // from REAL Flutterwave data only: signature-verified above, then
    // re-verified against the Flutterwave v3 API before any state change
    // (never trusted from the webhook payload alone). Refunds stay owned by
    // the bill payment function — this branch only confirms success.
    if (evType.startsWith("bill")) {
      const b44 = createClientFromRequest(req);
      const ref = String(d.tx_ref || d.reference || "");
      const providerTxId = d.id ? String(d.id) : "";
      if (ref && providerTxId) {
        const rows = await b44.asServiceRole.entities.CrxsBillPayment.filter({ bill_key: ref }).catch(() => []);
        const bill = (rows || [])[0] || null;
        if (bill && bill.status !== "confirmed") {
          let verifiedStatus = "";
          try {
            const v = await flwV3Request("GET", "/v3/transactions/" + providerTxId);
            if (v.ok && v.json && v.json.data) verifiedStatus = String(v.json.data.status || "");
          } catch (e) {
            console.error("bill re-verify failed:", e.message);
          }
          if (verifiedStatus === "successful") {
            await b44.asServiceRole.entities.CrxsBillPayment.update(bill.id, {
              status: "confirmed",
              flutterwave_ref: String(d.tx_ref || bill.flutterwave_ref || ""),
              evidence_json: JSON.stringify([{ check: "webhook_bill_reverified", pass: true, value: "Flutterwave transaction " + providerTxId + " successful (API re-verified)" }]),
            });
          } else if (verifiedStatus && verifiedStatus !== "successful") {
            console.error(`flutterwave-webhook [rid=${rid}] bill ${ref} provider status ${verifiedStatus} — no state change (the bill function owns refunds)`);
          }
        }
      }
      return Response.json({ received: true, correlationId: rid });
    }

    // Ride X Card activity — every card-transaction event goes through the
    // single authoritative purchase processor: idempotency keyed on the
    // provider transaction id (retries never double-charge or double-log),
    // provider-truth FX/cross-border determination, our configurable platform
    // fees, the CardPurchase ledger record, the wallet fee deduction, and the
    // structured Google Sheet log (failures recorded, never silent).
    if (evType.startsWith("card") && d.card_id) {
      const cardClient = createClientFromRequest(req);
      const report = await processCardPurchase(cardClient, d, rid);
      for (const s of report.steps) {
        if (s.result === "FAIL") {
          console.error(`flutterwave-webhook [rid=${rid}] ${s.name} FAILED: ${s.detail}`);
        }
      }
      console.log(`flutterwave-webhook [rid=${rid}] card transaction processed — duplicate=${report.duplicate} tx=${report.provider_transaction_id}`);
      return Response.json({ received: true, correlationId: rid, cardPurchase: report });
    }

    return Response.json({ received: true, correlationId: rid });
  } catch (error) {
    console.error("flutterwave-webhook error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}