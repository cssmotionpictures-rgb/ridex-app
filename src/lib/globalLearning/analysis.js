// GLOBAL ANALYSIS — pure functions. Win/loss factor attribution, calibration
// buckets, section comparison, champion/challenger comparison and pattern
// candidates for the learning queue. Never invents causation: every factor is
// classified LIKELY / POSSIBLE / NOT SUPPORTED / UNKNOWN from data recorded
// BEFORE the result was known.
import { oddsRangeOf, marketFamilyOf } from "./globalId";
import { disagreementOf, marketProbOf } from "./marketModel";

export const isGraded = (s) => s === "won" || s === "lost";
const r2 = (x) => Math.round(x * 100) / 100;
const clampP = (p) => Math.min(0.99, Math.max(0.01, p || 0));

export function brierOf(rows) {
  const g = rows.filter((r) => isGraded(r.status));
  return g.length ? r2(g.reduce((s, r) => s + Math.pow((r.probability || 0) - (r.status === "won" ? 1 : 0), 2), 0) / g.length) : null;
}

export function loglossOf(rows) {
  const g = rows.filter((r) => isGraded(r.status));
  return g.length
    ? r2(g.reduce((s, r) => s - Math.log(r.status === "won" ? clampP(r.probability) : 1 - clampP(r.probability)), 0) / g.length)
    : null;
}

export function winRateOf(rows) {
  const g = rows.filter((r) => isGraded(r.status));
  return g.length ? r2((g.filter((r) => r.status === "won").length / g.length) * 100) : null;
}

export function paperRoiOf(rows) {
  const priced = rows.filter((r) => isGraded(r.status) && (r.market_odds || 0) > 1);
  if (!priced.length) return null;
  const profit = priced.reduce((s, r) => s + (r.status === "won" ? (r.market_odds || 1) - 1 : -1), 0);
  return { profit: r2(profit), roiPct: r2((profit / priced.length) * 100), n: priced.length };
}

export function clvAvgOf(rows) {
  const withClv = rows.filter((r) => (r.clv_pct || 0) !== 0);
  return withClv.length ? r2(withClv.reduce((s, r) => s + (r.clv_pct || 0), 0) / withClv.length) : null;
}

export const groupBy = (rows, fn) => {
  const g = {};
  rows.forEach((r) => {
    const k = fn(r);
    if (k == null || k === "") return;
    (g[k] ||= []).push(r);
  });
  return g;
};

export function summaryOf(rows) {
  return {
    n: rows.length,
    settled: rows.filter((r) => isGraded(r.status)).length,
    won: rows.filter((r) => r.status === "won").length,
    lost: rows.filter((r) => r.status === "lost").length,
    void: rows.filter((r) => ["void", "push", "cancelled"].includes(r.status)).length,
    brier: brierOf(rows),
    logloss: loglossOf(rows),
    winRate: winRateOf(rows),
    clv: clvAvgOf(rows),
    paper: paperRoiOf(rows),
  };
}

export function sectionComparison(rows) {
  return Object.entries(groupBy(rows, (r) => r.source_section)).map(([section, list]) => {
    const graded = list.filter((r) => isGraded(r.status));
    return {
      section,
      n: list.length,
      settled: graded.length,
      brier: brierOf(list),
      logloss: loglossOf(list),
      winRate: winRateOf(list),
      clv: clvAvgOf(list),
      avgOdds: graded.filter((r) => (r.market_odds || 0) > 1).length
        ? r2(graded.filter((r) => (r.market_odds || 0) > 1).reduce((s, r) => s + r.market_odds, 0) / graded.filter((r) => (r.market_odds || 0) > 1).length)
        : null,
      calErr: graded.length ? r2((graded.reduce((s, r) => s + (r.probability || 0), 0) / graded.length) * 100 - winRateOf(list)) : null,
      paper: paperRoiOf(list),
    };
  });
}

export function modelComparison(rows) {
  const champ = rows.filter((r) => r.source_section === "kala" && r.model_version === "RX-2.0");
  const chall = rows.filter((r) => r.source_section === "kala" && r.model_version === "RX-2.1");
  const champKey = (r) => `${r.fixture_id}|${r.market_key}`;
  const challMap = new Map(chall.map((r) => [`${r.fixture_id}|${r.market_key}|${r.prediction_version || 1}`, r]));
  const paired = champ.filter((r) => challMap.has(`${champKey(r)}|1`));
  return {
    champion: summaryOf(champ),
    challenger: summaryOf(chall),
    pairedCommon: paired.length,
    verdict: paired.length
      ? "paired rows accumulating — no superiority claim until the OOS promotion gate passes on settled evidence"
      : "no common settled rows yet — data integration verified; predictive superiority not established",
  };
}

export function calibrationBuckets(rows) {
  const defs = [
    ["50–59", 50, 60], ["60–69", 60, 70], ["70–79", 70, 80],
    ["80–89", 80, 90], ["90–94", 90, 95], ["95+", 95, 101],
  ];
  const graded = rows.filter((r) => isGraded(r.status));
  return defs.map(([label, lo, hi]) => {
    const list = graded.filter((r) => (r.probability || 0) * 100 >= lo && (r.probability || 0) * 100 < hi);
    const expected = list.length ? r2((list.reduce((s, r) => s + (r.probability || 0), 0) / list.length) * 100) : null;
    const actual = winRateOf(list);
    return {
      bucket: label,
      n: list.length,
      expected,
      actual,
      gap: expected != null && actual != null ? r2(actual - expected) : null,
      brier: brierOf(list),
      logloss: loglossOf(list),
    };
  });
}

export function factorsOf(row, status, score) {
  const win = [];
  const loss = [];
  const priced = (row.market_odds || 0) > 1;
  const edge = row.edge_pct || 0;
  const agreement = row.agreement ?? 1;
  const dq = String(row.data_quality || "").toUpperCase();
  const [h, a] = score || [];
  let lossClass = "";

  if (status === "won") {
    if (priced && edge > 0) win.push({ factor: `genuine model edge at T0 (+${r2(edge)}pp vs market)`, class: "LIKELY" });
    else if (priced) win.push({ factor: "market disagreed at T0 — possible fortuitous outcome, not a predictive signal", class: "LIKELY" });
    if (agreement >= 0.85) win.push({ factor: "strong model consensus", class: "POSSIBLE" });
    if (dq === "HIGH") win.push({ factor: "high data quality", class: "POSSIBLE" });
    if (row.injury_status === "matched") win.push({ factor: "injury-informed prediction", class: "POSSIBLE" });
    if (row.lineup_status === "confirmed") win.push({ factor: "confirmed lineup at prediction time", class: "POSSIBLE" });
    if (!win.length) win.push({ factor: "no distinguishing pre-recorded signal identified", class: "UNKNOWN" });
  }

  if (status === "lost") {
    if (dq === "LOW") { loss.push({ factor: "poor input data quality on record", class: "LIKELY" }); lossClass = "A_bad_data"; }
    if (agreement < 0.75) { loss.push({ factor: "model disagreement below the consensus threshold", class: "LIKELY" }); lossClass = lossClass || "G_model_disagreement"; }
    if (priced && (row.closing_odds || 0) > 1 && row.closing_odds < (row.market_odds || 1) * 0.97) {
      loss.push({ factor: "market drifted against the selection by kickoff (T0 → close)", class: "LIKELY" });
      lossClass = lossClass || "H_odds_mispricing";
    }
    if (priced && edge <= 0) { loss.push({ factor: "no positive edge at T0 — weak candidate by the engine's own measure", class: "LIKELY" }); lossClass = lossClass || "H_odds_mispricing"; }
    if ((row.market_odds || 0) >= 3) loss.push({ factor: "longshot odds range — variance-heavy selection", class: "POSSIBLE" });
    if (h != null && h === a && ["1", "2"].includes(String(row.market_key))) loss.push({ factor: "unexpected draw variance", class: "POSSIBLE" });
    if (!loss.length) { loss.push({ factor: "single-match variance; no pre-recorded signal explains the failure", class: "UNKNOWN" }); lossClass = "UNCLASSIFIED"; }
  }
  return { winFactors: win, lossFactors: loss, lossClass };
}

// Pattern scan — segments with sufficient settled sample AND a material
// calibration gap become learning-queue candidates. Nothing is claimed from a
// tiny sample, and every candidate carries its evidence level.
export function patternCandidates(rows, { minN = 20, minGap = 8 } = {}) {
  const settled = rows.filter((r) => isGraded(r.status) && r.probability != null);
  const candidates = [];
  const add = (dim, value, list, extra = {}) => {
    const n = list.length;
    if (n < minN) return;
    const expected = r2((list.reduce((s, r) => s + (r.probability || 0), 0) / n) * 100);
    const actual = r2((list.filter((r) => r.status === "won").length / n) * 100);
    const gap = r2(actual - expected);
    if (Math.abs(gap) < minGap) return;
    const sections = [...new Set(list.map((r) => r.source_section))];
    const over = gap < 0 ? "overconfident" : "under-confident";
    candidates.push({
      dim,
      value,
      sample: n,
      expected,
      actual,
      gap,
      sections,
      scope: dim === "section" ? "SECTION" : sections.length > 1 ? "GLOBAL" : extra.marketDim ? "MARKET" : "SECTION",
      market: extra.market || "",
      odds_range: extra.oddsRange || "",
      insight: `${value}: predicted ${expected}%, observed ${actual}% across ${n} settled predictions (${sections.join(", ")}) — the model is ${Math.abs(gap)}pp ${over} in this segment`,
      hypothesis:
        gap < 0
          ? `Reduce effective confidence in this segment (${value}) until walk-forward validation says otherwise`
          : `Investigate raising confidence in this segment (${value}) — under-confidence may hide genuine edge`,
      ...extra,
    });
  };

  Object.entries(groupBy(settled, (r) => (r.market_odds || 0) > 1 ? oddsRangeOf(r.market_odds) : null))
    .forEach(([v, list]) => add("odds_range", `Odds ${v}`, list, { oddsRange: v }));
  Object.entries(groupBy(settled, (r) => marketFamilyOf(r.market_key)))
    .forEach(([v, list]) => add("market", `${v} selections`, list, { market: v, marketDim: true }));
  const awayLong = settled.filter((r) => marketFamilyOf(r.market_key) === "away win" && (r.market_odds || 0) >= 3);
  add("market_x_odds", "Away Win selections at 3.00+", awayLong, { market: "away win", oddsRange: "3.00+" });
  Object.entries(groupBy(settled, (r) => (r.agreement ?? 1) >= 0.9 ? "agreement ≥ 0.90" : (r.agreement ?? 1) >= 0.75 ? "agreement 0.75–0.89" : "agreement < 0.75"))
    .forEach(([v, list]) => add("agreement", v, list));
  Object.entries(groupBy(settled, (r) => ["HIGH", "MEDIUM", "LOW"].includes(String(r.data_quality || "").toUpperCase()) ? `data quality ${String(r.data_quality).toUpperCase()}` : null))
    .forEach(([v, list]) => add("data_quality", v, list));
  Object.entries(groupBy(settled, (r) => (r.injury_status ? `injury ${r.injury_status}` : null)))
    .forEach(([v, list]) => add("injury_status", v, list));
  const confirmed = settled.filter((r) => r.lineup_status === "confirmed");
  const noLineup = settled.filter((r) => r.lineup_status && r.lineup_status !== "confirmed");
  if (confirmed.length >= minN) add("lineup_status", "lineup confirmed", confirmed);
  if (noLineup.length >= minN) add("lineup_status", "lineup not confirmed", noLineup);
  Object.entries(groupBy(settled, (r) => r.source_section))
    .forEach(([v, list]) => add("section", `${v} section`, list));
  // MODEL-VS-MARKET disagreement segments — priced, settled rows only, gated
  // by the same minN/minGap evidence rule: one result is never a pattern.
  const pricedSettled = settled.filter((r) => (r.market_odds || 0) > 1 && marketProbOf(r) > 0);
  Object.entries(groupBy(pricedSettled, (r) => {
    const d = disagreementOf(r.probability, marketProbOf(r));
    return `${d.band} — ${d.direction}`;
  })).forEach(([v, list]) => add("model_vs_market", v, list));
  return candidates;
}