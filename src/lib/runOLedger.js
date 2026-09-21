// RUN O LEDGER — persistence + settlement mirroring + analytics for the RUN O
// premium selections. RUN O reuses the shared immutable evidence
// infrastructure: every selection is born from a KalaModelObservation row
// (same RX-2.0 candidate) and learns through the SAME global ledger row —
// global_prediction_id links to it, so RUN O never duplicates global
// ingestion. Settlement is MIRRORED from the linked observation's verified
// result; RUN O never settles independently and never rewrites a recorded
// selection — a material pre-kickoff change creates Version 2 instead.

import { base44 } from "@/api/base44Client";
import { canonicalOf } from "@/lib/ensemble/markets";
import { RX_MODEL_VERSION } from "@/lib/ensemble/engine";
import { loadObservations } from "@/lib/ensemble/observations";
import { globalPredictionId } from "@/lib/globalLearning/globalId";
import { kalaAnalytics, calibrationBuckets, groupBy } from "@/lib/kala";
import { RUNO_MODEL_VERSION, tierOf, whyRunO, riskFlagsOf } from "@/lib/runO";

const nowIso = () => new Date().toISOString();

export function runoIdOf(fixtureId, marketKey, version) {
  return `runo|${fixtureId}|${marketKey}|v${version}`;
}

// RX-2.1 injury/lineup enrichment for the displayed cards — latest row per
// fixture+market. Empty map means UNKNOWN, never zero.
export async function loadRx21Enrichment() {
  const rows = await loadObservations(1000).catch(() => []);
  const map = {};
  (rows || []).filter((r) => r.model_version === "RX-2.1").forEach((r) => {
    const [fx, mkt] = String(r.observation_key || "").split("|");
    if (!fx || !mkt) return;
    const k = `${fx}|${mkt}`;
    const cur = map[k];
    if (!cur || new Date(r.recorded_at || 0) >= new Date(cur.recorded_at || 0)) {
      map[k] = {
        injuryStatus: r.injury_status || "",
        absHome: r.injury_absences_home || 0,
        absAway: r.injury_absences_away || 0,
        lineupStatus: r.lineup_status || "",
        recordedAt: r.recorded_at,
      };
    }
  });
  return map;
}

function rowOfRunOPick(p, rank, correlation, enrichment, version, supersedes) {
  const en = (enrichment || {})[`${p.fixtureId}|${p.marketKey}`] || {};
  const can = canonicalOf(p.marketKey);
  const score = p.masterScore ?? p.score ?? 0;
  return {
    runo_id: runoIdOf(p.fixtureId, p.marketKey, version),
    observation_key: `${p.fixtureId}|${p.marketKey}`,
    global_prediction_id: globalPredictionId("kala", RX_MODEL_VERSION, p.fixtureId, p.marketKey, 1),
    model_version: RX_MODEL_VERSION,
    runo_version: RUNO_MODEL_VERSION,
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
    canonical_market: can.id,
    settlement_rule: can.rule,
    rank,
    tier: tierOf(score),
    runo_score: Math.round(score * 10) / 10,
    probability: p.prob,
    confidence: p.confidence || 0,
    market_odds: p.marketOdds || 0,
    bookmaker: p.bookmaker || "",
    market_probability: p.marketProbability || 0,
    fair_odds: p.fairOdds || 0,
    edge_pct: p.edgePct || 0,
    adjusted_edge_pct: p.adjEdgePct || 0,
    ev_pct: p.evPct || 0,
    odds_status: p.oddsStatus || "",
    agreement: p.agreement ?? 1,
    uncertainty: p.uncertainty ?? 0,
    data_quality: p.qualityLabel || p.quality || "",
    injury_status: en.injuryStatus || "",
    injury_absences_home: en.absHome || 0,
    injury_absences_away: en.absAway || 0,
    lineup_status: en.lineupStatus || "",
    why_json: JSON.stringify(whyRunO(p)),
    risk_flags_json: JSON.stringify(riskFlagsOf(p)),
    correlation_risk: correlation || "LOW",
    prediction_version: version,
    supersedes_runo_id: supersedes,
    status: "open",
    recorded_at: nowIso(),
  };
}

// Record the RUN O daily board — idempotent per fixture+market, strictly
// pre-kickoff. A MATERIAL pre-kickoff change (score ≥3 points, price ≥5%, or
// a newly confirmed lineup) creates the next immutable version and supersedes
// the old row — the original is never rewritten.
export async function recordRunOPicks(items, enrichment = {}) {
  if (!items?.length) return { recorded: 0, superseded: 0 };
  const now = Date.now();
  const existing = await base44.entities.RunOPick.filter({}, "-recorded_at", 1000).catch(() => []);
  const latestByKey = new Map();
  (existing || []).forEach((r) => {
    const k = `${r.fixture_id}|${r.market_key}`;
    const cur = latestByKey.get(k);
    if (!cur || (r.prediction_version || 1) >= (cur.prediction_version || 1)) latestByKey.set(k, r);
  });
  const fresh = [];
  const sup = [];
  const seen = new Set();
  for (const { pick: p, rank, correlation } of items) {
    if (!p?.fixtureId || !p?.marketKey) continue;
    const key = `${p.fixtureId}|${p.marketKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ko = new Date(p.kickoff).getTime();
    if (!Number.isFinite(ko) || ko <= now) continue; // KICKOFF LOCK — pre-match records only
    const prev = latestByKey.get(key);
    if (!prev) { fresh.push(rowOfRunOPick(p, rank, correlation, enrichment, 1, "")); continue; }
    if (["won", "lost", "void"].includes(prev.status)) continue; // settled — immutable
    const en = (enrichment || {})[key] || {};
    const scoreDelta = Math.abs((p.masterScore ?? p.score ?? 0) - (prev.runo_score || 0));
    const oddsDelta =
      (p.marketOdds || 0) > 1 && (prev.market_odds || 0) > 1
        ? Math.abs(p.marketOdds / prev.market_odds - 1) * 100
        : 0;
    const lineupUpgrade = en.lineupStatus === "confirmed" && (prev.lineup_status || "") !== "confirmed";
    if (scoreDelta >= 3 || oddsDelta >= 5 || lineupUpgrade) {
      const v = (prev.prediction_version || 1) + 1;
      fresh.push(rowOfRunOPick(p, rank, correlation, enrichment, v, prev.runo_id));
      sup.push({ id: prev.id, status: "superseded" });
    }
  }
  if (fresh.length) await base44.entities.RunOPick.bulkCreate(fresh);
  if (sup.length) await base44.entities.RunOPick.bulkUpdate(sup);
  return { recorded: fresh.length, superseded: sup.length };
}

export async function loadRunOPicks(limit = 1000) {
  const rows = await base44.entities.RunOPick.filter({}, "-recorded_at", limit).catch(() => []);
  return rows || [];
}

// Mirror the authoritative verified settlement from the linked observation
// onto the open RUN O rows. Append-only — never settles independently.
export async function mirrorRunOSettlement() {
  const open = await base44.entities.RunOPick.filter({ status: "open" }, "-kickoff", 200).catch(() => []);
  if (!open?.length) return 0;
  const obs = await loadObservations(1000).catch(() => []);
  const map = new Map((obs || []).map((o) => [o.observation_key, o]));
  const updates = [];
  open.forEach((r) => {
    const o = map.get(r.observation_key);
    if (o && ["won", "lost", "void"].includes(o.status)) {
      updates.push({
        id: r.id,
        status: o.status,
        actual_home: o.actual_home ?? 0,
        actual_away: o.actual_away ?? 0,
        result_source: o.result_source || "mirrored from the linked verified observation",
        clv_pct: o.clv_pct || 0,
        settled_at: o.settled_at || nowIso(),
      });
    }
  });
  if (updates.length) await base44.entities.RunOPick.bulkUpdate(updates);
  return updates.length;
}

// === PERFORMANCE ANALYTICS — INSUFFICIENT SAMPLE is shown instead of
// meaningless percentages until the settled sample earns them ===
export const RUNO_MIN_GROUP_SAMPLE = 10;

export const oddsBandOf = (o) =>
  !o || o <= 0 ? "UNPRICED" : o < 1.5 ? "1.01–1.49" : o < 2 ? "1.50–1.99" : o < 3 ? "2.00–2.99" : o < 4 ? "3.00–3.99" : "4.00+";

export function runoAnalytics(rows) {
  const list = (rows || []).map((r) => ({ ...r, calibrated_probability: r.probability }));
  const base = kalaAnalytics(list);
  const graded = list.filter((r) => ["won", "lost"].includes(r.status));
  const avgScore = graded.length
    ? Math.round((graded.reduce((s, r) => s + (r.runo_score || 0), 0) / graded.length) * 10) / 10
    : null;
  const clvRows = graded.filter((r) => (r.clv_pct || 0) !== 0);
  const clv = clvRows.length
    ? Math.round((clvRows.reduce((s, r) => s + r.clv_pct, 0) / clvRows.length) * 10) / 10
    : null;
  const injRows = graded.filter((r) => (r.injury_status || "") !== "");
  const linRows = graded.filter((r) => (r.lineup_status || "") !== "");
  return {
    ...base,
    avgScore,
    clv,
    calibration: calibrationBuckets(list),
    groups: {
      market: groupBy(graded, (r) => r.market_label),
      odds: groupBy(graded, (r) => oddsBandOf(r.market_odds)),
      competition: groupBy(graded, (r) => r.league),
      tier: groupBy(graded, (r) => r.tier),
    },
    injuryInformed: injRows.length
      ? { n: injRows.length, won: injRows.filter((r) => r.status === "won").length }
      : null,
    lineupInformed: linRows.length
      ? { n: linRows.length, won: linRows.filter((r) => r.status === "won").length }
      : null,
  };
}