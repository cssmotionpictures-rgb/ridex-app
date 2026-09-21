// Server-side Fintava client — Nigerian banking-as-a-service.
// The customer NEVER sees the provider name: this client is the only code that
// talks to the network, requests are ALWAYS built server-side from validated
// inputs, and the API key never touches the frontend or any log.
//
// Verified LIVE against the merchant account (CSS Entertainment, Tier 3) on
// 2026-09-13 using the documented live base URL. Fail-closed like every Crix
// rail: a provider that answers with anything other than its documented JSON is
// UNREACHABLE and nothing is charged.

const LIVE_BASE = "https://live.fintavapay.com/api/dev";

export function fintavaApiKey(): string {
  const key = Deno.env.get("FINATAVA_API_KEY") || "";
  if (!key) throw new Error("FINATAVA_API_KEY_MISSING");
  return key;
}

export type FintavaResult = {
  ok: boolean;
  status: number;
  json: any;
  transport: string;
};

async function fintavaRequest(method: "GET" | "POST", path: string, body?: any): Promise<FintavaResult> {
  try {
    const key = fintavaApiKey();
    const r = await fetch(LIVE_BASE + path, {
      method,
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("json")) {
      return { ok: false, status: r.status, json: null, transport: "the provider did not answer as a live API" };
    }
    let json: any = null;
    try { json = await r.json(); } catch { json = null; }
    if (json === null) {
      return { ok: false, status: r.status, json: null, transport: "the provider returned an unreadable answer" };
    }
    const ok = r.ok && (json.status === undefined || Number(json.status) < 400);
    return { ok, status: r.status, json, transport: "" };
  } catch (error) {
    return { ok: false, status: 0, json: null, transport: String(error.message || error).slice(0, 120) };
  }
}

// ---- Documented live endpoints (cards + account) ----

// The merchant's own wallet balance — also the cheap live probe (moves no money)
export async function fintavaMerchantBalance(): Promise<FintavaResult> {
  return fintavaRequest("GET", "/merchant/balance");
}

// Every card issued under this merchant (paged)
export async function fintavaFetchCards(page = 1, take = 20): Promise<FintavaResult> {
  return fintavaRequest("GET", "/cards/fetch/all?page=" + page + "&take=" + take);
}

// Live status of one card (by card number)
export async function fintavaCardStatus(cardNo: string): Promise<FintavaResult> {
  return fintavaRequest("GET", "/cards/status?cardNo=" + encodeURIComponent(cardNo));
}

// One card's full details by its id
export async function fintavaViewCard(id: string): Promise<FintavaResult> {
  return fintavaRequest("GET", "/cards/fetch/" + encodeURIComponent(id));
}

// A new card request — cardBrand VERVE | VISA | MASTERCARD, cardType
// STATIC_WITH_ACCOUNT | STATIC_NO_ACCOUNT | DYNAMIC_CARD. accountNumber is
// required for STATIC_WITH_ACCOUNT cards.
export async function fintavaCreateCardRequest(p: {
  cardBrand: string;
  cardName: string;
  cardType: string;
  accountNumber?: string;
}): Promise<FintavaResult> {
  return fintavaRequest("POST", "/cards/physical/request", p);
}

// Cheap fail-closed probe: the API is live only when the documented balance
// endpoint answers with real JSON.
export async function fintavaLive(): Promise<boolean> {
  const r = await fintavaMerchantBalance();
  return r.transport === "" && r.ok;
}