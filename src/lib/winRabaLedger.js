// WIN RABA ledger — permanent prediction tracking, accumulator records and
// settlement against REAL final scores. Every selection is recorded before
// kickoff and never rewritten: a pre-kickoff model change creates Prediction
// Version 2 and keeps Version 1. Settlement grades from the API-Football
// fixture result; a pick with no result within 7 days is voided (counts
// toward nothing). The ACCA LAB learns market adjustments from settled
// history only after a meaningful sample (WR_LEARN_MIN_SAMPLE) — never
// overfit to a tiny sample.

import { base44 } from "@/api/base44Client";
import { readWithRetry } from "@/lib/throttledRead";
import { apiFootball } from "@/lib/apiFootball";
import { WR_MODEL_VERSION, WR_LEARN_MIN_SAMPLE } from "@/lib/winRaba";
import { findResultByFixture, codeOfLabel } from "@/lib/ensemble/fixtures";

const nowIso = () => new Date().toISOString();

// Grade a market key against the real final score. true/false, or null when
// the market can't be resolved — never guessed.
export function wrSettle(key, h, a) {
  const k = String(key || "").trim().toUpperCase();
  if (k === "1") return h > a;
  if (k === "X") return h === a;
  if (k === "2") return a > h;
  if (k === "1X") return h >= a;
  if (k === "X2") return a >= h;
  if (k === "12") return h !== a;
  const o = /^O([\d.]+)$/.exec(k);
  if (o) return h + a > Number(o[1]);
  const u = /^U([\d.]+)$/.exec(k);
  if (u) return h + a < Number(u[1]);
  if (k === "BTTS_Y") return h > 0 && a > 0;
  if (k === "BTTS_N") return !(h > 0 && a > 0);
  if (k === "DNB1") return h > a; // a draw voids the leg, handled by the caller
  if (k === "DNB2") return a > h;
  return null;
}

function rowOf(p) {
  return {
    fixture_id: p.fixtureId,
    home: p.home,
    away: p.away,
    league: p.league,
    kickoff: p.kickoff,
    lagos_date_key: p.lagosDateKey,
    day_index: p.dayIndex || 0,
    session: p.session,
    market_key: p.marketKey,
    market_label: p.marketLabel,
    model_probability: p.prob,
    confidence: p.confidence != null ? p.confidence : Math.round(p.prob * 100),
    market_odds: p.marketOdds || 0,
    bookmaker: p.bookmaker || "",
    market_probability: p.marketProbability || 0,
    edge_pct: p.edgePct || 0,
    data_quality: p.dataQuality || "",
    odds_status: p.oddsStatus || "",
    prediction_version: 1,
    supersedes_id: "",
    model_version: WR_MODEL_VERSION,
    status: "open",
    recorded_at: nowIso(),
  };
}

// Permanently record every pick shown on the board — idempotent. A pre-kickoff
// model change (different market, or probability moved >2pp) creates Prediction
// Version 2 and marks the prior row superseded; history is never rewritten.
export async function recordWinRabaBoard(days) {
  const picks = (days || []).flatMap((d) => [...d.morning, ...d.evening]);
  if (!picks.length) return { recorded: 0, updated: 0 };
  const since = days[0].dateKey;
  const existing = await readWithRetry(
    () => base44.entities.WinRabaSelection.filter({ lagos_date_key: { $gte: since } }, "-recorded_at", 500),
    { fallback: [] }
  );
  const byFx = {};
  (existing || []).forEach((r) => {
    (byFx[r.fixture_id] ||= []).push(r);
  });

  const fresh = [];
  const superseded = [];
  for (const p of picks) {
    const rows = (byFx[p.fixtureId] || []).filter((r) => r.status !== "superseded");
    const current = rows.sort((a, b) => (b.prediction_version || 1) - (a.prediction_version || 1))[0];
    if (!current) {
      fresh.push(rowOf(p));
      continue;
    }
    const sameCall =
      current.market_key === p.marketKey &&
      Math.abs((current.model_probability || 0) - p.prob) <= 0.02;
    if (sameCall) continue; // identical prediction — never duplicated
    if (new Date(current.kickoff).getTime() > Date.now()) {
      // model changed before kickoff → Prediction Version 2, Version 1 kept
      fresh.push({ ...rowOf(p), prediction_version: (current.prediction_version || 1) + 1, supersedes_id: current.id });
      superseded.push({ id: current.id, status: "superseded" });
    }
  }
  if (fresh.length) await base44.entities.WinRabaSelection.bulkCreate(fresh);
  if (superseded.length) await base44.entities.WinRabaSelection.bulkUpdate(superseded);
  return { recorded: fresh.length, updated: superseded.length };
}

// Store a built accumulator with a permanent leg snapshot, linked to the
// selection rows it was built from.
export async function recordWinRabaAcca(acca, dateKey) {
  if (!acca || !acca.legs.length) return null;
  const minDate = acca.legs.map((l) => l.lagosDateKey).sort()[0];
  const rows = await readWithRetry(
    () => base44.entities.WinRabaSelection.filter({ lagos_date_key: { $gte: minDate } }, "-recorded_at", 500),
    { fallback: [] }
  );
  const latestByFx = {};
  (rows || []).forEach((r) => {
    const k = `${r.fixture_id}|${r.market_key}`;
    const prev = latestByFx[k];
    if (!prev || (r.prediction_version || 1) > (prev.prediction_version || 1)) latestByFx[k] = r;
  });
  const memberIds = acca.legs
    .map((l) => latestByFx[`${l.fixtureId}|${l.marketKey}`]?.id)
    .filter(Boolean);

  const legsJson = JSON.stringify(
    acca.legs.map((l) => ({
      fixtureId: l.fixtureId,
      home: l.home,
      away: l.away,
      league: l.league,
      kickoff: l.kickoff,
      kickoffLabel: l.kickoffLabel,
      lagosDate: l.lagosDateKey,
      session: l.session,
      market: l.marketLabel,
      marketKey: l.marketKey,
      odds: l.marketOdds || 0,
      bookmaker: l.bookmaker || "",
      confidence: l.confidence,
      probability: l.prob,
      edgePct: l.edgePct || 0,
      dataQuality: l.dataQuality || "",
      oddsStatus: l.oddsStatus || "",
    }))
  );

  return base44.entities.WinRabaAcca.create({
    level: acca.level,
    date_key: dateKey,
    legs_count: acca.legsCount,
    combined_odds: acca.combinedOdds,
    odds_basis: acca.oddsBasis,
    combined_probability: acca.combinedProbability,
    risk_level: acca.riskLevel,
    correlation_note: acca.correlationNote,
    paper_stake: acca.paperStake,
    potential_return: acca.potentialReturn,
    member_ids: memberIds.join(","),
    legs_json: legsJson,
    status: "open",
  });
}

// Settle every selection whose kickoff has passed, from the real final score,
// then settle the accumulators from their members' results.
export async function settleWinRaba() {
  const open = await readWithRetry(
    () => base44.entities.WinRabaSelection.filter({ status: "open" }, "-kickoff", 200),
    { fallback: [] }
  );
  const due = (open || []).filter((r) => r.kickoff && new Date(r.kickoff).getTime() < Date.now() - 105 * 60000);
  const updates = [];
  for (const r of due.slice(0, 40)) {
    try {
      // RX-2.0 board picks (of- fixture ids) settle from the verified
      // openfootball result — the same feed the prediction was made from.
      if (String(r.fixture_id || "").startsWith("of-")) {
        const code = codeOfLabel(r.league);
        if (code) {
          const res = await findResultByFixture(r.home, r.away, String(r.kickoff).slice(0, 10), code);
          if (res) {
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
        }
        continue;
      }
      const data = await apiFootball("fixtures", { id: r.fixture_id });
      const f = data?.response?.[0];
      const st = f?.fixture?.status?.short || "";
      const h = f?.goals?.home;
      const a = f?.goals?.away;
      if (["FT", "AET", "PEN"].includes(st) && h != null && a != null) {
        const won = wrSettle(r.market_key, h, a);
        if (won == null) continue;
        const isDnb = /^DNB/i.test(r.market_key);
        updates.push({
          id: r.id,
          status: isDnb && h === a ? "void" : won ? "won" : "lost",
          actual_home: h,
          actual_away: a,
          result_source: "API-Football fixture result",
          settled_at: nowIso(),
        });
      } else if (["PST", "CANC", "ABD", "AWD", "WO"].includes(st)) {
        updates.push({ id: r.id, status: "cancelled", result_source: "API-Football fixture result", settled_at: nowIso() });
      } else if (new Date(r.kickoff).getTime() < Date.now() - 7 * 86400000) {
        updates.push({ id: r.id, status: "void", settled_at: nowIso() }); // no result within 7 days — counts toward nothing
      }
    } catch {
      // provider hiccup — the pick stays open and is retried on the next visit
    }
  }
  if (updates.length) await base44.entities.WinRabaSelection.bulkUpdate(updates);
  const accas = await settleWinRabaAccas();
  return { settled: updates.length, accas };
}

async function settleWinRabaAccas() {
  const open = await readWithRetry(
    () => base44.entities.WinRabaAcca.filter({ status: "open" }, "-created_date", 100),
    { fallback: [] }
  );
  const updates = [];
  for (const acca of open || []) {
    const ids = String(acca.member_ids || "").split(",").filter(Boolean);
    if (!ids.length) continue;
    const rows = (await Promise.all(
      ids.map((id) => base44.entities.WinRabaSelection.get(id).catch(() => null))
    )).filter(Boolean);
    if (rows.length < ids.length) continue; // a member row isn't reachable yet
    const won = rows.filter((m) => m.status === "won").length;
    const lost = rows.filter((m) => m.status === "lost").length;
    const voided = rows.filter((m) => ["void", "cancelled", "superseded"].includes(m.status)).length;
    if (won + lost + voided < rows.length) continue; // still-open member — acca stays open
    // A failed acca never rewrites its legs: won only when every non-void leg won.
    const status = lost ? "lost" : won ? "won" : "void";
    updates.push({ id: acca.id, status, won_legs: won, lost_legs: lost, void_legs: voided, settled_at: nowIso() });
  }
  if (updates.length) await base44.entities.WinRabaAcca.bulkUpdate(updates);
  return updates.length;
}

export async function getWinRabaAccas(limit = 100) {
  return readWithRetry(
    () => base44.entities.WinRabaAcca.filter({}, "-created_date", limit),
    { fallback: [] }
  );
}

// ACCA LAB — performance stats + learned market adjustments. A failed
// accumulator never marks its underlying picks bad: individual selections are
// tracked separately from acca hit rates.
export async function getWinRabaStats() {
  const rows = await readWithRetry(
    () => base44.entities.WinRabaSelection.filter({}, "-recorded_at", 1000),
    { fallback: [] }
  );
  const settled = (rows || []).filter((r) => ["won", "lost", "void"].includes(r.status));
  const graded = settled.filter((r) => r.status !== "void");
  const accas = await getWinRabaAccas(300);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : null);

  const won = graded.filter((r) => r.status === "won");
  const morningGraded = graded.filter((r) => r.session === "morning");
  const eveningGraded = graded.filter((r) => r.session === "evening");

  const group = (keyFn) => {
    const g = {};
    graded.forEach((r) => {
      const k = keyFn(r) || "—";
      (g[k] ||= { n: 0, won: 0, probSum: 0 });
      g[k].n++;
      g[k].probSum += r.model_probability || 0;
      if (r.status === "won") g[k].won++;
    });
    return Object.fromEntries(
      Object.entries(g).map(([k, v]) => [k, { settled: v.n, wonRate: pct(v.won, v.n), avgProb: Math.round((v.probSum / v.n) * 100) }])
    );
  };

  const accasSettled = (accas || []).filter((a) => a.status === "won" || a.status === "lost");
  const accaProfit = (accasSettled || []).reduce(
    (s, a) => s + (a.status === "won" ? (a.paper_stake || 0) * ((a.combined_odds || 1) - 1) : -(a.paper_stake || 0)),
    0
  );
  const accaStaked = (accasSettled || []).reduce((s, a) => s + (a.paper_stake || 0), 0);

  const accaByLevel = {};
  ["morning", "evening", "fullday", "rollover5"].forEach((lv) => {
    const list = (accasSettled || []).filter((a) => a.level === lv);
    const wonList = list.filter((a) => a.status === "won");
    accaByLevel[lv] = { settled: list.length, won: wonList.length, hitRate: pct(wonList.length, list.length) };
  });

  const byMarket = group((r) => r.market_key);
  // Learned adjustments — only markets with a meaningful settled sample move
  // the ranking, capped at ±0.05 so history nudges rather than overrides.
  const marketAdjust = {};
  for (const [k, v] of Object.entries(byMarket)) {
    if (v.settled >= WR_LEARN_MIN_SAMPLE) {
      marketAdjust[k] = Math.max(-0.05, Math.min(0.05, (v.wonRate / 100 - v.avgProb / 100) * 0.5));
    }
  }

  return {
    individual: {
      settled: graded.length,
      won: won.length,
      winRate: pct(won.length, graded.length),
      voided: settled.length - graded.length,
    },
    morning: { settled: morningGraded.length, wonRate: pct(morningGraded.filter((r) => r.status === "won").length, morningGraded.length) },
    evening: { settled: eveningGraded.length, wonRate: pct(eveningGraded.filter((r) => r.status === "won").length, eveningGraded.length) },
    avgOdds: avg(graded.filter((r) => (r.market_odds || 0) > 1).map((r) => r.market_odds)),
    avgConfidence: avg(graded.map((r) => r.confidence)),
    avgEdge: avg(graded.filter((r) => (r.market_odds || 0) > 1).map((r) => r.edge_pct || 0)),
    paper: {
      staked: accaStaked,
      profit: Math.round(accaProfit),
      roiPct: accaStaked ? Math.round((accaProfit / accaStaked) * 1000) / 10 : null,
    },
    accaByLevel,
    accaHitRate: pct(accasSettled?.filter((a) => a.status === "won").length, accasSettled?.length),
    byMarket,
    byLeague: group((r) => r.league),
    byConfidence: group((r) => `${Math.min(90, Math.floor((r.model_probability || 0) * 10) * 10)}%+`),
    byOddsRange: group((r) =>
      (r.market_odds || 0) > 1
        ? r.market_odds < 1.5
          ? "<1.50"
          : r.market_odds < 2
          ? "1.50–1.99"
          : r.market_odds < 3
          ? "2.00–2.99"
          : "3.00+"
        : "model only"
    ),
    modelVersion: WR_MODEL_VERSION,
  };
}