// Flutterwave v4 API client — shared by flutterwave-pay and flutterwave-webhook.
// OAuth 2.0 with Client ID / Client Secret (idp.flutterwave.com), card fields
// AES-GCM encrypted with the FLW_ENCRYPTION_KEY secret, as per Flutterwave docs.

import { secrets } from "base44:runtime";

const DEFAULT_BASE = "https://developersandbox-api.flutterwave.com";
const TOKEN_URL = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

// Module-level token cache (never top-level await/throw — init happens on first call).
let tokenCache = { token: null, expiresAt: 0 };

export function flwBaseUrl() {
  return secrets.get("FLW_API_BASE") || DEFAULT_BASE;
}

async function fetchToken() {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: secrets.get("FLW_CLIENT_ID") || "",
      client_secret: secrets.get("FLW_CLIENT_SECRET") || "",
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || "Could not authenticate with Flutterwave");
  }
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 600) * 1000 };
  return data.access_token;
}

export async function getFlwToken(force = false) {
  const now = Date.now();
  if (!force && tokenCache.token && now < tokenCache.expiresAt - 60000) return tokenCache.token;
  return fetchToken();
}

function traceId() {
  return `ridex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Bearer-authenticated Flutterwave API call. Refreshes the token once on 401.
// Returns { ok, status, json }.
export async function flwRequest(method, path, body) {
  let token = await getFlwToken();
  const doFetch = async (tok) =>
    fetch(`${flwBaseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json",
        "X-Trace-Id": traceId(),
        "X-Idempotency-Key": traceId(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  let res = await doFetch(token);
  if (res.status === 401) {
    token = await getFlwToken(true);
    res = await doFetch(token);
  }
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

// --- Card-field encryption (AES-GCM with the Flutterwave encryption key) ---

export async function importFlwKey() {
  const b64 = secrets.get("FLW_ENCRYPTION_KEY") || "";
  if (!b64) throw new Error("FLW_ENCRYPTION_KEY secret is not set");
  const keyBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
}

export function makeNonce() {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("");
  return raw.slice(0, 12);
}

export async function encryptField(key, nonce, value) {
  const iv = new TextEncoder().encode(nonce);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(String(value)));
  return btoa(String.fromCharCode(...new Uint8Array(ct)));
}

// --- Response normalization ---

export function normalizeNextAction(nextAction) {
  if (!nextAction || !nextAction.type) return null;
  const t = nextAction.type;
  if (t === "redirect_url") return { type: "redirect", url: nextAction.redirect_url && nextAction.redirect_url.url };
  if (t === "requires_otp") return { type: "otp" };
  if (t === "requires_pin") return { type: "pin" };
  if (t === "requires_additional_fields") return { type: "avs" };
  if (t === "payment_instruction")
    return { type: "instruction", note: (nextAction.payment_instruction && nextAction.payment_instruction.note) || "" };
  if (t === "requires_bank_transfer")
    return { type: "bank_transfer", details: nextAction.requires_bank_transfer || {} };
  if (t === "requires_capture") return { type: "capture" };
  if (t === "qr_code") return { type: "qr_code" };
  if (t === "requires_requery") return { type: "requery" };
  return { type: t };
}

export function normalizeOrder(data) {
  if (!data) return null;
  const card = (data.payment_method_details && data.payment_method_details.card) || {};
  return {
    order_id: data.id,
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    reference: data.reference,
    next_action: normalizeNextAction(data.next_action),
    last4: card.last4 || "",
    network: card.network || "",
  };
}

export function flwErrorMessage(json) {
  const type = json && json.error && json.error.type;
  const msg = (json && json.error && json.error.message) || "";
  if (type === "PAYMENT_METHOD_INVALID")
    return "This payment method is not enabled on your Flutterwave account yet — try Card instead.";
  if (type === "INVALID_CARD_NUMBER") return "That card number looks invalid — please check it and try again.";
  if (type === "CARD_EXPIRY_YEAR_OUT_OF_RANGE") return "Card expiry year looks wrong — use MM/YY format.";
  if (type === "INVALID_CVV" || type === "NEGATIVE_CVV_RESULT") return "That card security code was rejected.";
  if (type === "INSUFFICIENT_FUNDS") return "The card has insufficient funds.";
  if (type === "EXPIRED_CARD") return "That card has expired.";
  return msg || "Flutterwave could not process the payment";
}