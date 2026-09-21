// RX BACKTEST — a genuine WALK-FORWARD evaluation over the immutable
// EnginePrediction ledger. Training/calibration data for each test row comes
// ONLY from rows whose kickoff is strictly earlier (results of earlier games
// are known by then); no future result or future odds ever leaks backward.
// Rows not recorded strictly before their own kickoff are excluded entirely
// and counted as leakage-guard exclusions.
//
// Clearly separated:
//   CHAMPION   = the probability the engine actually recorded live
//                (KALA-MASTER-1.0 / RX-2.0).
//   CHALLENGER = the same rows re-blended with per-model weights learned
//                ONLY from prior settled rows. A challenger is promoted only
//                after a sufficient out-of-sample sample and a material
//                improvement — never from a handful of results.
// This is a BACKTEST of historical rows — it is never reported as live
// forward performance.

const STAKE = 1000;
const MIN_TRAIN = 30; // rows of prior history before challenger evaluation starts
const PROMOTION_MIN_N = 100; // out-of-sample test rows before promotion is even considered

const leakageOk = (r) => {
  const rec = new Date(r.recorded_at || 0).getTime();
  const ko = new Date(r.kickoff || 0).getTime();
  return Number.isFinite(rec) && Number.isFinite(ko) && rec < ko;
};

export const oddsBandOf = (o) =>
  o >= 10 ? "10.00+" :
  o >= 7.5 ? "7.50–9.99" :
  o >= 5 ? "5.00–7.49" :
  o >= 4 ? "4.00–4.99" :
  o >= 3 ? "3.00–3.99" :
  o >= 2 ? "2.00–2.99" : "1.01–1.99";

function accOf() {
  return { n: 0, brier: 0, ll: 0, cal: 0, wins: 0, profit: 0, staked: 0, oddsSum: 0, oddsN: 0, edgeSum: 0, edgeN: 0, clv: 0, clvN: 0 };
}

function addRow(acc, r, p) {
  const y = r.status === "won" ? 1 : 0;
  const q = Math.min(0.985, Math.max(0.015, Number(p)));
  if (!Number.isFinite(q)) return;
  acc.n++;
  acc.brier += (q - y) ** 2;
  acc.ll += -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
  acc.cal += q - y;
  if (y) acc.wins++;
  if ((r.market_odds || 0) > 1 && Number.isFinite(r.market_odds)) {
    acc.oddsSum += r.market_odds;
    acc.oddsN++;
    acc.edgeSum += Number(r.edge_pct) || 0;
    acc.edgeN++;
    acc.staked += STAKE;
    acc.profit += y ? STAKE * (r.market_odds - 1) : -STAKE;
    if ((r.closing_odds || 0) > 1) {
      acc.clv += (r.closing_odds / r.market_odds - 1) * 100;
      acc.clvN++;
    }
  }
}

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

function finish(acc) {
  return {
    n: acc.n,
    brier: acc.n ? r2(acc.brier / acc.n) : null,
    logLoss: acc.n ? r2(acc.ll / acc.n) : null,
    calErrPct: acc.n ? Math.round((acc.cal / acc.n) * 1000) / 10 : null,
    winRatePct: acc.n ? Math.round((acc.wins / acc.n) * 1000) / 10 : null,
    avgOdds: acc.oddsN ? r2(acc.oddsSum / acc.oddsN) : null,
    avgEdgePct: acc.edgeN ? Math.round((acc.edgeSum / acc.edgeN) * 10) / 10 : null,
    paperProfit: Math.round(acc.profit),
    paperRoiPct: acc.staked ? Math.round((acc.profit / acc.staked) * 1000) / 10 : null,
    clvAvgPct: acc.clvN ? r2(acc.clv / acc.clvN) : null,
    clvN: acc.clvN,
  };
}

// Per-model weights learned from a TRAINING slice only — Brier-weighted with a
// floor, exactly the strategy the live engine documents. Insufficient sample
// returns null (the challenger honestly reports NOT EVALUABLE).
function learnedWeights(train) {
  const briers = {};
  const counts = {};
  train.forEach((r) => {
    let per = {};
    try { per = JSON.parse(r.models_json || "{}"); } catch { per = {}; }
    const y = r.status === "won" ? 1 : 0;
    Object.entries(per).forEach(([k, p]) => {
      if (!Number.isFinite(p)) return;
      briers[k] = (briers[k] || 0) + (p - y) ** 2;
      counts[k] = (counts[k] || 0) + 1;
    });
  });
  const keys = Object.keys(briers).filter((k) => counts[k] >= MIN_TRAIN);
  if (keys.length < 3) return null;
  const minB = Math.min(...keys.map((k) => briers[k] / counts[k]));
  const raw = {};
  keys.forEach((k) => { raw[k] = Math.max(0.02, Math.exp(-(briers[k] / counts[k] - minB) * 6)); });
  const total = Object.values(raw).reduce((s, x) => s + x, 0);
  const w = {};
  keys.forEach((k) => { w[k] = Math.round((raw[k] / total) * 1000) / 1000; });
  return w;
}

// === WALK-FORWARD BACKTEST ===
export function walkForward(rows) {
  const all = Array.isArray(rows) ? rows : [];
  const graded = all.filter(
    (r) => ["won", "lost"].includes(r.status) && r.calibrated_probability != null
  );
  const settled = graded.filter(leakageOk).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const leakageExcluded = graded.length - settled.length;

  const champ = accOf();
  const chall = accOf();
  const groups = {
    market: {}, league: {}, oddsBand: {}, tier: {},
  };
  const groupAdd = (dim, key, r) => {
    if (!key) return;
    (groups[dim][key] ||= accOf());
    addRow(groups[dim][key], r, r.calibrated_probability);
  };

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    // CHAMPION — what the engine recorded live.
    addRow(champ, r, r.calibrated_probability);
    groupAdd("market", r.market_key, r);
    groupAdd("league", r.league, r);
    groupAdd("oddsBand", (r.market_odds || 0) > 1 ? oddsBandOf(r.market_odds) : "unpriced", r);
    groupAdd("tier", r.grade, r);

    // CHALLENGER — re-blend with weights learned ONLY from strictly-prior rows.
    const train = settled.slice(0, i).filter((x) => new Date(x.kickoff) < new Date(r.kickoff));
    if (train.length >= MIN_TRAIN) {
      let per = {};
      try { per = JSON.parse(r.models_json || "{}"); } catch { per = {}; }
      const keys = Object.keys(per).filter((k) => Number.isFinite(per[k]));
      if (keys.length >= 3) {
        const w = learnedWeights(train);
        if (w) {
          const wsum = keys.reduce((s, k) => s + (w[k] ?? 0.02), 0);
          if (wsum > 0) {
            const p = keys.reduce((s, k) => s + per[k] * ((w[k] ?? 0.02) / wsum), 0);
            addRow(chall, r, p);
          }
        }
      }
    }
  }

  const champion = finish(champ);
  const challenger = chall.n ? finish(chall) : { n: 0, status: "NOT EVALUABLE — insufficient settled history (needs 30 prior rows before evaluation can even start)" };

  // PROMOTION GATE — the challenger replaces the champion only on a
  // sufficient out-of-sample sample AND material, stable improvement.
  let promotion = { eligible: false, reason: `Insufficient out-of-sample sample — challenger needs ${PROMOTION_MIN_N} tested rows before promotion is considered (has ${chall.n}).` };
  if (chall.n >= PROMOTION_MIN_N && champion.n >= PROMOTION_MIN_N && champion.logLoss != null && challenger.logLoss != null) {
    const llGain = (champion.logLoss - challenger.logLoss) / champion.logLoss;
    const brierGain = champion.brier != null && challenger.brier != null ? (champion.brier - challenger.brier) / champion.brier : 0;
    if (llGain >= 0.05 && brierGain >= 0.05) {
      promotion = { eligible: true, reason: `Challenger improves log loss ${Math.round(llGain * 100)}% and Brier ${Math.round(brierGain * 100)}% out-of-sample on ${chall.n} rows.` };
    } else {
      promotion = { eligible: false, reason: `Challenger does not yet materially outperform the champion (log-loss gain ${Math.round(llGain * 100)}%, Brier gain ${Math.round(brierGain * 100)}% — both must reach 5% on 100+ rows). Champion stays.` };
    }
  }

  const groupOut = (dim) =>
    Object.entries(groups[dim])
      .map(([key, acc]) => ({ key, ...finish(acc) }))
      .sort((a, b) => b.n - a.n);

  return {
    type: "BACKTEST — walk-forward, chronological, no data leakage",
    leakageGuard: "only rows recorded strictly before their own kickoff are tested",
    testN: settled.length,
    leakageExcluded,
    champion,
    challenger,
    promotion,
    byMarket: groupOut("market"),
    byLeague: groupOut("league"),
    byOddsBand: groupOut("oddsBand"),
    byTier: groupOut("tier"),
  };
}

// === BIG HAMMER ODDS-RANGE ANALYSIS ===
// Whether BIG HAMMER is finding value or merely selecting longshots.
export function bigHammerBands(rows) {
  const graded = (Array.isArray(rows) ? rows : []).filter(
    (r) => ["won", "lost"].includes(r.status) && (r.market_odds || 0) >= 3 && r.calibrated_probability != null
  );
  const bands = ["3.00–3.99", "4.00–4.99", "5.00–7.49", "7.50–9.99", "10.00+"];
  return bands
    .map((label) => {
      const [lo, hi] = label === "10.00+" ? [10, Infinity] : label.split("–").map(Number);
      const list = graded.filter((r) => r.market_odds >= lo && r.market_odds < hi);
      const acc = accOf();
      list.forEach((r) => addRow(acc, r, r.calibrated_probability));
      const f = finish(acc);
      return {
        band: label,
        n: f.n,
        predictedPct: f.n ? Math.round((list.reduce((s, r) => s + r.calibrated_probability, 0) / f.n) * 1000) / 10 : null,
        actualPct: f.winRatePct,
        brier: f.brier,
        paperRoiPct: f.paperRoiPct,
      };
    })
    .filter((b) => b.n > 0);
}

// === DRIFT DETECTION ===
// Rolling windows vs the lifetime record — win rate and Brier.
export function driftOf(rows) {
  const graded = (Array.isArray(rows) ? rows : [])
    .filter((r) => ["won", "lost"].includes(r.status) && r.calibrated_probability != null)
    .sort((a, b) => new Date(b.settled_at || b.kickoff || 0) - new Date(a.settled_at || a.kickoff || 0));
  const winRate = (list) =>
    list.length ? Math.round((list.filter((r) => r.status === "won").length / list.length) * 1000) / 10 : null;
  const brier = (list) =>
    list.length ? r2(list.reduce((s, r) => s + (r.calibrated_probability - (r.status === "won" ? 1 : 0)) ** 2, 0) / list.length) : null;
  const windows = { last25: winRate(graded.slice(0, 25)), last50: winRate(graded.slice(0, 50)), last100: winRate(graded.slice(0, 100)), lifetime: winRate(graded) };
  const lifetimeBrier = brier(graded);
  const worst = windows.lifetime;
  const recent = windows.last25;
  const driftPct = recent != null && worst != null ? Math.round((recent - worst) * 10) / 10 : null;
  return {
    ...windows,
    brierLifetime: lifetimeBrier,
    brierLast25: brier(graded.slice(0, 25)),
    driftPct,
    warning: graded.length >= 30 && driftPct != null && driftPct <= -15,
  };
}