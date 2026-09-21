import { base44 } from "@/api/base44Client";

// Flutterwave gateway helpers — thin wrappers over the flutterwave-pay backend
// function. All Flutterwave credentials stay server-side; only bounded payment
// data (card fields over TLS, references, bounded meta) crosses this boundary.

export async function createCardOrder({ amount, email, reference, card, meta, redirectUrl }) {
  const res = await base44.functions.invoke("flutterwave-pay", {
    action: "pay",
    amount,
    email,
    reference,
    currency: "NGN",
    card,
    redirect_url: redirectUrl,
    meta,
  });
  return res.data;
}

export async function authorizeFlutterwaveOrder({ orderId, type, value }) {
  const res = await base44.functions.invoke("flutterwave-pay", {
    action: "authorize",
    order_id: orderId,
    type,
    value,
  });
  return res.data;
}

export async function getFlutterwaveOrderStatus(orderId) {
  const res = await base44.functions.invoke("flutterwave-pay", {
    action: "status",
    order_id: orderId,
  });
  return res.data;
}

export async function settleFlutterwaveByTransaction(transactionId) {
  const res = await base44.functions.invoke("flutterwave-pay", {
    action: "settleByTx",
    transaction_id: transactionId,
  });
  return res.data;
}

// A payment counts as successful when the charge is approved (succeeded, or
// authorized with nothing left for the customer to do — capture is automatic).
export function orderIsPaid(order) {
  if (!order) return false;
  const na = order.next_action;
  if (order.status === "succeeded") return true;
  if (order.status === "authorized" && (!na || na.type === "capture")) return true;
  return false;
}