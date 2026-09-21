// MONSTER PASTE ARRANGEMENTS — the automatic ticket structures built from
// the paste analysis qualified picks. Pure and testable. PRECISION OVER
// VOLUME: every arrangement draws ONLY from gate-qualified selections — WEAK
// and REJECTED candidates are never silently slipped into a ticket. Correlation
// control: no two legs share a team, and same-competition legs are flagged.

import { riskOfMonster } from "@/lib/monsterBoard";

const teamClashWith = (list, p) =>
  list.some((x) => [x.home, x.away].some((t) => t === p.home || t === p.away));

function combinedOf(legs) {
  const combinedProb = (legs || []).reduce((p, l) => p * (l.prob || 0.01), 1);
  const allPriced = (legs || []).every((l) => (l.marketOdds || 0) > 1);
  const combinedOdds = allPriced
    ? legs.reduce((o, l) => o * (l.marketOdds || 1), 1)
    : legs.reduce((o, l) => o * (1 / Math.max(l.prob || 0.01, 0.01)), 1);
  return { combinedProb, combinedOdds: Math.round(combinedOdds * 100) / 100, oddsBasis: allPriced ? "real" : "model" };
}

function warningsOf(legs) {
  const out = [];
  const comps = new Map();
  for (const l of legs) {
    const c = l.leagueCode || l.league || "";
    comps.set(c, (comps.get(c) || 0) + 1);
  }
  for (const [comp, n] of comps) {
    if (n >= 2) out.push(`${n} legs share ${comp} — same-competition outcomes are correlated`);
  }
  if (legs.length >= 4) out.push("A long combination needs every leg to win — one failure settles the whole ticket");
  return out;
}

const wrap = (key, label, note, legs) => {
  if (!legs || legs.length === 0) return { key, label, note, legs: [] };
  return { key, label, note, legs, ...combinedOf(legs), warnings: warningsOf(legs) };
};

// Builds every arrangement from the ranked qualified picks. Correlation map
// comes from the same correlation control the MONSTER board uses.
export function buildArrangements(picks, correlation = {}) {
  const ranked = [...(picks || [])];
  const corrOf = (p) => correlation[`${p.fixtureId}|${p.marketKey}`] || "LOW";

  const lowRisk = ranked.filter((p) => riskOfMonster(p) === "LOW" && corrOf(p) === "LOW");
  const distinct = (list, p) => !teamClashWith(list, p);

  // A. SAFER PICKS — up to 3 highest-quality, low-risk, low-correlation picks
  const safer = [];
  for (const p of lowRisk) {
    if (safer.length >= 3) break;
    if (distinct(safer, p)) safer.push(p);
  }

  // B. BALANCED — up to 5 picks, no shared teams, max 2 per competition
  const balanced = [];
  const compCount = new Map();
  for (const p of ranked) {
    if (balanced.length >= 5) break;
    if (!distinct(balanced, p)) continue;
    const c = p.leagueCode || p.league || "";
    if ((compCount.get(c) || 0) >= 2) continue;
    compCount.set(c, (compCount.get(c) || 0) + 1);
    balanced.push(p);
  }

  // C. VALUE — real prices where the analysis sees positive edge, ranked by edge
  const value = ranked
    .filter((p) => (p.marketOdds || 0) > 1 && ((p.adjEdgePct ?? p.edgePct) || 0) > 0)
    .sort((a, b) => (b.adjEdgePct ?? b.edgePct ?? 0) - (a.adjEdgePct ?? a.edgePct ?? 0));
  const valueLegs = [];
  for (const p of value) {
    if (valueLegs.length >= 5) break;
    if (distinct(valueLegs, p)) valueLegs.push(p);
  }

  // D. HIGH-RISK / HIGH-REWARD — clearly labeled, only when genuine 3.00+ prices qualify
  const highRisk = [];
  for (const p of ranked.filter((x) => (x.marketOdds || 0) >= 3)) {
    if (highRisk.length >= 3) break;
    if (distinct(highRisk, p)) highRisk.push(p);
  }

  // E. SINGLES — the best individual selections
  // F. SMALL ACCUMULATORS — 3-leg and 4-leg team-distinct combinations
  const acca3 = [];
  const acca4 = [];
  for (const p of ranked) {
    if (acca4.length < 4 && distinct(acca4, p) && (riskOfMonster(p) === "LOW" || riskOfMonster(p) === "MODERATE")) acca4.push(p);
  }
  acca4.slice(0, 3).forEach((p) => acca3.push(p));

  return {
    singles: wrap("singles", "SINGLES — BEST INDIVIDUAL SELECTIONS", "Every qualified pick on its own, strongest first.", ranked),
    safer: wrap("safer", "SAFER PICKS", "The highest-confidence low-risk selections — fewest legs, strongest evidence.", safer),
    balanced: wrap("balanced", "BALANCED", "Strong selections with correlation and risk controlled across competitions.", balanced),
    value: wrap("value", "VALUE PICKS", "Real prices where the analysis sees positive edge — value is only claimed where a real price exists.", valueLegs),
    highRisk: wrap("high-risk", "HIGH RISK / HIGH REWARD", "Qualified selections at 3.00+ real prices — clearly labeled: these lose more often than they win.", highRisk),
    acca3: wrap("acca3", "SMALL ACCUMULATOR — 3 LEGS", "Three team-distinct qualified selections.", acca3),
    acca4: wrap("acca4", "SMALL ACCUMULATOR — 4 LEGS", "Four team-distinct qualified selections — every leg must win.", acca4),
  };
}