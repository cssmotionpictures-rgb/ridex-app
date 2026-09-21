// RX-2.1 CHALLENGER (recording layer) — injury + lineup intelligence bolted on
// top of the UNTOUCHED RX-2.0 champion. Challenger rows are RESEARCH
// OBSERVATIONS recorded in parallel on the SAME candidates the champion
// analyzed: same fixtures, same markets, same real prices — different model
// version. RX-2.1 never appears on betting boards; promotion happens only on
// out-of-sample evidence (rx21Core.championChallengerComparison).
//
// Lifecycle rules (identical to the champion ledger, never violated):
//  - recorded strictly BEFORE kickoff (KICKOFF LOCK)
//  - immutable after recording: a pre-kickoff lineup confirmation creates a
//    NEW :v2 row — the original is never rewritten
//  - settlement and closing-price capture run through the existing shared
//    settleObservations/captureClosingOdds (they grade every open row from
//    the verified feed, challenger rows included)
import { base44 } from "@/api/base44Client";
import { existingKeySet, PAUSED_DUP_WRITE_MESSAGE } from "@/lib/idempotency";
import { readOrThrow } from "@/lib/globalLearning/safeReads";
import { canonicalOf } from "./markets";
import { RX_MODELS, RX_MARKET_MODEL_WEIGHT } from "./models";
import { injuriesByDate, injuryIntel, lineupFor } from "./enrichment";
import { fixtureXgIntel, XG_MAX_FIXTURES_PER_SCAN, XG_KICKOFF_WINDOW_H } from "./xg";
import {
  RX21_MODEL_VERSION, challengerCandidate, challengerKey, challengerKeyV2,
  promoteLineupSnapshot,
} from "./rx21Core";
import { getProductionModel } from "./productionModel";

const nowIso = () => new Date().toISOString();

// The champion's model weights — the challenger re-blends the SAME votes plus
// the injury voter, so the weights stay in sync with RX-2.0 by construction.
const WEIGHTS = Object.fromEntries([
  ...RX_MODELS.map((m) => [m.key, m.weight]),
  ["market", RX_MARKET_MODEL_WEIGHT],
]);

export function rowOfChallenger(e, x, enrich, pm = null) {
  const c = e.c || {};
  const can = canonicalOf(c.marketKey);
  return {
    observation_key: challengerKey(e.fixtureId, c.marketKey),
    prediction_key: `${e.fixtureId}|${c.marketKey}`,
    qualified: !!x.qualifies,
    reject_reason: x.rejectReason || "",
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
    models_json: JSON.stringify({ ...x.perModel, ablation: x.ablation }),
    models_used: String(x.voting),
    models_unavailable:
      x.injuryVote == null
        ? [...(e.modelsUnavailable || []), "injury (no verified injury data — unknown, never zero)"].join(",")
        : (e.modelsUnavailable || []).join(","),
    ensemble_probability: x.prob,
    calibrated_probability: x.calibrated,
    confidence: x.displayConf,
    kala_score: x.master,
    grade: x.grade,
    agreement: x.agreement,
    uncertainty: x.uncertainty,
    data_quality: c.dq || "MEDIUM",
    pick_quality: c.quality || "MEDIUM",
    evidence: e.evidence || "",
    market_odds: c.price || 0,
    bookmaker: c.bookmaker || "",
    market_probability: c.implied || 0,
    margin_probability: c.marginImplied || 0,
    raw_edge_pct: x.rawEdgePct,
    edge_pct: x.edgePct,
    adjusted_edge_pct: x.adjEdgePct,
    min_adj_edge: c.minAdjEdge || 0,
    ev_pct: x.evPct,
    fair_odds: x.fairOdds,
    odds_status: c.priced ? "priced" : "model_only",
    weights_basis: pm?.promoted ? "baseline (RX-2.1 PRODUCTION — registry-promoted)" : "baseline (RX-2.1 challenger)",
    calibration_sample: c.calibrationSample ?? 0,
    flags_json: JSON.stringify(x.flags),
    provenance_json: JSON.stringify({
      ...(c.provenance || {}),
      rx21: {
        injuries: { source: "API-Football injuries (api-football proxy)", status: enrich.injury.status, fetchedAt: enrich.injury.fetchedAt },
        lineups: { source: "API-Football fixtures/lineups (api-football proxy)", status: enrich.lineup?.status || "not_checked" },
        xg: {
          source: "API-Football fixtures/statistics expected-goals (api-football proxy)",
          status: enrich.xg?.status || "not_checked",
          homeFor: enrich.xg?.home?.xgFor ?? null,
          homeAgainst: enrich.xg?.home?.xgAgainst ?? null,
          awayFor: enrich.xg?.away?.xgFor ?? null,
          awayAgainst: enrich.xg?.away?.xgAgainst ?? null,
        },
        challengerVersion: RX21_MODEL_VERSION,
      },
    }),
    snapshot_json: JSON.stringify({
      rx21: {
        injury: {
          status: enrich.injury.status,
          homeImpact: enrich.injury.homeImpact,
          awayImpact: enrich.injury.awayImpact,
          delta: enrich.injury.delta,
        },
        lineup: enrich.lineup,
        injuryVote: x.injuryVote,
        ablation: x.ablation,
        championProbability: c.calibrated ?? null,
        reason: "RX-2.1 challenger snapshot — champion RX-2.0 untouched",
      },
      champion: c.snapshot || null,
      // ACTIVE MODEL PROOF — registry resolution at generation time; when the
      // registry has promoted the challenger, its rows ARE the production model.
      activeModel: pm
        ? { productionVersion: pm.production_version, role: pm.role, registryChampion: pm.registry_champion || "", promoted: !!pm.promoted, resolvedAt: nowIso() }
        : null,
    }),
    model_version: RX21_MODEL_VERSION,
    injury_status: enrich.injury.status,
    injury_absences_home: enrich.injury.homeImpact?.out ?? 0,
    injury_absences_away: enrich.injury.awayImpact?.out ?? 0,
    lineup_status: enrich.lineup?.status || "",
    recorded_at: nowIso(),
    capture_status: "pending",
    closing_snapshots_json: "[]",
    status: "open",
  };
}

// Record the RX-2.1 challenger for every analyzed candidate — idempotent on
// the challenger key, strictly pre-kickoff, never lowering any gate.
export async function recordChallengerObservations(board, calibration) {
  const entries = (board?.observations || []).filter((e) => e?.c?.marketKey);
  if (!entries.length) return { recorded: 0, skipped: 0, injuriesAvailable: false, xgAvailable: 0 };

  const now = Date.now();
  const pre = entries.filter((e) => {
    const ko = new Date(e.kickoff).getTime();
    // KICKOFF LOCK — pre-match records only.
    return Number.isFinite(ko) && ko > now;
  });
  if (!pre.length) return { recorded: 0, skipped: entries.length, injuriesAvailable: false, xgAvailable: 0, status: "ok" };

  // EXISTENCE GATE — the deterministic challenger identity is verified with a
  // batched read BEFORE any enrichment or write. A failed/throttled check
  // PAUSES the write entirely: an unverified pool never receives rows.
  let have;
  try {
    have = await existingKeySet("KalaModelObservation", "observation_key", pre.map((e) => challengerKey(e.fixtureId, e.c.marketKey)));
  } catch (e) {
    return {
      recorded: 0,
      skipped: entries.length,
      injuriesAvailable: false,
      xgAvailable: 0,
      status: "paused",
      reason: PAUSED_DUP_WRITE_MESSAGE,
      error: String(e?.message || e),
    };
  }
  const todo = pre.filter((e) => !have.has(challengerKey(e.fixtureId, e.c.marketKey)));
  if (!todo.length) return { recorded: 0, skipped: entries.length, injuriesAvailable: false, xgAvailable: 0, status: "ok", existingSkipped: pre.length };

  // Verified injury data per kickoff UTC date (null = unavailable, recorded).
  // Dates are fetched SEQUENTIALLY with a short gap — parallel bursts trip the
  // provider's per-minute limit and produce false "unavailable" results.
  const dates = [...new Set(todo.map((e) => String(e.kickoff).slice(0, 10)))];
  const inj = {};
  for (const d of dates) {
    inj[d] = await injuriesByDate(d);
    if (dates.length > 1) await new Promise((r) => setTimeout(r, 1500));
  }

  // Confirmed lineups only for imminent fixtures — they publish near kickoff,
  // and the quota is never burned on far-future fixtures. Later confirmations
  // are captured by the heartbeat (captureLineupConfirmations).
  const imminent = todo
    .map((e) => ({ e, mins: (new Date(e.kickoff).getTime() - now) / 60000 }))
    .filter((x) => x.mins >= 0 && x.mins <= 180)
    .slice(0, 8);
  const lineups = new Map();
  for (const { e } of imminent) {
    if (lineups.has(e.fixtureId)) continue;
    lineups.set(e.fixtureId, await lineupFor(String(e.kickoff).slice(0, 10), e.home, e.away));
  }

  // VERIFIED EXPECTED-GOALS (xG) RESEARCH — deep enrichment for the strongest
  // pre-kickoff candidates inside the closing window, capped per scan to
  // protect the provider quota, fetched sequentially (never burst). Recorded
  // as a research ablation ONLY — the challenger's own probability never
  // moves from it; promotion happens on out-of-sample evidence.
  const xgByFixture = new Map();
  const xgRanked = todo
    .filter((e) => {
      const mins = (new Date(e.kickoff).getTime() - now) / 60000;
      return mins >= 0 && mins <= XG_KICKOFF_WINDOW_H * 60;
    })
    .sort((a, b) => (b.c.master || 0) - (a.c.master || 0));
  for (const e of xgRanked) {
    if (xgByFixture.size >= XG_MAX_FIXTURES_PER_SCAN) break;
    if (xgByFixture.has(e.fixtureId)) continue;
    xgByFixture.set(e.fixtureId, await fixtureXgIntel(e.leagueCode, e.kickoff, e.home, e.away).catch(() => ({ status: "unavailable" })));
    await new Promise((r) => setTimeout(r, 1200)); // pace — the quota is shared with injuries and lineups
  }

  // ACTIVE MODEL RESOLUTION — stamped into every new challenger snapshot; when
  // the registry has promoted the challenger, its rows are the production model.
  const pm = await getProductionModel();
  const rows = [];
  for (const e of todo) {
    const date = String(e.kickoff).slice(0, 10);
    const intel = injuryIntel(inj[date], e.home, e.away, e.kickoff);
    const lu = lineups.get(e.fixtureId) || null;
    const minutes = Math.round((new Date(e.kickoff).getTime() - now) / 60000);
    const x = challengerCandidate(
      e.c,
      {
        injuryDelta: intel.delta,
        lineupStatus: lu?.status || "",
        minutesToKickoff: minutes,
        xg: xgByFixture.get(e.fixtureId) || null,
      },
      WEIGHTS,
      calibration
    );
    if (!x) continue; // invalid challenger computation — the champion row stands alone, nothing fudged
    rows.push(
      rowOfChallenger(e, x, {
        injury: {
          status: intel.status,
          homeImpact: intel.homeImpact,
          awayImpact: intel.awayImpact,
          delta: intel.delta,
          fetchedAt: nowIso(),
        },
        lineup: lu,
        xg: xgByFixture.get(e.fixtureId) || null,
      }, pm)
    );
  }
  for (let i = 0; i < rows.length; i += 400) {
    await base44.entities.KalaModelObservation.bulkCreate(rows.slice(i, i + 400));
  }
  return {
    recorded: rows.length,
    skipped: entries.length - rows.length,
    injuriesAvailable: dates.some((d) => Array.isArray(inj[d])),
    xgAvailable: [...xgByFixture.values()].filter((x) => x?.status === "matched").length,
  };
}

// LINEUP CONFIRMATION CAPTURE — while KALA is open, open RX-2.1 rows inside the
// closing window whose lineup is not yet confirmed are re-checked. A
// confirmation creates a NEW immutable :v2 snapshot for every market of that
// fixture (probabilities unchanged, uncertainty reduced). The v1 rows stay on
// record untouched. Strictly pre-kickoff — never a post-kickoff price or fact.
export async function captureLineupConfirmations({ windowMs = 150 * 60000, maxFixtures = 6 } = {}) {
  const now = Date.now();
  // EXISTENCE GATE — a throttled/failed open-row read PAUSES :v2 creation:
  // an unverified pool never receives rows.
  let open21;
  try {
    open21 = await readOrThrow(
      () => base44.entities.KalaModelObservation.filter({ model_version: RX21_MODEL_VERSION, status: "open" }, "kickoff", 400),
      "RX-2.1 open-row read (lineup confirmation)"
    );
  } catch {
    return { due: 0, confirmed: 0, rows: 0, status: "paused", reason: PAUSED_DUP_WRITE_MESSAGE };
  }
  const have = new Set((open21 || []).map((r) => r.observation_key));
  const byFixture = new Map();
  (open21 || []).forEach((r) => {
    const t = new Date(r.kickoff).getTime();
    if (!Number.isFinite(t) || t <= now + 60000 || t > now + windowMs) return;
    if (r.lineup_status === "confirmed") return;
    if (/:v\d+$/.test(String(r.observation_key || ""))) return; // superseded versions never re-check
    if (!byFixture.has(r.fixture_id)) byFixture.set(r.fixture_id, []);
    byFixture.get(r.fixture_id).push(r);
  });
  if (!byFixture.size) return { due: 0, confirmed: 0, rows: 0 };

  const fresh = [];
  let confirmed = 0;
  for (const [fid, rows] of [...byFixture.entries()].slice(0, maxFixtures)) {
    const r0 = rows[0];
    let lu = null;
    try {
      lu = await lineupFor(String(r0.kickoff).slice(0, 10), r0.home, r0.away);
    } catch {
      lu = null;
    }
    if (!lu || lu.status !== "confirmed") continue; // not published yet — checked again next heartbeat
    confirmed++;
    for (const r of rows) {
      const v2Key = challengerKeyV2(r.fixture_id, r.market_key);
      if (have.has(v2Key)) continue;
      const { id, created_date, updated_date, created_by_id, ...rest } = r;
      fresh.push({ ...rest, ...promoteLineupSnapshot(r, lu) });
    }
  }
  if (fresh.length) {
    for (let i = 0; i < fresh.length; i += 400) {
      await base44.entities.KalaModelObservation.bulkCreate(fresh.slice(i, i + 400));
    }
  }
  return { due: byFixture.size, confirmed, rows: fresh.length };
}