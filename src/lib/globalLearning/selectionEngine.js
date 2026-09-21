// SELECTION INTELLIGENCE ENGINE — the quality layer ABOVE the verified
// promotion pipeline. The Champion/Challenger/OOS/promotion/registry chain is
// untouched; this module takes recorded candidates and answers one question:
// "Which of these does the engine responsibly stand behind TODAY?"
//
// Design rules (never violated):
//  - PURE functions only — no I/O, no mutation of inputs, no future data.
//    Scores use exclusively pre-kickoff fields recorded at generation time.
//  - NO PICK is a first-class outcome, better than a weak pick.
//  - Composite scoring is MULTIPLICATIVE and evidence-weighted (a single weak
//    supporting factor genuinely hurts), never a naive average.
//  - Segment reliability uses empirical-Bayes shrinkage: a small sample can
//    never swing the estimate — it shrinks toward the neutral prior.
//  - Thresholds come from validation data where the sample justifies it, and
//    otherwise from explicitly-labelled conservative defaults.
//  - Probability is never certainty. There is no such thing as a sure win —
//    the board is the engine's highest-caliber selections, honestly labelled.

export const SURE_WIN_PROBABILITY = 0.83; // calibrated-probability entry floor for the high-confidence board
export const SURE_WIN_MAX_PICKS = 20; // the board never shows more than this
export const MIN_SEGMENT_SAMPLE = 10; // below this a segment is INSUFFICIENT EVIDENCE, never trusted
export const SHRINKAGE_K = 20; // shrinkage strength toward the neutral prior
export const MIN_HEALTH_SAMPLE = 30; // model-health verdicts arm only at this settled sample
export const MIN_BUCKET_SAMPLE = 30; // validation bucket must hold this before it sets a threshold

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (v) => Math.round(clamp(v, 0, 1) * 1000) / 10;

// ---------------------------------------------------------------------------
// Normalization — one candidate shape from every qualified prediction surface.
export function normalizeCandidate(raw, source) {
  return {
    source,
    fixture_id: raw.fixture_id || "",
    home: raw.home || "",
    away: raw.away || "",
    league: raw.league || "",
    league_code: raw.league_code || "",
    kickoff: raw.kickoff || "",
    recorded_at: raw.recorded_at || "",
    market_key: raw.market_key || "",
    market_label: raw.market_label || "",
    calibrated: raw.calibrated_probability ?? raw.probability ?? 0,
    confidence: raw.confidence ?? 0,
    agreement: raw.agreement ?? 1,
    uncertainty: raw.uncertainty ?? 0,
    data_quality: raw.data_quality || "",
    market_odds: raw.market_odds || 0,
    odds_status: raw.odds_status || "",
    models_unavailable: raw.models_unavailable || "",
    capture_status: raw.capture_status || "",
    injury_status: raw.injury_status || "",
    lineup_status: raw.lineup_status || "",
    flags_json: raw.flags_json || raw.risk_flags_json || "[]",
    model_version: raw.model_version || "",
    qualified: raw.qualified ?? true,
    reject_reason: raw.reject_reason || "",
    candidate_id: raw.prediction_key || raw.monster_id || raw.id || "",
    lagos_date_key: raw.lagos_date_key || "",
  };
}

// ---------------------------------------------------------------------------
// STAGE 6 — DATA HEALTH. Blockers are integrity failures (never recommend);
// penalties are honest weaknesses that lower the health score.
export function dataHealthOf(cand, nowMs = Date.now()) {
  const blockers = [];
  const notes = [];
  let penalty = 0;
  const ko = cand.kickoff ? Date.parse(cand.kickoff) : NaN;
  const rec = cand.recorded_at ? Date.parse(cand.recorded_at) : NaN;
  if (!Number.isFinite(ko)) blockers.push("no kickoff time on record — identity incomplete");
  else if (ko <= nowMs) blockers.push("kickoff already passed — not actionable");
  if (!Number.isFinite(rec)) blockers.push("no record timestamp — provenance missing");
  else if (Number.isFinite(ko) && rec >= ko) blockers.push("recorded at/after kickoff — possible data leakage");

  const dq = String(cand.data_quality || "").toUpperCase();
  if (dq === "LOW") blockers.push("LOW data quality on record");
  else if (dq === "MEDIUM") { penalty += 8; notes.push("MEDIUM data quality"); }

  let flags = [];
  try { flags = JSON.parse(cand.flags_json || "[]"); } catch { flags = []; }
  const isBlock = (f) =>
    typeof f === "string" ? f.toUpperCase().includes("BLOCK")
      : !!(f && String(f.severity || f.level || "").toUpperCase().includes("BLOCK"));
  if (flags.some(isBlock)) blockers.push("blocking red flag recorded at prediction time");
  const warnCount = flags.filter((f) => !isBlock(f)).length;
  if (warnCount) { penalty += Math.min(8, warnCount * 4); notes.push(`${warnCount} risk flag(s) recorded`); }

  if (String(cand.odds_status) !== "priced") { penalty += 8; notes.push("no real market price to cross-check (model-only)"); }
  if (cand.models_unavailable) { penalty += 6; notes.push("some voting models unavailable"); }
  if (!cand.injury_status) { penalty += 5; notes.push("injury data UNKNOWN — never assumed zero"); }
  if (!["confirmed"].includes(String(cand.lineup_status))) { penalty += 5; notes.push("lineup unconfirmed"); }
  if (String(cand.capture_status).startsWith("failed")) { penalty += 3; notes.push("closing-price capture failed (recorded, not fabricated)"); }

  const score = clamp(100 - penalty, 0, 100);
  return { score, status: blockers.length ? "BLOCKED" : score >= 70 ? "OK" : "WEAK", blockers, notes, dataTimestamp: cand.recorded_at };
}

// ---------------------------------------------------------------------------
// STAGE 4 — SEGMENT INTELLIGENCE. LearningCycleReport.feature_evidence_json
// carries the evidence-gated segment table; reliability is the observed/expected
// ratio SHRUNK toward neutral by sample size.
export function segmentEvidenceMap(report) {
  const map = new Map();
  if (!report?.feature_evidence_json) return map;
  let rows = [];
  try { rows = JSON.parse(report.feature_evidence_json); } catch { return map; }
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.dim || r.value == null) continue;
    map.set(`${r.dim}|${String(r.value).toLowerCase()}`, r);
  }
  return map;
}

export function segmentFactorFor(map, dim, value) {
  const row = map.get(`${dim}|${String(value).toLowerCase()}`);
  if (!row || !Number(row.sample) || row.sample < MIN_SEGMENT_SAMPLE) {
    // absence of evidence is NEUTRAL (never a penalty, never a boost) — it
    // simply withholds ELITE certification until evidence exists.
    return { factor: 1, evidence: false, label: `${dim} ${value}: INSUFFICIENT EVIDENCE — neutral, ELITE withheld` };
  }
  const expected = Number(row.expected_pct) || 0;
  const actual = Number(row.actual_pct) || 0;
  const ratio = expected > 0 ? actual / expected : 1;
  const shrunk = (row.sample * ratio + SHRINKAGE_K) / (row.sample + SHRINKAGE_K); // empirical-Bayes shrinkage toward 1
  return { factor: clamp(shrunk, 0.7, 1.1), evidence: true, label: `${dim} ${value}: n=${row.sample}, observed ${actual}% vs expected ${expected}%` };
}

export function candidateSegmentFactors(cand, map) {
  const parts = [
    segmentFactorFor(map, "market", cand.market_key),
    segmentFactorFor(map, "league", cand.league),
    segmentFactorFor(map, "section", cand.source),
  ];
  const factor = clamp(parts.reduce((p, s) => p * s.factor, 1), 0.6, 1.15);
  return {
    factor,
    evidence: parts.some((s) => s.evidence),
    labels: parts.map((s) => s.label),
  };
}

// ---------------------------------------------------------------------------
// STAGE 15 — MODEL HEALTH. Verdicts arm only at MIN_HEALTH_SAMPLE settled
// events; a handful of unlucky games can never demote a model.
export function modelHealthOf(events, { rollingWindow = 20, minSample = MIN_HEALTH_SAMPLE } = {}) {
  const m = (rows) => {
    const n = rows.length;
    if (!n) return { n: 0, brier: 0, hit_rate_pct: 0, avg_predicted_pct: 0 };
    let brier = 0;
    let hits = 0;
    let pred = 0;
    for (const e of rows) {
      const p = clamp(Number(e.predicted_probability) || 0, 0, 1);
      const y = e.outcome === "won" ? 1 : 0;
      brier += (p - y) ** 2;
      hits += y;
      pred += p;
    }
    return { n, brier: brier / n, hit_rate_pct: (hits / n) * 100, avg_predicted_pct: (pred / n) * 100 };
  };
  const longTerm = m(events);
  const rolling = m(events.slice(0, rollingWindow));
  if (longTerm.n < minSample) {
    return { verdict: `BASELINE BUILDING — ${longTerm.n} settled events (< ${minSample}); no deterioration verdict possible, honestly not alarmed`, healthFactor: 1, rolling, longTerm };
  }
  const overconfident = rolling.hit_rate_pct < rolling.avg_predicted_pct - 10;
  const ratio = longTerm.brier > 0 ? rolling.brier / longTerm.brier : 1;
  let verdict = "STABLE — rolling performance within normal variance of long-term";
  let healthFactor = 1;
  if (ratio > 1.3) { verdict = `DETERIORATING — rolling Brier ${Math.round((ratio - 1) * 100)}% worse than long-term`; healthFactor = 0.9; }
  else if (ratio < 0.75) { verdict = "IMPROVING — rolling performance better than long-term"; }
  if (overconfident) { verdict += " · OVERCONFIDENT — observed hit rate materially below predicted"; healthFactor = Math.min(healthFactor, 0.9); }
  return { verdict, healthFactor, rolling, longTerm };
}

// ---------------------------------------------------------------------------
// STAGE 5/9 — REGIME. Distinguishes "model got worse" from "environment
// changed" using the learning cycle's drift verdict plus model health.
export function regimeOf({ driftVerdict = "", healthVerdict = "" } = {}) {
  const t = `${driftVerdict} ${healthVerdict}`.toUpperCase();
  // word-boundary match, never a bare substring — "not ALARMED" and
  // "no DRIFT ALARMS yet" must never read as an active drift alarm
  const disrupted = [
    /\bDRIFT ALARM\b/, /\bALARM DETECTED\b/, /\bDRIFT DETECTED\b/, /\bALARM —/,
    /\bDISRUPTED\b/, /\bDISRUPTION\b/,
  ].some((re) => re.test(t));
  if (disrupted) {
    return { status: "DISRUPTED", factor: 0.75, note: "regime shift detected — confidence reduced, evidence requirements raised" };
  }
  if (t.includes("DETERIORATING") || t.includes("OVERCONFIDENT") || t.includes("CAUTION") || t.includes("BUILDING")) {
    return { status: "CAUTION", factor: 0.9, note: "early-warning signals present — engine is more selective" };
  }
  return { status: "STABLE", factor: 1, note: "no regime-shift signals" };
}

// ---------------------------------------------------------------------------
// STAGE 14 — THRESHOLDS. Derived from the validation reliability curve when a
// bucket holds MIN_BUCKET_SAMPLE settled events; otherwise explicitly-labelled
// conservative defaults. Never arbitrary in either case.
export function deriveThresholds(report) {
  // Quality is a SUPPORTED-probability estimate (calibrated × evidence
  // support), so the floors sit on that scale: conservative defaults that a
  // well-supported 86% candidate clears, pending validation-derived values.
  const thresholds = {
    elite: 0.73, strong: 0.68, lean: 0.58,
    eliteMinCalibrated: SURE_WIN_PROBABILITY,
    derivedFrom: "conservative defaults — validation buckets below the minimum sample",
  };
  if (!report?.evaluation_json) return thresholds;
  let evalJson = null;
  try { evalJson = JSON.parse(report.evaluation_json); } catch { return thresholds; }
  const models = evalJson?.models_all || {};
  for (const stats of Object.values(models)) {
    const bucket = (stats?.buckets || []).find((b) => b.bucket === "80-90%" && Number(b.n) >= MIN_BUCKET_SAMPLE);
    if (bucket && Number(bucket.actual_pct) > 0) {
      thresholds.elite = clamp(bucket.actual_pct / 100 - 0.05, 0.75, 0.95); // observed hit rate minus a safety margin
      thresholds.derivedFrom = `derived from the validated 80-90% reliability bucket (n=${bucket.n}, observed ${bucket.actual_pct}%) minus a 5pp safety margin`;
      break;
    }
  }
  return thresholds;
}

// ---------------------------------------------------------------------------
// STAGE 1/12/19 — COMPOSITE QUALITY SCORE + RECOMMENDATION.
// Multiplicative, evidence-weighted: quality = calibrated probability ×
// agreement × data-health × segment-reliability × (1−uncertainty) ×
// regime × model-health. A 90% prediction from unreliable data therefore
// does NOT outrank a well-supported 78% prediction.
export function scoreCandidate(cand, ctx) {
  const health = dataHealthOf(cand, ctx.now);
  const calibrated = clamp(Number(cand.calibrated) || 0, 0, 1);
  const out = {
    candidate: { ...cand },
    calibrated,
    health,
    dataTimestamp: cand.recorded_at,
  };
  if (health.status === "BLOCKED") {
    return { ...out, quality: 0, recommendationStatus: "BLOCKED", reasons: health.blockers, segment: null };
  }
  const agreement = clamp(Number.isFinite(Number(cand.agreement)) ? Number(cand.agreement) : 1, 0, 1);
  const uncertainty = clamp(Number(cand.uncertainty) || 0, 0, 1);
  const fAgree = 0.55 + 0.45 * agreement; // disagreement genuinely hurts
  const fHealth = 0.5 + 0.5 * (health.score / 100);
  const seg = candidateSegmentFactors(cand, ctx.segments);
  const fUnc = 1 - 0.8 * uncertainty;
  const quality = clamp(calibrated * fAgree * fHealth * seg.factor * fUnc * ctx.regime.factor * ctx.health.healthFactor, 0, 1);
  return { ...out, quality, uncertainty, agreement, segment: seg, recommendationStatus: null, reasons: [] };
}

// Uncertainty raises the bar: the engine becomes MORE selective as
// uncertainty rises (effective floors scale up), never less.
const effectiveFloor = (floor, uncertainty) => floor * (1 + 0.25 * clamp(uncertainty || 0, 0, 1));

export function recommendationOf(scored, thresholds) {
  if (scored.recommendationStatus === "BLOCKED") return scored;
  const { calibrated, quality, uncertainty = 0, health, segment } = scored;
  const reasons = [];
  if (calibrated >= SURE_WIN_PROBABILITY) reasons.push(`${pct(calibrated)}% calibrated probability — above the ${Math.round(SURE_WIN_PROBABILITY * 100)}% board floor`);
  if (scored.agreement >= 0.85) reasons.push("strong model consensus recorded pre-kickoff");
  if (health.status === "OK") reasons.push(`data health ${health.score}/100 — no integrity blockers`);
  if (segment?.evidence) reasons.push(segment.labels.find((l) => !l.includes("INSUFFICIENT")) || "validated segment evidence");
  if (scored.ctxRegime === "STABLE") reasons.push("stable regime — no drift or deterioration signals");
  if (String(scored.candidate.odds_status) === "priced") reasons.push("real bookmaker price on record (market cross-check)");
  const effElite = effectiveFloor(thresholds.elite, uncertainty);
  const effStrong = effectiveFloor(thresholds.strong, uncertainty);
  const effLean = effectiveFloor(thresholds.lean, uncertainty);

  if (quality >= effElite && calibrated >= thresholds.eliteMinCalibrated && segment?.evidence && scored.ctxRegime === "STABLE" && health.status === "OK") {
    return { ...scored, recommendationStatus: "ELITE_PICK", reasons };
  }
  if (quality >= effStrong && calibrated >= 0.75) {
    return { ...scored, recommendationStatus: "STRONG_PICK", reasons: reasons.length ? reasons : ["quality above the strong floor with sufficient calibrated support"] };
  }
  if (quality >= effLean) {
    return { ...scored, recommendationStatus: "LEAN", reasons: ["potentially useful, but meaningful uncertainty remains"] };
  }
  return {
    ...scored,
    recommendationStatus: "NO_PICK",
    reasons: [`quality score ${pct(quality)} below the effective selection floor ${pct(effLean)} (uncertainty-adjusted) — the engine prefers NO PICK over a weak pick`],
  };
}

// ---------------------------------------------------------------------------
// STAGE 13 — CORRELATION CONTROL. Correlated selections are flagged and never
// counted as independent confirmations.
export function correlationGroups(picks) {
  const byFixture = new Map();
  for (const p of picks) {
    const k = p.candidate.fixture_id || `${p.candidate.home}|${p.candidate.away}`;
    if (!byFixture.has(k)) byFixture.set(k, []);
    byFixture.get(k).push(p);
  }
  const byLeague = new Map();
  for (const p of picks) byLeague.set(p.candidate.league, (byLeague.get(p.candidate.league) || 0) + 1);
  const concentrated = [...byLeague.entries()].filter(([, n]) => n >= 6).map(([l]) => l);
  return picks.map((p) => {
    const group = byFixture.get(p.candidate.fixture_id || `${p.candidate.home}|${p.candidate.away}`);
    if (group.length > 1) {
      return { ...p, correlation: { risk: "HIGH", note: `same fixture as ${group.length - 1} other board pick(s) — correlated, NOT independent confirmations` } };
    }
    if (concentrated.includes(p.candidate.league)) {
      return { ...p, correlation: { risk: "MEDIUM", note: `board is concentrated in ${p.candidate.league} — treat cluster risk honestly` } };
    }
    return { ...p, correlation: { risk: "LOW", note: "" } };
  });
}

// ---------------------------------------------------------------------------
// STAGE 12/19 — THE SELECTION PIPELINE. Score every candidate, gate the board
// at the 83% calibrated floor + ELITE/STRONG quality tier, rank by composite
// evidence score, cap at SURE_WIN_MAX_PICKS, report rejections honestly.
export function rankAndSelect(candidates, ctx) {
  const scored = candidates.map((c) => {
    const s = scoreCandidate(c, ctx);
    return recommendationOf({ ...s, ctxRegime: ctx.regime.status }, ctx.thresholds);
  });
  const byStatus = {};
  for (const s of scored) byStatus[s.recommendationStatus] = (byStatus[s.recommendationStatus] || 0) + 1;
  const boardPool = scored.filter((s) =>
    s.calibrated >= SURE_WIN_PROBABILITY && ["ELITE_PICK", "STRONG_PICK"].includes(s.recommendationStatus));
  boardPool.sort((a, b) => b.quality - a.quality);
  const picks = correlationGroups(boardPool.slice(0, SURE_WIN_MAX_PICKS)).map((p, i) => ({ ...p, rank: i + 1 }));
  const rejectionReasons = scored
    .filter((s) => !picks.some((p) => p.candidate.fixture_id === s.candidate.fixture_id && p.candidate.market_key === s.candidate.market_key))
    .map((s) => {
      if (s.recommendationStatus === "BLOCKED") return "BLOCKED — data/model integrity prevents a responsible recommendation";
      if (s.recommendationStatus === "NO_PICK") return "NO PICK — below the uncertainty-adjusted selection floor";
      if (s.recommendationStatus === "LEAN") return "LEAN — quality present but below the 83% board standard";
      if (s.calibrated < SURE_WIN_PROBABILITY) return `calibrated probability ${pct(s.calibrated)}% below the ${Math.round(SURE_WIN_PROBABILITY * 100)}% board floor`;
      return "qualified but outside the top " + SURE_WIN_MAX_PICKS;
    })
    .reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {});
  return {
    picks,
    scored,
    stats: {
      seen: scored.length,
      onBoard: picks.length,
      byStatus,
      rejectionReasons: Object.entries(rejectionReasons).map(([label, count]) => ({ label, count })),
    },
  };
}