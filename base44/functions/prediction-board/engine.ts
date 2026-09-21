// engine.ts — ensemble orchestration for the Ride X model engine.
// Builds the rolling 7-day board from real season fixtures + played results.
// Models: Poisson, Dixon-Coles, expected-goals regression, recent form,
// home/away strength, head-to-head history, momentum — computed from real
// match data. Calibrated, quality-filtered and league-diversified.
// No invented numbers, no AI-credit dependence, no fake fallbacks.

import {
  LEAGUES, fetchSeason, deriveSeason, leagueReliability, currentSeasonYear,
} from "./openfootball.ts";
import {
  MARKET_LABELS, goalGrid, blendGrids, marketsFromGrid, bestMarket,
  localParts, formRateFromString, isConsistent, consistentScoreline,
} from "./models.ts";
import {
  providerRegistry, nameTokens, tokenMatch, afFixturesForDate, smFixturesForDate,
  srFixturesForDate, afOddsForFixture, smOddsForFixture, mergeOddsMaps, marketOddsInfo,
  healthGet, buildCompetitionRegistry, sportradarReady,
} from "./providers.ts";

export const DEFAULT_CONFIG = {
  timezone: "Africa/Lagos",
  minProbability: 0.72,
  preferredProbability: 0.75,
  minQualityScore: 70,
  maxUncertainty: 0.25,
  minAgreement: 0.6,
  maxMorning: 4,
  maxEvening: 4,
  morningStart: 5,
  // Evening starts at 5pm in the board timezone — afternoon kickoffs belong
  // to the morning session so it brings games every day (the old 3pm split
  // left morning empty almost every weekday).
  eveningStart: 17,
  maxPerLeague: 2,
  minGames: 3,
  leagues: LEAGUES.map((l) => ({ code: l.code, name: l.name, country: l.country, tier: l.tier, offset: l.offset })),
};

export function mergeConfig(row) {
  const cfg = { ...DEFAULT_CONFIG };
  // Provider registry resolves safely for a missing/null config row too.
  cfg.providerRegistry = providerRegistry(row);
  if (!row) return cfg;
  for (const k of Object.keys(DEFAULT_CONFIG)) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") cfg[k] = row[k];
  }
  if (typeof cfg.leagues === "string") {
    try { cfg.leagues = JSON.parse(cfg.leagues); } catch { cfg.leagues = DEFAULT_CONFIG.leagues; }
  }
  if (!Array.isArray(cfg.leagues) || !cfg.leagues.length) cfg.leagues = DEFAULT_CONFIG.leagues;
  for (const l of cfg.leagues) {
    if (l.offset === undefined) {
      const ref = LEAGUES.find((x) => x.code === l.code);
      l.offset = ref ? ref.offset : 1;
    }
  }
  return cfg;
}

function pool(tasks, concurrency) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      out[idx] = await tasks[idx]();
    }
  });
  return Promise.all(workers).then(() => out);
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function fmtLocal(iso, tz) {
  try {
    const f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    return f.format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

function teamRates(stats) {
  if (!stats || !stats.gp) return null;
  const gp = stats.gp;
  const r = {
    gp,
    att: (stats.gf || 0) / gp,
    def: (stats.ga || 0) / gp,
    form: formRateFromString(stats.form),
    home: null,
    away: null,
  };
  if (stats.home && stats.home.gp) r.home = { att: stats.home.gf / stats.home.gp, def: stats.home.ga / stats.home.gp };
  if (stats.away && stats.away.gp) r.away = { att: stats.away.gf / stats.away.gp, def: stats.away.ga / stats.away.gp };
  return r;
}

// MODEL H — head-to-head: the real previous meetings between these two teams
// across the last two league seasons. Small samples shrink toward the base
// goal model instead of over-trusting two or three games.
function h2hLambdas(meetings, lhBase, laBase) {
  if (!meetings || !meetings.length) return null;
  const n = meetings.length;
  const hg = meetings.reduce((s, g) => s + g.gf, 0) / n;
  const ag = meetings.reduce((s, g) => s + g.ga, 0) / n;
  return {
    lh: (hg * n + lhBase * 2) / (n + 2),
    la: (ag * n + laBase * 2) / (n + 2),
    n,
    hg,
    ag,
  };
}

// MODEL M — momentum, the physics of form: recency-weighted points rate with
// an acceleration term (how the last 3 games compare to the 3 before them).
function momentumMult(games) {
  const last = (games || []).slice(-6);
  if (last.length < 4) return null;
  const pts = (g) => (g.gf > g.ga ? 1 : g.gf === g.ga ? 0.5 : 0);
  const now = last.slice(-3);
  const prev = last.slice(0, Math.max(0, last.length - 3));
  if (!prev.length) return null;
  const rNow = now.reduce((s, g) => s + pts(g), 0) / now.length;
  const rPrev = prev.reduce((s, g) => s + pts(g), 0) / prev.length;
  const gd = last.reduce((s, g) => s + (g.gf - g.ga), 0) / last.length;
  const acceleration = rNow - rPrev;
  return {
    mult: clamp(1 + 0.15 * acceleration + 0.03 * clamp(gd, -1, 1), 0.88, 1.12),
    rate: (rNow * now.length + rPrev * prev.length) / last.length,
    n: last.length,
  };
}

// The multi-model ensemble for one fixture. Unavailable inputs exclude the
// corresponding model and lower data quality — they never get invented.
function runEnsemble(homeStats, awayStats, lgGpg, tier, deep) {
  const flags = [];
  const h = teamRates(homeStats);
  const a = teamRates(awayStats);
  if (!h || !a) {
    flags.push("League-table data unavailable for one or both teams");
    return { ok: false, flags };
  }

  const lgSide = Math.max((lgGpg || 2.7) / 2, 0.5);
  const grids = [];

  // MODEL A — Poisson goal model on overall rates + generic home advantage.
  const lhBase = Math.max((h.att * a.def) / lgSide * 1.10, 0.15);
  const laBase = Math.max((a.att * h.def) / lgSide * 0.92, 0.12);
  grids.push({ key: "poisson", label: "Poisson goal model", grid: goalGrid(lhBase, laBase, 0), weight: 0.28 });

  // MODEL B — Dixon-Coles (low-score correlation correction).
  grids.push({ key: "dc", label: "Dixon-Coles", grid: goalGrid(lhBase, laBase, -0.12), weight: 0.24 });

  // MODEL C — EXPECTED GOALS: attack/defence rates regressed toward the
  // league mean (Empirical-Bayes shrinkage). Stable expected goals even
  // early in the season, where raw small-sample rates mislead.
  const kPrior = 6;
  const attHs = ((homeStats.gf || 0) + lgSide * kPrior) / (homeStats.gp + kPrior);
  const defHs = ((homeStats.ga || 0) + lgSide * kPrior) / (homeStats.gp + kPrior);
  const attAs = ((awayStats.gf || 0) + lgSide * kPrior) / (awayStats.gp + kPrior);
  const defAs = ((awayStats.ga || 0) + lgSide * kPrior) / (awayStats.gp + kPrior);
  grids.push({
    key: "xg", label: "Expected goals (regressed)",
    grid: goalGrid(Math.max(attHs * defAs / lgSide * 1.10, 0.15), Math.max(attAs * defHs / lgSide * 0.92, 0.12), 0),
    weight: 0.14,
  });

  // MODEL D — recent-form adjustment (recency-weighted W/D/L form).
  if (h.form != null && a.form != null) {
    const mh = clamp(0.85 + 0.3 * h.form, 0.85, 1.15);
    const ma = clamp(0.85 + 0.3 * a.form, 0.85, 1.15);
    grids.push({
      key: "form", label: "Recent form",
      grid: goalGrid(lhBase * mh, laBase * ma, 0), weight: 0.12,
    });
  } else {
    flags.push("Recent-form data unavailable for one or both teams");
  }

  // MODEL E — home/away strength splits.
  if (h.home && a.away && h.away && a.home) {
    const lh = Math.max((h.home.att * a.away.def) / lgSide, 0.15);
    const la = Math.max((a.away.att * h.home.def) / lgSide, 0.12);
    grids.push({ key: "split", label: "Home/away strength", grid: goalGrid(lh, la, 0), weight: 0.12 });
  } else {
    flags.push("Home/away split data unavailable");
  }

  // MODEL H — real head-to-head history (last two league seasons).
  const h2hInfo = h2hLambdas(deep.meetings, lhBase, laBase);
  if (h2hInfo) {
    grids.push({
      key: "h2h", label: "Head-to-head",
      grid: goalGrid(Math.max(h2hInfo.lh, 0.15), Math.max(h2hInfo.la, 0.12), 0), weight: 0.10,
    });
  } else {
    flags.push("No head-to-head history in the last two league seasons");
  }

  // MODEL M — momentum & recent results (acceleration of form).
  const momH = momentumMult(deep.gamesH);
  const momA = momentumMult(deep.gamesA);
  if (momH && momA) {
    grids.push({
      key: "momentum", label: "Momentum & recent results",
      grid: goalGrid(lhBase * momH.mult, laBase * momA.mult, 0), weight: 0.14,
    });
  } else {
    flags.push("Momentum model needs more completed games");
  }

  // Lineups/injuries are unavailable before kickoff on the connected plans —
  // never modelled, honestly flagged.
  flags.push("Lineups/injuries unavailable before kickoff — not modelled");

  const blend = blendGrids(grids.map((g) => ({ grid: g.grid, weight: g.weight })));

  // Per-model votes for the agreement metric.
  const votes = grids.map((g) => {
    const mk = marketsFromGrid(g.grid);
    const bm = bestMarket(mk);
    return { name: g.label, pick: bm.key, prob: bm.prob };
  });

  // Select the single best market across ALL meaningful markets — the engine
  // never defaults to the winner market.
  const ensBest = bestMarket(marketsFromGrid(blend));
  const probability = ensBest.prob;
  const agreeing = votes.filter((v) => v.pick === ensBest.key);
  const agreementRatio = votes.length ? agreeing.length / votes.length : 0;
  const fairOdds = 1 / Math.max(probability, 0.01);

  // MARKET DATA — real bookmaker odds (averaged across providers/bookmakers,
  // margin removed). No odds → the market model abstains, never approximates.
  let marketOdds = null, valueEdge = null, marketConfirm = 0.5, valueScore = 0.5;
  if (deep.odds) {
    const info = marketOddsInfo(deep.odds, ensBest.key);
    if (info) {
      marketOdds = Math.round(info.decimal * 100) / 100;
      valueEdge = Math.round((probability - info.impliedProb) * 1000) / 1000;
      marketConfirm = info.impliedProb >= probability - 0.08 ? 1 : 0.7;
      valueScore = valueEdge > 0 ? 1 : 0.6;
      flags.push(`Bookmaker market: ${info.decimal.toFixed(2)} avg odds — implied ${Math.round(info.impliedProb * 100)}%`);
    } else {
      flags.push("Bookmaker odds don't cover the selected market — value edge unavailable");
    }
  } else {
    flags.push("No bookmaker odds for this fixture — market model & value edge unavailable");
  }

  // Uncertainty — model disagreement + missing data.
  const probs = votes.map((v) => v.prob);
  const mean = probs.length ? probs.reduce((x, y) => x + y, 0) / probs.length : 0;
  const sd = probs.length ? Math.sqrt(probs.reduce((s, p) => s + (p - mean) ** 2, 0) / probs.length) : 0;
  const dataItems = [true, true, h.form != null, a.form != null,
    !!(h.home && a.away && h.away && a.home), !!h2hInfo];
  const missingFrac = dataItems.filter((x) => !x).length / dataItems.length;
  let uncertainty = (1 - agreementRatio) * 0.45 + (mean > 0 ? (sd / mean) * 0.35 : 0.2) + missingFrac * 0.08;
  if (deep.crossValidated) uncertainty *= 0.88; // two independent providers confirm the fixture
  uncertainty = clamp(uncertainty, 0, 1);

  // MATCH QUALITY SCORE 0-100. Unavailable components contribute half their
  // weight (honest "unknown", never a fake boost) and are red-flagged above.
  const dataQualityNum = clamp((1 - missingFrac) + (deep.crossValidated ? 0.15 : 0), 0, 1);
  const dqLevel = dataQualityNum >= 0.8 ? "HIGH" : dataQualityNum >= 0.55 ? "MEDIUM" : "LOW";
  const xgStrength = 1; // the expected-goals model always runs (regressed rates)
  const formStrength = h.form != null && a.form != null ? 1 : 0.5;
  const splitStrength = h.home && a.away && h.away && a.home ? 1 : 0.5;
  const availability = 0.5; // lineups/injuries unavailable before kickoff
  const providerScore = deep.crossValidated ? 1 : 0.6; // independent provider confirmation
  let qualityScore = dataQualityNum * 10 + agreementRatio * 15 + xgStrength * 15 + formStrength * 10
    + splitStrength * 10 + availability * 10 + marketConfirm * 10
    + leagueReliability(tier) * 5 + valueScore * 10 + providerScore * 5;
  qualityScore -= uncertainty * 15;
  qualityScore = clamp(qualityScore, 0, 100);

  // Predicted scoreline — regenerated to be mathematically CONSISTENT with
  // the selected market (validatePredictionConsistency).
  const score = consistentScoreline(blend, ensBest.key);
  if (!isConsistent(ensBest.key, score.home, score.away)) {
    flags.push("Internal consistency check failed");
    return { ok: false, flags };
  }

  const risk = probability >= 0.85 && uncertainty <= 0.10 && qualityScore >= 85
    ? "LOW RISK"
    : probability >= 0.75 && uncertainty <= 0.18 && qualityScore >= 75
      ? "MEDIUM RISK"
      : "HIGH RISK";

  const reasons = [
    `${homeStats.name} #${homeStats.rank} · ${homeStats.w}W-${homeStats.d}D-${homeStats.l}L (${homeStats.gp} games · ${homeStats.gf} scored / ${homeStats.ga} conceded)`,
    `${awayStats.name} #${awayStats.rank} · ${awayStats.w}W-${awayStats.d}D-${awayStats.l}L (${awayStats.gp} games · ${awayStats.gf} scored / ${awayStats.ga} conceded)`,
  ];
  const mk = marketsFromGrid(blend);
  reasons.push(`Model 1X2: ${Math.round(mk["1"] * 100)}% / ${Math.round(mk["X"] * 100)}% / ${Math.round(mk["2"] * 100)}%`);
  reasons.push(`Model totals: Over 2.5 ${Math.round(mk["O2.5"] * 100)}% · BTTS ${Math.round(mk["BTTS_Y"] * 100)}%`);
  if (h.form != null && a.form != null) {
    reasons.push(`Recent form: ${homeStats.form || "—"} vs ${awayStats.form || "—"}`);
  }
  if (h2hInfo) {
    reasons.push(`Head-to-head: last ${h2hInfo.n} league meeting${h2hInfo.n > 1 ? "s" : ""} — ${homeStats.name} ${h2hInfo.hg.toFixed(1)} avg goals, ${awayStats.name} ${h2hInfo.ag.toFixed(1)}`);
  }
  if (momH && momA) {
    reasons.push(`Momentum (last ${momH.n} games): ${homeStats.name} ${Math.round(momH.rate * 100)}% points rate · ${awayStats.name} ${Math.round(momA.rate * 100)}%`);
  }

  return {
    ok: true,
    marketKey: ensBest.key,
    marketLabel: MARKET_LABELS[ensBest.key] || ensBest.key,
    probability,
    predictedHome: score.home,
    predictedAway: score.away,
    qualityScore,
    agreementRatio,
    modelVotes: votes,
    uncertainty,
    dataQualityNum,
    dqLevel,
    flags,
    reasons,
    fairOdds,
    marketOdds,
    valueEdge,
    risk,
  };
}

// Historical performance from settled picks — hit rate, Brier score, log
// loss, calibration by league / market / confidence bucket / time window.
async function performance(base44) {
  try {
    const rows = await base44.asServiceRole.entities.EnginePick.filter(
      { status: { $in: ["win", "loss", "void"] } }, "-kickoff", 400
    );
    const settled = rows || [];
    if (!settled.length) return { samples: 0 };
    const now = Date.now();
    const decide = settled.filter((r) => r.status === "win" || r.status === "loss");
    const wins = decide.filter((r) => r.status === "win").length;
    const briers = settled.filter((r) => typeof r.brier === "number").map((r) => r.brier);
    const logLosses = settled.filter((r) => typeof r.log_loss === "number").map((r) => r.log_loss);
    const byKey = (list, keyFn) => {
      const m = {};
      for (const r of list) {
        const k = keyFn(r) || "—";
        if (!m[k]) m[k] = { total: 0, wins: 0 };
        m[k].total++;
        if (r.status === "win") m[k].wins++;
      }
      for (const k of Object.keys(m)) m[k].rate = m[k].wins / m[k].total;
      return m;
    };
    const inWindow = (r, days) => {
      const t = new Date(r.kickoff).getTime();
      return now - t <= days * 86400000;
    };
    const bucket = (r) => {
      const p = r.probability;
      if (p >= 0.85) return "85%+";
      if (p >= 0.80) return "80–85%";
      if (p >= 0.75) return "75–80%";
      return "72–75%";
    };
    return {
      samples: settled.length,
      decided: decide.length,
      wins,
      hitRate: decide.length ? wins / decide.length : null,
      brierAvg: briers.length ? briers.reduce((x, y) => x + y, 0) / briers.length : null,
      logLossAvg: logLosses.length ? logLosses.reduce((x, y) => x + y, 0) / logLosses.length : null,
      byLeague: byKey(decide, (r) => r.league_name),
      byMarket: byKey(decide, (r) => r.market_label),
      byBucket: byKey(decide, bucket),
      last7: byKey(decide.filter((r) => inWindow(r, 7)), () => "7-day"),
      last30: byKey(decide.filter((r) => inWindow(r, 30)), () => "30-day"),
    };
  } catch (e) {
    console.error("performance failed:", e?.message || e);
    return null;
  }
}

export async function buildBoard(base44, cfg) {
  const now = new Date();
  const sy = currentSeasonYear(now);

  // Current season (fixtures + results) and previous season (head-to-head
  // history) per league — all from the provider, trimmed and cached.
  const leagueResults = await pool(
    cfg.leagues.map((l) => async () => {
      const cur = await fetchSeason(base44, l.code, sy, true);
      if (!cur || !cur.length) return { l, ok: false };
      const derived = deriveSeason(cur);
      const prev = await fetchSeason(base44, l.code, sy - 1, false);
      const prevDerived = prev ? deriveSeason(prev) : null;
      const games = { ...derived.games };
      if (prevDerived) {
        for (const [team, list] of Object.entries(prevDerived.games)) {
          (games[team] ||= []).push(...list);
        }
      }
      return { l, ok: true, cur, derived, games };
    }),
    8
  );

  const dayKeys = [];
  for (let i = 0; i < 7; i++) {
    dayKeys.push(localParts(new Date(now.getTime() + i * 86400000).toISOString(), cfg.timezone).dateKey);
  }
  const daySet = new Set(dayKeys);
  const perDay = {};
  for (const k of dayKeys) perDay[k] = { morning: [], evening: [], scanned: 0 };

  // CROSS-PROVIDER LAYER — independent fixtures for the same real matches.
  // API-Football serves a rolling ~3-day window on the current plan;
  // Sportmonks serves its subscribed competitions. Cached 6h server-side.
  const reg = cfg.providerRegistry;
  const providerFixtures = {};
  for (const k of dayKeys) providerFixtures[k] = { af: [], sm: [], sr: [] };
  const afDays = new Set(dayKeys.slice(0, 3));
  const wantedLeagues = cfg.leagues.map((l) => ({ name: l.name, country: l.country }));
  // Provider isolation — one adapter failing must never take the board down;
  // the trace records it honestly instead.
  const srTrace = { enabled: reg.sportradar?.enabled, ready: sportradarReady(), counts: {}, errors: [] };
  await Promise.all(dayKeys.map(async (k) => {
    // Sportradar shares the same near-term window as API-Football: its 1 req/s
    // trial limit means one schedule call per day, so the first 3 days get
    // the premium cross-validation (cached 6h afterwards).
    const [af, sm, sr] = await Promise.all([
      afDays.has(k) ? afFixturesForDate(base44, k, reg.apiFootball.enabled, wantedLeagues) : Promise.resolve([]),
      smFixturesForDate(base44, k, reg.sportmonks.enabled),
      afDays.has(k)
        ? srFixturesForDate(base44, k, reg.sportradar?.enabled, wantedLeagues)
            .then((r) => { srTrace.counts[k] = Array.isArray(r) ? r.length : "not-array"; return r; })
            .catch((e) => { srTrace.errors.push(`${k}: ${String(e?.message || e).slice(0, 160)}`); return []; })
        : Promise.resolve([]),
    ]);
    providerFixtures[k].af = af;
    providerFixtures[k].sm = sm;
    providerFixtures[k].sr = sr;
  }));
  // providerMatchResolver pool — normalized team tokens + kickoff times.
  const providerPool = [];
  for (const k of dayKeys) {
    for (const f of providerFixtures[k].af) {
      providerPool.push({ provider: "API-Football", id: f.id, utc: f.utc, ms: Date.parse(f.utc), th: nameTokens(f.home), ta: nameTokens(f.away) });
    }
    for (const f of providerFixtures[k].sm) {
      providerPool.push({ provider: "Sportmonks", id: f.id, utc: f.utc, ms: Date.parse(f.utc), th: nameTokens(f.home), ta: nameTokens(f.away) });
    }
    for (const f of providerFixtures[k].sr) {
      providerPool.push({ provider: "Sportradar", id: f.id, utc: f.utc, ms: Date.parse(f.utc), th: nameTokens(f.home), ta: nameTokens(f.away) });
    }
  }
  let oddsBudget = 6; // bounded odds calls per rebuild — stays under the provider's per-minute cap (each cached 30 min)
  let afOddsUsed = 0; // API-Football per-minute cap: at most 4 odds calls per rebuild

  const funnel = { available: 0, dataPass: 0, agreementPass: 0, probabilityPass: 0, qualityPass: 0, crossValidated: 0 };
  let fixturesSeen = 0;
  let leaguesWithData = 0;

  for (const res of leagueResults) {
    if (!res.ok) continue;
    const { l, cur, derived, games } = res;
    leaguesWithData++;
    const tier = l.tier || 2;

    for (const m of cur) {
      if (m.played) continue;
      // Kickoff ISO — provider time is league-local; shift to UTC by the
      // league country's offset, then classify in the configured timezone.
      const t = (m.time || "15:00").slice(0, 5);
      const base = new Date(`${m.date}T${t}:00Z`);
      let iso = new Date(base.getTime() - (l.offset || 1) * 3600 * 1000).toISOString();

      // providerMatchResolver — the SAME real match recognized across
      // providers via normalized team names + kickoff proximity. The
      // openfootball entry stays the canonical fixture; cross-provider
      // matches confirm it and refine the kickoff time (never duplicates).
      const thC = nameTokens(m.team1);
      const taC = nameTokens(m.team2);
      const approxMs = Date.parse(iso);
      const matched = [];
      for (const f of providerPool) {
        if (Math.abs(f.ms - approxMs) > 30 * 3600 * 1000) continue;
        if (tokenMatch(thC, f.th) && tokenMatch(taC, f.ta)) matched.push(f);
      }
      const afMatch = matched.find((f) => f.provider === "API-Football");
      const exact = afMatch || matched[0];
      if (exact && exact.utc) iso = exact.utc; // exact provider kickoff replaces the estimate
      const kickoffMs = Date.parse(iso);
      if (kickoffMs <= now.getTime()) continue; // started — never picked
      const lp = localParts(iso, cfg.timezone);
      if (!daySet.has(lp.dateKey)) continue;
      fixturesSeen++;
      funnel.available++;
      if (matched.length) funnel.crossValidated++;
      const bucket = perDay[lp.dateKey];
      bucket.scanned++;
      const session = lp.hour >= cfg.eveningStart ? "evening" : "morning";

      const homeStats = derived.table[m.team1] || null;
      const awayStats = derived.table[m.team2] || null;
      if (!homeStats || !awayStats) continue; // team has played no games yet

      // Head-to-head: real meetings between the pair (last two seasons).
      const meetings = (games[m.team1] || [])
        .filter((g) => g.opp === m.team2)
        .sort((x, y) => (x.date < y.date ? -1 : 1))
        .slice(-4);

      const deep = {
        meetings,
        gamesH: games[m.team1] || [],
        gamesA: games[m.team2] || [],
        crossValidated: matched.length > 0,
        odds: null,
      };
      let ens = runEnsemble(homeStats, awayStats, derived.lgGpg, tier, deep);
      if (!ens.ok) continue;

      // QUALITY FILTER — cumulative funnel. The engine never forces a pick.
      if (homeStats.gp < cfg.minGames || awayStats.gp < cfg.minGames) continue;
      if (ens.dataQualityNum < 0.55) continue;
      funnel.dataPass++;

      // Real bookmaker odds for provider-confirmed fixtures (bounded budget,
      // cached 30 min) — rerun the ensemble with the market, then re-check
      // every filter against the market-informed numbers.
      if (matched.length && ens.probability >= cfg.minProbability && oddsBudget > 0 && !deep.odds) {
        const maps = [];
        for (const mm of matched) {
          if (mm.provider !== "API-Football" && mm.provider !== "Sportmonks") continue; // Sportradar supplies data + coverage, never odds
          if (mm.provider === "API-Football") {
            if (afOddsUsed >= 4) continue; // keeps the rebuild under the provider's per-minute cap
            afOddsUsed++;
          }
          oddsBudget--;
          const o = mm.provider === "API-Football"
            ? await afOddsForFixture(base44, mm.id)
            : await smOddsForFixture(base44, mm.id);
          if (o && Object.keys(o).filter((x) => !x.startsWith("_")).length) maps.push(o);
        }
        if (maps.length) {
          deep.odds = mergeOddsMaps(maps);
          const ens2 = runEnsemble(homeStats, awayStats, derived.lgGpg, tier, deep);
          if (ens2.ok) ens = ens2;
        }
      }
      if (ens.agreementRatio < cfg.minAgreement) continue;
      funnel.agreementPass++;
      if (ens.probability < cfg.minProbability) continue;
      funnel.probabilityPass++;
      if (ens.qualityScore < cfg.minQualityScore || ens.uncertainty > cfg.maxUncertainty) continue;
      funnel.qualityPass++;

      const rankScore = ens.qualityScore * 0.45 + ens.probability * 100 * 0.35 + ens.agreementRatio * 100 * 0.20;
      const agreeCount = ens.modelVotes.filter((v) => v.pick === ens.marketKey).length;
      bucket[session].push({
        fixtureId: `${l.code}|${m.date}|${m.team1}|${m.team2}`,
        leagueCode: l.code,
        league: l.name,
        home: m.team1,
        away: m.team2,
        homeShort: m.team1,
        awayShort: m.team2,
        homeLogo: "",
        awayLogo: "",
        kickoff: iso,
        localTime: fmtLocal(iso, cfg.timezone),
        dateKey: lp.dateKey,
        session,
        marketKey: ens.marketKey,
        marketLabel: ens.marketLabel,
        probability: Math.round(ens.probability * 1000) / 1000,
        predictedHome: ens.predictedHome,
        predictedAway: ens.predictedAway,
        qualityScore: Math.round(ens.qualityScore),
        agreementText: `${agreeCount}/${ens.modelVotes.length} models agree`,
        agreementRatio: Math.round(ens.agreementRatio * 100) / 100,
        dataQuality: ens.dqLevel,
        uncertainty: Math.round(ens.uncertainty * 100) / 100,
        fairOdds: Math.round(ens.fairOdds * 100) / 100,
        marketOdds: ens.marketOdds,
        valueEdge: ens.valueEdge,
        sources: ["openfootball", ...[...new Set(matched.map((f) => f.provider))]],
        crossProvider: matched.length ? `${matched.length + 1} providers` : null,
        risk: ens.risk,
        reasons: ens.reasons,
        models: ens.modelVotes,
        flags: ens.flags,
        rank: rankScore,
      });
    }
  }

  // Selection per day/session: rank, diversify by league, cap — never force.
  const days = dayKeys.map((k) => {
    const b = perDay[k];
    const select = (arr, cap) => {
      const ranked = arr.slice().sort((x, y) => y.rank - x.rank);
      const out = [];
      const perLeague = {};
      for (const p of ranked) {
        if ((perLeague[p.leagueCode] || 0) >= cfg.maxPerLeague) continue;
        out.push(p);
        perLeague[p.leagueCode] = (perLeague[p.leagueCode] || 0) + 1;
        if (out.length >= cap) break;
      }
      return out.map(({ rank, ...rest }) => rest);
    };
    return {
      dateKey: k,
      scanned: b.scanned,
      morning: { picks: select(b.morning, cfg.maxMorning) },
      evening: { picks: select(b.evening, cfg.maxEvening) },
    };
  });

  // Provider health snapshot — board + admin dashboards.
  const providers = {};
  for (const [k, v] of Object.entries(reg)) {
    if (k === "openfootball") {
      providers[k] = { label: v.label, enabled: v.enabled, status: v.enabled ? (leaguesWithData > 0 ? "ONLINE" : "OFFLINE") : "DISABLED", lastSuccess: null };
    } else if (k === "sportradar") {
      const h = await healthGet(base44, k);
      const ready = v.enabled && sportradarReady();
      providers[k] = { label: v.label, enabled: v.enabled, status: ready ? (h.status || "UNKNOWN") : "DISABLED", lastSuccess: h.lastSuccess || null };
    } else {
      const h = await healthGet(base44, k);
      providers[k] = { label: v.label, enabled: v.enabled, status: v.enabled ? (h.status || "UNKNOWN") : "DISABLED", lastSuccess: h.lastSuccess || null };
    }
  }

  // Competition coverage — discovered from what providers ACTUALLY returned
  // in the scanned window (verified, never assumed).
  const okCodes = new Set(leagueResults.filter((r) => r.ok).map((r) => r.l.code));
  const competitions = buildCompetitionRegistry(providerFixtures, cfg.leagues.map((l) => ({
    name: l.name, country: l.country, hasData: okCodes.has(l.code),
  })));

  return {
    updatedAt: new Date().toISOString(),
    timezone: cfg.timezone,
    leaguesScanned: cfg.leagues.length,
    leaguesWithData,
    fixturesSeen,
    funnel,
    days,
    performance: await performance(base44),
    providers,
    competitions,
    srTrace,
    modelVersion: "v3.0",
    sourceDown: fixturesSeen === 0,
    notes: "Multi-provider engine: openfootball (season data) + API-Football + Sportmonks + Sportradar Soccer v4 (fixture cross-validation, exact kickoff times, per-event coverage flags; Sportradar supplies data — never odds). Odds and value edges are never estimated.",
  };
}