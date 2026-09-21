import { base44 } from "@/api/base44Client";
import { oddsKey } from "@/lib/bookmakerOdds";

// IN-BROWSER VALUE ALERTS — no Slack, no external service. Whenever the REAL
// bookmaker feed prices a market the model holds at 80%+ confidence AND the
// real price carries a positive edge (bookmaker implied probability BELOW the
// model's), the pick is saved as a ValueAlert record and shown on the
// prediction board's 80%+ VALUE ALERTS panel — right in the browser.
//
// Honest by construction: only REAL provider prices trigger an alert (no
// real price — no alert, never a stand-in), one alert per match per day
// (device localStorage + entity-level dedupe across devices), and a failure
// never breaks the slip behind it.

const KEY = "ridex-value-alerts-v1";
const todayKey = () => new Date().toISOString().slice(0, 10);
const VALUE_BAR = 0.8; // the 80%+ model-confidence bar
const MAX_ALERTS_PER_PASS = 5;

function readSent() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (j.date !== todayKey() || typeof j.keys !== "object") return { date: todayKey(), keys: {} };
    return j;
  } catch {
    return { date: todayKey(), keys: {} };
  }
}

// Fire-and-forget — an alert failure never breaks the slip behind it.
export async function notifyValueOpportunities(legs) {
  try {
    const sent = readSent();
    const alerts = [];
    for (const l of legs || []) {
      const o = l?.realOdds;
      const prob = Number(l?.prob ?? l?.probability) || 0;
      const price = Number(o?.price) || 0;
      if (!o || o.status || !(price > 1) || prob < VALUE_BAR) continue;
      const edge = prob - 1 / price;
      if (edge <= 0) continue; // no positive edge vs the real price — not a value opportunity
      const k = oddsKey(l);
      if (sent.keys[k]) continue;
      sent.keys[k] = Date.now();
      alerts.push({
        home: l.home,
        away: l.away,
        league: l.league || "",
        market: l.marketLabel || "",
        prob: Math.round(prob * 100),
        price,
        bookmaker: o.bookmaker || "",
        edgePct: Math.round(edge * 1000) / 10,
      });
    }
    if (!alerts.length) return 0;

    // Entity-level dedupe — one alert per match per day across ALL devices.
    const today = todayKey();
    const existing = await base44.entities.ValueAlert.filter({ date_key: today }).catch(() => []);
    const seen = new Set((existing || []).map((a) => `${a.home}|${a.away}|${a.market}`));
    const fresh = alerts.filter((a) => !seen.has(`${a.home}|${a.away}|${a.market}`));
    if (!fresh.length) return 0;

    try {
      localStorage.setItem(KEY, JSON.stringify(sent));
    } catch {}
    await base44.entities.ValueAlert.bulkCreate(
      fresh.slice(0, MAX_ALERTS_PER_PASS).map((a) => ({
        date_key: today,
        home: a.home,
        away: a.away,
        league: a.league,
        market: a.market,
        prob: a.prob,
        price: a.price,
        bookmaker: a.bookmaker,
        edge_pct: a.edgePct,
      }))
    ).catch(() => {});
    return fresh.length;
  } catch {
    return 0;
  }
}