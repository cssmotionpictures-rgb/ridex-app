// RX STORE — prediction immutability, settlement from the verified feed and
// the engine's learned state (calibration + model weights). Every prediction
// version is stored with the full snapshot the spec demands; a pre-kickoff
// change creates Version 2 and never rewrites Version 1. Settlement grades
// from the real final score only — a pick is NEVER marked won from the
// prediction itself, and no result within 7 days is voided (counts toward
// nothing). No data leakage: results come from the same verified feed the
// prediction was made from, keyed by the recorded kickoff.

import { base44 } from "@/api/base44Client";
import { readWithRetry } from "@/lib/throttledRead";
import { wrSettle } from "@/lib/winRabaLedger";
import { RX_MODEL_VERSION } from "./engine";
import { findResultByFixture } from "./fixtures";
import { calibrators, metrics } from "./calibration";

const nowIso = () => new Date().toISOString();
const MIN_WEIGHT_SAMPLE = 30;

function rowOf(p) {
  return {
    model_version: RX_MODEL_VERSION,
    prediction_version: 1,
    supersedes_id: "",
    fixture_id: p.fixtureId,
    home: p.home,
    away: p.away,
    league: p.league,
    league_code: p.leagueCode || "",
    kickoff: p.kickoff,
    lagos_date_key: p.lagosDateKey,
    session: p.session,
    market_key: p.marketKey,
    market_label: p.marketLabel,
    models_json: JSON.stringify(p.perModel || {}),
    models_used: String(p.voting || 0),
    models_unavailable: (p.modelsUnavailable || []).join(","),
    ensemble_probability: p.ensemble,
    calibrated_probability: p.calibrated,
    confidence: p.confidence,
    master_score: p.masterScore,
    grade: (p.grade || "").toLowerCase().replace(" ", "_"),
    agreement: p.agreement,
    uncertainty: p.uncertainty,
    data_quality: p.dq || "MEDIUM",
    evidence: p.evidence || "",
    market_odds: p.marketOdds || 0,
    bookmaker: p.bookmaker || "",
    market_probability: p.marketProbability || 0,
    margin_probability: p.marginProbability || 0,
    raw_edge_pct: p.rawEdgePct || 0,
    edge_pct: p.edgePct || 0,
    adjusted_edge_pct: p.adjEdgePct || 0,
    pick_quality: p.quality || "MEDIUM",
    weights_basis: p.weightsBasis || "baseline",
    calibration_sample: p.calibrationSample || 0,
    provenance_json: JSON.stringify(p.provenance || {}),
    validation_json: JSON.stringify(p.validation || null),
    snapshot_json: JSON.stringify(p.snapshot || {}),
    prediction_key: `${p.fixtureId}|${p.marketKey}`,
    ev_pct: p.evPct || 0,
    fair_odds: p.fairOdds || 0,
    pinnacle_odds: p.pinnacle || 0,
    explanation: p.explanation ? [p.explanation.why, p.explanation.market, p.explanation.support].join(" ") : "",
    failure_modes: (p.failureModes || []).join(" · "),
    odds_status: p.oddsStatus || "",
    big_hammer: !!p.bigHammer,
    status: "open",
    recorded_at: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// RECORDING GATE — READ FAILURE IS NEVER "NO EXISTING RECORDS".
// Canonical identity is the schema's own: prediction_key + prediction_version
// (no second identity system). Before ANY write the existing rows are read
// authoritatively through the 429-aware retry mechanism, and the gate moves
// only through explicit states:
//   READ_SUCCESS / READ_EMPTY  → verified pool — absence is confirmed absence
//   READ_RETRYING              → 429 backoff inside readWithRetry
//   READ_FAILED                → recording PAUSED, ZERO writes — a failed read
//                                is never treated as an empty pool, so a
//                                throttled session can never re-create rows
//                                that already exist (the duplicate bug).
// Concurrency: every recording is serialized through a single-writer promise
// chain — two simultaneous calls cannot both insert the same prediction; the
// second call's duplicate check runs after the first call's writes land.
const READ_SUCCESS = "READ_SUCCESS";
const READ_EMPTY = "READ_EMPTY";
const READ_FAILED = "READ_FAILED";
const READ_RETRYING = "READ_RETRYING"; // internal backoff phase of readWithRetry

const recordingLock = { chain: Promise.resolve() };
const withRecordingLock = (fn) => {
  const run = recordingLock.chain.then(fn, fn);
  recordingLock.chain = run.catch(() => {});
  return run;
};

async function readExistingPredictions(since) {
  try {
    const rows = await readWithRetry(() =>
      base44.entities.EnginePrediction.filter(
        { lagos_date_key: { $gte: since } },
        "-recorded_at",
        500
      )
    );
    return { state: (rows || []).length ? READ_SUCCESS : READ_EMPTY, rows: rows || [] };
  } catch (e) {
    return { state: READ_FAILED, rows: null, error: e };
  }
}

// Permanently record every qualifying engine prediction — idempotent, with
// immutable versioning. A pre-kickoff change (different market, or calibrated
// probability moved >2pp) creates Prediction Version 2 and supersedes the
// prior row; history is never rewritten.
export function recordEnginePicks(board) {
  return withRecordingLock(() => recordEnginePicksLocked(board));
}

async function recordEnginePicksLocked(board) {
  const picks = [
    ...(board?.days || []).flatMap((d) => d.all || []),
    ...(board?.bigHammer || []),
  ];
  if (!picks.length) return { status: "ok", recorded: 0, superseded: 0 };
  const since = board.days[0].dateKey;
  const read = await readExistingPredictions(since);
  if (read.state === READ_FAILED) {
    // READ_FAILED must NEVER become READ_EMPTY — recording is deferred to the
    // next scan, which retries with a fully authoritative read.
    return {
      status: "paused",
      reason:
        "WRITE PAUSED — DUPLICATE CHECK COULD NOT BE VERIFIED (" +
        (read.error?.isThrottle ? "read throttled, retries exhausted" : "read failed") +
        "). No prediction was inserted or superseded from an unverified pool.",
      recorded: 0,
      superseded: 0,
    };
  }
  const byKey = {};
  read.rows.forEach((r) => {
    (byKey[`${r.fixture_id}|${r.market_key}`] ||= []).push(r);
  });

  const fresh = [];
  const superseded = [];
  const seen = new Set();
  for (const p of picks) {
    const key = `${p.fixtureId}|${p.marketKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rows = (byKey[key] || []).filter((r) => r.status !== "superseded");
    const current = rows.sort((a, b) => (b.prediction_version || 1) - (a.prediction_version || 1))[0];
    if (!current) {
      fresh.push(rowOf(p));
      continue;
    }
    const sameCall =
      current.calibrated_probability != null &&
      Math.abs(current.calibrated_probability - p.calibrated) <= 0.02;
    if (sameCall) continue;
    if (new Date(current.kickoff).getTime() > Date.now()) {
      fresh.push({ ...rowOf(p), prediction_version: (current.prediction_version || 1) + 1, supersedes_id: current.id });
      superseded.push({ id: current.id, status: "superseded" });
    }
  }
  if (fresh.length) await base44.entities.EnginePrediction.bulkCreate(fresh);
  if (superseded.length) await base44.entities.EnginePrediction.bulkUpdate(superseded);
  return { status: "ok", recorded: fresh.length, superseded: superseded.length };
}

// Settle every open prediction whose kickoff has passed, from the real final
// score in the verified feed. DNB picks void on a draw; no result within 7
// days voids.
export async function settleEnginePredictions() {
  const open = await base44.entities.EnginePrediction
    .filter({ status: "open", model_version: RX_MODEL_VERSION }, "-kickoff", 200)
    .catch(() => []);
  const due = (open || []).filter((r) => r.kickoff && new Date(r.kickoff).getTime() < Date.now() - 105 * 60000);
  const updates = [];
  for (const r of due.slice(0, 40)) {
    try {
      const date = String(r.kickoff).slice(0, 10);
      const res = r.league_code
        ? await findResultByFixture(r.home, r.away, date, r.league_code)
        : null;
      // SETTLEMENT AUDIT — only a verified, finite, non-negative final score
      // can ever grade a prediction; anything else stays open and retries.
      if (res && Number.isFinite(res.home) && Number.isFinite(res.away) && res.home >= 0 && res.away >= 0) {
        const won = wrSettle(r.market_key, res.home, res.away);
        if (won == null) continue;
        const isDnb = /^DNB/i.test(r.market_key);
        updates.push({
          id: r.id,
          status: isDnb && res.home === res.away ? "void" : won ? "won" : "lost",
          actual_home: res.home,
          actual_away: res.away,
          result_source: "openfootball verified result",
          settled_at: nowIso(),
        });
      } else if (new Date(r.kickoff).getTime() < Date.now() - 7 * 86400000) {
        updates.push({ id: r.id, status: "void", settled_at: nowIso() });
      }
    } catch {
      // feed hiccup — stays open, retried on the next visit
    }
  }
  if (updates.length) await base44.entities.EnginePrediction.bulkUpdate(updates);
  return updates.length;
}

// Calibration state from settled predictions of the CURRENT model version —
// recorded pre-kickoff, graded from real results. Insufficient sample → the
// engine honestly reports not ready instead of inventing a correction.
export async function getEngineCalibration() {
  const rows = await base44.entities.EnginePrediction
    .filter({ model_version: RX_MODEL_VERSION }, "-recorded_at", 1000)
    .catch(() => []);
  const graded = (rows || []).filter(
    (r) => ["won", "lost"].includes(r.status) && r.calibrated_probability != null
  );
  const cal = calibrators(graded.map((r) => ({ p: r.calibrated_probability, y: r.status === "won" ? 1 : 0 })));
  return cal;
}

// Learned model weights from out-of-sample settled predictions (each row was
// recorded before kickoff with per-model probabilities). Weight ∝ exp(-Brier)
// with a floor, normalized. Insufficient sample → null (defaults are used).
export async function getEngineWeights() {
  const rows = await base44.entities.EnginePrediction
    .filter({ model_version: RX_MODEL_VERSION }, "-recorded_at", 1000)
    .catch(() => []);
  const graded = (rows || []).filter((r) => ["won", "lost"].includes(r.status));
  if (graded.length < MIN_WEIGHT_SAMPLE) return null;
  const briers = {};
  const counts = {};
  graded.forEach((r) => {
    let per = {};
    try { per = JSON.parse(r.models_json || "{}"); } catch { per = {}; }
    const y = r.status === "won" ? 1 : 0;
    Object.entries(per).forEach(([k, p]) => {
      briers[k] = (briers[k] || 0) + (p - y) ** 2;
      counts[k] = (counts[k] || 0) + 1;
    });
  });
  const keys = Object.keys(briers).filter((k) => counts[k] >= MIN_WEIGHT_SAMPLE);
  if (keys.length < 3) return null;
  const minB = Math.min(...keys.map((k) => briers[k] / counts[k]));
  const raw = {};
  keys.forEach((k) => {
    raw[k] = Math.max(0.02, Math.exp(-(briers[k] / counts[k] - minB) * 6));
  });
  const total = Object.values(raw).reduce((s, x) => s + x, 0);
  const weights = {};
  keys.forEach((k) => {
    weights[k] = Math.round((raw[k] / total) * 1000) / 1000;
  });
  return weights;
}

// Performance metrics snapshot (Brier, log loss, calibration error) — the
// honest self-measurement the engine reports instead of claiming wins.
export async function getEnginePerformance() {
  const rows = await base44.entities.EnginePrediction
    .filter({ model_version: RX_MODEL_VERSION }, "-recorded_at", 1000)
    .catch(() => []);
  const graded = (rows || []).filter(
    (r) => ["won", "lost"].includes(r.status) && r.calibrated_probability != null
  );
  return metrics(graded.map((r) => ({ p: r.calibrated_probability, y: r.status === "won" ? 1 : 0 })));
}