// KALA DIAGNOSTICS — pure research analytics over MODEL OBSERVATIONS (and the
// qualified-prediction ledger). Measurement starts IMMEDIATELY from the first
// settled observation; the 30-row threshold elsewhere governs only when
// results may begin to materially adjust production weights, never when
// measuring. Small samples are always labeled — no strong claims from thin
// data. These functions never mutate anything; they only compute.

const clampQ = (p) => Math.min(0.985, Math.max(0.015, Number(p) || 0.5));
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const settledOf = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => ["won", "lost"].includes(r.status));

// Wilson 95% confidence interval on an observed proportion.
export function wilsonCI(k, n) {
  if (!n) return { lo: null, hi: null };
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (c - s) / d), hi: Math.min(1, (c + s) / d) };
}

// === PER-MODEL TRACKING — every model evaluated independently, immediately ===
export function perModelDiagnostics(rows) {
  const settled = settledOf(rows);
  const acc = {};
  for (const r of settled) {
    let per = {};
    try { per = JSON.parse(r.models_json || "{}"); } catch { per = {}; }
    const y = r.status === "won" ? 1 : 0;
    Object.entries(per).forEach(([k, p]) => {
      if (!Number.isFinite(p)) return;
      (acc[k] ||= { n: 0, brier: 0, ll: 0, cal: 0, right: 0 });
      const q = clampQ(p);
      acc[k].n++;
      acc[k].brier += (q - y) ** 2;
      acc[k].ll += -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
      acc[k].cal += q - y;
      if ((p > 0.5) === (y === 1)) acc[k].right++; // directional accuracy
    });
  }
  return Object.entries(acc)
    .map(([key, a]) => ({
      key,
      n: a.n,
      brier: r2(a.brier / a.n),
      logLoss: r2(a.ll / a.n),
      calErrPct: Math.round((a.cal / a.n) * 1000) / 10,
      directionalPct: Math.round((a.right / a.n) * 1000) / 10,
    }))
    .sort((a, b) => (a.brier ?? 9) - (b.brier ?? 9));
}

// === RELIABILITY BANDS — predicted probability vs observed frequency (with CI) ===
export function reliabilityBands(rows) {
  const bands = [
    ["50–59%", 0.5, 0.6], ["60–69%", 0.6, 0.7], ["70–79%", 0.7, 0.8],
    ["80–89%", 0.8, 0.9], ["90%+", 0.9, 1.01],
  ];
  return bands.map(([label, lo, hi]) => {
    const list = settledOf(rows).filter((r) => r.calibrated_probability != null && r.calibrated_probability >= lo && r.calibrated_probability < hi);
    const k = list.filter((r) => r.status === "won").length;
    const n = list.length;
    const ci = wilsonCI(k, n);
    return {
      band: label,
      n,
      predictedPct: n ? Math.round((list.reduce((s, r) => s + r.calibrated_probability, 0) / n) * 1000) / 10 : null,
      observedPct: n ? Math.round((k / n) * 1000) / 10 : null,
      ciLoPct: n ? Math.round(ci.lo * 1000) / 10 : null,
      ciHiPct: n ? Math.round(ci.hi * 1000) / 10 : null,
    };
  });
}

// === MODEL DISAGREEMENT RESEARCH — does agreement actually predict success? ===
export function disagreementResearch(rows) {
  const buckets = [
    ["LOW (<75%)", 0, 0.75],
    ["MEDIUM (75–85%)", 0.75, 0.85],
    ["HIGH (85%+)", 0.85, 1.01],
  ];
  return buckets.map(([label, lo, hi]) => {
    const list = settledOf(rows).filter((r) => (r.agreement ?? 0) >= lo && (r.agreement ?? 0) < hi);
    const n = list.length;
    const k = list.filter((r) => r.status === "won").length;
    const brier = n ? r2(list.reduce((s, r) => s + (clampQ(r.calibrated_probability) - (r.status === "won" ? 1 : 0)) ** 2, 0) / n) : null;
    const calErr = n ? Math.round((list.reduce((s, r) => s + clampQ(r.calibrated_probability) - (r.status === "won" ? 1 : 0), 0) / n) * 1000) / 10 : null;
    return {
      bucket: label,
      n,
      winRatePct: n ? Math.round((k / n) * 1000) / 10 : null,
      brier,
      calErrPct: calErr,
    };
  });
}

// === ODDS-RANGE PERFORMANCE — the exact research bands ===
export const ODDS_BANDS = [
  ["1.01–1.49", 1.01, 1.5], ["1.50–1.99", 1.5, 2], ["2.00–2.99", 2, 3],
  ["3.00–3.99", 3, 4], ["4.00–4.99", 4, 5], ["5.00–7.49", 5, 7.5],
  ["7.50–9.99", 7.5, 10], ["10.00+", 10, Infinity],
];

export function oddsRangePerformance(rows) {
  const settled = settledOf(rows).filter((r) => (r.market_odds || 0) > 1);
  return ODDS_BANDS.map(([label, lo, hi]) => {
    const list = settled.filter((r) => r.market_odds >= lo && r.market_odds < hi);
    const n = list.length;
    const k = list.filter((r) => r.status === "won").length;
    const clvList = list.filter((r) => (r.closing_odds || 0) > 1);
    const brier = n ? r2(list.reduce((s, r) => s + (clampQ(r.calibrated_probability) - (r.status === "won" ? 1 : 0)) ** 2, 0) / n) : null;
    const profit = list.reduce((s, r) => s + (r.status === "won" ? 1000 * (r.market_odds - 1) : -1000), 0);
    return {
      band: label,
      n,
      predictedPct: n ? Math.round((list.reduce((s, r) => s + r.calibrated_probability, 0) / n) * 1000) / 10 : null,
      actualPct: n ? Math.round((k / n) * 1000) / 10 : null,
      brier,
      clvAvgPct: clvList.length ? r2(clvList.reduce((s, r) => s + (r.closing_odds / r.market_odds - 1) * 100, 0) / clvList.length) : null,
      clvN: clvList.length,
      paperRoiPct: n ? Math.round((profit / (n * 1000)) * 1000) / 10 : null,
    };
  });
}

// === CLV — computed only where a real T0 price AND a verified closing price both exist ===
export function clvGroups(rows) {
  const withClv = settledOf(rows).filter((r) => (r.market_odds || 0) > 1 && (r.closing_odds || 0) > 1);
  const avg = (list) =>
    list.length ? r2(list.reduce((s, r) => s + (r.closing_odds / r.market_odds - 1) * 100, 0) / list.length) : null;
  const byDim = (dim) =>
    Object.entries(
      withClv.reduce((m, r) => {
        const k = dim(r);
        (m[k] ||= []).push(r);
        return m;
      }, {})
    )
      .map(([key, list]) => ({ key, n: list.length, clvAvgPct: avg(list) }))
      .sort((a, b) => b.n - a.n);
  return {
    computable: withClv.length,
    totalSettled: settledOf(rows).length,
    all: avg(withClv),
    qualifiedOnly: avg(withClv.filter((r) => r.qualified)),
    bigHammer: avg(withClv.filter((r) => (r.market_odds || 0) >= 3)),
    byMarket: byDim((r) => r.canonical_market || r.market_key),
    byLeague: byDim((r) => r.league),
    byOddsBand: byDim((r) => ODDS_BANDS.find(([, lo, hi]) => r.market_odds >= lo && r.market_odds < hi)?.[0] || "—"),
  };
}

// === MARKET / LEAGUE RESTRICTION ENGINES — evidence-based, sample-gated ===
// No market or league is restricted from a small sample; a status only
// changes once the settled evidence supports it.
export function restrictionStatusOf(list) {
  const n = list.length;
  const k = list.filter((r) => r.status === "won").length;
  if (!n) return { n, winRatePct: null, calErrPct: null, brier: null, status: "ACTIVE — no settled sample yet" };
  const calErr = Math.round((list.reduce((s, r) => s + clampQ(r.calibrated_probability) - (r.status === "won" ? 1 : 0), 0) / n) * 1000) / 10;
  const brier = r2(list.reduce((s, r) => s + (clampQ(r.calibrated_probability) - (r.status === "won" ? 1 : 0)) ** 2, 0) / n);
  const winRatePct = Math.round((k / n) * 1000) / 10;
  let status = "ACTIVE";
  if (n < 20) status = "ACTIVE — sample below monitoring threshold (20)";
  else if (n >= 50 && (calErr > 15 || (brier ?? 0) > 0.45)) status = "DISABLED — severe miscalibration on 50+ settled";
  else if (n >= 30 && (calErr > 12 || (brier ?? 0) > 0.35)) status = "RESTRICTED — weak calibration on 30+ settled";
  else if (calErr > 8 || (brier ?? 0) > 0.3) status = "WATCH — calibration drifting";
  return { n, winRatePct, calErrPct: calErr, brier, status };
}

export function marketStatuses(rows) {
  const settled = settledOf(rows);
  const groups = {};
  settled.forEach((r) => {
    const k = r.canonical_market || r.market_key;
    (groups[k] ||= []).push(r);
  });
  return Object.entries(groups)
    .map(([key, list]) => ({ key, ...restrictionStatusOf(list) }))
    .sort((a, b) => b.n - a.n);
}

export function leagueStatuses(rows) {
  const settled = settledOf(rows);
  const groups = {};
  settled.forEach((r) => { (groups[r.league] ||= []).push(r); });
  return Object.entries(groups)
    .map(([key, list]) => ({ key, ...restrictionStatusOf(list) }))
    .sort((a, b) => b.n - a.n);
}

// === LOSS CLUSTER DETECTION — repeated failure patterns, never auto-rewrites ===
// A pattern is reported only with n>=20 settled and a >=10pp deviation; it is
// sent to challenger evaluation, never silently baked into the live model.
export function lossClusters(rows) {
  const settled = settledOf(rows);
  const out = [];
  const dev = (list, label, detail) => {
    if (list.length < 20) return;
    const pred = list.reduce((s, r) => s + clampQ(r.calibrated_probability), 0) / list.length;
    const act = list.filter((r) => r.status === "won").length / list.length;
    if (pred - act >= 0.1) {
      out.push({
        pattern: label,
        n: list.length,
        evidence: `predicted ${Math.round(pred * 100)}% vs actual ${Math.round(act * 100)}% on ${list.length} settled — overconfident by ${Math.round((pred - act) * 100)}pp`,
        detail,
      });
    }
  };
  dev(settled.filter((r) => r.market_key === "2" && (r.market_odds || 0) > 1 && r.market_odds < 2), "REPEATED FAILURE PATTERN DETECTED — Away favorites underperforming", "Challenger candidate: boost home-advantage term or raise the away-win threshold.");
  dev(settled.filter((r) => r.market_key === "O2.5"), "REPEATED FAILURE PATTERN DETECTED — Over 2.5 overconfidence", "Challenger candidate: damp the goal-rate projections toward the league mean.");
  dev(settled.filter((r) => (r.market_odds || 0) >= 3), "REPEATED FAILURE PATTERN DETECTED — 3.00+ selections overestimate probability", "Challenger candidate: stronger longshot haircut on calibrated probability.");
  // per-league and per-model outliers
  const byLeague = {};
  settled.forEach((r) => { (byLeague[r.league] ||= []).push(r); });
  Object.entries(byLeague).forEach(([lg, list]) => dev(list, `REPEATED FAILURE PATTERN DETECTED — ${lg} underperforming`, "Candidate for the league restriction engine once 30+ settle."));
  return out;
}

// === ERROR CLASSIFICATION SUMMARY ===
export function errorClassification(rows) {
  const lost = settledOf(rows).filter((r) => r.status === "lost");
  const counts = {};
  lost.forEach((r) => { const k = r.loss_class || "UNRECORDED"; counts[k] = (counts[k] || 0) + 1; });
  return { lostTotal: lost.length, counts };
}

// === KALA EVIDENCE LEVEL (0–5) — never implied above what data supports ===
export function evidenceLevel(rows, promotionEligible = false) {
  const n = settledOf(rows).length;
  if (n === 0) return { level: 0, label: "LEVEL 0 — no settled sample", note: "Nothing is proven yet. Observations are being collected." };
  if (n < 10) return { level: 1, label: `LEVEL 1 — early observations (${n} settled)`, note: "Measurement has started; no reliability claim is possible." };
  if (n < 40) return { level: 2, label: `LEVEL 2 — initial calibration (${n} settled)`, note: "First calibration curves are forming; weights stay baseline." };
  if (n < 100) return { level: 3, label: `LEVEL 3 — meaningful sample (${n} settled)`, note: "Learned weights are now permitted; promotion still requires 100+ out-of-sample rows." };
  if (!promotionEligible) return { level: 4, label: `LEVEL 4 — strong out-of-sample evidence (${n} settled)`, note: "Champion/challenger evaluation is live on a full sample." };
  return { level: 5, label: `LEVEL 5 — long-term validated (${n} settled)`, note: "Sustained out-of-sample validation." };
}

// === CLOSING-CAPTURE HEALTH — what the scheduled capture actually achieved ===
export function closingSummary(rows) {
  const open = (Array.isArray(rows) ? rows : []).filter((r) => r.status === "open");
  const counts = {};
  open.forEach((r) => { const k = r.capture_status || "pending"; counts[k] = (counts[k] || 0) + 1; });
  const withClosing = (Array.isArray(rows) ? rows : []).filter((r) => (r.closing_odds || 0) > 1).length;
  const due = open.filter((r) => new Date(r.kickoff).getTime() > Date.now());
  return { openWithKickoffAhead: due.length, captureStatusCounts: counts, rowsWithClosingPrice: withClosing };
}