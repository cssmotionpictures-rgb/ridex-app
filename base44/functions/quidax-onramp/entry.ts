import { secrets } from "base44:runtime";

// QUIDAX CRYPTO ON-RAMP — READ-ONLY for now. Buying/converting is honestly
// PAUSED until the founder confirms the API key has no withdrawal permission
// and Quidax sandbox testing passes. Only public market-rate reads happen
// here; no account balances, no orders, no money movement — ever, in this
// state. The ₦100 live connectivity test is run separately and only after
// the written permission confirmation.
const ONRAMP = {
  paused: true,
  reason: "Crypto buying is read-only while we finish Quidax sandbox testing and key permission checks. You can watch live rates here — buying unlocks after verification.",
};

const nowIso = () => new Date().toISOString();

export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");

    // Money-moving actions are hard-disabled — honest, fail-closed
    if (action === "buy" || action === "quote" || action === "convert") {
      return Response.json({ error: ONRAMP.reason, paused: true }, { status: 423 });
    }

    // READ-ONLY market rates from the Quidax public feed
    const base = String(secrets.get("QUIDAX_SANDBOX_BASE_URL") || "https://openapi.quidax.io").replace(/\/+$/, "");
    const key = String(secrets.get("QUIDAX_API_KEY") || "");
    let res: Response;
    try {
      res = await fetch(base + "/api/v1/markets/tickers", {
        headers: { Accept: "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) },
      });
    } catch (e: any) {
      return Response.json({
        reachable: false, paused: true, reason: ONRAMP.reason,
        feed_error: "The Quidax market feed did not answer — " + String((e && e.message) || e).slice(0, 120),
        checked_at: nowIso(),
      });
    }

    const text = await res.text();
    const blocked = res.status === 403 || res.status === 503 || /just a moment|cloudflare|cf-ray/i.test(text.slice(0, 400));
    if (blocked) {
      return Response.json({
        reachable: false, paused: true, reason: ONRAMP.reason,
        feed_error: "The Quidax market feed is blocking server requests right now — rates are temporarily unavailable.",
        checked_at: nowIso(),
      });
    }

    let json: any = null;
    try { json = JSON.parse(text); } catch { json = null; }
    const raw = json && json.data !== undefined ? json.data : json;
    let markets: any[] = [];
    if (Array.isArray(raw)) {
      markets = raw.map((t: any) => ({ market: String(t.market || ""), last: Number(t.last) || 0, high: Number(t.high) || 0, low: Number(t.low) || 0 }));
    } else if (raw && typeof raw === "object") {
      markets = Object.keys(raw).map((k) => { const t = raw[k] || {}; return { market: String(t.market || k), last: Number(t.last) || 0, high: Number(t.high) || 0, low: Number(t.low) || 0 }; });
    }
    const ngnMarkets = markets.filter((m) => /ngn/i.test(m.market)).slice(0, 10);

    return Response.json({ reachable: res.ok, paused: true, reason: ONRAMP.reason, markets: ngnMarkets, checked_at: nowIso() });
  } catch (error: any) {
    return Response.json({ error: String((error && error.message) || error) }, { status: 500 });
  }
}