// KALA MODEL OBSERVATIONS — the research ledger. Every analyzed candidate
// (qualified OR rejected) is recorded pre-kickoff as a MODEL OBSERVATION:
// a research record, never a bet. Observations let the models be evaluated
// per-model on real outcomes without pretending every observation was a
// recommended selection. Only QUALIFIED candidates ever appear on betting
// recommendation boards; observations feed research, calibration and model
// diagnostics.
//
// Lifecycle rules (never violated):
//  - recorded strictly BEFORE kickoff (no leakage, no post-hoc rows)
//  - immutable after kickoff: settlement, closing odds and performance
//    metrics are APPENDED; probabilities, odds, scores and selections are
//    never rewritten
//  - graded only from the verified feed under the market's canonical
//    settlement rule; a failed closing capture is RECORDED, never fabricated

import { base44 } from "@/api/base44Client";
import { readWithRetry } from "@/lib/throttledRead";
import { existingKeySet, PAUSED_DUP_WRITE_MESSAGE } from "@/lib/idempotency";
import { attachRealOdds, oddsKey } from "@/lib/bookmakerOdds";
import { canonicalOf, settleCanonical } from "./markets";
import { findResultByFixture } from "./fixtures";
import { RX_MODEL_VERSION } from "./engine";
import { getProductionModel } from "./productionModel";

const nowIso = () => new Date().toISOString();

// === row construction ===
export function rowOfObservation(e, pm = null) {
  const c = e.c || {};
  const can = canonicalOf(c.marketKey);
  return {
    observation_key: `${e.fixtureId}|${c.marketKey}`,
    prediction_key: `${e.fixtureId}|${c.marketKey}`,
    qualified: !!c.qualifies,
    reject_reason: c.rejectReason || "",
    fixture_id: e.fixtureId,
    home: e.home,
    away: e.away,
    league: e.league,
    league_code: e.leagueCode || "",
    kickoff: e.kickoff,
    lagos_date_key: e.lagosDateKey,
    session: e.session,
    market_key: c.marketKey,
    market_label: c.marketLabel,
    canonical_market: can.id,
    settlement_rule: can.rule,
    models_json: JSON.stringify(c.perModel || {}),
    models_used: String(c.voting || 0),
    models_unavailable: Array.isArray(e.modelsUnavailable) ? e.modelsUnavailable.join(",") : "",
    ensemble_probability: c.ensemble,
    calibrated_probability: c.calibrated,
    confidence: c.displayConf ?? Math.round((c.calibrated || 0) * 100),
    kala_score: c.master,
    grade: c.grade || "",
    agreement: c.agreement,
    uncertainty: c.uncertainty,
    data_quality: c.dq || "MEDIUM",
    pick_quality: c.quality || "MEDIUM",
    evidence: e.evidence || "",
    market_odds: c.price || 0,
    bookmaker: c.bookmaker || "",
    market_probability: c.implied || 0,
    margin_probability: c.marginImplied || 0,
    raw_edge_pct: c.rawEdgePct || 0,
    edge_pct: c.edgePct || 0,
    adjusted_edge_pct: c.adjEdgePct || 0,
    min_adj_edge: c.minAdjEdge || 0,
    ev_pct: c.evPct || 0,
    fair_odds: c.fairOdds || 0,
    odds_status: c.priced ? "priced" : "model_only",
    weights_basis: c.weightsBasis || "baseline",
    calibration_sample: c.calibrationSample ?? 0,
    flags_json: JSON.stringify(c.flags || []),
    provenance_json: JSON.stringify(c.provenance || {}),
    snapshot_json: JSON.stringify({
      ...(c.snapshot || {}),
      // ACTIVE MODEL PROOF — what the promotion registry resolved at generation
      // time. The prediction record itself shows which production model was
      // active when it was made; a registry version this build does not run is
      // flagged, never silently stamped as the row's model_version.
      activeModel: pm
        ? { productionVersion: pm.production_version, role: pm.role, registryChampion: pm.registry_champion || "", resolvedAt: nowIso() }
        : null,
    }),
    model_version: RX_MODEL_VERSION,
    recorded_at: nowIso(),
    capture_status: "pending",
    closing_snapshots_json: "[]",
    status: "open",
  };
}

// Record every analyzed candidate (qualified + rejected) as a research
// observation — idempotent on observation_key and strictly pre-kickoff.
// Recording observations NEVER lowers the qualification gate and never
// manufactures selections: rejected candidates stay labeled rejected.
export async function recordObservations(board) {
  const entries = board?.observations || [];
  const now = Date.now();
  // ACTIVE MODEL RESOLUTION — the registry champion at generation time is
  // stamped into every new prediction snapshot (immutable proof).
  const pm = await getProductionModel();
  const seen = new Set();
  const candidates = [];
  for (const e of entries) {
    const c = e.c || {};
    if (!c.marketKey) continue;
    const key = `${e.fixtureId}|${c.marketKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ko = new Date(e.kickoff).getTime();
    if (!Number.isFinite(ko) || ko <= now) continue; // KICKOFF LOCK — pre-match records only
    candidates.push({ key, row: rowOfObservation(e, pm) });
  }
  if (!candidates.length) return { recorded: 0, skipped: entries.length, status: "ok" };

  // EXISTENCE GATE — the deterministic observation identity is verified with a
  // batched read BEFORE any write. A failed/throttled check PAUSES the write
  // entirely: a silently-empty result here is the exact failure mode that
  // duplicated this ledger, so an unverified pool never receives rows.
  let have;
  try {
    have = await readWithRetry(() =>
      existingKeySet("KalaModelObservation", "observation_key", candidates.map((c) => c.key))
    );
  } catch (e) {
    return {
      recorded: 0,
      skipped: entries.length,
      status: "paused",
      reason: PAUSED_DUP_WRITE_MESSAGE,
      error: String(e?.message || e),
    };
  }
  const fresh = candidates.filter((c) => !have.has(c.key)).map((c) => c.row);
  for (let i = 0; i < fresh.length; i += 400) {
    await base44.entities.KalaModelObservation.bulkCreate(fresh.slice(i, i + 400));
  }
  return {
    recorded: fresh.length,
    skipped: entries.length - fresh.length,
    status: "ok",
    existingSkipped: candidates.length - fresh.length,
  };
}

export async function loadObservations(limit = 1000) {
  return readWithRetry(
    () => base44.entities.KalaModelObservation.filter({}, "-recorded_at", limit),
    { fallback: [] }
  );
}

// === ERROR CLASSIFICATION — a loss is never just "wrong" ===
// Attribution uses only data recorded BEFORE the result was known; when the
// evidence cannot attribute the loss, it stays UNCLASSIFIED rather than
// inventing a cause.
function classifyLoss(r, result) {
  try {
    const flags = JSON.parse(r.flags_json || "[]");
    if ((r.data_quality || "") === "LOW" || flags.some((f) => f && f.id === "form_sample")) return "A_bad_data";
  } catch { /* flags unparseable — fall through */ }
  if ((r.agreement ?? 1) < 0.75) return "G_model_disagreement";
  if ((r.uncertainty ?? 0) > 0.5) return "C_bad_probability";
  if ((r.market_odds || 0) > 1 && (r.closing_odds || 0) > 1 && r.closing_odds < r.market_odds * 0.97) return "H_odds_mispricing";
  if ((r.market_odds || 0) > 1 && (r.edge_pct || 0) <= 0) return "H_odds_mispricing";
  if (result && (result.home === result.away) && ["1", "2"].includes(r.market_key)) return "F_unexpected_draw_variance";
  return "UNCLASSIFIED — single-match variance; rich attribution needs lineup/xG data";
}

// Settle open observations whose kickoff has passed, from the verified feed,
// under the market's canonical settlement rule. DNB draws void; no verified
// result within 7 days voids (counts toward nothing). Settlement APPENDS
// only — the recorded prediction is never touched.
export async function settleObservations() {
  const open = await readWithRetry(
    () => base44.entities.KalaModelObservation.filter({ status: "open" }, "-kickoff", 200),
    { fallback: [] }
  );
  const due = (open || []).filter((r) => r.kickoff && new Date(r.kickoff).getTime() < Date.now() - 105 * 60000);
  const updates = [];
  for (const r of due.slice(0, 60)) {
    try {
      const date = String(r.kickoff).slice(0, 10);
      const res = r.league_code ? await findResultByFixture(r.home, r.away, date, r.league_code) : null;
      if (res && Number.isFinite(res.home) && Number.isFinite(res.away) && res.home >= 0 && res.away >= 0) {
        const won = settleCanonical(r.market_key, res.home, res.away);
        if (won === undefined) continue; // unknown market — never settled by generic logic
        const clv =
          (r.market_odds || 0) > 1 && (r.closing_odds || 0) > 1
            ? Math.round((r.closing_odds / r.market_odds - 1) * 1000) / 10
            : 0;
        updates.push({
          id: r.id,
          status: won === null ? "void" : won ? "won" : "lost",
          actual_home: res.home,
          actual_away: res.away,
          result_source: "openfootball verified result",
          settled_at: nowIso(),
          clv_pct: clv,
          loss_class: won === false ? classifyLoss(r, res) : "",
        });
      } else if (new Date(r.kickoff).getTime() < Date.now() - 7 * 86400000) {
        updates.push({ id: r.id, status: "void", settled_at: nowIso() });
      }
    } catch {
      // feed hiccup — stays open, retried on the next visit
    }
  }
  if (updates.length) await base44.entities.KalaModelObservation.bulkUpdate(updates);
  return updates.length;
}

// === CLOSING ODDS CAPTURE ===
// The Odds API pulls are credit-priced, so there is no per-minute scheduler:
// every time the KALA command center opens, every open observation/prediction
// whose kickoff falls inside the closing window (default 150 minutes out)
// gets a fresh price snapshot appended. The LAST pre-kickoff snapshot becomes
// the closing price — effectively T-60/T-30/T-15/closest-available at real
// visit frequency. Prices are only ever captured strictly BEFORE kickoff;
// post-kickoff prices are never used, and a failed capture is recorded as a
// failure, never fabricated.
export async function captureClosingOdds({ windowMs = 150 * 60000 } = {}) {
  const now = Date.now();
  const [obs, preds] = await Promise.all([
    readWithRetry(() => base44.entities.KalaModelObservation.filter({ status: "open" }, "kickoff", 400), { fallback: [] }),
    readWithRetry(() => base44.entities.EnginePrediction.filter({ status: "open" }, "kickoff", 200), { fallback: [] }),
  ]);
  const inWin = (r) => {
    const t = new Date(r.kickoff).getTime();
    return Number.isFinite(t) && t > now + 60000 && t <= now + windowMs;
  };
  const targets = [...(obs || []).filter(inWin), ...(preds || []).filter(inWin)];
  if (!targets.length) return { due: 0, captured: 0, status: "none_due" };

  const legs = targets.map((r) => ({
    date: String(r.kickoff).slice(0, 10),
    home: r.home,
    away: r.away,
    league: r.league,
    marketLabel: r.market_label,
  }));

  let res = null;
  try {
    res = await attachRealOdds(legs, { maxLeagues: 12 });
  } catch (e) {
    res = { providerStatus: "transport_error", message: String(e?.message || e) };
  }

  // Transport/provider failure — RECORDED as a failure on every due research
  // row (once per status), never fabricated into a price. EnginePrediction
  // rows carry no capture-status field and are simply left untouched.
  if (!res?.map || res.providerStatus !== "ok") {
    const tag = `failed:${res?.providerStatus || "transport_error"}`;
    const failUpdates = targets
      .filter((r) => r.observation_key != null && (r.capture_status || "pending") !== tag)
      .map((r) => ({ id: r.id, capture_status: tag }));
    if (failUpdates.length) await base44.entities.KalaModelObservation.bulkUpdate(failUpdates);
    return { due: targets.length, captured: 0, providerStatus: res?.providerStatus || "transport_error" };
  }

  const obsUpdates = [];
  const predUpdates = [];
  const statusTagOf = (entry) => {
    if (!entry) return "no_provider_coverage";
    if (entry.price > 1) return "ok";
    if (["league_not_covered", "fixture_unmatched"].includes(entry.status)) return "no_provider_coverage";
    if (entry.status === "market_not_offered") return "market_not_offered";
    if (entry.status === "stale") return "stale";
    if (entry.status === "live_now") return "live_now";
    return `failed:${entry.status || "unknown"}`;
  };

  for (const r of targets) {
    const entry = res?.map?.get(oddsKey({ date: String(r.kickoff).slice(0, 10), home: r.home, away: r.away, marketLabel: r.market_label }));
    const tag = statusTagOf(entry);
    const isObs = r.observation_key != null;

    if (tag === "ok" && entry.price > 1) {
      let snaps = [];
      try { snaps = JSON.parse(r.closing_snapshots_json || "[]"); } catch { snaps = []; }
      const tMinus = Math.max(0, Math.round((new Date(r.kickoff).getTime() - Date.now()) / 60000));
      snaps.push({ at: nowIso(), tMinusMin: tMinus, odds: entry.price, bookmaker: entry.bookmaker || "" });
      snaps = snaps.slice(-8); // keep the most recent pre-kickoff snapshots
      if (isObs) {
        obsUpdates.push({
          id: r.id,
          closing_odds: entry.price,
          closing_bookmaker: entry.bookmaker || "",
          closing_captured_at: nowIso(),
          closing_snapshots_json: JSON.stringify(snaps),
          capture_status: "ok",
        });
      } else {
        // EnginePrediction only carries a closing_odds column — append-only,
        // never rewriting the recorded prediction.
        predUpdates.push({ id: r.id, closing_odds: entry.price });
      }
    } else if (isObs && (r.capture_status || "pending") !== tag && tag !== "live_now") {
      // scheduled capture failed / no coverage — RECORDED, never fabricated
      obsUpdates.push({ id: r.id, capture_status: tag });
    }
  }

  if (obsUpdates.length) await base44.entities.KalaModelObservation.bulkUpdate(obsUpdates);
  if (predUpdates.length) await base44.entities.EnginePrediction.bulkUpdate(predUpdates);
  return {
    due: targets.length,
    captured: predUpdates.length + obsUpdates.filter((u) => u.closing_odds).length,
    providerStatus: res?.providerStatus || "transport_error",
  };
}