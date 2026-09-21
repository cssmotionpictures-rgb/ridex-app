// STROWALLET CLIENT — SERVER-SIDE ONLY. Never imported by frontend code.
// API client for the Strowallet card network: virtual dollar cards (NFC Visa
// cards, Google Pay / Apple Pay capable), cardholder KYC, funding and status.
// The public key travels as the documented query parameter; the secret key is
// sent in the documented auth headers. Secrets never leave the server: they
// are read from the platform secret store, never logged, never returned.

import { secrets } from "base44:runtime";

export const STRO_CARD_BASE = "https://ziiropay.com/api/bitvcard";
export const STRO_RATE_URL = "https://strowallet.com/api/exchange-rate/USD/NGN";

export function stroKeys(): { publicKey: string; secretKey: string } {
  const publicKey = String(secrets.get("STROWALLET_PUBLIC_KEY") || "").trim();
  const secretKey = String(secrets.get("STROWALLET_SECRET_KEY") || "").trim();
  if (!publicKey || !secretKey) {
    throw new Error("STROWALLET keys are not configured — the dollar card rail is not provisioned.");
  }
  return { publicKey, secretKey };
}

export type StroResult = {
  ok: boolean;
  status: number;
  json: any;
  transport: string;
};

// Every card-network call carries the public key in the query string (the
// documented parameter) and the secret key in the auth headers. A transport
// error is reported as `transport` — a LOST answer, never proof of failure.
export async function stroCardRequest(method: string, path: string, query: Record<string, any> = {}): Promise<StroResult> {
  const { publicKey, secretKey } = stroKeys();
  const qs = new URLSearchParams({ public_key: publicKey });
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  try {
    const res = await fetch(STRO_CARD_BASE + path + "?" + qs.toString(), {
      method,
      headers: { "secret-key": secretKey, token: secretKey, accept: "application/json" },
    });
    let json: any = null;
    try { json = await res.json(); } catch { json = null; }
    return { ok: res.ok, status: res.status, json, transport: "" };
  } catch (e) {
    return { ok: false, status: 0, json: null, transport: String((e as any).message || e) };
  }
}

// Live USD→NGN rate from the provider's public rates endpoint — the rate the
// card network actually charges at. No auth required.
export async function stroUsdNgnRate(): Promise<{ ok: boolean; rate: number; source: string }> {
  try {
    const res = await fetch(STRO_RATE_URL, { headers: { accept: "application/json" } });
    let json: any = null;
    try { json = await res.json(); } catch { json = null; }
    const rate = Number(json && json.rate);
    if (res.ok && rate > 0) return { ok: true, rate, source: "strowallet_live" };
    return { ok: false, rate: 0, source: "" };
  } catch {
    return { ok: false, rate: 0, source: "" };
  }
}

// ---- Cardholder KYC ----
export function stroKycSubmit(fields: Record<string, any>): Promise<StroResult> {
  return stroCardRequest("POST", "/cardkyc", fields);
}
export function stroKycStatus(email: string): Promise<StroResult> {
  return stroCardRequest("GET", "/cardkycstatus", { email });
}

// ---- Dollar card lifecycle ----
export function stroCreateCard(o: { name: string; customerId: string; amount: number }): Promise<StroResult> {
  return stroCardRequest("POST", "/create-nfc-card", { name: o.name, customer_id: o.customerId, amount: o.amount });
}
export function stroCardDetails(cardId: string): Promise<StroResult> {
  return stroCardRequest("GET", "/fetch-nfccard-detail", { card_id: cardId });
}
export function stroCardHistory(cardId: string): Promise<StroResult> {
  return stroCardRequest("GET", "/nfc-card-transactions", { card_id: cardId });
}
export function stroFundWithdraw(cardId: string, amount: number, type: "fund" | "withdraw"): Promise<StroResult> {
  return stroCardRequest("POST", "/fund-withdraw-nfccard", { card_id: cardId, amount, type });
}
export function stroCardStatus(cardId: string, status: "active" | "frozen"): Promise<StroResult> {
  return stroCardRequest("POST", "/nfc-cards/status", { card_id: cardId, status });
}