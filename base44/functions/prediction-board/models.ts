// models.ts — pure prediction math for the Ride X model engine.
// Poisson, Dixon-Coles, form and home/away-strength models over real team
// statistics. No invented data anywhere in this file: every unavailable
// input is excluded from the ensemble and flagged honestly.

export const MARKET_LABELS = {
  "1": "Home Win",
  "X": "Draw",
  "2": "Away Win",
  "1X": "Double Chance 1X",
  "X2": "Double Chance X2",
  "12": "Double Chance 12",
  "O0.5": "Over 0.5 Goals",
  "O1.5": "Over 1.5 Goals",
  "O2.5": "Over 2.5 Goals",
  "O3.5": "Over 3.5 Goals",
  "U1.5": "Under 1.5 Goals",
  "U2.5": "Under 2.5 Goals",
  "U3.5": "Under 3.5 Goals",
  "BTTS_Y": "BTTS Yes",
  "BTTS_N": "BTTS No",
  "DNB_H": "Draw No Bet · Home",
  "DNB_A": "Draw No Bet · Away",
};

export const MARKET_KEYS = Object.keys(MARKET_LABELS);

// Auto-selection pool: the engine compares all meaningful markets, but never
// auto-picks trivial ones (Over 0.5 is ~95% on almost every fixture) or draw-
// excluded markets (Draw No Bet probabilities are not directly comparable,
// since a draw voids the stake).
export const SELECTION_POOL = MARKET_KEYS.filter((k) => k !== "O0.5" && !k.startsWith("DNB"));

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function poissonPmf(lambda, k) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

// Goal-score probability grid. rho = 0 → plain Poisson; rho < 0 →
// Dixon-Coles low-score correlation correction.
export function goalGrid(lh, la, rho = 0) {
  const maxG = 9;
  const g = [];
  let sum = 0;
  for (let h = 0; h <= maxG; h++) {
    const row = [];
    for (let a = 0; a <= maxG; a++) {
      let p = poissonPmf(lh, h) * poissonPmf(la, a);
      if (rho) {
        if (h === 0 && a === 0) p *= 1 - lh * la * rho;
        else if (h === 1 && a === 0) p *= 1 + lh * rho;
        else if (h === 0 && a === 1) p *= 1 + la * rho;
        else if (h === 1 && a === 1) p *= 1 - rho;
      }
      p = Math.max(p, 0);
      row.push(p);
      sum += p;
    }
    g.push(row);
  }
  for (let h = 0; h <= maxG; h++) for (let a = 0; a <= maxG; a++) g[h][a] /= sum;
  return g;
}

// Weighted blend of several model grids — keeps every market mathematically
// consistent with one shared goal distribution (no "Under 2.5 + 2-1" bugs).
export function blendGrids(parts) {
  const maxG = 9;
  let wSum = 0;
  for (const part of parts) wSum += part.weight;
  if (wSum <= 0 || !parts.length) return null;
  const g = [];
  for (let h = 0; h <= maxG; h++) {
    const row = [];
    for (let a = 0; a <= maxG; a++) {
      let p = 0;
      for (const part of parts) p += (part.grid[h][a] * part.weight) / wSum;
      row.push(p);
    }
    g.push(row);
  }
  return g;
}

export function marketsFromGrid(g) {
  let pH = 0, pD = 0, pA = 0, bttsY = 0;
  const cum = [0, 0, 0, 0, 0, 0];
  let best = { h: 0, a: 0, p: 0 };
  let expectedTotal = 0;
  for (let h = 0; h < g.length; h++) {
    for (let a = 0; a < g[h].length; a++) {
      const p = g[h][a];
      if (h > a) pH += p; else if (h === a) pD += p; else pA += p;
      if (h >= 1 && a >= 1) bttsY += p;
      if (h + a <= 5) cum[h + a] += p;
      expectedTotal += p * (h + a);
      if (p > best.p) best = { h, a, p };
    }
  }
  for (let k = 1; k <= 5; k++) cum[k] += cum[k - 1];
  const denom = pH + pA;
  return {
    "1": pH,
    "X": pD,
    "2": pA,
    "1X": pH + pD,
    "X2": pD + pA,
    "12": pH + pA,
    "O0.5": 1 - cum[0],
    "O1.5": 1 - cum[1],
    "O2.5": 1 - cum[2],
    "O3.5": 1 - cum[3],
    "U1.5": cum[1],
    "U2.5": cum[2],
    "U3.5": cum[3],
    "BTTS_Y": bttsY,
    "BTTS_N": 1 - bttsY,
    "DNB_H": denom > 0 ? pH / denom : 0,
    "DNB_A": denom > 0 ? pA / denom : 0,
    score: { home: best.h, away: best.a },
    expectedTotal,
  };
}

export function bestMarket(markets) {
  let key = null;
  let prob = -1;
  for (const k of SELECTION_POOL) {
    const p = markets[k];
    if (typeof p === "number" && p > prob) {
      prob = p;
      key = k;
    }
  }
  return { key, prob };
}

export function evaluateMarket(key, hs, as) {
  const t = hs + as;
  switch (key) {
    case "1": return hs > as ? "win" : "lose";
    case "X": return hs === as ? "win" : "lose";
    case "2": return hs < as ? "win" : "lose";
    case "1X": return hs >= as ? "win" : "lose";
    case "X2": return hs <= as ? "win" : "lose";
    case "12": return hs !== as ? "win" : "lose";
    case "O0.5": return t >= 1 ? "win" : "lose";
    case "O1.5": return t >= 2 ? "win" : "lose";
    case "O2.5": return t >= 3 ? "win" : "lose";
    case "O3.5": return t >= 4 ? "win" : "lose";
    case "U1.5": return t <= 1 ? "win" : "lose";
    case "U2.5": return t <= 2 ? "win" : "lose";
    case "U3.5": return t <= 3 ? "win" : "lose";
    case "BTTS_Y": return hs >= 1 && as >= 1 ? "win" : "lose";
    case "BTTS_N": return hs === 0 || as === 0 ? "win" : "lose";
    case "DNB_H": return hs > as ? "win" : hs === as ? "void" : "lose";
    case "DNB_A": return hs < as ? "win" : hs === as ? "void" : "lose";
    default: return "void";
  }
}

// validatePredictionConsistency — a pick is only valid when its market and
// its predicted scoreline agree mathematically (Under 2.5 can never pair
// with a 2-1 scoreline, BTTS Yes can never pair with 2-0, etc.).
export function isConsistent(key, hs, as) {
  const t = hs + as;
  if (key === "U1.5" && t >= 2) return false;
  if (key === "U2.5" && t >= 3) return false;
  if (key === "U3.5" && t >= 4) return false;
  if (key === "O0.5" && t < 1) return false;
  if (key === "O1.5" && t < 2) return false;
  if (key === "O2.5" && t <= 2) return false;
  if (key === "O3.5" && t <= 3) return false;
  if (key === "BTTS_Y" && (hs < 1 || as < 1)) return false;
  if (key === "BTTS_N" && hs >= 1 && as >= 1) return false;
  if (key === "1" && hs <= as) return false;
  if (key === "2" && hs >= as) return false;
  if (key === "X" && hs !== as) return false;
  if (key === "1X" && hs < as) return false;
  if (key === "X2" && hs > as) return false;
  if (key === "12" && hs === as) return false;
  if (key === "DNB_H" && hs < as) return false;
  if (key === "DNB_A" && hs > as) return false;
  return true;
}

// Regenerate the predicted scoreline as the most probable grid cell that is
// mathematically CONSISTENT with the selected market.
export function consistentScoreline(g, key) {
  let best = null;
  for (let h = 0; h < g.length; h++) {
    for (let a = 0; a < g[h].length; a++) {
      if (!isConsistent(key, h, a)) continue;
      if (!best || g[h][a] > best.p) best = { h, a, p: g[h][a] };
    }
  }
  if (!best) return { home: 0, away: 0 };
  return { home: best.h, away: best.a };
}

// Local date/hour of an ISO timestamp in a timezone (hourCycle h23).
export function localParts(iso, tz) {
  try {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    const parts = {};
    for (const p of f.formatToParts(new Date(iso))) parts[p.type] = p.value;
    return {
      dateKey: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour) % 24,
      minute: Number(parts.minute),
    };
  } catch {
    const d = new Date(iso);
    return { dateKey: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }
}

// "WWLDW" → 0-1 recency points rate (D counts half).
export function formRateFromString(s) {
  if (!s || typeof s !== "string") return null;
  const letters = s.toUpperCase().replace(/[^WDL]/g, "").slice(-6);
  if (letters.length < 3) return null;
  let pts = 0;
  for (const c of letters) pts += c === "W" ? 1 : c === "D" ? 0.5 : 0;
  return pts / letters.length;
}