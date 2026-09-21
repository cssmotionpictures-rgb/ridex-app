// BIGISUB CLIENT — SERVER-SIDE ONLY. Never imported by frontend code.
// Token-auth REST client for the BigiSub bill network (https://api.bigisub.ng) —
// airtime, data, cable TV, electricity, recharge PINs, result checkers and
// betting funding. Secrets never leave the server: they are read from the
// platform secret store, never logged, never returned.

import { secrets } from "base44:runtime";

export const BIGISUB_BASE_URL = "https://api.bigisub.ng";

export function bigisubToken(): string {
  const token = String(secrets.get("BIGISUB_API_TOKEN") || "").trim();
  if (!token) throw new Error("BIGISUB_API_TOKEN is not configured — the bill rail is not provisioned.");
  return token;
}

// The 4-digit BigiSub transaction PIN — required by every purchase endpoint.
// Resolved BEFORE any wallet debit so a missing PIN can never strand money.
export function bigisubPin(): string {
  const pin = String(secrets.get("BIGISUB_TXN_PIN") || "").trim();
  if (!pin) throw new Error("BIGISUB_TXN_PIN is not configured — purchases cannot run until the transaction PIN secret is set.");
  return pin;
}

export type BigiResult = {
  ok: boolean;
  status: number;
  json: any;
  transport: string;
};

export async function bigisubRequest(method: string, path: string, body?: any): Promise<BigiResult> {
  const headers: Record<string, string> = {
    Authorization: "Token " + bigisubToken(),
    "content-type": "application/json",
    accept: "application/json",
  };
  try {
    const res = await fetch(BIGISUB_BASE_URL + path, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
    let json: any = null;
    try { json = await res.json(); } catch { json = null; }
    return { ok: res.ok, status: res.status, json, transport: "" };
  } catch (e) {
    return { ok: false, status: 0, json: null, transport: String((e as any).message || e) };
  }
}

// Normalize BigiSub's honest status vocabulary (docs: successful/completed =
// delivered; processing/submitted/pending/in_progress = pending; failed =
// failed; cancelled/refunded/partial = provider returned the money).
export function bigisubStatusValue(json: any): string {
  const d = json && json.data ? json.data : json;
  const raw = d && (d.status_detail || d.status);
  const s = String(raw || "").toLowerCase();
  if (["successful", "completed", "delivered", "success"].includes(s)) return "completed";
  if (["processing", "submitted", "pending", "in_progress"].includes(s)) return "processing";
  if (["failed"].includes(s)) return "failed";
  if (["cancelled", "refunded", "partial"].includes(s)) return "refunded";
  // An explicit success:true response with no status field is an immediate success
  if (!s && json && json.success === true) return "completed";
  return "";
}

export function bigisubReference(json: any): string {
  const d = json && json.data ? json.data : json;
  if (!d) return "";
  return String(d.transaction_id || d.id || d.reference || d.ref || d.order_id || "");
}

// Live platform wallet balance on BigiSub — used for diagnostics only.
export async function bigisubWalletBalance(): Promise<number | null> {
  const r = await bigisubRequest("GET", "/api/v2/financial/wallet/balance/");
  const b = r.ok && r.json && r.json.data ? Number(r.json.data.balance) : null;
  return typeof b === "number" && !isNaN(b) ? b : null;
}