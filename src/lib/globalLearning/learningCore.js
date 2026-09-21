// LEARNING CORE — the pure, single-source-of-truth logic of the RIDE X
// self-learning loop. This file exists in TWO BYTE-IDENTICAL COPIES required
// by the platform: src/lib/globalLearning/learningCore.js (imported by the
// automated regression tests, src/__tests__/learningLoop.test.js) and
// base44/shared/learningCore.ts (imported by the server-side learning-cycle
// function). The parity test in learningLoop.test.js FAILS the suite if the
// copies ever drift — never edit one without the other.
//
// Scientific rule enforced here: nothing in this module ever fabricates
// evidence. Samples under their thresholds are reported as INSUFFICIENT,
// never forced; attribution that the pre-kickoff data cannot support stays
// UNATTRIBUTED; a promotion happens only on chronological OOS evidence.

export const CHAMPION_DEFAULT = "RX-2.0";
export const CHALLENGER_DEFAULT = "RX-2.1";
export const MIN_INSIGHT_SAMPLE = 10;
export const MIN_CALIBRATION_SAMPLE = 100;
export const MIN_OOS_PROMOTION = 50;
export const TRAIN_FRACTION = 0.7;

export const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
export const r4 = (x) => Math.round((Number(x) || 0) * 10000) / 10000;

export function marketFamilyOf(mk) {
  const k = String(mk || "");
  if (["1", "X", "2"].includes(k)) return "1x2";
  if (["1X", "X2", "12"].includes(k)) return "double_chance";
  if (k.startsWith("DNB")) return "draw_no_bet";
  if (k.startsWith("O") || k.startsWith("U")) return "over_under";
  if (k.startsWith("BTTS")) return "btts";
  if (k.startsWith("AH") || k.startsWith("THO")) return "handicap_team_goals";
  return "other";
}
export function probBucketOf(p) {
  const v = Number(p) || 0;
  return v < 0.6 ? "<60%" : v < 0.7 ? "60-70%" : v < 0.8 ? "70-80%" : v < 0.9 ? "80-90%" : "90%+";
}
export function confBucketOf(c) {
  const v = Number(c) || 0;
  return v < 60 ? "<60" : v < 70 ? "60-70" : v < 80 ? "70-80" : v < 90 ? "80-90" : "90+";
}
export function oddsBandOf(o) {
  const v = Number(o) || 0;
  return v <= 0 ? "UNPRICED" : v < 1.5 ? "1.01-1.49" : v < 2 ? "1.50-1.99" : v < 3 ? "2.00-2.99" : v < 4 ? "3.00-3.99" : "4.00+";
}
export function edgeBucketOf(e) {
  const v = Number(e) || 0;
  return v >= 8 ? "STRONG EDGE 8pp+" : v >= 4 ? "EDGE 4-8pp" : v > 0 ? "SMALL EDGE 0-4pp" : v <= -4 ? "NEGATIVE 4pp+" : v < 0 ? "NEGATIVE 0-4pp" : "NO EDGE";
}
export function agreementBucketOf(a) {
  if (a == null || a === "") return "unknown";
  const v = Number(a);
  return v >= 0.9 ? "HIGH >=0.90" : v >= 0.75 ? "MEDIUM 0.75-0.90" : "LOW <0.75";
}
export const evidenceLevelOf = (n) => (n >= 100 ? 3 : n >= 30 ? 2 : 1);

// === EVENT IDENTITY =========================================================
// Deterministic idempotency key. The global_prediction_id already encodes
// prediction identity + selection identity (source|model|fixture|market|vN),
// and an outcome row is created exactly once per prediction with an immutable
// single settlement — so key = prediction_id + selection_id + settlement by
// construction. Re-keying would re-count every already-counted event.
export function eventKeyOf(globalPredictionId) {
  return `learn|${globalPredictionId}`;
}

// === ELIGIBILITY ============================================================
// VOID/PUSH/CANCELLED never train; an unusable probability is reported, never
// forced into the training set.
export function classifyOutcome(o) {
  const s = String(o?.settlement || "");
  if (!["won", "lost"].includes(s)) {
    return { eligible: false, reason: `${s || "unset"} — never trains the model by definition` };
  }
  const p = Number(o?.predicted_probability);
  if (!Number.isFinite(p) || p <= 0 || p >= 1) {
    return { eligible: false, reason: "no usable predicted probability on record — not forced into training" };
  }
  return { eligible: true, reason: "" };
}

// === ERROR / WIN FORENSICS ==================================================
// Evidence-based attribution computed ONLY from the frozen pre-kickoff
// features plus the graded outcome. When the recorded features cannot support
// a cause, the classification stays INSUFFICIENT EVIDENCE — never invented.
export function errorForensicsOf({ outcome, agreement, uncertainty, data_quality, market_odds, edge_pct, clv_pct }) {
  const dq = String(data_quality || "");
  const agree = Number(agreement ?? 1);
  const unc = Number(uncertainty ?? 0);
  const priced = Number(market_odds || 0) > 1;
  const edge = Number(edge_pct || 0);
  const clv = Number(clv_pct || 0);
  if (outcome === "won") {
    const factors = [];
    if (agree >= 0.85) factors.push(`high pre-kickoff model consensus (${Math.round(agree * 100)}%)`);
    if (dq === "HIGH") factors.push("HIGH pre-kickoff data quality");
    if (clv > 0) factors.push(`positive closing-line value (+${clv}%) — the market moved toward the pick`);
    return {
      classification: "SUPPORTED — supporting factors were present pre-kickoff",
      basis: factors.length ? factors.join(" · ") : "no distinctive pre-kickoff strength recorded",
      generalization: "single observation — generalizes only through segment evidence with sufficient sample",
      evidence_level: 1,
    };
  }
  if (dq === "LOW") {
    return {
      classification: "FEATURE/DATA FAILURE — LOW data quality was recorded before kickoff",
      basis: "data quality was LOW at record time — the feature inputs themselves were weak before the match",
      evidence_level: 2,
    };
  }
  if (agree < 0.75) {
    return {
      classification: "MODEL DISAGREEMENT — the voting models diverged before kickoff",
      basis: `model agreement was only ${Math.round(agree * 100)}% at record time — high probability with low consensus is a known failure pattern`,
      evidence_level: 2,
    };
  }
  if (unc > 0.5) {
    return {
      classification: "OVERCONFIDENCE / CALIBRATION ERROR — high stated probability despite high recorded uncertainty",
      basis: `uncertainty ${Math.round(unc * 100)}% was recorded pre-kickoff alongside the stated probability`,
      evidence_level: 2,
    };
  }
  if (priced && clv < -8) {
    return {
      classification: "MARKET MOVEMENT — the closing line moved materially against the pick",
      basis: `CLV ${clv}% (negative) — the verified closing price disagreed with the recorded price`,
      evidence_level: 2,
    };
  }
  if (priced && edge <= 0) {
    return {
      classification: "MARKET DISAGREEMENT — the recorded pre-kickoff price carried no edge",
      basis: `edge ${edge}pp vs the recorded price at record time — the market never agreed with the estimate`,
      evidence_level: 2,
    };
  }
  return {
    classification: "INSUFFICIENT EVIDENCE — single-match variance cannot be attributed from the recorded features",
    basis: "no pre-kickoff red flag was recorded; rich attribution needs lineup/xG/game-state data",
    evidence_level: 1,
  };
}

// === LEARNING EVENT BUILD ===================================================
// Pure: builds exactly one canonical event row from an eligible outcome and
// its canonical prediction. Never mutates the inputs (immutability of the
// original prediction is preserved by construction). The features digest is
// strictly the pre-kickoff snapshot; forensics are stored separately.
export function buildLearningEvent(o, pred, { now, batch } = {}) {
  const p = pred || {};
  const forensics = errorForensicsOf({
    outcome: o.settlement,
    agreement: p.agreement ?? 1,
    uncertainty: p.uncertainty ?? 0,
    data_quality: o.data_quality || p.data_quality || "",
    market_odds: o.market_odds ?? p.market_odds ?? 0,
    edge_pct: o.edge_pct ?? p.edge_pct ?? 0,
    clv_pct: o.clv_pct ?? 0,
  });
  return {
    event_key: eventKeyOf(o.global_prediction_id),
    global_prediction_id: o.global_prediction_id,
    prediction_row_id: p.id || "",
    source_section: o.source_section,
    model_version: o.model_version || p.model_version || "unknown",
    learning_version: p.learning_version || "L-000",
    fixture_id: p.fixture_id || "",
    home: o.home || "",
    away: o.away || "",
    league: o.league || "",
    market_key: o.market_key || "",
    market_label: o.market_label || p.market_label || "",
    kickoff: p.kickoff || "",
    predicted_at: p.recorded_at || "",
    settled_at: o.settled_at || "",
    counted_at: now || "",
    predicted_probability: o.predicted_probability,
    predicted_class: o.market_key || "",
    confidence: o.confidence ?? p.confidence ?? 0,
    kala_score: p.kala_score ?? 0,
    grade: p.grade || "",
    market_odds: o.market_odds ?? p.market_odds ?? 0,
    bookmaker: p.bookmaker || "",
    fair_odds: o.fair_odds ?? p.fair_odds ?? 0,
    edge_pct: o.edge_pct ?? p.edge_pct ?? 0,
    adjusted_edge_pct: o.adjusted_edge_pct ?? p.adjusted_edge_pct ?? 0,
    ev_pct: p.ev_pct ?? 0,
    odds_status: p.odds_status || "",
    final_home: o.final_home ?? 0,
    final_away: o.final_away ?? 0,
    outcome: o.settlement,
    verification_source: o.verification_source || "",
    result_source: o.result_source || "",
    features_json: JSON.stringify({
      probability: o.predicted_probability,
      confidence: o.confidence ?? null,
      kala_score: p.kala_score ?? null,
      grade: p.grade || "",
      agreement: p.agreement ?? null,
      uncertainty: p.uncertainty ?? null,
      data_quality: o.data_quality || p.data_quality || "",
      market_odds: o.market_odds ?? null,
      fair_odds: o.fair_odds ?? null,
      edge_pct: o.edge_pct ?? null,
      adjusted_edge_pct: o.adjusted_edge_pct ?? null,
      ev_pct: p.ev_pct ?? null,
      clv_pct: o.clv_pct ?? null,
      market_probability: p.market_probability ?? null,
      margin_probability: p.margin_probability ?? null,
      injury_status: o.injury_state || p.injury_status || "",
      lineup_status: o.lineup_state || p.lineup_status || "",
      model_disagreement: o.model_disagreement ?? null,
      session: p.session || "",
      big_hammer: p.big_hammer ?? false,
    }),
    forensics_json: JSON.stringify(forensics),
    agreement: p.agreement ?? 1,
    uncertainty: p.uncertainty ?? 0,
    data_quality: o.data_quality || p.data_quality || "",
    injury_state: o.injury_state || "",
    lineup_state: o.lineup_state || "",
    clv_pct: o.clv_pct ?? 0,
    learning_batch: batch || "",
    status: "counted",
  };
}

// Retry-safe selection: outcomes whose event already exists (from a prior or
// interrupted run) are never re-created — reprocessing counts nothing twice.
export function selectEventsToCreate(eligible, priorEvents, predByKey, ctx) {
  const existingKeys = new Set((priorEvents || []).map((e) => e.event_key));
  const toCreate = [];
  const duplicatesPrevented = [];
  for (const o of eligible || []) {
    const key = eventKeyOf(o.global_prediction_id);
    if (existingKeys.has(key) || toCreate.some((e) => e.event_key === key)) {
      duplicatesPrevented.push(key);
      continue;
    }
    const pred = predByKey ? predByKey.get?.(o.global_prediction_id) : null;
    toCreate.push(buildLearningEvent(o, pred || {}, ctx));
  }
  return { toCreate, duplicatesPrevented };
}

// === METRICS ================================================================
// Probability-quality metrics over counted events (y: won=1, lost=0).
export function metricsOf(evts) {
  const n = (evts || []).length;
  if (!n) return { n: 0, brier: null, logloss: null, hit_rate_pct: null, avg_predicted_pct: null, ece_pp: null, buckets: [] };
  const defs = [["<60%", 0, 0.6], ["60-70%", 0.6, 0.7], ["70-80%", 0.7, 0.8], ["80-90%", 0.8, 0.9], ["90%+", 0.9, 1.01]];
  const buckets = defs.map(([label]) => ({ bucket: label, n: 0, avg_predicted_pct: 0, actual_pct: null }));
  let brier = 0;
  let ll = 0;
  let hit = 0;
  let prob = 0;
  for (const e of evts) {
    const y = e.outcome === "won" ? 1 : 0;
    const p = Math.min(0.99, Math.max(0.01, Number(e.predicted_probability) || 0.5));
    brier += (p - y) * (p - y);
    ll += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    hit += y;
    prob += p;
    const idx = defs.findIndex(([, lo, hi]) => p >= lo && p < hi);
    if (idx >= 0) {
      buckets[idx].n++;
      buckets[idx].pSum = (buckets[idx].pSum || 0) + p;
      buckets[idx].ySum = (buckets[idx].ySum || 0) + y;
    }
  }
  let ece = 0;
  for (const b of buckets) {
    if (b.n) {
      b.avg_predicted_pct = r2((b.pSum / b.n) * 100);
      b.actual_pct = r2((b.ySum / b.n) * 100);
      ece += (b.n / n) * Math.abs(b.ySum / b.n - b.pSum / b.n);
    }
    delete b.pSum;
    delete b.ySum;
  }
  return {
    n,
    brier: r4(brier / n),
    logloss: r4(ll / n),
    hit_rate_pct: r2((hit / n) * 100),
    avg_predicted_pct: r2((prob / n) * 100),
    ece_pp: r2(ece * 100),
    buckets,
  };
}

// === FEATURE EVIDENCE =======================================================
// Per-segment evidence with sample-gated verdicts — never forced.
export function segmentEvidence(evts) {
  const dims = [
    ["section", (e) => e.source_section || "unknown", "SECTION"],
    ["market_family", (e) => marketFamilyOf(e.market_key), "MARKET"],
    ["league", (e) => e.league || "unknown", "COMPETITION"],
    ["model", (e) => e.model_version || "unknown", "MODEL"],
    ["prob_bucket", (e) => probBucketOf(e.predicted_probability), null],
    ["conf_bucket", (e) => confBucketOf(e.confidence), null],
    ["odds_band", (e) => oddsBandOf(e.market_odds), null],
    ["value_bucket", (e) => edgeBucketOf(e.edge_pct), null],
    ["data_quality", (e) => e.data_quality || "unknown", null],
    ["agreement", (e) => agreementBucketOf(e.agreement), null],
  ];
  const rows = [];
  for (const [dim, fn] of dims) {
    const groups = new Map();
    for (const e of evts) {
      const v = String(fn(e) || "unknown");
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v).push(e);
    }
    for (const [value, list] of groups) {
      const expected = (list.reduce((s, e) => s + (Number(e.predicted_probability) || 0), 0) / list.length) * 100;
      const actual = (list.filter((e) => e.outcome === "won").length / list.length) * 100;
      const gap = actual - expected;
      const verdict =
        list.length < 5 ? "INSUFFICIENT SAMPLE" : Math.abs(gap) <= 5 ? "WELL CALIBRATED" : gap < 0 ? "OVERCONFIDENT" : "UNDERCONFIDENT";
      rows.push({
        dim,
        value,
        sample: list.length,
        expected_pct: r2(expected),
        actual_pct: r2(actual),
        gap_pp: r2(gap),
        verdict,
        sections: [...new Set(list.map((e) => e.source_section))].join(","),
      });
    }
  }
  return rows;
}

// === CALIBRATION STATUS =====================================================
// The honest gate: under the sample floor, calibration is OBSERVED but never
// promoted. The method choice (isotonic / Platt / empirical) is decided only
// at review time, on out-of-sample evidence — never the most complicated one
// by default.
export function calibrationStatusOf(n, minSample = MIN_CALIBRATION_SAMPLE) {
  if (n < minSample) {
    return {
      status: "INSUFFICIENT EVIDENCE — CALIBRATION OBSERVED BUT NOT PROMOTED",
      note: `Recalibration requires ${minSample}+ settled events (currently ${n}). Metrics are recorded honestly; no production recalibration is applied from this sample.`,
    };
  }
  return {
    status: "CALIBRATION OBSERVED — SAMPLE SUPPORTS RECALIBRATION REVIEW",
    note: "Sample supports a recalibration review — any change still passes the promotion gate first.",
  };
}

// === CHRONOLOGICAL SPLIT ====================================================
// Older events train, newer events validate (OOS). Zero future leakage: the
// boundary is defined by kickoff/settled order, never by a random mix.
export function chronologicalSplit(events, trainFraction = TRAIN_FRACTION) {
  const timeOf = (e) => {
    const t = e.kickoff ? Date.parse(e.kickoff) : NaN;
    return Number.isFinite(t) ? t : e.settled_at ? Date.parse(e.settled_at) : 0;
  };
  const ordered = [...(events || [])].sort((a, b) => timeOf(a) - timeOf(b));
  const oosStart = Math.floor(ordered.length * trainFraction);
  const oos = ordered.slice(oosStart);
  return {
    ordered,
    train: ordered.slice(0, oosStart),
    oos,
    boundary: oos.length ? oos[0].kickoff || oos[0].settled_at || null : null,
  };
}

// === PROMOTION GATE =========================================================
// Champion/Challenger gate: chronological OOS evidence, minimum sample on
// BOTH sides, better Brier AND log loss, and no unacceptable calibration
// degradation (ECE within +2pp). A higher hit rate alone never promotes.
// If no candidate passes, the Champion is kept.
export function promotionGateDecision({ championOos, challengerOos, minOos = MIN_OOS_PROMOTION, champion = CHAMPION_DEFAULT, challenger = CHALLENGER_DEFAULT }) {
  const champN = championOos?.n || 0;
  const challN = challengerOos?.n || 0;
  if (challN < minOos || champN < minOos) {
    return {
      decision: "INSUFFICIENT EVIDENCE — CURRENT CHAMPION RETAINED",
      reason: `OOS settled sample below the promotion minimum (${challenger}: ${challN}, ${champion}: ${champN} OOS events; ${minOos} each required). ${challenger} keeps recording in parallel and is re-evaluated as verified results settle — NOT PROMOTED is the correct outcome here, not a failure.`,
      changelogDecision: "NOT_PROMOTED",
      nextChampion: champion,
    };
  }
  const better = (challengerOos.brier ?? 1) < (championOos.brier ?? 1) && (challengerOos.logloss ?? 99) < (championOos.logloss ?? 99);
  const calibOk = (challengerOos.ece_pp ?? 99) <= (championOos.ece_pp ?? 0) + 2;
  if (better && calibOk) {
    return {
      decision: "CHALLENGER ACCEPTED — OOS EVIDENCE PASSES THE PROMOTION GATE",
      reason: `${challenger} beats ${champion} on chronological OOS (Brier ${challengerOos.brier} vs ${championOos.brier}, log loss ${challengerOos.logloss} vs ${championOos.logloss}) over ${challN} OOS events with no calibration degradation.`,
      changelogDecision: "PROMOTED",
      nextChampion: challenger,
    };
  }
  return {
    decision: "OOS EVIDENCE FAILED THE GATE — CURRENT CHAMPION RETAINED",
    reason: calibOk
      ? `${challenger} did not beat ${champion} on chronological OOS evidence (Brier ${challengerOos.brier} vs ${championOos.brier}, log loss ${challengerOos.logloss} vs ${championOos.logloss}).`
      : `${challenger} showed unacceptable calibration degradation on OOS (ECE ${challengerOos.ece_pp}pp vs ${championOos.ece_pp}pp) — the Champion is retained.`,
    changelogDecision: "NOT_PROMOTED",
    nextChampion: champion,
  };
}

// === DRIFT ==================================================================
// Recent window vs historical baseline. Alarms arm only at sufficient
// history — one bad period never triggers replacement.
export function driftVerdictOf(ordered, window = 5, armAt = 50) {
  const recentN = Math.min(window, ordered.length);
  const recent = ordered.slice(-recentN);
  const historical = ordered.slice(0, ordered.length - recentN);
  const recentM = metricsOf(recent);
  const histM = metricsOf(historical);
  const underSample = ordered.length < armAt;
  return {
    window,
    total_events: ordered.length,
    recent_n: recentM.n,
    recent_hit_rate_pct: recentM.hit_rate_pct,
    recent_avg_predicted_pct: recentM.avg_predicted_pct,
    historical_n: histM.n,
    historical_hit_rate_pct: histM.hit_rate_pct,
    historical_avg_predicted_pct: histM.avg_predicted_pct,
    verdict: underSample ? "BASELINE BUILDING — INSUFFICIENT HISTORY FOR DRIFT ALARMS" : "MONITORED — NO DRIFT ALARM",
    note: underSample
      ? `Drift alarms arm at ${armAt}+ settled events (currently ${ordered.length}). Recent-window figures are transparency only — one bad period never triggers replacement.`
      : "Recent window vs historical baseline monitored; a single bad period never triggers replacement — only validated OOS evidence can promote a replacement.",
  };
}

// === ACTIVE MODEL RESOLUTION =================================================
// Pure resolver for the active-model registry — the single source of truth
// for which production model future predictions resolve to.
export function resolveActiveModel(rows, fallbackChampion = CHAMPION_DEFAULT, challenger = CHALLENGER_DEFAULT) {
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    return { champion_version: fallbackChampion, challenger_version: challenger, promotion_status: "", source: "none" };
  }
  return {
    champion_version: String(row.champion_version || fallbackChampion),
    challenger_version: String(row.challenger_version || challenger),
    promotion_status: row.promotion_status || "",
    source: "registry",
  };
}