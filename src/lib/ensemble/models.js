// RX ENSEMBLE MODELS (RX-2.0) — independent forecasting approaches.
// Every model reads ONLY verified played matches (real final scores from the
// openfootball verified feed). A model whose data requirement is not met
// returns null and is recorded as UNAVAILABLE — it never votes and nothing is
// ever fabricated. Models with no honest data feed at all (xG, lineups,
// injuries) are structurally unavailable and are disclosed as such, never
// guessed.

import { normalizeName } from "@/lib/cornerFeed";

const sameName = (a, b) => a === b || normalizeName(a) === normalizeName(b);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---------- decayed team statistics over the verified window ----------
// Date-decayed (half-life) points share, goal rates, home/away splits, an
// empirical goal histogram and rest information — one stats pass per team.
export function teamStats(played, team, { maxN = 14, halfLifeDays = 60 } = {}) {
  const mine = played
    .filter((m) => m.score?.ft && (sameName(m.team1, team) || sameName(m.team2, team)))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-maxN);
  if (!mine.length) return null;
  const ref = new Date(mine[mine.length - 1].date).getTime();
  let wsum = 0, wpts = 0, wgf = 0, wga = 0, lastMs = 0;
  let last3w = 0, last3pts = 0;
  const goalHist = {};
  const home = { n: 0, pts: 0, gf: 0, ga: 0 };
  const away = { n: 0, pts: 0, gf: 0, ga: 0 };
  mine.forEach((m, idx) => {
    const [h, a] = m.score.ft;
    const isHome = sameName(m.team1, team);
    const our = isHome ? h : a;
    const opp = isHome ? a : h;
    const days = Math.max(0, (ref - new Date(m.date).getTime()) / 86400000);
    const w = Math.pow(0.5, days / halfLifeDays);
    const pt = our > opp ? 1 : our === opp ? 0.5 : 0;
    wsum += w; wpts += pt * w; wgf += our * w; wga += opp * w;
    goalHist[our] = (goalHist[our] || 0) + 1;
    const side = isHome ? home : away;
    side.n++; side.pts += pt; side.gf += our; side.ga += opp;
    const wl = Math.pow(0.5, mine.length - 1 - idx);
    last3w += wl; last3pts += pt * wl;
    if (!lastMs) lastMs = new Date(m.date).getTime();
  });
  return {
    n: mine.length,
    share: wpts / wsum,
    gfRate: wgf / wsum,
    gaRate: wga / wsum,
    home,
    away,
    last3Share: last3w ? last3pts / last3w : 0.5,
    goalHist,
    lastPlayedAt: lastMs,
  };
}

export function h2hOfWindow(played, home, away) {
  const n = played.filter(
    (m) => m.score?.ft && sameName(m.team1, home) && sameName(m.team2, away)
  ).length;
  return { n };
}

export function meanGoalsPerSide(played) {
  let g = 0, n = 0;
  (played || []).forEach((m) => {
    if (m.score?.ft) { g += m.score.ft[0] + m.score.ft[1]; n += 2; }
  });
  return { mean: n ? g / n : 1.35, sides: n };
}

// ---------- Poisson / Dixon-Coles goal machinery ----------
const pois = (l, k) => {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p = (p * l) / i;
  return p;
};

// Bivariate goal matrix with the Dixon-Coles low-score correction (rho).
export function scoreMatrix(lh, la, { rho = 0, maxG = 8 } = {}) {
  const mx = [];
  let total = 0;
  for (let h = 0; h <= maxG; h++) {
    mx[h] = [];
    for (let a = 0; a <= maxG; a++) {
      let p = pois(lh, h) * pois(la, a);
      if (rho) {
        if (h === 0 && a === 0) p *= 1 - lh * la * rho;
        else if (h === 0 && a === 1) p *= 1 + lh * rho;
        else if (h === 1 && a === 0) p *= 1 + la * rho;
        else if (h === 1 && a === 1) p *= 1 - rho;
      }
      mx[h][a] = p;
      total += p;
    }
  }
  for (let h = 0; h <= maxG; h++) for (let a = 0; a <= maxG; a++) mx[h][a] /= total;
  return mx;
}

// Full market set from a goal matrix — the exact keys settlement understands.
export function marketsFromMatrix(mx) {
  const maxG = mx.length - 1;
  let p1 = 0, pX = 0, p2 = 0, btts = 0;
  const over = { 0.5: 0, 1.5: 0, 2.5: 0, 3.5: 0 };
  for (let h = 0; h <= maxG; h++) {
    for (let a = 0; a <= maxG; a++) {
      const p = mx[h][a];
      if (h > a) p1 += p; else if (h === a) pX += p; else p2 += p;
      if (h > 0 && a > 0) btts += p;
      const tg = h + a;
      for (const line of [0.5, 1.5, 2.5, 3.5]) if (tg > line) over[line] += p;
    }
  }
  const M = { "1": p1, "X": pX, "2": p2, "BTTS_Y": btts, "BTTS_N": 1 - btts };
  for (const l of [0.5, 1.5, 2.5, 3.5]) {
    M[`O${l}`] = over[l];
    M[`U${l}`] = 1 - over[l];
  }
  return M;
}

// Expected goal rates from decayed attack/defence rates + league mean.
export function goalRates(hs, as, leagueMean) {
  const base = leagueMean || 1.35;
  const hAttack = hs.n ? 0.6 * hs.gfRate + 0.4 * (hs.home.n ? hs.home.gf / hs.home.n : hs.gfRate) : base;
  const hConcede = hs.n ? 0.6 * hs.gaRate + 0.4 * (hs.home.n ? hs.home.ga / hs.home.n : hs.gaRate) : base;
  const aAttack = as.n ? 0.6 * as.gfRate + 0.4 * (as.away.n ? as.away.gf / as.away.n : as.gfRate) : base;
  const aConcede = as.n ? 0.6 * as.gaRate + 0.4 * (as.away.n ? as.away.ga / as.away.n : as.gaRate) : base;
  const lh = clamp(0.5 * (hAttack + aConcede) * 1.12, 0.15, 4.2);
  const la = clamp(0.5 * (aAttack + hConcede) * 0.92, 0.12, 4.0);
  return { lh, la };
}

// ---------- Elo strength ratings (cached per verified result set) ----------
const eloCache = new WeakMap();
export function eloRatings(played) {
  if (eloCache.has(played)) return eloCache.get(played);
  const r = new Map();
  const rate = (t) => {
    const k = normalizeName(t);
    if (!r.has(k)) r.set(k, 1500);
    return r.get(k);
  };
  played
    .filter((m) => m.score?.ft)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .forEach((m) => {
      const [h, a] = m.score.ft;
      const reH = rate(m.team1);
      const reA = rate(m.team2);
      const sH = h > a ? 1 : h === a ? 0.5 : 0;
      const eH = 1 / (1 + Math.pow(10, -(reH + 60 - reA) / 400));
      const k = 30;
      r.set(normalizeName(m.team1), reH + k * (sH - eH));
      r.set(normalizeName(m.team2), reA + k * (1 - sH - (1 - eH)));
    });
  eloCache.set(played, r);
  return r;
}

// ---------- 1X2 helpers ----------
const splitFromExpected = (e, pX) => ({ p1: (1 - pX) * e, pX, p2: (1 - pX) * (1 - e) });

// ---------- Monte Carlo sampling ----------
const randn = () => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const samplePoisson = (l) => {
  const L = Math.exp(-l);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
};

const histDist = (hist, maxK = 5) => {
  const p = new Array(maxK + 1).fill(0);
  let tot = 0;
  Object.entries(hist || {}).forEach(([g, c]) => {
    p[Math.min(maxK, Number(g) || 0)] += c;
    tot += c;
  });
  return tot ? p.map((x) => x / tot) : null;
};

// ---------- the independent models ----------
// Each returns { p1, pX, p2 } and, for goal-based models, a full `markets`
// map. null = data requirement not met — the model does not vote.
export const RX_MODELS = [
  {
    key: "strength",
    label: "Dynamic team strength",
    weight: 0.10,
    run: ({ hs, as }) => {
      const d = hs.share - as.share;
      const e = clamp(0.5 + 0.22 * Math.tanh(d * 3), 0.03, 0.97);
      const pX = clamp(0.30 - Math.abs(d) * 0.3, 0.06, 0.33);
      return splitFromExpected(e, pX);
    },
  },
  {
    key: "elo",
    label: "Elo strength ratings",
    weight: 0.11,
    run: ({ played, home, away }) => {
      const r = eloRatings(played);
      const reH = r.get(normalizeName(home));
      const reA = r.get(normalizeName(away));
      if (reH == null || reA == null) return null;
      const d = reH + 60 - reA;
      const e = 1 / (1 + Math.pow(10, -d / 400));
      const pX = clamp(0.28 * Math.exp(-Math.abs(d) / 320), 0.06, 0.32);
      return splitFromExpected(e, pX);
    },
  },
  {
    key: "attackDefence",
    label: "Attack / defence strength",
    weight: 0.11,
    run: ({ rates }) => {
      const sup = rates.lh - rates.la;
      const e = clamp(1 / (1 + Math.exp(-sup * 0.9)), 0.03, 0.97);
      const pX = clamp(0.28 * Math.exp(-Math.abs(sup) / 1.1), 0.06, 0.32);
      return splitFromExpected(e, pX);
    },
  },
  {
    key: "formDecay",
    label: "Time-decayed form",
    weight: 0.10,
    run: ({ hsRecent, asRecent }) => {
      if (!hsRecent || !asRecent) return null;
      const d = hsRecent.share - asRecent.share;
      const e = clamp(0.5 + 0.26 * Math.tanh(d * 3), 0.03, 0.97);
      const pX = clamp(0.29 - Math.abs(d) * 0.3, 0.06, 0.32);
      return splitFromExpected(e, pX);
    },
  },
  {
    key: "poisson",
    label: "Poisson goal model",
    weight: 0.13,
    goalBased: true,
    run: ({ rates }) => {
      const mx = scoreMatrix(rates.lh, rates.la);
      return { ...mx0(mx), markets: marketsFromMatrix(mx) };
    },
  },
  {
    key: "dixonColes",
    label: "Dixon-Coles low-score correction",
    weight: 0.13,
    goalBased: true,
    run: ({ rates }) => {
      const mx = scoreMatrix(rates.lh, rates.la, { rho: 0.06 });
      return { ...mx0(mx), markets: marketsFromMatrix(mx) };
    },
  },
  {
    key: "homeAway",
    label: "Home/away split model",
    weight: 0.09,
    run: ({ hs, as }) => {
      if (hs.home.n < 2 || as.away.n < 2) return null;
      const d = hs.home.pts / hs.home.n - as.away.pts / as.away.n;
      const e = clamp(0.5 + 0.2 * Math.tanh(d * 3), 0.05, 0.95);
      const pX = clamp(0.30 - Math.abs(d) * 0.25, 0.07, 0.33);
      return splitFromExpected(e, pX);
    },
  },
  {
    key: "recent",
    label: "Recent performance burst",
    weight: 0.05,
    run: ({ hs, as }) => {
      const d = hs.last3Share - as.last3Share;
      const e = clamp(0.5 + 0.24 * Math.tanh(d * 3), 0.03, 0.97);
      const pX = clamp(0.30 - Math.abs(d) * 0.28, 0.06, 0.33);
      return splitFromExpected(e, pX);
    },
  },
  {
    key: "goalDist",
    label: "Goal-distribution model",
    weight: 0.07,
    goalBased: true,
    run: ({ hs, as }) => {
      const dh = histDist(hs.goalHist);
      const da = histDist(as.goalHist);
      if (!dh || !da) return null;
      const mx = dh.map((ph) => da.map((pa) => ph * pa));
      return { ...mx0(mx), markets: marketsFromMatrix(mx) };
    },
  },
  {
    key: "monteCarlo",
    label: "Monte Carlo simulation",
    weight: 0.13,
    goalBased: true,
    run: ({ rates }) => {
      const N = 6000;
      const mx = [];
      for (let h = 0; h <= 7; h++) mx[h] = new Array(8).fill(0);
      for (let i = 0; i < N; i++) {
        const lh = rates.lh * Math.exp(0.07 * randn());
        const la = rates.la * Math.exp(0.07 * randn());
        const h = Math.min(7, samplePoisson(lh));
        const a = Math.min(7, samplePoisson(la));
        mx[h][a]++;
      }
      let tot = 0;
      mx.forEach((row) => row.forEach((v) => (tot += v)));
      for (let h = 0; h <= 7; h++) for (let a = 0; a <= 7; a++) mx[h][a] /= tot;
      return { ...mx0(mx), markets: marketsFromMatrix(mx) };
    },
  },
  {
    key: "restFatigue",
    label: "Rest / fatigue schedule",
    weight: 0.04,
    run: ({ hs, as, kickoffMs }) => {
      if (!hs.lastPlayedAt || !as.lastPlayedAt || !kickoffMs) return null;
      const daysH = (kickoffMs - hs.lastPlayedAt) / 86400000;
      const daysA = (kickoffMs - as.lastPlayedAt) / 86400000;
      if (!Number.isFinite(daysH) || !Number.isFinite(daysA)) return null;
      const restAdj = clamp((daysA - daysH) * 0.008, -0.04, 0.04);
      const d = hs.share - as.share;
      const e = clamp(0.5 + 0.2 * Math.tanh(d * 3) + restAdj, 0.03, 0.97);
      const pX = clamp(0.30 - Math.abs(d) * 0.3, 0.06, 0.33);
      return splitFromExpected(e, pX);
    },
  },
];

// Weight of the market-implied model when real three-way prices exist.
export const RX_MARKET_MODEL_WEIGHT = 0.16;

// Structurally unavailable models — disclosed, never guessed.
export const RX_UNAVAILABLE_MODELS = [
  "xG model — no verified expected-goals feed is connected",
  "lineup / injury model — no verified lineup or injury feed is connected",
  "first-half / second-half models — no premium half-time markets are offered",
];

function mx0(mx) {
  let p1 = 0, pX = 0, p2 = 0;
  for (let h = 0; h < mx.length; h++) {
    for (let a = 0; a < mx[h].length; a++) {
      if (h > a) p1 += mx[h][a];
      else if (h === a) pX += mx[h][a];
      else p2 += mx[h][a];
    }
  }
  return { p1, pX, p2 };
}