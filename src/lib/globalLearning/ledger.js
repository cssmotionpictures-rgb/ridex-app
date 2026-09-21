// GLOBAL LEDGER SYNC — the connection point between every RIDE X prediction
// section and the central learning engine. Each section's own immutable ledger
// (KALA observations, WIN RABA selections, BANKu/MONSTER slips) is ingested
// into the Global Prediction Ledger through deterministic global_prediction_ids:
// idempotent, additive-only, never rewriting a section's own records. NO
// existing prediction module is modified — sections keep their identity and
// their ledgers; the global engine reads them.
import { base44 } from "@/api/base44Client";
import { canonicalOf } from "@/lib/ensemble/markets";
import { codeOfLabel } from "@/lib/ensemble/fixtures";
import { globalPredictionId } from "./globalId";
import { factorsOf } from "./analysis";
import { existingKeySet, existingRowMap, PAUSED_DUP_WRITE_MESSAGE } from "@/lib/idempotency";
import { readOrThrow } from "./safeReads";

const nowIso = () => new Date().toISOString();
const SETTLED = new Set(["won", "lost", "void", "push", "cancelled"]);
const PAGES = 3;
const PAGE = 1000;
const SOURCE_WINDOW_DAYS = 21;
const SOURCE_PAGE = 5000;

export async function fetchAll(entity, sort) {
  const out = [];
  for (let i = 0; i < PAGES; i++) {
    if (i) await new Promise((r) => setTimeout(r, 400)); // pace reads — burst reads trip the platform's traffic limit
    const rows = await base44.entities[entity].filter({}, sort, PAGE).catch(() => []);
    if (!rows?.length) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const verOf = (key) => {
  const m = /:v(\d+)$/.exec(String(key || ""));
  return m ? Number(m[1]) : 1;
};

export function globalOfKalaObservation(r) {
  const version = verOf(r.observation_key);
  const can = canonicalOf(r.market_key);
  const gid = globalPredictionId("kala", r.model_version, r.fixture_id, r.market_key, version);
  return {
    global_prediction_id: gid,
    kind: "prediction",
    source_section: "kala",
    source_entity: "KalaModelObservation",
    source_row_id: r.id || "",
    source_model: r.model_version,
    model_version: r.model_version,
    big_hammer: !!r.qualified && (r.market_odds || 0) >= 3,
    fixture_id: r.fixture_id,
    home: r.home,
    away: r.away,
    league: r.league,
    league_code: r.league_code || "",
    kickoff: r.kickoff,
    lagos_date_key: r.lagos_date_key,
    session: r.session || "",
    market_key: r.market_key,
    market_label: r.market_label,
    canonical_market: can.id,
    settlement_rule: can.rule,
    probability: r.calibrated_probability ?? r.ensemble_probability ?? 0,
    confidence: r.confidence || 0,
    grade: r.grade || "",
    kala_score: r.kala_score || 0,
    qualified: !!r.qualified,
    reject_reason: r.reject_reason || "",
    market_odds: r.market_odds || 0,
    bookmaker: r.bookmaker || "",
    market_probability: r.market_probability || 0,
    margin_probability: r.margin_probability || 0,
    fair_odds: r.fair_odds || 0,
    edge_pct: r.edge_pct || 0,
    adjusted_edge_pct: r.adjusted_edge_pct || 0,
    ev_pct: r.ev_pct || 0,
    odds_status: r.odds_status || "",
    agreement: r.agreement ?? 1,
    uncertainty: r.uncertainty ?? 0,
    data_quality: r.data_quality || "",
    injury_status: r.injury_status || "",
    injury_absences_home: r.injury_absences_home || 0,
    injury_absences_away: r.injury_absences_away || 0,
    lineup_status: r.lineup_status || "",
    prediction_version: version,
    supersedes_global_id: version > 1 ? globalPredictionId("kala", r.model_version, r.fixture_id, r.market_key, version - 1) : "",
    models_json: r.models_json || "",
    snapshot_json: r.snapshot_json || "",
    provenance_json: r.provenance_json || "",
    recorded_at: r.recorded_at,
    status: r.status,
    verification: SETTLED.has(r.status) && r.result_source ? "verified_provider" : "",
    actual_home: r.actual_home ?? 0,
    actual_away: r.actual_away ?? 0,
    result_source: r.result_source || "",
    closing_odds: r.closing_odds || 0,
    clv_pct: r.clv_pct || 0,
    settled_at: r.settled_at,
  };
}

export function globalOfWinRaba(r) {
  const version = r.prediction_version || 1;
  const can = canonicalOf(r.market_key);
  const model = r.model_version || "wr-v1";
  const status = r.status;
  return {
    global_prediction_id: globalPredictionId("win-raba", model, r.fixture_id, r.market_key, version),
    kind: "prediction",
    source_section: "win-raba",
    source_entity: "WinRabaSelection",
    source_row_id: r.id || "",
    source_model: model,
    model_version: model,
    big_hammer: (r.market_odds || 0) >= 3,
    fixture_id: r.fixture_id,
    home: r.home,
    away: r.away,
    league: r.league,
    league_code: r.league_code || codeOfLabel(r.league) || "",
    kickoff: r.kickoff,
    lagos_date_key: r.lagos_date_key,
    session: r.session || "",
    market_key: r.market_key,
    market_label: r.market_label,
    canonical_market: can.id,
    settlement_rule: can.rule,
    probability: r.model_probability ?? 0,
    confidence: r.confidence || 0,
    qualified: true,
    reject_reason: "",
    market_odds: r.market_odds || 0,
    bookmaker: r.bookmaker || "",
    market_probability: r.market_probability || 0,
    fair_odds: 0,
    edge_pct: r.edge_pct || 0,
    odds_status: r.odds_status || "",
    agreement: 1,
    uncertainty: 0,
    data_quality: r.data_quality || "",
    prediction_version: version,
    supersedes_global_id: version > 1 ? globalPredictionId("win-raba", model, r.fixture_id, r.market_key, version - 1) : "",
    recorded_at: r.recorded_at,
    status,
    verification: SETTLED.has(status) && r.result_source ? "verified_provider" : "",
    actual_home: r.actual_home ?? 0,
    actual_away: r.actual_away ?? 0,
    result_source: r.result_source || "",
    settled_at: r.settled_at,
  };
}

const BANKU_SECTION = { banku: "banku", kala: "kala-drop", monster: "monster" };
const BANKU_STATUS = { win: "won", loss: "lost", void: "void", open: "open" };

export function globalOfBankuPick(r) {
  const can = canonicalOf(r.market_key);
  const model = `${r.slip || "banku"}-v1`;
  const status = BANKU_STATUS[r.status] || "open";
  const fx = r.fixture_id || `legacy-${r.date_key}-${String(r.home).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(r.away).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return {
    global_prediction_id: globalPredictionId(BANKU_SECTION[r.slip] || "banku", model, fx, r.market_key, 1),
    kind: "prediction",
    source_section: BANKU_SECTION[r.slip] || "banku",
    source_entity: "BankuPickResult",
    source_row_id: r.id || "",
    source_model: model,
    model_version: model,
    big_hammer: false,
    fixture_id: fx,
    home: r.home,
    away: r.away,
    league: r.league || "",
    kickoff: r.kickoff || "",
    lagos_date_key: r.date_key,
    market_key: r.market_key,
    market_label: r.market_label,
    canonical_market: can.id,
    settlement_rule: can.rule,
    probability: r.probability ?? 0,
    confidence: Math.round((r.probability || 0) * 100),
    qualified: true,
    fair_odds: r.fair_odds || 0,
    data_quality: r.src || "",
    recorded_at: r.settled_at || r.created_date || nowIso(),
    status,
    verification: SETTLED.has(status) && r.result_source ? "verified_provider" : "",
    actual_home: r.actual_home ?? 0,
    actual_away: r.actual_away ?? 0,
    result_source: r.result_source || "",
    settled_at: r.settled_at,
  };
}

// Outcome row for a settled global prediction — created once, immutable.
export function outcomeOf(r) {
  const { winFactors, lossFactors, lossClass } = factorsOf(r, r.status, [r.actual_home, r.actual_away]);
  const priced = (r.market_odds || 0) > 1 && (r.closing_odds || 0) > 1;
  return {
    global_prediction_id: r.global_prediction_id,
    source_section: r.source_section,
    model_version: r.model_version,
    home: r.home,
    away: r.away,
    league: r.league || "",
    market_key: r.market_key,
    market_label: r.market_label || "",
    predicted_probability: r.probability ?? 0,
    actual_result: r.status,
    final_home: r.actual_home ?? 0,
    final_away: r.actual_away ?? 0,
    market_odds: r.market_odds || 0,
    closing_odds: r.closing_odds || 0,
    clv_pct: r.clv_pct || 0,
    fair_odds: r.fair_odds || 0,
    edge_pct: r.edge_pct || 0,
    adjusted_edge_pct: r.adjusted_edge_pct || 0,
    confidence: r.confidence || 0,
    data_quality: r.data_quality || "",
    model_disagreement: Math.round((1 - (r.agreement ?? 1)) * 100) / 100,
    injury_state: r.injury_status || "",
    lineup_state: r.lineup_status || "",
    odds_movement: priced
      ? `T0 ${r.market_odds} → close ${r.closing_odds} (${(r.clv_pct || 0) >= 0 ? "+" : ""}${r.clv_pct || 0}%)`
      : "none captured",
    settlement: r.status,
    verification_source: r.verification || "verified_provider",
    result_source: r.result_source || "",
    win_factors_json: JSON.stringify(winFactors),
    loss_factors_json: JSON.stringify(lossFactors),
    loss_class: lossClass,
    analysis_status: "analyzed",
    learning_status: "pending",
    settled_at: r.settled_at || nowIso(),
  };
}

// Ingest every section ledger into the global ledger — idempotent across
// repeated syncs. Every create is gated by a VERIFIED deterministic-identity
// check; a failed/throttled gate read PAUSES all writes for the run (nothing
// is ever created against an unverified pool). Outcome rows are created once
// per settled prediction behind their own identity gate.
export async function syncGlobalEngine({ onState = () => {} } = {}) {
  const since = new Date(Date.now() - SOURCE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const pausedSections = [];
  const sources = {};
  const sourcesTruncated = {};

  // Sources are read SEQUENTIALLY — a read burst trips the platform's traffic
  // limit. A failed/throttled source read PAUSES that section for the run: it
  // is never treated as an empty ledger.
  const sections = [
    ["kala", "KalaModelObservation", "lagos_date_key", globalOfKalaObservation],
    ["win-raba", "WinRabaSelection", "lagos_date_key", globalOfWinRaba],
    ["slips", "BankuPickResult", "date_key", globalOfBankuPick],
  ];
  for (const [name, entityName, dateField] of sections) {
    try {
      const rows = await readOrThrow(
        () => base44.entities[entityName].filter({ [dateField]: { $gte: since } }, "-created_date", SOURCE_PAGE),
        `${name} source read`
      );
      sources[name] = rows;
      sourcesTruncated[name] = rows.length >= SOURCE_PAGE;
    } catch {
      pausedSections.push(name);
      sources[name] = [];
    }
  }

  // Candidates — one per deterministic global identity; display text is irrelevant.
  const byId = new Map();
  for (const [name, , , mapper] of sections) {
    for (const r of sources[name]) {
      const c = mapper(r);
      if (c?.market_key && c.global_prediction_id && !byId.has(c.global_prediction_id)) byId.set(c.global_prediction_id, c);
    }
  }
  const candidates = [...byId.values()];

  // EXISTENCE GATE — batched deterministic-identity check against the global
  // ledger. Any read failure after bounded retries PAUSES ALL WRITES.
  let existing;
  try {
    onState("DEDUP_CHECK");
    existing = await existingRowMap("GlobalPredictionLedger", "global_prediction_id", candidates.map((c) => c.global_prediction_id));
  } catch (e) {
    return {
      status: "paused",
      pausedReason: PAUSED_DUP_WRITE_MESSAGE,
      pausedSections,
      error: String(e?.message || e),
      sources: { kala: sources.kala.length, "win-raba": sources["win-raba"].length, slips: sources.slips.length },
      predictions: candidates.length,
      created: 0,
      updated: 0,
      skippedExisting: 0,
      outcomes: 0,
    };
  }

  const fresh = candidates.filter((c) => !existing.has(c.global_prediction_id));
  const updates = [];
  for (const c of candidates) {
    const cur = existing.get(c.global_prediction_id);
    if (cur && SETTLED.has(c.status) && !SETTLED.has(cur.status)) {
      // Settlement mirror — appended to the CANONICAL (earliest-created) row.
      updates.push({
        id: cur.id,
        status: c.status,
        verification: c.verification,
        actual_home: c.actual_home,
        actual_away: c.actual_away,
        result_source: c.result_source,
        settled_at: c.settled_at,
      });
    }
  }
  for (let i = 0; i < fresh.length; i += 400) {
    await base44.entities.GlobalPredictionLedger.bulkCreate(fresh.slice(i, i + 400));
  }
  if (updates.length) await base44.entities.GlobalPredictionLedger.bulkUpdate(updates);
  const skippedExisting = candidates.length - fresh.length;
  if (skippedExisting) {
    console.info(`syncGlobalEngine: EXISTING_PREDICTION_SKIPPED — ${skippedExisting} candidate(s) already on the ledger; nothing re-created`);
  }

  // OUTCOME GATE — one outcome per settled prediction, created exactly once,
  // behind its own verified identity check. A failed check pauses outcome
  // writes for the run (never a duplicate, never silently skipped forever).
  const settledCandidates = candidates.filter((c) => SETTLED.has(c.status) && c.probability != null);
  let outcomes = 0;
  let outcomesPaused = false;
  if (settledCandidates.length) {
    try {
      const done = await existingKeySet("GlobalOutcomeLedger", "global_prediction_id", settledCandidates.map((c) => c.global_prediction_id));
      const missing = settledCandidates.filter((c) => !done.has(c.global_prediction_id)).map(outcomeOf);
      for (let i = 0; i < missing.length; i += 400) {
        await base44.entities.GlobalOutcomeLedger.bulkCreate(missing.slice(i, i + 400));
      }
      outcomes = missing.length;
    } catch {
      outcomesPaused = true;
    }
  }

  const paused = pausedSections.length > 0 || outcomesPaused;
  return {
    status: paused ? "paused" : "ok",
    pausedReason: paused ? PAUSED_DUP_WRITE_MESSAGE : "",
    pausedSections,
    outcomesPaused,
    sources: { kala: sources.kala.length, "win-raba": sources["win-raba"].length, slips: sources.slips.length },
    sourcesTruncated,
    predictions: candidates.length,
    created: fresh.length,
    updated: updates.length,
    skippedExisting,
    outcomes,
  };
}