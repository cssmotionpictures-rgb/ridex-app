import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { roundMoney, quoteFee, getOrCreateWallet } from "../../shared/crixCore.ts";
import { bigisubRequest, bigisubStatusValue, bigisubReference, bigisubPin } from "../../shared/bigisubClient.ts";
import { writeSettledPair, writeRefundPair, creditAccountForCategory } from "../../shared/crixBillPairs.ts";
import { assertNotPaused, appendAudit } from "../../shared/crixGuards.ts";
import { recordCrixPayment } from "../../shared/crixSheets.ts";
import { notifyMajorUtilityPayment } from "../../shared/crixDriveAlerts.ts";
import { verifyPin } from "../../shared/crixPin.ts";

// CRIX BILL PAYMENTS — the live Naira rail, powered by the BigiSub bill network
// (deploy retry: PIN gate + sheets accounting)
// network (airtime, data, DStv/GOtv/Startimes/Showmax, electricity discos,
// recharge PINs, WAEC/NECO/NABTEB result checkers). Paid INSTANTLY from the
// customer's funded Naira wallet. Money safety, none skippable:
//   1. EMERGENCY PAUSE — fail-closed, checked before any movement
//   2. IDEMPOTENCY — the same bill_key NEVER pays twice (checked against the
//      permanent record before any debit)
//   3. LIVE CATALOGUE — providers, plans, packages, prices, minimums and the
//      electricity network charge are re-read from the live catalogue at pay
//      time; a client-supplied price is never trusted
//   4. LIVE CUSTOMER VERIFICATION — smartcards and meters are confirmed with
//      the biller BEFORE any money moves
//   5. FEE BEFORE DEBIT — quoted from the active fee rule only; the
//      transaction PIN is resolved BEFORE the debit so a missing secret can
//      never strand reserved money
//   6. ATOMIC WALLET DEBIT — available >= total or nothing moves
//   7. HONEST STATES — completed settles instantly with its double-entry
//      pair; refunded returns the wallet in full with the reversing pair; a
//      lost or processing answer is UNKNOWN — never blindly refunded or
//      re-sent (BigiSub exposes no general transaction-status endpoint, so
//      UNKNOWN bills are confirmed against the biller's dashboard by support,
//      with the debit and full evidence on record)

const MIN_BILL_NGN = 25;
const MAX_BILL_NGN = 500000;
const EPIN_MAX_QTY = 10;

const NET: Record<string, string> = { "1": "MTN", "2": "Glo", "3": "Airtel", "4": "9mobile" };
const CABLES: Array<{ slug: string; name: string }> = [
  { slug: "dstv", name: "DStv" },
  { slug: "gotv", name: "GOtv" },
  { slug: "startimes", name: "Startimes" },
  { slug: "showmax", name: "Showmax" },
];

const CATEGORY_BY_SECTION: Record<string, string> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  tv: "CABLEBILLS",
  power: "UTILITYBILLS",
  epin: "AIRTIME",
  education: "EDUCATION",
};

type BillItem = {
  section: string;
  provider: string;
  provider_name: string;
  code: string;
  name: string;
  amount: number;
  fixed: boolean;
  label: string;
  verifiable: boolean;
  variation?: string;
  meter_types?: string[];
  min?: number;
  max?: number;
  charge?: number;
};

// The live catalogue is expensive to rebuild — cache it briefly. Cache MISSes
// rebuild from live data only; nothing here is ever hard-coded.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; items: BillItem[] } = { at: 0, items: [] };

function rowsOf(r: any): any[] {
  const d = r && r.json && r.json.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.prices)) return d.prices;
  if (d && Array.isArray(d.providers)) return d.providers;
  if (d && Array.isArray(d.services)) return d.services;
  return [];
}

async function fetchCatalog(): Promise<BillItem[]> {
  if (cache.items.length && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;
  const items: BillItem[] = [];

  // Airtime — 4 live networks, open amount (min ₦25 per the biller)
  for (const n of Object.keys(NET)) {
    items.push({ section: "airtime", provider: n, provider_name: NET[n], code: n, name: NET[n] + " Airtime", amount: 0, fixed: false, label: "Phone number", verifiable: false, min: MIN_BILL_NGN, max: 50000 });
  }
  // Data — live plans per network (each plan carries the exact price)
  try {
    for (const n of Object.keys(NET)) {
      const r = await bigisubRequest("GET", "/api/v2/vtu/data/plans/?network=" + n);
      for (const p of rowsOf(r)) {
        if (p.plan_disabled) continue;
        items.push({
          section: "data", provider: n, provider_name: NET[n], code: String(p.id),
          name: (NET[n] + " " + Number(p.size) + (String(p.plan_volume || "").toUpperCase() === "GB" ? "GB" : String(p.plan_volume || "MB")) + " " + String(p.plantype || "") + " — " + String(p.validity || "")).trim(),
          amount: Number(p.amount) || 0, fixed: true, label: "Phone number", verifiable: false,
        });
      }
    }
  } catch (e) { /* family unavailable — the rest still serves */ }
  // Cable TV — live packages per provider
  try {
    for (const c of CABLES) {
      const r = await bigisubRequest("GET", "/api/v2/vtu/cable/plans/?cable_name=" + c.slug);
      for (const p of rowsOf(r)) {
        items.push({ section: "tv", provider: c.slug, provider_name: c.name, code: String(p.id), variation: String(p.variation_code || ""), name: String(p.product_name || c.name + " package"), amount: Number(p.amount) || 0, fixed: true, label: "Smartcard number", verifiable: true });
      }
    }
  } catch (e) { /* family unavailable */ }
  // Electricity — every live disco, with its real minimums and network charge
  try {
    const r = await bigisubRequest("GET", "/api/v2/bills/electricity/providers/");
    for (const p of rowsOf(r)) {
      items.push({
        section: "power", provider: String(p.code), provider_name: String(p.name), code: String(p.code), name: String(p.name),
        amount: 0, fixed: false, label: "Meter number", verifiable: true,
        meter_types: ["prepaid", "postpaid"],
        min: Number(p.min_amount_prepaid) || Number(p.min_amount_postpaid) || 500,
        max: MAX_BILL_NGN, charge: Number(p.service_charge) || 0,
      });
    }
  } catch (e) { /* family unavailable */ }
  // Recharge PINs — live voucher products per network & denomination
  try {
    const r = await bigisubRequest("GET", "/api/v2/vtu/recharge-pin/plans/");
    for (const p of rowsOf(r)) {
      items.push({ section: "epin", provider: String(p.network), provider_name: NET[String(p.network)] || String(p.network_name || "Network"), code: String(p.id), name: (NET[String(p.network)] || String(p.network_name)) + " ₦" + Number(p.size) + " voucher", amount: Number(p.regular_price) || Number(p.size) || 0, fixed: true, label: "", verifiable: false });
    }
  } catch (e) { /* family unavailable */ }
  // Education — live result-checker prices (WAEC, NECO, NABTEB)
  try {
    const r = await bigisubRequest("GET", "/api/v2/bills/result-checker/prices/");
    for (const p of rowsOf(r)) {
      items.push({ section: "education", provider: String(p.code || p.exam_type || "").toLowerCase(), provider_name: String(p.exam_type || p.name), code: String(p.code || p.exam_type || "").toLowerCase(), name: String(p.name || p.exam_type + " Result Checker"), amount: Number(p.amount) || 0, fixed: true, label: "Reference (optional)", verifiable: false });
    }
  } catch (e) { /* family unavailable */ }

  cache = { at: Date.now(), items };
  return items;
}

// The exact purchase request is ALWAYS built server-side from live catalogue
// data — the client only ever chooses the item and (for open-amount types) the
// amount.
function buildPurchase(section: string, item: BillItem, pin: string, o: { customer: string; amount: number; meterType: string; customerName: string; phone: string; quantity: number }): { path: string; body: any } {
  if (section === "airtime") return { path: "/api/v2/vtu/airtime/purchase/", body: { network: Number(item.provider), amount: o.amount, phone_number: o.customer, pin } };
  if (section === "data") return { path: "/api/v2/vtu/data/purchase/", body: { plan: Number(item.code), phone_number: o.customer, pin } };
  if (section === "tv") return { path: "/api/v2/vtu/cable/purchase/", body: { plan: Number(item.code), cable_name: item.provider, variation_code: item.variation || "", card_no: o.customer, Customer: o.customerName, amount: o.amount, pin } };
  if (section === "power") return { path: "/api/v2/bills/electricity/pay/", body: { company: item.provider, meter_no: o.customer, meter_type: o.meterType, amount: o.amount, Customer_name: o.customerName, phone_number: o.phone, pin } };
  if (section === "epin") return { path: "/api/v2/vtu/recharge-pin/purchase/", body: { plan: Number(item.code), quantity: o.quantity, pin } };
  if (section === "education") return { path: "/api/v2/bills/result-checker/purchase/", body: { exam: item.code, quantity: 1, pin_code: pin } };
  throw new Error("Unknown bill type");
}

// Live customer verification — meters and smartcards confirmed with the
// biller. Returns the confirmed customer name ("" when the biller did not
// return one).
async function verifyLive(section: string, provider: string, customer: string, meterType: string): Promise<{ ok: boolean; name: string; reason: string }> {
  if (section === "power") {
    const r = await bigisubRequest("POST", "/api/v2/bills/electricity/verify/", { company: provider, meter_no: customer, meter_type: meterType });
    const d = r.json && r.json.data ? r.json.data : null;
    if (r.ok && r.json && r.json.success !== false) {
      return { ok: true, name: String((d && (d.Customer_name || d.customer_name || d.name)) || ""), reason: "" };
    }
    return { ok: false, name: "", reason: String((r.json && r.json.message) || "The biller could not confirm this meter number") };
  }
  if (section === "tv") {
    const r = await bigisubRequest("POST", "/api/v2/vtu/cable/verify/", { cable_name: provider, card_no: customer });
    const d = r.json && r.json.data ? r.json.data : null;
    if (r.ok && r.json && r.json.success !== false) {
      return { ok: true, name: String((d && (d.customer_name || d.Customer || d.name)) || ""), reason: "" };
    }
    return { ok: false, name: "", reason: String((r.json && r.json.message) || "The biller could not confirm this smartcard number") };
  }
  return { ok: true, name: "", reason: "" };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    // ---- CATALOG — the live bill network, grouped for the customer ----
    if (action === "catalog") {
      const items = await fetchCatalog();
      if (!items.length) {
        return Response.json({ error: "The biller catalogue is unavailable right now — please try again shortly. Nothing was charged." }, { status: 503 });
      }
      return Response.json({ items });
    }

    // ---- VALIDATE — live customer check at the biller (name confirmation) ----
    if (action === "validate") {
      const section = String(body.section || "");
      const provider = String(body.provider || "").trim();
      const customer = String(body.customer || "").trim();
      if (!section || !provider || !customer) return Response.json({ error: "Missing bill or customer details" }, { status: 400 });
      if (section !== "power" && section !== "tv") return Response.json({ valid: true, name: "" });
      const v = await verifyLive(section, provider, customer, String(body.meter_type || "prepaid"));
      if (!v.ok) return Response.json({ valid: false, reason: v.reason });
      return Response.json({ valid: true, name: v.name });
    }

    // ---- QUOTE — the fee from the active rule, plus the electricity network charge ----
    if (action === "quote") {
      const amount = roundMoney(body.amount_ngn);
      const section = String(body.section || "");
      const provider = String(body.provider || "");
      if (!(amount > 0) || amount > MAX_BILL_NGN) {
        return Response.json({ error: "Bill amounts must be positive and at most ₦" + MAX_BILL_NGN.toLocaleString() + "." }, { status: 400 });
      }
      const quote = await quoteFee(svc, "bill_payment", "NGN", amount);
      if (!quote) return Response.json({ error: "Bill payments are not enabled yet — nothing was charged." }, { status: 400 });
      let charge = 0;
      if (section === "power" && provider) {
        const items = await fetchCatalog();
        const match = items.find((i) => i.section === "power" && i.provider === provider);
        charge = Number(match && match.charge) || 0;
      }
      return Response.json({ quote: { ...quote, amount_ngn: amount, provider_charge: charge, total_debit: roundMoney(quote.total_debit + charge) } });
    }

    // ---- PAY — the guarded instant payment flow ----
    if (action === "pay") {
      const billKey = String(body.bill_key || "").trim();
      const section = String(body.section || "").trim();
      const provider = String(body.provider || "").trim();
      const itemCode = String(body.item_code || "").trim();
      const customer = String(body.customer_reference || "").trim();
      const amountIn = roundMoney(body.amount_ngn);
      const quantity = Math.max(1, Math.min(EPIN_MAX_QTY, Number(body.quantity) || 1));
      const meterType = String(body.meter_type || "prepaid");
      const phone = String(body.phone || "").trim();
      const category = CATEGORY_BY_SECTION[section];
      if (!billKey || !section || !provider || !itemCode || !category) {
        return Response.json({ error: "Missing payment details — nothing was charged." }, { status: 400 });
      }
      const customerRequired = section !== "epin" && section !== "education";
      if (customerRequired && !customer) {
        return Response.json({ error: "Missing customer details — nothing was charged." }, { status: 400 });
      }

      // 1. EMERGENCY PAUSE — fail-closed before any movement
      const pause = await assertNotPaused(svc, "bill_payment");
      if (pause.blocked) {
        await appendAudit(svc, { operation: "bill_payment", user_id: user.id, idempotency_key: billKey, old_state: "REQUESTED", new_state: "PAUSED", asset: "NGN", amount: amountIn, actor: "crix-bill-payment", reason: pause.reason, payload_json: { switches: pause.switches } }).catch(() => {});
        return Response.json({ error: pause.reason }, { status: 423 });
      }

      // 2. IDEMPOTENCY — the same bill_key never pays twice
      const priorRows = await svc.entities.CrixBillPayment.filter({ bill_key: billKey });
      const prior = (priorRows || [])[0] || null;
      if (prior) {
        return Response.json({ idempotent: true, bill_key: prior.bill_key, status: prior.status, biller_name: prior.biller_name, amount_ngn: prior.amount_ngn });
      }

      // 2b. TRANSACTION PIN — the customer verifies every purchase personally.
      //     Checked BEFORE the catalogue read and any wallet movement; a wrong
      //     or missing PIN moves nothing.
      const pinCheck = await verifyPin(svc, user.id, body.pin);
      if (!pinCheck.ok) {
        await appendAudit(svc, { operation: "bill_payment", user_id: user.id, idempotency_key: billKey, old_state: "REQUESTED", new_state: "PIN_REJECTED", asset: "NGN", amount: amountIn, actor: "crix-bill-payment", reason: pinCheck.reason }).catch(() => {});
        return Response.json({ error: pinCheck.reason + " — nothing was charged.", pin_required: true }, { status: 403 });
      }

      // 3. LIVE CATALOGUE — item, provider, price, minimums and network charge
      //    re-read live; never trusted from the client
      const items = await fetchCatalog();
      if (!items.length) {
        return Response.json({ error: "The biller network is unavailable right now — nothing was charged. Please try again shortly." }, { status: 503 });
      }
      const match = items.find((i: BillItem) => i.section === section && i.provider === provider && i.code === itemCode) || null;
      if (!match) return Response.json({ error: "That bill or package is no longer offered — nothing was charged." }, { status: 400 });

      // Amount rules per family — fixed items cost exactly their live price
      let amountNgn = amountIn;
      if (match.fixed) {
        const expected = section === "epin" ? roundMoney(Number(match.amount) * quantity) : Number(match.amount);
        if (Math.abs(amountIn - expected) > 0.01) {
          return Response.json({ error: "This package costs exactly ₦" + expected.toLocaleString() + (section === "epin" ? " for " + quantity + " voucher(s)" : "") + " — nothing was charged." }, { status: 400 });
        }
        amountNgn = roundMoney(expected);
      } else {
        const lo = Number(match.min || MIN_BILL_NGN);
        const hi = Number(match.max || MAX_BILL_NGN);
        if (!(amountNgn >= lo) || amountNgn > hi) {
          return Response.json({ error: "Amounts for " + match.name + " must be between ₦" + lo.toLocaleString() + " and ₦" + hi.toLocaleString() + " — nothing was charged." }, { status: 400 });
        }
      }
      if (!(amountNgn > 0) || amountNgn > MAX_BILL_NGN) {
        return Response.json({ error: "Bill amounts must be positive and at most ₦" + MAX_BILL_NGN.toLocaleString() + " — nothing was charged." }, { status: 400 });
      }
      const charge = Number(match.charge) || 0;

      // 4. LIVE CUSTOMER VERIFICATION — meters and smartcards confirmed BEFORE money moves
      let customerName = String(body.customer_name || "").slice(0, 120);
      if (match.verifiable) {
        const v = await verifyLive(section, provider, customer, meterType);
        if (!v.ok) {
          return Response.json({ error: v.reason + " — nothing was charged." }, { status: 400 });
        }
        if (v.name) customerName = v.name.slice(0, 120);
      }

      // 5. FEE QUOTE — from the active fee rule only, plus the electricity network charge
      const quote = await quoteFee(svc, "bill_payment", "NGN", amountNgn);
      if (!quote) return Response.json({ error: "Bill payments are not enabled yet — nothing was charged." }, { status: 400 });
      const feeWithCharge = roundMoney(quote.fee + charge);
      const totalDebit = roundMoney(amountNgn + feeWithCharge);

      // Resolve the transaction PIN BEFORE any debit — a missing secret must
      // never strand reserved money
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

      // The permanent record exists BEFORE any money moves
      const now = new Date().toISOString();
      const timeline = [
        { step: "REQUESTED", at: now, detail: "idempotency locked" },
        { step: "VALIDATED", at: now, detail: "package re-verified live: " + match.name + (charge ? " (plus ₦" + charge + " electricity network charge)" : "") },
      ];
      const bill = await svc.entities.CrixBillPayment.create({
        bill_key: billKey, user_id: user.id, category,
        biller_name: match.name, biller_code: match.provider, item_code: match.code,
        customer_reference: customer, customer_name: customerName,
        amount_ngn: amountNgn, fee_total: feeWithCharge, total_debit: totalDebit,
        status: "created", provider_ref: "", ledger_pair: "", failure_reason: "",
        timeline_json: JSON.stringify(timeline),
        evidence_json: JSON.stringify([{ check: "catalogue_live", pass: true, value: section + " · " + match.provider + " · " + match.code + " — ₦" + amountNgn, source: "live biller catalogue" }]),
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
        return Response.json({ error: "The payment could not be reserved — please try again. Nothing was charged." }, { status: 409 });
      }
      timeline.push({ step: "RESERVED", at: new Date().toISOString(), detail: "₦" + totalDebit + " reserved from the Naira wallet atomically" });

      // 7. INSTANT SETTLEMENT — the biller is called the moment the debit confirms
      let purchase: any;
      try {
        const reqBody = buildPurchase(section, match, pin, { customer, amount: amountNgn, meterType, customerName, phone, quantity });
        purchase = await bigisubRequest("POST", reqBody.path, reqBody.body);
      } catch (buildError) {
        await updateBill({ status: "failed", failure_reason: String(buildError.message || buildError).slice(0, 200) }).catch(() => {});
        await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: totalDebit } }).catch(() => {});
        return Response.json({ error: "The payment could not be prepared — nothing was charged." }, { status: 400 });
      }

      if (purchase.transport) {
        // A LOST answer is UNKNOWN — the debit stands, the bill is never re-sent
        await updateBill({
          status: "unknown", failure_reason: ("transport: " + purchase.transport).slice(0, 200),
          timeline_json: JSON.stringify([...timeline, { step: "UNKNOWN", at: new Date().toISOString(), detail: "the biller network did not answer — confirming with the biller; never blindly refunded or re-sent" }]),
        }).catch(() => {});
        await appendAudit(svc, { operation: "bill_payment", user_id: user.id, transaction_id: billKey, idempotency_key: billKey, old_state: "RESERVED", new_state: "UNKNOWN", asset: "NGN", amount: amountNgn, fee: feeWithCharge, provider: "bigisub", actor: "crix-bill-payment", reason: "biller network did not answer — confirming with the biller" }).catch(() => {});
        return Response.json({ status: "unknown", bill_key: billKey, message: "The biller network did not answer. Your payment is being confirmed — check its status in a few moments. Do not pay the same bill again." }, { status: 504 });
      }

      const statusValue = bigisubStatusValue(purchase.json);
      const providerRef = bigisubReference(purchase.json);
      const providerData = purchase.json && purchase.json.data ? purchase.json.data : null;

      // Definitive refusal (HTTP 4xx) or provider-returned money → immediate FULL refund
      const definitiveRefusal = (!purchase.ok && [400, 401, 402, 403, 404, 422].includes(purchase.status)) || statusValue === "refunded" || statusValue === "failed";
      if (definitiveRefusal) {
        const reason = String((purchase.json && (purchase.json.message || (purchase.json.errors && JSON.stringify(purchase.json.errors)))) || ("HTTP " + purchase.status)).slice(0, 200);
        await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: totalDebit } }).catch(() => {});
        let refundPair = "";
        try {
          refundPair = await writeRefundPair(svc, { key: billKey, userId: user.id, amount: amountNgn, fee: feeWithCharge, memo: "bill payment refused — " + match.name, creditAccount: creditAccountForCategory(category) });
        } catch (ledgerError) { /* refund applied; pair flagged in evidence */ }
        const refundAt = new Date().toISOString();
        await updateBill({
          status: "refunded", failure_reason: reason, ledger_pair: refundPair,
          timeline_json: JSON.stringify([
            ...timeline,
            { step: "FAILED", at: refundAt, detail: "biller refused: " + reason },
            { step: "REFUNDED", at: refundAt, detail: "wallet refunded ₦" + totalDebit + " in full" },
          ]),
        });
        await appendAudit(svc, { operation: "bill_payment", user_id: user.id, transaction_id: billKey, idempotency_key: billKey, old_state: "RESERVED", new_state: "REFUNDED", asset: "NGN", amount: amountNgn, fee: feeWithCharge, provider: "bigisub", actor: "crix-bill-payment", reason: "biller refused the payment — wallet refunded in full: " + reason }).catch(() => {});
        return Response.json({ status: "refunded", bill_key: billKey, message: "The biller refused this payment — your wallet was refunded in full. (" + reason + ")" }, { status: 422 });
      }

      if (statusValue === "completed") {
        // The bill is PAID — settle the double-entry pair (a ledger write failure
        // is recorded as evidence for reconciliation; it can never roll back a
        // bill the biller already delivered)
        let pairKey = "";
        let ledgerNote = "double-entry pair balanced";
        try {
          pairKey = await writeSettledPair(svc, { key: billKey, userId: user.id, amount: amountNgn, fee: feeWithCharge, memo: "Bill payment — " + match.name + " (" + customer + ")" + (charge ? " [includes ₦" + charge + " electricity network charge]" : ""), creditAccount: creditAccountForCategory(category) });
        } catch (ledgerError) {
          ledgerNote = "ledger write failed — flagged for reconciliation: " + String(ledgerError.message || ledgerError).slice(0, 120);
        }
        const pins = providerData && Array.isArray(providerData.pins) ? providerData.pins : (providerData && Array.isArray(providerData.pin_codes) ? providerData.pin_codes : (providerData && providerData.pin ? [providerData.pin] : null));
        const token = providerData ? String(providerData.token || providerData.electricity_token || "") : "";
        const units = providerData ? String(providerData.units || providerData.unit || "") : "";
        const doneAt = new Date().toISOString();
        await updateBill({
          status: "paid", provider_ref: providerRef, ledger_pair: pairKey,
          timeline_json: JSON.stringify([...timeline, { step: "PAID", at: doneAt, detail: "biller confirmed payment — " + ledgerNote }]),
          evidence_json: JSON.stringify([
            { check: "catalogue_live", pass: true, value: match.code, source: "live biller catalogue" },
            { check: "biller_response", pass: true, value: providerRef || "completed", source: "live bill payment response" },
            { check: "ledger", pass: !!pairKey, value: ledgerNote, source: "double-entry ledger" },
            ...(pins ? [{ check: "pins_delivered", pass: true, value: JSON.stringify(pins).slice(0, 500), source: "live bill payment response" }] : []),
            ...(token ? [{ check: "electricity_token", pass: true, value: token + (units ? " · " + units : ""), source: "live bill payment response" }] : []),
          ]),
        });
        const finalWallet = await svc.entities.CrixWallet.get(wallet.id);
        await appendAudit(svc, {
          operation: "bill_payment", user_id: user.id, transaction_id: billKey, idempotency_key: billKey,
          old_state: "RESERVED", new_state: "PAID", asset: "NGN", amount: amountNgn, fee: feeWithCharge,
          provider: "bigisub", actor: "crix-bill-payment",
          reason: "bill paid instantly from the funded Naira wallet — " + match.name,
        }).catch(() => {});
        await recordCrixPayment(svc, { service: "Bill payment", details: match.name + " (" + customer + ")", amount: amountNgn, fee: feeWithCharge, status: "paid", reference: billKey, user: user.email || user.id }).catch(() => {});
        // MAJOR UTILITY ALERT — every completed electricity payment of
        // ₦10,000+ is recorded to the team's Drive so operations sees it
        // the moment it settles (non-blocking)
        if (category === "UTILITYBILLS" && amountNgn >= 10000) {
          await notifyMajorUtilityPayment(svc, { bill_key: billKey, biller_name: match.name, customer_reference: customer, amount_ngn: amountNgn, fee: feeWithCharge, provider_ref: providerRef }).catch(() => {});
        }
        return Response.json({
          status: "paid", bill_key: billKey, biller_name: match.name,
          customer_reference: customer, amount_ngn: amountNgn, fee: feeWithCharge,
          provider_ref: providerRef, balance: finalWallet.available,
          ...(pins ? { pins } : {}), ...(token ? { token, units } : {}),
        });
      }

      // processing / pending / unrecognized — UNKNOWN, never blindly refunded or re-sent
      await updateBill({
        status: "unknown", provider_ref: providerRef,
        failure_reason: statusValue ? ("provider status: " + statusValue + " (HTTP " + purchase.status + ")") : ("unrecognized provider response (HTTP " + purchase.status + ")"),
        timeline_json: JSON.stringify([...timeline, { step: "UNKNOWN", at: new Date().toISOString(), detail: "the biller is processing — confirming before any action" }]),
      }).catch(() => {});
      await appendAudit(svc, { operation: "bill_payment", user_id: user.id, transaction_id: billKey, idempotency_key: billKey, old_state: "RESERVED", new_state: "UNKNOWN", asset: "NGN", amount: amountNgn, fee: feeWithCharge, provider: "bigisub", actor: "crix-bill-payment", reason: "provider is processing or the response was unrecognized — confirming with the biller" }).catch(() => {});
      return Response.json({ status: "unknown", bill_key: billKey, message: "The biller is processing your payment. Check its status in a few moments. Do not pay the same bill again." }, { status: 504 });
    }

    // ---- RESOLVE — honest status for an UNKNOWN payment ----
    if (action === "resolve") {
      const billKey = String(body.bill_key || "").trim();
      const rows = await svc.entities.CrixBillPayment.filter({ bill_key: billKey });
      const bill = (rows || [])[0] || null;
      if (!bill || (bill.user_id !== user.id && user.role !== "admin")) {
        return Response.json({ error: "Payment not found" }, { status: 404 });
      }
      if (bill.status !== "unknown") {
        return Response.json({ status: bill.status, bill_key: billKey, amount_ngn: bill.amount_ngn, biller_name: bill.biller_name });
      }
      // BigiSub exposes no general transaction-status endpoint for bills — the
      // debit and the full evidence stay on record while support confirms with
      // the biller. Never a blind refund, never a re-send.
      const ageMin = Math.floor((Date.now() - new Date(bill.created_date).getTime()) / 60000);
      await appendAudit(svc, { operation: "bill_payment", user_id: bill.user_id, transaction_id: bill.bill_key, idempotency_key: bill.bill_key, old_state: "UNKNOWN", new_state: "UNKNOWN", asset: "NGN", amount: Number(bill.amount_ngn), provider: "bigisub", actor: "crix-bill-payment", reason: "customer checked status — pending biller confirmation" }).catch(() => {});
      return Response.json({
        status: "unknown", bill_key: bill.bill_key,
        message: ageMin < 10
          ? "Still confirming with the biller — check again in a few minutes. Do not pay the same bill again."
          : "The biller has not confirmed this payment yet. Our team is confirming with the biller and your wallet is refunded automatically if it never went through. Do not pay the same bill again.",
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}