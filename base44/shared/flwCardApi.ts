import { flwRequest } from "./flutterwaveClient.ts";
import { secrets } from "base44:runtime";

const CLASSIC_BASE = "https://api.flutterwave.com";
const TIMEOUT_MS = 25000;

// Classify a failed provider request so errors can be grouped by
// code / message / endpoint / operation in the CardProviderDiagnostic log.
function classify(status, message, network) {
  if (network) return "D — provider service unreachable (outcome unknown)";
  if (status === 400 && !message) return "D — provider 400 with no error message (endpoint unrouted/unsupported for this account)";
  if (status === 400) return "C — provider API validation error";
  if (status === 401 || status === 403) return "A — authentication/permission error";
  if (status === 404) return "A — wrong endpoint";
  if (status >= 500) return "D — provider service issue";
  return "G — unknown";
}

// Safe diagnostic record for every failed provider request (400/4xx/5xx or
// network failure). NEVER stores PAN, CVV, PIN, API keys, webhook secrets or
// access tokens — status, provider code/message and call metadata only.
// Recording is best-effort: a diagnostics failure never breaks a payment.
async function recordDiagnostic(base44, r, method, path, opts, network) {
  try {
    const message = String(
      (r.json && (r.json.message || (r.json.error && r.json.error.message))) ||
      (network ? r.networkError : "")
    ).slice(0, 500);
    await base44.entities.CardProviderDiagnostic.create({
      correlation_id: String(opts.correlation_id || ""),
      http_status: Number(r.status) || 0,
      error_code: String((r.json && (r.json.code || r.json.error)) || "").slice(0, 80),
      error_message: message,
      method: String(method || ""),
      endpoint: String(path || "").slice(0, 200),
      card_id: String(opts.card_id || ""),
      transaction_id: String(opts.transaction_id || ""),
      amount: Number(opts.amount) || 0,
      currency: String(opts.currency || ""),
      transaction_type: String(opts.transaction_type || ""),
      network_error: !!network,
      ambiguous_outcome: !!r.ambiguous,
      classification: classify(Number(r.status) || 0, message, !!network),
    });
  } catch { /* diagnostics must never break the payment flow */ }
}

// Card Issuing lives on the classic v3 API authenticated with the account's
// Secret Key (FLW_SECRET_KEY). When the key is absent we fall back to the
// OAuth-authenticated sandbox surface, which reports clearly that Card
// Issuing is not enabled yet. Shared by the flutterwave-cards function,
// the daily summary job and the webhook handler.
//
// Returns { ok, status, json } — or, when the request never completed
// (timeout / network failure), { ok: false, status: 0, json: null,
// ambiguous: true, networkError }. `ambiguous: true` means the provider MAY
// still have applied the operation: callers MUST check the outcome at the
// provider (e.g. GET the card) before touching any money state, and must
// NEVER blind-retry the same operation.
export async function flwCardsRequest(method, path, body, opts = {}) {
  const key = (secrets.get("FLW_SECRET_KEY") || "").trim();
  try {
    if (key) {
      const res = await fetch(`${CLASSIC_BASE}/v3${path}`, {
        method,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = await res.json().catch(() => ({}));
      const r = { ok: res.ok, status: res.status, json };
      if (!r.ok && opts.base44) await recordDiagnostic(opts.base44, r, method, path, opts, false);
      return r;
    }
    const r = await flwRequest(method, `/v3${path}`, body);
    if (!r.ok && opts.base44) await recordDiagnostic(opts.base44, r, method, path, opts, false);
    return r;
  } catch (e) {
    const r = { ok: false, status: 0, json: null, ambiguous: true, networkError: String(e?.message || e) };
    if (opts.base44) await recordDiagnostic(opts.base44, r, method, path, opts, true);
    return r;
  }
}