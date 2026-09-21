// VERIFIED CORNERS markets. Corner lines are built ONLY from real corner-kick
// statistics (API-Football match statistics, aggregated by the corner-stats
// feed). Nothing is projected or guessed — if either side has no verified
// corner history, no corner line is attached at all.

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function pAtLeast(lam, min) {
  let cum = 0, term = Math.exp(-lam);
  for (let k = 0; k < min; k++) {
    if (k > 0) term *= lam / k;
    cum += term;
  }
  return clamp(1 - cum, 0, 1);
}

// NO INVENTED MARGIN — the price attached here is the exact model fair odds
// (1 ÷ probability). A real bookmaker price comes only from the live odds
// feed and is always labeled separately.

// Best high-probability corners line for a fixture, computed from each
// side's REAL corner history ({ avgFor, avgTotal, n } from the verified
// corner feed). The expected match corners is the mean of actually observed
// match totals involving either side — never a projection.
// Returns { label, prob, fairOdds, odds, expected, source: "feed" }, or
// null when there is no verified history.
export function cornersFromFeed(home, away) {
  // SEPARATE CORNER-DATA THRESHOLD — a corner line only enters a slip when
  // BOTH sides carry 5+ tracked finished matches of REAL corner statistics.
  // Thin samples (2-4 games) are never sold as a trend — no line at all.
  if (!home?.n || !away?.n || home.n < 5 || away.n < 5) return null;
  const lam = (home.avgTotal * home.n + away.avgTotal * away.n) / (home.n + away.n);
  const lines = [
    { label: "Over 6.5 Corners", min: 7 },
    { label: "Over 7.5 Corners", min: 8 },
    { label: "Under 11.5 Corners", maxAt: 11 },
    { label: "Under 12.5 Corners", maxAt: 12 },
  ];
  let best = null;
  for (const l of lines) {
    const prob = l.min != null ? pAtLeast(lam, l.min) : 1 - pAtLeast(lam, l.maxAt + 1);
    if (prob >= 0.86 && (!best || prob > best.prob)) best = { ...l, prob };
  }
  if (!best) return null; // no line honestly clears the 86% bar — no corner leg, never forced
  return {
    label: best.label,
    prob: Number(best.prob.toFixed(3)),
    fairOdds: Number((1 / best.prob).toFixed(2)),
    odds: Number((1 / best.prob).toFixed(2)), // exact model fair odds — same value as fairOdds, never a projected margin
    expected: Number(lam.toFixed(1)),
    source: "feed",
  };
}