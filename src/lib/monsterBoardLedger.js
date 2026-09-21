// MONSTER BOARD LEDGER — persistence + settlement mirroring + analytics for
// the MONSTER DAILY BOARDS (the MonsterPick entity). MONSTER reuses the shared
// immutable evidence infrastructure: every selection is born from a
// KalaModelObservation row (the same RX-2.0 candidate every section analyzes)
// and learns through the SAME global ledger row — global_prediction_id links
// to it, so MONSTER never duplicates global ingestion. Settlement is MIRRORED
// from the linked observation's verified result; MONSTER never settles
// independently and never rewrites a recorded selection — a material
// pre-kickoff change creates Version 2 instead.
// (Note: src/lib/monsterLedger.js is the separate settlement module of the
// legacy MONSTER 6-day rollover tracker — this file never touches it.)

import { base44 } from "@/api/base44Client";
import { readWithRetry } from "@/lib/throttledRead";
import { canonicalOf } from "@/lib/ensemble/markets";
import { RX_MODEL_VERSION } from "@/lib/ensemble/engine";
import { loadObservations } from "@/lib/ensemble/observations";
import { globalPredictionId } from "@/lib/globalLearning/globalId";
import { kalaAnalytics, calibrationBuckets, groupBy } from "@/lib/kala";
import {
  MONSTER_MODEL_VERSION, tierOfMonster, whyMonster, riskFlagsOf, architectureSimilarity,
} from "@/lib/monsterBoard";

const nowIso = () => new Date().toISOString();

export function monsterIdOf(fixtureId, marketKey, version) {
  return `monster|${fixtureId}|${marketKey}|v${version}`;
}

export function rowOfMonsterPick(p, rank, correlation, version, supersedes, opts = {}) {
  const can = canonicalOf(p.marketKey);
  const score = p.masterScore ?? p.score ?? 0;
  return {
    monster_id: opts.idOf ? opts.idOf(p.fixtureId, p.marketKey, version) : monsterIdOf(p.fixtureId, p.marketKey, version),
    observation_key: `${p.fixtureId}|${p.marketKey}`,
    global_prediction_id: globalPredictionId("kala", RX_MODEL_VERSION, p.fixtureId, p.marketKey, 1),
    model_version: RX_MODEL_VERSION,
    monster_version: MONSTER_MODEL_VERSION,
    source_section: opts.section || "monster",
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
    tier: tierOfMonster(score),
    monster_score: Math.round(score * 10) / 10,
    architecture_similarity: architectureSimilarity(p),
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
    why_json: JSON.stringify(whyMonster(p)),
    risk_flags_json: JSON.stringify(riskFlagsOf(p)),
    correlation_risk: correlation || "LOW",
    prediction_version: version,
    supersedes_monster_id: supersedes,
    status: "open",
    recorded_at: nowIso(),
  };
}

// Record the daily boards — idempotent per fixture+market, strictly
// pre-kickoff. A MATERIAL pre-kickoff change (score ≥3 points or a price move
// ≥5%) creates the next immutable version and supersedes the old row — the
// original is never rewritten.
export async function recordMonsterPicks(items, opts = {}) {
  const section = opts.section || "monster";
  if (!items?.length) return { recorded: 0, superseded: 0 };
  const now = Date.now();
  const existing = await readWithRetry(
    () => base44.entities.MonsterPick.filter({}, "-recorded_at", 1000),
    { fallback: [] }
  );
  const latestByKey = new Map();
  (existing || []).forEach((r) => {
    // section-scoped identity — the PASTE section never touches the daily
    // board's rows and vice versa, even on the same fixture+market
    const k = `${r.source_section || "monster"}|${r.fixture_id}|${r.market_key}`;
    const cur = latestByKey.get(k);
    if (!cur || (r.prediction_version || 1) >= (cur.prediction_version || 1)) latestByKey.set(k, r);
  });
  const fresh = [];
  const sup = [];
  const seen = new Set();
  for (const { pick: p, rank, correlation } of items) {
    if (!p?.fixtureId || !p?.marketKey) continue;
    const key = `${section}|${p.fixtureId}|${p.marketKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ko = new Date(p.kickoff).getTime();
    if (!Number.isFinite(ko) || ko <= now) continue; // KICKOFF LOCK — pre-match records only
    const prev = latestByKey.get(key);
    if (!prev) { fresh.push(rowOfMonsterPick(p, rank, correlation, 1, "", opts)); continue; }
    if (["won", "lost", "void"].includes(prev.status)) continue; // settled — immutable
    const scoreDelta = Math.abs((p.masterScore ?? p.score ?? 0) - (prev.monster_score || 0));
    const oddsDelta =
      (p.marketOdds || 0) > 1 && (prev.market_odds || 0) > 1
        ? Math.abs(p.marketOdds / prev.market_odds - 1) * 100
        : 0;
    if (scoreDelta >= 3 || oddsDelta >= 5) {
      const v = (prev.prediction_version || 1) + 1;
      fresh.push(rowOfMonsterPick(p, rank, correlation, v, prev.monster_id, opts));
      sup.push({ id: prev.id, status: "superseded" });
    }
  }
  if (fresh.length) await base44.entities.MonsterPick.bulkCreate(fresh).catch(() => null);
  if (sup.length) await base44.entities.MonsterPick.bulkUpdate(sup).catch(() => null);
  return { recorded: fresh.length, superseded: sup.length };
}

export async function loadMonsterPicks(limit = 1000) {
  return readWithRetry(
    () => base44.entities.MonsterPick.filter({}, "-recorded_at", limit),
    { fallback: [] }
  );
}

// Mirror the authoritative verified settlement from the linked observation
// onto the open MONSTER rows. Append-only — never settles independently.
export async function mirrorMonsterSettlement() {
  const open = await readWithRetry(
    () => base44.entities.MonsterPick.filter({ status: "open" }, "-kickoff", 200),
    { fallback: [] }
  );
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
  if (updates.length) await base44.entities.MonsterPick.bulkUpdate(updates).catch(() => null);
  return updates.length;
}

// === PERFORMANCE ANALYTICS — INSUFFICIENT SAMPLE is shown instead of
// meaningless percentages until the settled sample earns them ===
export const MONSTER_MIN_SAMPLE = 10;

export const monsterOddsBandOf = (o) =>
  !o || o <= 0 ? "UNPRICED" : o < 1.5 ? "1.01–1.49" : o < 2 ? "1.50–1.99" : o < 3 ? "2.00–2.99" : o < 4 ? "3.00–3.99" : "4.00+";

export function monsterAnalytics(rows) {
  const list = (rows || []).map((r) => ({ ...r, calibrated_probability: r.probability }));
  const base = kalaAnalytics(list);
  const graded = list.filter((r) => ["won", "lost"].includes(r.status));
  const avgScore = graded.length
    ? Math.round((graded.reduce((s, r) => s + (r.monster_score || 0), 0) / graded.length) * 10) / 10
    : null;
  const clvRows = graded.filter((r) => (r.clv_pct || 0) !== 0);
  const clv = clvRows.length
    ? Math.round((clvRows.reduce((s, r) => s + r.clv_pct, 0) / clvRows.length) * 10) / 10
    : null;
  return {
    ...base,
    avgScore,
    clv,
    calibration: calibrationBuckets(list),
    groups: {
      market: groupBy(graded, (r) => r.market_label),
      odds: groupBy(graded, (r) => monsterOddsBandOf(r.market_odds)),
      competition: groupBy(graded, (r) => r.league),
      tier: groupBy(graded, (r) => r.tier),
    },
  };
}