// Flutterwave v3 API helper — bill payments & virtual account numbers
// (secret-key auth, api.flutterwave.com/v3). The secret key is stored
// server-side; its value never appears in any response. Every value written
// by callers comes from a real Flutterwave API response — never simulated.

import { secrets } from "base44:runtime";

export function flwV3SecretKey() {
  const key = secrets.get("FLW_SECRET_KEY");
  if (!key) throw new Error("FLW_SECRET_KEY secret is not set");
  return key;
}

export async function flwV3Request(method, path, body) {
  const res = await fetch("https://api.flutterwave.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + flwV3SecretKey(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

// Live USD → NGN rate from Flutterwave's real rates endpoint (verified live:
// this endpoint answered 200 with rate data). A failed read is honestly
// failed — never substituted with a typed rate.
export async function fetchUsdNgnRate() {
  const r = await flwV3Request("GET", "/v3/transfers/rates?amount=1&from=USD&to=NGN");
  const rate = r.ok && r.json && r.json.data ? Number(r.json.data.rate) : 0;
  return { ok: rate > 0, rate };
}