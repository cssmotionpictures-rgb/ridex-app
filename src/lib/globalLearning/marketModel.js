// MODEL-VS-MARKET OBSERVATION LAYER — measures whether RIDE X probability
// estimates are calibrated, directionally useful and genuinely identifying
// value against REAL bookmaker prices. Strict separation is the core rule:
// model probability and model fair odds are NEVER overwritten by, labeled as
// or substituted with bookmaker odds — and a bookmaker price is NEVER
// inferred from a model number. This is an observation/evidence layer only:
// it computes, classifies and reports; it never changes a prediction, a
// weight or a threshold, and it never claims value before verified outcomes
// accumulate. It feeds the EXISTING Global Learning evidence-gated queue.
import { marketFamilyOf } from "./globalId";

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const isGraded = (s) => s === "won" || s === "lost";

// ————— MARKET MATH —————
export function marketImpliedProbability(odds) {
  const o = Number(odds);
  return Number.isFinite(o) && o > 1 ? 1 / o : 0;
}

// Margin-adjusted (overround-normalized) probabilities for a set of prices
// that all quote the SAME market (e.g. 1X2). Returns [] when any price is
// invalid — the adjustment is never computed from partial data.
export function marginAdjustedProbability(oddsList) {
  const raw = (oddsList || []).map(marketImpliedProbability);
  if (!raw.length || raw.some((p) => p <= 0)) return [];
  const overround = raw.reduce((s, p) => s + p, 0);
  return raw.map((p) => p / overround);
}

// The market benchmark for a ledger row: margin-adjusted where recorded,
// else the stored raw implied probability, else computed from the real
// price. NEVER derived from a model number — 0 when no real price exists.
export function marketProbOf(row) {
  const mp = Number(row?.margin_probability) || 0;
  if (mp > 0) return mp;
  const sp = Number(row?.market_probability) || 0;
  if (sp > 0) return sp;
  return marketImpliedProbability(row?.market_odds);
}

// ————— DISAGREEMENT CLASSIFICATION —————
export const DISAGREEMENT_BANDS = [
  ["CLOSE AGREEMENT", 3],
  ["MODERATE DISAGREEMENT", 8],
  ["HIGH DISAGREEMENT", 15],
  ["EXTREME DISAGREEMENT", Infinity],
];

export function disagreementOf(modelProb, marketProb) {
  const m = Number(modelProb) || 0;
  const k = Number(marketProb) || 0;
  const diffPct = r2((m - k) * 100) ?? 0;
  const absDiffPct = r2(Math.abs(diffPct)) ?? 0;
  const band = (DISAGREEMENT_BANDS.find(([, max]) => absDiffPct <= max) || DISAGREEMENT_BANDS[3])[0];
  return {
    diffPct,
    absDiffPct,
    band,
    direction: diffPct > 0 ? "MODEL ABOVE MARKET" : diffPct < 0 ? "MODEL BELOW MARKET" : "ALIGNED",
    valuePct: diffPct,
  };
}

// ————— SPORT / IDENTITY —————
export function sportOfRow(row) {
  const s = String(row?.sport || "").trim();
  if (s) return s.charAt(0).toUpperCase() + s.slice(1);
  const league = String(row?.league || "").trim();
  if (/\batp\b|\bwta\b|\bitf\b|challenger|nestl|hopman|davis cup/i.test(league)) return "Tennis";
  if (/^(us open|wimbledon|roland[- ]garros|australian open|indian wells|miami open|madrid open|rome|china open|japan open)/i.test(league))
    return "Tennis";
  if (/\bnba\b|\bwnba\b|basketball|euroleague/i.test(league)) return "Basketball";
  if (/\bmlb\b|baseball/i.test(league)) return "Baseball";
  if (/\bnfl\b|american football|super bowl/i.test(league)) return "American football";
  if (/\bnhl\b|ice hockey/i.test(league)) return "Ice hockey";
  if (["kala", "win-raba"].includes(String(row?.source_section))) return "Football";
  if (/premier|la liga|serie a|bundesliga|ligue 1|eredivisie|champions|europa|primeira|pro league|allsvenskan|ekstraklasa/i.test(league))
    return "Football";
  return "Unspecified";
}

// ————— OBSERVATIONS —————
// Only REAL captured bookmaker prices create a market observation — a
// model-only pick is never manufactured a market view, and model fair odds
// are never shown, stored or counted as a bookmaker price.
export function marketObservationOf(row) {
  const odds = Number(row?.market_odds) || 0;
  const modelProb = Number(row?.probability);
  if (!(odds > 1) || !(modelProb > 0) || !row?.global_prediction_id) return null;
  const implied = marketImpliedProbability(odds);
  const stored = Number(row.market_probability) || 0;
  const marketDataQuality =
    stored > 0 && Math.abs(stored - implied) > 0.01
      ? "CHECK — stored market probability differs from the recorded price"
      : "OK";
  const d = disagreementOf(modelProb, marketProbOf(row));
  return {
    // RIDE X side (immutable record fields — never overwritten by market data)
    global_prediction_id: row.global_prediction_id,
    prediction_version: row.prediction_version || 1,
    section: row.source_section || "",
    model_version: row.model_version || "",
    sport: sportOfRow(row),
    league: row.league || "",
    market_key: row.market_key || "",
    market_family: marketFamilyOf(row.market_key),
    market_label: row.market_label || "",
    home: row.home || "",
    away: row.away || "",
    model_probability: modelProb,
    model_fair_odds: Number(row.fair_odds) > 1 ? Number(row.fair_odds) : r2(1 / modelProb),
    confidence: row.confidence || 0,
    recorded_at: row.recorded_at || "",
    kickoff: row.kickoff || "",
    // MARKET SNAPSHOT — separate fields, permanently distinct from model numbers
    bookmaker: row.bookmaker || "",
    bookmaker_odds: odds,
    odds_status: row.odds_status || "",
    market_implied_probability: implied,
    market_probability: marketProbOf(row),
    closing_odds: Number(row.closing_odds) || 0,
    clv_pct: Number(row.clv_pct) || 0,
    market_data_quality: marketDataQuality,
    disagreement: d,
    status: row.status || "",
  };
}

// Observations deduped by Global Prediction ID — immutable versions keep the
// newest prediction_version; a prediction never appears twice.
export function marketObservations(rows) {
  const byGid = new Map();
  for (const row of rows || []) {
    const obs = marketObservationOf(row);
    if (!obs) continue;
    const cur = byGid.get(obs.global_prediction_id);
    if (!cur || (obs.prediction_version || 1) >= (cur.prediction_version || 1)) {
      byGid.set(obs.global_prediction_id, obs);
    }
  }
  return [...byGid.values()];
}

// ————— SAMPLE-GATED METRICS —————
const graded = (list) => list.filter((o) => isGraded(o.status));
const brierOf = (list) => {
  const g = graded(list);
  return g.length ? r2(g.reduce((s, o) => s + Math.pow(o.model_probability - (o.status === "won" ? 1 : 0), 2), 0) / g.length) : null;
};
const loglossOf = (list) => {
  const g = graded(list);
  if (!g.length) return null;
  const cp = (p) => Math.min(0.99, Math.max(0.01, p));
  return r2(g.reduce((s, o) => s - Math.log(o.status === "won" ? cp(o.model_probability) : 1 - cp(o.model_probability)), 0) / g.length);
};
const winRateOf = (list) => {
  const g = graded(list);
  return g.length ? r2((g.filter((o) => o.status === "won").length / g.length) * 100) : null;
};
// Paper ROI is only ever reported from a sufficient settled sample — a tiny
// sample never gets presented as proof of predictive edge.
const roiOf = (list) => {
  const g = graded(list);
  if (g.length < 30) return null;
  const profit = g.reduce((s, o) => s + (o.status === "won" ? o.bookmaker_odds - 1 : -1), 0);
  return { profit: r2(profit), roiPct: r2((profit / g.length) * 100), n: g.length };
};
const clvAvgOf = (list) => {
  const c = list.filter((o) => (o.clv_pct || 0) !== 0);
  return c.length ? r2(c.reduce((s, o) => s + (o.clv_pct || 0), 0) / c.length) : null;
};

export function evidenceLabelOf(n, { validated = false } = {}) {
  if (validated) return "VALIDATED INSIGHT";
  if (!n) return "INSUFFICIENT SAMPLE";
  if (n < 30) return "EVIDENCE ACCUMULATING";
  if (n < 100) return "PATTERN DETECTED — NOT VALIDATED";
  return "EVIDENCE MATURING — VALIDATION PENDING";
}

const statsOf = (list) => {
  const g = graded(list);
  const exp = g.length ? (g.reduce((s, o) => s + o.model_probability, 0) / g.length) * 100 : null;
  const actual = winRateOf(list);
  return {
    n: list.length,
    settled: g.length,
    avgModelProb: list.length ? r2((list.reduce((s, o) => s + o.model_probability, 0) / list.length) * 100) : null,
    avgMarketProb: list.length ? r2((list.reduce((s, o) => s + (o.market_probability || 0), 0) / list.length) * 100) : null,
    avgDiff: list.length ? r2(list.reduce((s, o) => s + o.disagreement.diffPct, 0) / list.length) : null,
    winRate: actual,
    calErr: exp != null && actual != null ? r2(actual - exp) : null,
    brier: brierOf(list),
    logloss: loglossOf(list),
    roi: roiOf(list),
    clv: clvAvgOf(list),
    evidence: evidenceLabelOf(g.length),
  };
};

const groupObs = (obs, fn) =>
  Object.entries(
    (obs || []).reduce((g, o) => {
      const k = fn(o);
      if (k) (g[k] ||= []).push(o);
      return g;
    }, {})
  ).map(([key, list]) => ({ key, ...statsOf(list) }));

export function disagreementStats(observations) {
  const obs = observations || [];
  const settled = graded(obs);
  return {
    total: obs.length,
    settled: settled.length,
    agreementRate: obs.length
      ? r2((obs.filter((o) => o.disagreement.band === "CLOSE AGREEMENT").length / obs.length) * 100)
      : null,
    avgDiff: obs.length ? r2(obs.reduce((s, o) => s + o.disagreement.diffPct, 0) / obs.length) : null,
    largestDiff: obs.length ? r2(Math.max(...obs.map((o) => o.disagreement.absDiffPct))) : null,
    byBand: DISAGREEMENT_BANDS.map(([band]) => ({
      band,
      ...statsOf(obs.filter((o) => o.disagreement.band === band)),
    })),
    bySport: groupObs(obs, (o) => o.sport),
    byMarketFamily: groupObs(obs, (o) => o.market_family),
    bySection: groupObs(obs, (o) => o.section),
  };
}

// ————— TENNIS CALIBRATION TRACK —————
export const TENNIS_PROB_BANDS = [
  ["50–59", 50, 60],
  ["60–69", 60, 70],
  ["70–79", 70, 80],
  ["80–89", 80, 90],
  ["90+", 90, 101],
];

const tourOf = (o) =>
  /\bwta\b/i.test(o.league) ? "WTA"
  : /\batp\b/i.test(o.league) ? "ATP"
  : /\bitf\b|challenger|125|nestl/i.test(o.league) ? "ITF / WTA 125 / Challenger"
  : "Tour not identified";

export function tennisCalibrationTrack(observations) {
  const tennis = (observations || []).filter((o) => o.sport === "Tennis");
  const g = graded(tennis);
  const byBand = TENNIS_PROB_BANDS.map(([label, lo, hi]) => {
    const list = g.filter((o) => o.model_probability * 100 >= lo && o.model_probability * 100 < hi);
    const expected = list.length ? r2((list.reduce((s, o) => s + o.model_probability, 0) / list.length) * 100) : null;
    const actual = winRateOf(list);
    return {
      band: label,
      n: list.length,
      expected,
      actual,
      calErr: expected != null && actual != null ? r2(actual - expected) : null,
      brier: brierOf(list),
      logloss: loglossOf(list),
      avgMarketProb: list.length ? r2((list.reduce((s, o) => s + (o.market_probability || 0), 0) / list.length) * 100) : null,
      evidence: evidenceLabelOf(list.length),
    };
  });
  return {
    total: tennis.length,
    settled: g.length,
    evidence: evidenceLabelOf(g.length),
    byBand,
    byTour: groupObs(tennis, tourOf),
    byDisagreement: groupObs(tennis, (o) => o.disagreement.band),
    notes: [
      "Tennis rows are identified from the recorded sport field and league labels — never guessed.",
      "Surface and ranking difference are not carried by the current data providers — left unavailable, never fabricated.",
      "No finding here promotes anything: the full backtest → walk-forward → challenger → out-of-sample chain still applies.",
    ],
  };
}

// ————— USER-SUPPLIED MARKET CASES (research observations only) —————
// Records a user-supplied price against an EXISTING immutable prediction
// WITHOUT touching the prediction. Used for the tennis research cases: no
// value claim, no confidence change, no production effect — the verified
// outcome and comparable observations decide over time.
export function userSuppliedMarketCase(row, price, source = "user-supplied") {
  const modelProb = Number(row?.probability) || 0;
  const p = Number(price) || 0;
  if (!modelProb || !(p > 1) || !row?.global_prediction_id) return null;
  const marketProb = marketImpliedProbability(p);
  return {
    global_prediction_id: row.global_prediction_id,
    fixture: `${row.home} v ${row.away}`,
    league: row.league || "",
    market: row.market_label || "",
    model_probability: modelProb,
    model_fair_odds: Number(row.fair_odds) > 1 ? Number(row.fair_odds) : r2(1 / modelProb),
    market_price: p,
    market_source: source,
    market_implied_probability: r2(marketProb),
    ...disagreementOf(modelProb, marketProb),
    note: "observation only — no prediction change, no value claim; awaits the verified outcome and comparable observations",
  };
}