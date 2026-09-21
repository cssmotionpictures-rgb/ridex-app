// KALA — the intelligence presentation layer over the RX-2.0 ensemble engine.
// KALA never modifies the engine, the ledgers or any existing RIDE X tab: it
// reads the immutable EnginePrediction ledger and the board the engine builds,
// and adds its own analytics (performance, calibration, model health, edge
// realization, cashout analysis) plus per-user settings and imported-slip
// tickets. "NO QUALIFYING PICK" is a valid, desirable result — nothing is
// ever manufactured to fill a slot.

import { base44 } from "@/api/base44Client";

export const KALA_LAYER_VERSION = "KALA-MASTER-1.0";

// Sample-size honesty — never claim accuracy from a handful of predictions.
export const sampleLabel = (n) =>
  n < 30 ? "VERY SMALL SAMPLE" : n < 100 ? "EARLY SAMPLE" : n < 500 ? "DEVELOPING SAMPLE" : "MORE RELIABLE SAMPLE";

export const agreementLabel = (a) => (a >= 0.85 ? "HIGH" : a >= 0.75 ? "MEDIUM" : "LOW");
export const riskOf = (u) => (u <= 0.25 ? "LOW" : u <= 0.45 ? "MEDIUM" : u <= 0.65 ? "HIGH" : "EXTREME");

// === Tracked picks (on-device watchlist — no database rows, fully removable) ===
const TRACK_KEY = "kala-tracked-v1";
export const loadTracked = () => {
  try { return JSON.parse(localStorage.getItem(TRACK_KEY) || "[]"); } catch { return []; }
};
export const saveTracked = (ids) => {
  try { localStorage.setItem(TRACK_KEY, JSON.stringify([...new Set(ids)].slice(0, 200))); } catch {}
};

// === Performance analytics over graded EnginePrediction rows ===
export function kalaAnalytics(rows) {
  const graded = (rows || []).filter((r) => ["won", "lost"].includes(r.status));
  const n = graded.length;
  const won = graded.filter((r) => r.status === "won");
  let brier = 0, logloss = 0, calErr = 0, probSum = 0, edgeSum = 0, edgeN = 0, oddsSum = 0, oddsN = 0;
  graded.forEach((r) => {
    const p = Math.min(0.985, Math.max(0.015, r.calibrated_probability || 0.5));
    const y = r.status === "won" ? 1 : 0;
    brier += (p - y) ** 2;
    logloss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    calErr += p - y;
    probSum += p;
    if ((r.market_odds || 0) > 1) { oddsSum += r.market_odds; oddsN++; }
    if ((r.market_odds || 0) > 1) { edgeSum += r.edge_pct || 0; edgeN++; }
  });
  // Current streak — latest settled first.
  const bySettled = [...graded].sort(
    (a, b) => new Date(b.settled_at || b.recorded_at || 0) - new Date(a.settled_at || a.recorded_at || 0)
  );
  let streak = 0;
  for (const r of bySettled) { if (r.status === "won") streak++; else break; }
  // Paper P/L — real prices only; model-only picks are excluded, never faked.
  const stake = 1000;
  const priced = graded.filter((r) => (r.market_odds || 0) > 1);
  const profit = priced.reduce((s, r) => s + (r.status === "won" ? stake * (r.market_odds - 1) : -stake), 0);
  const staked = priced.length * stake;
  const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
  return {
    graded: n,
    won: won.length,
    winRate: n ? Math.round((won.length / n) * 1000) / 10 : null,
    brier: n ? Math.round((brier / n) * 1000) / 1000 : null,
    logloss: n ? Math.round((logloss / n) * 1000) / 1000 : null,
    calErr: n ? Math.round((calErr / n) * 1000) / 10 : null,
    avgProb: n ? Math.round((probSum / n) * 1000) / 10 : null,
    avgOdds: oddsN ? r2(oddsSum / oddsN) : null,
    avgEdge: edgeN ? Math.round((edgeSum / edgeN) * 10) / 10 : null,
    streak,
    paper: {
      staked,
      profit: Math.round(profit),
      roiPct: staked ? Math.round((profit / staked) * 1000) / 10 : null,
      pricedPicks: priced.length,
    },
    sample: sampleLabel(n),
  };
}

// Calibration buckets — expected vs actual wins per probability band.
export function calibrationBuckets(rows) {
  const bands = [
    ["50–59%", 0.5, 0.6], ["60–69%", 0.6, 0.7], ["70–79%", 0.7, 0.8],
    ["80–89%", 0.8, 0.9], ["90–94%", 0.9, 0.95], ["95%+", 0.95, 1.01],
  ];
  const graded = (rows || []).filter(
    (r) => ["won", "lost"].includes(r.status) && r.calibrated_probability != null
  );
  return bands
    .map(([label, lo, hi]) => {
      const list = graded.filter((r) => r.calibrated_probability >= lo && r.calibrated_probability < hi);
      const n = list.length;
      const won = list.filter((r) => r.status === "won").length;
      const expectedRate = n ? list.reduce((s, r) => s + r.calibrated_probability, 0) / n : null;
      const actualRate = n ? won / n : null;
      return {
        label, n, won,
        expectedRate: expectedRate != null ? Math.round(expectedRate * 1000) / 10 : null,
        actualRate: actualRate != null ? Math.round(actualRate * 1000) / 10 : null,
        diffPct: n ? Math.round((actualRate - expectedRate) * 1000) / 10 : null,
        sample: sampleLabel(n),
      };
    })
    .filter((b) => b.n > 0);
}

// Grouped win rates by league / market / odds range / grade / session.
export function groupBy(rows, keyFn) {
  const graded = (rows || []).filter((r) => ["won", "lost"].includes(r.status));
  const g = {};
  graded.forEach((r) => {
    const k = keyFn(r) || "—";
    (g[k] ||= { n: 0, won: 0 });
    g[k].n++;
    if (r.status === "won") g[k].won++;
  });
  return Object.entries(g)
    .map(([key, v]) => ({ key, settled: v.n, won: v.won, winRate: Math.round((v.won / v.n) * 1000) / 10 }))
    .sort((a, b) => b.settled - a.settled);
}

// === Per-user settings ===
export const KALA_DEFAULTS = {
  min_confidence: 80,
  min_edge_pct: 0,
  min_odds: 1.01,
  max_odds: 100,
  daily_picks: 3,
  morning_enabled: true,
  evening_enabled: true,
  rollover_enabled: true,
  paper_stake: 1000,
  risk_tolerance: "medium",
  cashout_weakest_leg_pct: 35,
  cashout_high_risk_legs: 2,
  cashout_prob_drop_pct: 20,
  cashout_value_pct: 75,
};
const SETTING_FIELDS = Object.keys(KALA_DEFAULTS);

export async function loadKalaSettings() {
  const rows = await base44.entities.KalaSetting.filter({}, "-created_date", 5).catch(() => []);
  const row = rows?.[0];
  const values = { ...KALA_DEFAULTS };
  if (row) SETTING_FIELDS.forEach((f) => { if (row[f] != null) values[f] = row[f]; });
  return { values, id: row?.id || null };
}

export async function saveKalaSettings(id, values) {
  const payload = {};
  SETTING_FIELDS.forEach((f) => (payload[f] = values[f]));
  if (id) return base44.entities.KalaSetting.update(id, payload);
  return base44.entities.KalaSetting.create(payload);
}

// === Cashout Intelligence — pure analysis, never executes anything ===
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sameTeam = (a, b) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
};
const marketNorm = (s) =>
  norm(s)
    .replace(/goals|both|teams|tost|toscore|score|nobet|or|the/g, "");
const sameMarket = (a, b) => {
  const x = marketNorm(a), y = marketNorm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
};

// Find the engine's immutable pre-kickoff estimate for one leg, if any.
function matchEngineRow(leg, rows) {
  const candidates = (rows || []).filter(
    (r) => sameTeam(leg.home, r.home) && sameTeam(leg.away, r.away)
  );
  const mkt = candidates.filter((r) => sameMarket(leg.market, r.market_label || r.market_key));
  const pool = mkt.length ? mkt : [];
  if (!pool.length) return null;
  // Latest version, preferring still-open rows (the live prediction).
  return pool.sort(
    (a, b) => (b.prediction_version || 1) - (a.prediction_version || 1) ||
      new Date(b.recorded_at || 0) - new Date(a.recorded_at || 0)
  )[0];
}

// Analyze one imported ticket. Labels are analytical opinions with reasons —
// KALA never says cashout is guaranteed better or worse, and never places one.
export function analyzeTicket(ticket, engineRows, settings, prevAnalysis) {
  const s = {
    weakest: settings.cashout_weakest_leg_pct ?? 35,
    highRiskN: settings.cashout_high_risk_legs ?? 2,
    dropPct: settings.cashout_prob_drop_pct ?? 20,
    valuePct: settings.cashout_value_pct ?? 75,
  };
  const prevLegs = (() => {
    try { return JSON.parse(prevAnalysis || "[]"); } catch { return []; }
  })();

  const legs = (ticket.legs || []).map((leg, i) => {
    let estimate = null;
    let source = "unavailable";
    const row = matchEngineRow(leg, engineRows);
    if (row && row.calibrated_probability != null) {
      estimate = row.calibrated_probability;
      source = "KALA estimate — recorded pre-kickoff";
    } else if ((leg.currentOdds || 0) > 1) {
      estimate = 1 / leg.currentOdds;
      source = "market-implied — from the current odds you entered";
    }
    const prev = prevLegs[i]?.estimate;
    const dropPct =
      prev != null && estimate != null ? Math.round((prev - estimate) * 1000) / 10 : null;
    return { ...leg, estimate, source, engineMatched: !!row, dropPct };
  });

  const pending = legs.filter((l) => (l.status || "pending") === "pending");
  const decidedWon = legs.filter((l) => l.status === "won").length;
  const decidedLost = legs.filter((l) => l.status === "lost").length;
  const estimatedPending = pending.filter((l) => l.estimate != null);
  const exact = pending.length > 0 && estimatedPending.length === pending.length;
  const remainingProb = exact ? estimatedPending.reduce((acc, l) => acc * l.estimate, 1) : null;
  const valueEstimate = remainingProb != null ? (ticket.potential_return || 0) * remainingProb : null;
  const cashout = ticket.cashout_offered || 0;
  const cashoutRatio =
    cashout > 0 && valueEstimate ? Math.round((cashout / valueEstimate) * 1000) / 10 : null;

  const weakest =
    pending.length ? pending.reduce((a, b) => ((b.estimate ?? 2) < (a.estimate ?? 2) ? b : a)) : null;
  const strongest =
    pending.length ? pending.reduce((a, b) => ((b.estimate ?? -1) > (a.estimate ?? -1) ? b : a)) : null;
  const highRiskLegs = pending.filter((l) => l.estimate == null || l.estimate < s.weakest / 100);
  const dropped = pending.filter((l) => (l.dropPct || 0) >= s.dropPct);

  const reasons = [];
  let verdict = "REVIEW";
  if (!legs.length) {
    verdict = "REVIEW";
    reasons.push("No legs on the slip yet.");
  } else if (!pending.length) {
    verdict = decidedLost ? "TICKET LOST" : decidedWon ? "TICKET WON" : "TICKET SETTLED";
    reasons.push("Every leg has been marked decided.");
  } else {
    if (!exact)
      reasons.push(
        `KALA estimate unavailable for ${pending.length - estimatedPending.length} leg(s) — enter that leg's current odds for a market-implied estimate.`
      );
    if (highRiskLegs.length >= s.highRiskN || (weakest && (weakest.estimate ?? 0) < s.weakest / 100)) {
      verdict = "HIGH RISK";
      reasons.push(
        `Weakest remaining leg (${weakest ? `${weakest.home} vs ${weakest.away} — ${weakest.market}` : "—"}) sits at ${
          weakest && weakest.estimate != null ? Math.round(weakest.estimate * 100) + "%" : "no estimate"
        }, and ${highRiskLegs.length} leg(s) are below your ${s.weakest}% risk threshold.`
      );
    } else if (cashoutRatio != null && cashoutRatio >= s.valuePct) {
      verdict = "CASHOUT-WORTHY-CONSIDERING";
      reasons.push(
        `The offered cashout is ${cashoutRatio}% of KALA's estimated remaining value (₦${Math.round(valueEstimate).toLocaleString()}) — close to or above your ${s.valuePct}% rule.`
      );
    } else if (cashoutRatio != null && cashoutRatio < 50) {
      verdict = "HOLD";
      reasons.push(
        `The offered cashout is only ${cashoutRatio}% of KALA's estimated remaining value — well below what the remaining legs are worth under the model.`
      );
    } else {
      verdict = cashoutRatio != null ? "REVIEW" : "HOLD";
      reasons.push(
        cashoutRatio != null
          ? `Cashout sits at ${cashoutRatio}% of estimated remaining value — neither clearly cheap nor clearly generous.`
          : "No cashout amount entered — remaining legs look within tolerance under the model."
      );
    }
    if (dropped.length)
      reasons.push(
        `${dropped.length} leg estimate(s) dropped ${s.dropPct}+ percentage points since the previous analysis.`
      );
  }

  // Auto rules — alerts only. KALA never executes a bookmaker cashout.
  const alerts = [];
  if (weakest && (weakest.estimate ?? 0) < s.weakest / 100)
    alerts.push(`Rule A triggered — weakest remaining leg below ${s.weakest}%.`);
  if (highRiskLegs.length >= s.highRiskN)
    alerts.push(`Rule B triggered — ${highRiskLegs.length} remaining legs at HIGH RISK.`);
  if (dropped.length)
    alerts.push(`Rule C triggered — a leg estimate dropped ${s.dropPct}+ points vs the previous analysis.`);
  if (cashoutRatio != null && cashoutRatio >= s.valuePct)
    alerts.push(`Rule D triggered — cashout reached ${s.valuePct}% of estimated remaining value.`);

  return {
    legs,
    pendingCount: pending.length,
    remainingProb: remainingProb != null ? Math.round(remainingProb * 1000) / 10 : null,
    valueEstimate: valueEstimate != null ? Math.round(valueEstimate) : null,
    cashoutRatio,
    weakest,
    strongest,
    verdict,
    reasons,
    alerts,
    approxNote: "Joint probability assumes independent legs — an approximation, not an exact product.",
  };
}