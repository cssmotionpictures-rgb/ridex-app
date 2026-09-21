// RX ENGINE (RX-2.0) — multi-model ensemble, disagreement detection,
// calibration, uncertainty, market intelligence, master score and the
// quality gate. The engine's defining behavior: it can say NO PICK. A
// candidate becomes a premium selection only when probability, consensus,
// calibration, data quality and (where priced) market edge ALL clear the
// bar — nothing is ever manufactured to fill a slot.

import {
  RX_MODELS,
  RX_MARKET_MODEL_WEIGHT,
  RX_UNAVAILABLE_MODELS,
  teamStats,
  goalRates,
  meanGoalsPerSide,
  h2hOfWindow,
  clamp,
} from "./models";
import { calibrate } from "./calibration";
import {
  validateFixture, freshnessOf, redFlagsOf, pickQualityOf, confidenceCap,
  minAdjEdgeFor, buildProvenance,
} from "./validation";

const r3 = (x) => Math.round((Number(x) || 0) * 1000) / 1000;

export const RX_MODEL_VERSION = "RX-2.0";
export const RX_MIN_QUALIFY_PROB = 0.68; // same floor WIN RABA has always used
export const RX_MASTER_QUALIFY = 80;
export const RX_MASTER_STRONG = 85;
export const RX_MASTER_ELITE = 90;
export const RX_MASTER_ULTRA = 95;
export const RX_MIN_AGREEMENT = 0.75; // below this consensus fails — a high average is not enough

export const gradeOf = (master) => {
  if (master >= RX_MASTER_ULTRA) return "ULTRA ELITE";
  if (master >= RX_MASTER_ELITE) return "ELITE";
  if (master >= RX_MASTER_STRONG) return "STRONG";
  if (master >= RX_MASTER_QUALIFY) return "QUALIFYING";
  return "WATCH";
};

const candidateMarkets = (home, away) => [
  { key: "1", label: "Home Win" },
  { key: "X", label: "Draw" },
  { key: "2", label: "Away Win" },
  { key: "1X", label: "1X · Home or Draw" },
  { key: "X2", label: "X2 · Draw or Away" },
  { key: "12", label: "12 · Home or Away" },
  { key: "DNB1", label: `Draw No Bet · ${home}` },
  { key: "DNB2", label: `Draw No Bet · ${away}` },
  { key: "O0.5", label: "Over 0.5 Goals" },
  { key: "U0.5", label: "Under 0.5 Goals" },
  { key: "O1.5", label: "Over 1.5 Goals" },
  { key: "U1.5", label: "Under 1.5 Goals" },
  { key: "O2.5", label: "Over 2.5 Goals" },
  { key: "U2.5", label: "Under 2.5 Goals" },
  { key: "O3.5", label: "Over 3.5 Goals" },
  { key: "U3.5", label: "Under 3.5 Goals" },
  { key: "BTTS_Y", label: "Both Teams To Score" },
  { key: "BTTS_N", label: "Both Teams Not To Score" },
];

// A model's probability for one market — goal models price totals/BTTS
// directly; 1X2 models price the 1X2 family by derivation.
function modelProbFor(model, key) {
  if (model.markets && model.markets[key] != null) return model.markets[key];
  const { p1, pX, p2 } = model;
  const den = p1 + p2;
  switch (key) {
    case "1": return p1;
    case "X": return pX;
    case "2": return p2;
    case "1X": return p1 + pX;
    case "X2": return pX + p2;
    case "12": return p1 + p2;
    case "DNB1": return den > 0.05 ? p1 / den : null;
    case "DNB2": return den > 0.05 ? p2 / den : null;
    default: return null;
  }
}

// Weighted ensemble + consensus for one market across the voting models.
function ensembleFor(models, key, weightOverrides) {
  const voters = models
    .map((m) => {
      const p = modelProbFor(m, key);
      if (p == null) return null;
      const base = m.key === "market"
        ? RX_MARKET_MODEL_WEIGHT
        : RX_MODELS.find((x) => x.key === m.key)?.weight ?? 0.08;
      const w = weightOverrides && weightOverrides[m.key] != null ? weightOverrides[m.key] : base;
      return { key: m.key, p, w: Math.max(0.02, w) };
    })
    .filter((v) => v && Number.isFinite(v.p));
  if (!voters.length) return null;
  const wsum = voters.reduce((s, v) => s + v.w, 0);
  const prob = voters.reduce((s, v) => s + v.p * (v.w / wsum), 0);
  const variance = voters.reduce((s, v) => {
    const w = v.w / wsum;
    return s + w * (v.p - prob) ** 2;
  }, 0);
  const cv = prob > 0 ? Math.sqrt(Math.max(0, variance)) / Math.max(prob, 1e-6) : 1;
  const agreement = clamp(1 - cv * 1.8, 0, 1);
  if (!Number.isFinite(prob)) return null; // invalid calculation — no candidate
  return {
    prob: clamp(prob, 0.01, 0.995),
    agreement,
    voting: voters.length,
    perModel: Object.fromEntries(voters.map((v) => [v.key, Math.round(v.p * 1000) / 1000])),
  };
}

// Analyze one fixture. Phase 1 runs the models and prices every candidate
// market WITHOUT market data (the market-implied model needs real prices,
// which the caller attaches between phases). Returns null when verified form
// is missing on either side — the fixture never enters with a guess.
export function analyzeFixture(input) {
  const { home, away, league, leagueCode, kickoff, played } = input;
  // HARD DATA VALIDATION GATE — a fixture failing any critical check (teams,
  // competition, kickoff time, KICKOFF LOCK) never reaches the models.
  const gate = validateFixture({ home, away, league, kickoff });
  if (!gate.ok) return null;
  if (!played?.length) return null;
  const hs = teamStats(played, home);
  const as = teamStats(played, away);
  if (!hs || !as) return null;
  const minForm = Math.min(hs.n, as.n);
  if (minForm < 4) return null; // no verified form on both sides — never guessed in
  const kickoffMs = gate.kickoffMs;
  const hsRecent = teamStats(played, home, { maxN: 8, halfLifeDays: 25 });
  const asRecent = teamStats(played, away, { maxN: 8, halfLifeDays: 25 });
  const leagueGoals = meanGoalsPerSide(played);
  const rates = goalRates(hs, as, leagueGoals.mean);
  const h2h = h2hOfWindow(played, home, away);

  const ctx = { played, home, away, hs, as, hsRecent, asRecent, rates, kickoffMs };
  const models = [];
  const unavailable = [];
  for (const def of RX_MODELS) {
    let out = null;
    try { out = def.run(ctx); } catch { out = null; }
    if (out && Number.isFinite(out.p1)) {
      const s = out.p1 + out.pX + out.p2;
      models.push({
        key: def.key,
        label: def.label,
        p1: out.p1 / s,
        pX: out.pX / s,
        p2: out.p2 / s,
        markets: out.markets || null,
      });
    } else {
      unavailable.push(def.key);
    }
  }
  if (models.length < 3) return null; // not enough independent voices — no forecast

  const markets = candidateMarkets(home, away);

  // Phase-1 raw pricing (no market model) — used to build the odds request.
  const legs = [];
  markets.forEach((mk) => {
    const ens = ensembleFor(models, mk.key, input.learnedWeights);
    if (ens && ens.prob >= 0.5) legs.push({ key: mk.key, label: mk.label, rawProb: ens.prob });
  });

  const meta = {
    home, away, league, leagueCode, kickoff, kickoffMs, minForm, h2h, rates,
    leagueSides: leagueGoals.sides, hs, as,
  };

  return {
    ...meta,
    raw1X2: {
      p1: ensOf(models, "1", input.learnedWeights),
      pX: ensOf(models, "X", input.learnedWeights),
      p2: ensOf(models, "2", input.learnedWeights),
    },
    legs,
    finalize: (marketIntel) =>
      finalizeForecast({ ...meta, models, unavailable, markets, marketIntel, input }),
  };
}

const ensOf = (models, key, overrides) => {
  const ens = ensembleFor(models, key, overrides);
  return ens ? ens.prob : 1 / 3;
};

// Phase 2 — final ensemble (market model included when real three-way prices
// exist), calibration, uncertainty, market edge, master score, quality gate,
// explanation and failure modes.
function finalizeForecast({ home, away, models, unavailable, markets, marketIntel, input, minForm, h2h, rates, leagueSides, hs, as, kickoffMs }) {
  const calibration = input.calibration || null;
  const learnedWeights = input.learnedWeights || null;

  const allModels = [...models];
  let threeWay = null;
  if (marketIntel?.threeWay && marketIntel.threeWay.p1 + marketIntel.threeWay.pX + marketIntel.threeWay.p2 > 0.1) {
    const tw = marketIntel.threeWay;
    const s = tw.p1 + tw.pX + tw.p2;
    allModels.push({
      key: "market",
      label: "Market-implied probability",
      p1: tw.p1 / s,
      pX: tw.pX / s,
      p2: tw.p2 / s,
      markets: null,
    });
    threeWay = { ...tw, overround: s };
  }

  const candidates = [];
  let marketsScanned = 0;
  // PREDICTION SNAPSHOT + PROVENANCE — the immutable input record every
  // candidate carries, so the future state of the database can never alter
  // what a historical prediction was based on.
  const scannedAt = new Date().toISOString();
  const weightsBasis = input.learnedWeights ? "learned" : "baseline";
  const fixtureSnapshot = {
    modelVersion: RX_MODEL_VERSION,
    scannedAt,
    weightsBasis,
    weights: input.learnedWeights || "BASELINE WEIGHTS — NOT YET LEARNED",
    calibration: input.calibration
      ? { ready: !!input.calibration.ready, sample: input.calibration.sample ?? 0 }
      : { ready: false, sample: 0 },
    models: models.map((m) => ({ key: m.key, label: m.label, p1: r3(m.p1), pX: r3(m.pX), p2: r3(m.p2) })),
    marketModel: threeWay ? { overround: r3(threeWay.overround) } : null,
    unavailableModels: unavailable,
  };
  const formFresh = freshnessOf({
    formLastPlayedMs: Math.max(hs.lastPlayedAt || 0, as.lastPlayedAt || 0) || null,
    kickoffMs,
  });
  const provenance = buildProvenance({
    league: input.league, leagueCode: input.leagueCode, kickoff: input.kickoff,
    calibration: input.calibration, learnedWeights: input.learnedWeights,
    odds: null, rates, minForm, h2hN: h2h.n, scannedAt,
  });
  for (const mk of markets) {
    const ens = ensembleFor(allModels, mk.key, learnedWeights);
    if (!ens) continue;
    marketsScanned++;
    const price = marketIntel?.prices?.[mk.key] || null;
    const priced = !!(price && price.price > 1 && Number.isFinite(price.price));
    const implied = priced ? 1 / price.price : 0;
    const calibratedP = calibrate(ens.prob, calibration);
    if (!Number.isFinite(calibratedP)) continue; // invalid calculation — no candidate
    // MARKET MARGIN — where the real three-way overround is known, the edge is
    // measured against the margin-adjusted benchmark, never raw 1/odds.
    const threeWayFamily = ["1", "X", "2", "1X", "X2", "12"].includes(mk.key);
    const overround = threeWay && threeWay.overround > 1 && threeWay.overround < 1.5 ? threeWay.overround : null;
    const marginImplied = priced && threeWayFamily && overround ? Math.min(0.99, implied / overround) : null;
    const benchImplied = marginImplied ?? implied;
    const rawEdgePct = priced ? Math.round((calibratedP - implied) * 1000) / 10 : 0;
    const edgePct = priced ? Math.round((calibratedP - benchImplied) * 1000) / 10 : 0;

    // Independent uncertainty — missing data, model disagreement, short
    // sample, no market cross-check, rest anomaly, thin league sample.
    const daysH = hs.lastPlayedAt && kickoffMs ? (kickoffMs - hs.lastPlayedAt) / 86400000 : null;
    const daysA = as.lastPlayedAt && kickoffMs ? (kickoffMs - as.lastPlayedAt) / 86400000 : null;
    const fatigueFlag = (daysH != null && daysH < 3) || (daysA != null && daysA < 3);
    let u = 0;
    u += clamp((10 - minForm) / 10, 0, 1) * 0.35;
    u += (h2h.n >= 2 ? 0 : 1) * 0.1;
    u += (priced ? 0 : 1) * 0.15;
    u += (1 - ens.agreement) * 0.25;
    u += fatigueFlag ? 0.1 : 0;
    u += leagueSides < 60 ? 0.05 : 0;
    const uncertainty = clamp(u, 0, 1);
    // UNCERTAINTY-ADJUSTED EDGE — raw edge minus an explicit haircut for
    // model disagreement and uncertainty. A tiny theoretical edge with large
    // uncertainty becomes NO BET.
    const edgeHaircut = Math.round((uncertainty * 6 + (1 - ens.agreement) * 4) * 10) / 10;
    const adjEdgePct = priced ? Math.round((edgePct - edgeHaircut) * 10) / 10 : null;
    const minAdjEdge = priced ? minAdjEdgeFor(price.price) : null;

    // Data quality — odds availability is ONE factor: an unpriced candidate can
    // still earn HIGH when the verified evidence is strong on its own.
    const dq =
      minForm < 4 || ens.agreement < 0.65
        ? "LOW"
        : priced
        ? minForm >= 5 && h2h.n >= 2 && ens.agreement >= 0.8 ? "HIGH" : "MEDIUM"
        : minForm >= 6 && h2h.n >= 2 && ens.agreement >= 0.85 ? "HIGH" : "MEDIUM";

    const evPct = priced ? Math.round((calibratedP * price.price - 1) * 1000) / 10 : 0;
    const fairOdds = Math.round((1 / calibratedP) * 100) / 100;

    // RIDE X MASTER SCORE — no single statistic dominates.
    const probPts = 34 * clamp((calibratedP - 0.5) / 0.45, 0, 1);
    const agreePts = 16 * clamp((ens.agreement - 0.6) / 0.4, 0, 1);
    const dqPts = 12 * (dq === "HIGH" ? 1 : dq === "MEDIUM" ? 0.55 : 0);
    // No real price = the edge is unverified, but the candidate is not
    // quadruple-penalized: uncertainty and data quality already carry that
    // cost. Neutral score here.
    const mktPts = priced ? 14 * clamp((edgePct + 2) / 10, 0, 1) : 14 * 0.6;
    const evidencePts =
      10 * (0.6 * clamp(minForm / 6, 0, 1) + 0.4 * clamp(h2h.n / 3, 0, 1));
    // Market reliability — sharp-book agreement when priced, lower without a check.
    const pinDiv = priced && price.pinnacle > 1.01
      ? clamp(1 - Math.abs(1 / price.pinnacle - implied) / Math.max(implied, 0.01), 0, 1)
      : null;
    const stabilityPts = 7 * (priced ? (pinDiv != null ? 0.5 + 0.5 * pinDiv : 0.6) : 0.5);
    const uncertaintyPts = 7 * (1 - uncertainty);
    const master = Math.round(
      probPts + agreePts + dqPts + mktPts + evidencePts + stabilityPts + uncertaintyPts
    );

    const flags = redFlagsOf({
      priced, oddsFresh: priced ? "fresh" : "unavailable", minForm, h2hN: h2h.n,
      agreement: ens.agreement, uncertainty, leagueSides, fatigue: fatigueFlag,
      price: priced ? price.price : null, adjEdgePct, minAdjEdge,
    });
    const blocked = flags.some((f) => f.severity === "BLOCK");
    // FALSE-CONFIDENCE REMOVAL — several models agreeing is never enough for a
    // 97–99% claim; the cap scales with pricing, uncertainty and agreement.
    const displayConf = Math.min(
      Math.round(calibratedP * 100),
      confidenceCap({ priced, uncertainty, agreement: ens.agreement })
    );
    // PICK QUALITY — the reliability of the prediction PROCESS, explicitly
    // separate from the estimated probability (lineup/injury data is
    // structurally unavailable; quality is measured on what is connected).
    const quality = pickQualityOf({
      dq, agreement: ens.agreement, priced, adjEdgePct, minAdjEdge, uncertainty,
      oddsFresh: priced ? "fresh" : "unavailable",
    });
    const qualifies =
      calibratedP >= RX_MIN_QUALIFY_PROB &&
      master >= RX_MASTER_QUALIFY &&
      dq !== "LOW" &&
      ens.agreement >= RX_MIN_AGREEMENT &&
      !blocked &&
      !(priced && adjEdgePct < minAdjEdge);

    const rejectReason = !qualifies
      ? calibratedP < RX_MIN_QUALIFY_PROB
        ? `Probability ${Math.round(calibratedP * 100)}% below the qualifying floor`
        : ens.agreement < RX_MIN_AGREEMENT
        ? `LOW MODEL AGREEMENT (${Math.round(ens.agreement * 100)}%) — consensus fails`
        : dq === "LOW"
        ? "Data quality LOW — never enters premium selections"
        : priced && adjEdgePct < minAdjEdge
        ? `Adjusted edge ${adjEdgePct}pp is below the ${minAdjEdge}pp minimum required at odds ${price.price.toFixed(2)} — uncertainty overwhelms the edge`
        : uncertainty > 0.6
        ? "Uncertainty EXTREME — the prediction process cannot support a selection"
        : "Master score below 80"
      : "";

    // GRADE DOWNGRADE — ULTRA ELITE / ELITE require the evidence to back the
    // label: priced with a surviving adjusted edge (or exceptional unpriced
    // consensus), low uncertainty. Never a label from the score alone.
    let grade = gradeOf(master);
    if (qualifies) {
      const ultraOk = priced && adjEdgePct > 0 && uncertainty <= 0.2 && ens.agreement >= 0.9;
      const eliteOk =
        (priced && adjEdgePct >= minAdjEdge && uncertainty <= 0.3) ||
        (!priced && uncertainty <= 0.25 && ens.agreement >= 0.85);
      if (grade === "ULTRA ELITE" && !ultraOk) grade = eliteOk ? "ELITE" : "STRONG";
      else if (grade === "ELITE" && !eliteOk) grade = "STRONG";
    }
    let candProv = provenance;
    if (priced) {
      candProv = {
        ...provenance,
        odds: {
          source: "The Odds API (bookmaker-odds)",
          bookmaker: price.bookmaker || "",
          price: price.price,
          timestamp: price.timestamp || null,
          freshness: "fresh",
        },
      };
    }
    candidates.push({
      marketKey: mk.key,
      marketLabel: mk.label,
      ensemble: ens.prob,
      calibrated: calibratedP,
      agreement: ens.agreement,
      voting: ens.voting,
      perModel: ens.perModel,
      priced,
      price: priced ? price.price : 0,
      bookmaker: priced ? price.bookmaker || "" : "",
      pinnacle: priced && price.pinnacle > 1.01 ? price.pinnacle : 0,
      implied,
      edgePct,
      evPct,
      fairOdds,
      uncertainty,
      dq,
      master,
      grade,
      qualifies,
      rejectReason,
      rawEdgePct,
      adjEdgePct,
      minAdjEdge,
      marginImplied,
      displayConf,
      quality,
      flags,
      provenance: candProv,
      validation: {
        gate: "PASS",
        checks: [
          "valid fixture", "valid teams", "valid competition", "valid kickoff",
          "kickoff lock — recorded pre-match only",
          priced ? "verified odds where edge is calculated" : "edge not calculated — no verified odds (MARKET EDGE UNAVAILABLE)",
        ],
        freshness: { odds: priced ? "fresh" : "unavailable", form: formFresh.form },
        redFlags: flags,
      },
      snapshot: fixtureSnapshot,
      weightsBasis,
      calibrationSample: input.calibration?.sample ?? 0,
      explanation: buildExplanation({
        mk, ens, calibratedP, priced, price, implied, edgePct, fairOdds,
        minForm, h2h, rates, voting: ens.voting, home, away,
      }),
      failureModes: buildFailureModes({
        ens, mk, priced, minForm, h2h, fatigueFlag, calibratedP,
      }),
    });
  }

  return {
    candidates,
    marketsScanned,
    diagnostics: {
      modelsAvailable: models.map((m) => m.key),
      marketModelUsed: threeWay != null,
      unavailable,
      structurallyUnavailable: RX_UNAVAILABLE_MODELS,
      minForm,
      h2h: h2h.n,
      rates,
    },
  };
}

function buildExplanation({ home, away, mk, ens, calibratedP, priced, price, implied, edgePct, fairOdds, minForm, h2h, rates, voting }) {
  const why =
    `${voting} independent models converge on ${mk.label} — ensemble ${Math.round(ens.prob * 100)}%, ` +
    `agreement ${Math.round(ens.agreement * 100)}%. Calibrated estimate: ${Math.round(calibratedP * 100)}%.`;
  const market = priced
    ? `Real price ${price.price.toFixed(2)} (${price.bookmaker || "bookmaker"}) implies ` +
      `${Math.round(implied * 100)}% — the model sees ` +
      `${edgePct > 0 ? "+" : ""}${edgePct} pts of edge (fair odds ${fairOdds.toFixed(2)}). ` +
      `${price.pinnacle > 1.01 ? `Pinnacle quotes ${price.pinnacle.toFixed(2)} — sharp-book cross-check included.` : "Pinnacle not quoting this market."}`
    : "No live bookmaker price for this market — this is a model estimate, never presented as a bookmaker price.";
  const support =
    `Expected goals ≈ ${rates.lh.toFixed(2)}–${rates.la.toFixed(2)} · ${minForm} verified form games each side` +
    (h2h.n ? ` · ${h2h.n} H2H meeting${h2h.n > 1 ? "s" : ""} in the window` : " · no H2H history in the window") +
    ` (${home} vs ${away}).`;
  return { why, market, support };
}

function buildFailureModes({ ens, mk, priced, minForm, h2h, fatigueFlag, calibratedP }) {
  const risks = [];
  if (["1", "2"].includes(mk.key)) {
    const drawRisk = ens.perModel["X"] ?? 0.25;
    risks.push(`A draw remains a live outcome (~${Math.round(Math.min(0.35, Math.max(0.08, drawRisk)) * 100)}% under the models)`);
  }
  if (ens.agreement < 0.85) risks.push(`Models only ${Math.round(ens.agreement * 100)}% in agreement — a dissenting model can be the right one`);
  if (!priced) risks.push("No real market price to cross-check the estimate — the edge is unverified");
  if (minForm < 6) risks.push(`Evidence window is short (${minForm} verified games)`);
  if (!h2h.n) risks.push("No head-to-head history — opponent matchup effects unmeasured");
  if (fatigueFlag) risks.push("One side on short rest — schedule congestion can flip a tight game");
  if (calibratedP >= 0.9) risks.push("Single-match variance — even a 90% model loses roughly 1 in 10");
  risks.push("A single high-variance event (early red card, deflection, game-state distortion) can flip any football match");
  return risks.slice(0, 4);
}

// BIG HAMMER gate — priced 3.00+ only, with the STRICTER requirements.
// A 3.00+ price alone never qualifies: it needs STRONG+ master score, high
// model agreement and HIGH data quality.
// BIG HAMMER gate — priced 3.00+ only, with the STRICTER requirements.
// LONGSHOT PROTECTION: a 3.00+ price never qualifies on price alone — it
// needs a surviving uncertainty-adjusted edge of 4pp+, STRONG+ master score,
// high model agreement, HIGH data quality and no blocking red flag.
export function isBigHammer(c) {
  return (
    c.qualifies &&
    c.priced &&
    c.price >= 3 &&
    c.master >= RX_MASTER_STRONG &&
    c.agreement >= 0.85 &&
    c.dq === "HIGH" &&
    c.adjEdgePct != null &&
    c.adjEdgePct >= 4 &&
    !(c.flags || []).some((f) => f.severity === "BLOCK")
  );
}