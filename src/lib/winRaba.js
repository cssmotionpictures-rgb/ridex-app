// WIN RABA — 5-day Morning + Evening prediction ranking & accumulator module,
// now powered by the RX-2.0 multi-model ensemble (src/lib/ensemble).
// It READS the app's verified data core (openfootball season files with REAL
// kickoff times and real final scores, plus the real bookmaker odds layer)
// but never touches any existing prediction tab, slip, ledger or deal. Every
// displayed price is a REAL bookmaker quote where the odds provider carries
// the league/market; model numbers are always labeled as estimates. Never a
// guarantee — "qualifying pick" is the strongest claim made. Slots are never
// padded: if nothing clears the ensemble's quality gate, the board says so.

import { attachRealOdds, oddsKey } from "@/lib/bookmakerOdds";
import {
  RX_LEAGUES, loadLeague, kickoffOf, fixtureIdOf,
} from "@/lib/ensemble/fixtures";
import {
  RX_MODEL_VERSION, RX_MIN_QUALIFY_PROB, isBigHammer, analyzeFixture,
} from "@/lib/ensemble/engine";

export const WR_MODEL_VERSION = RX_MODEL_VERSION; // RX-2.0 — the ensemble engine
export const WR_QUALIFY_MIN_PROB = RX_MIN_QUALIFY_PROB; // below this a pick never qualifies
export const WR_DAYS = 5;
export const WR_PAPER_STAKE = 1000;
export const WR_LEARN_MIN_SAMPLE = 30; // ACCA LAB adjustments only after a meaningful settled sample

// The scanned competition set — every league the verified season files carry.
export const WR_LEAGUES = RX_LEAGUES;

// === Lagos time — every session classification uses Africa/Lagos, never server
// UTC. The helpers live in the pure lagosTime module so every prediction surface
// (and the software tests) shares ONE clock implementation. ===
export {
  lagosDateKey, lagosTodayKey, lagosKickoffLabel, lagosDayLabel, sessionOfKickoff,
} from "@/lib/lagosTime";
import {
  lagosDateKey, lagosTodayKey, lagosKickoffLabel, lagosDayLabel, sessionOfKickoff,
} from "@/lib/lagosTime";
// The 5-day window — computed fresh from the Lagos clock on every load, so the
// calendar rolls forward automatically at Lagos midnight.
export function windowDateKeys() {
  const out = [];
  for (let d = 0; d < WR_DAYS; d++) out.push(lagosDateKey(Date.now() + d * 86400000));
  return out;
}

// Ensemble candidate → the board pick shape (every field the board, acca
// builder, ledger and EnginePrediction store demand).
function pickShape(c, fx, fid, lg, dates) {
  const session = sessionOfKickoff(fx.kickoff);
  const dateKey = lagosDateKey(fx.kickoff);
  const adjust = fx.marketAdjust?.[c.marketKey] || 0;
  return {
    fixtureId: fid,
    home: fx.home,
    away: fx.away,
    league: lg.label,
    leagueCode: lg.code,
    kickoff: fx.kickoff,
    kickoffLabel: lagosKickoffLabel(fx.kickoff),
    lagosDateKey: dateKey,
    dayIndex: dates.indexOf(dateKey) + 1,
    session,
    marketKey: c.marketKey,
    marketLabel: c.marketLabel,
    prob: c.calibrated, // calibrated ensemble estimate — an estimate, never a guarantee
    ensemble: c.ensemble,
    confidence: c.displayConf ?? Math.round(c.calibrated * 100),
    rawEdgePct: c.rawEdgePct ?? 0,
    adjEdgePct: c.adjEdgePct ?? null,
    minAdjEdge: c.minAdjEdge ?? null,
    marginProbability: c.marginImplied ?? 0,
    quality: c.quality || "MEDIUM",
    flags: c.flags || [],
    provenance: c.provenance || null,
    validation: c.validation || null,
    weightsBasis: c.weightsBasis || "baseline",
    calibrationSample: c.calibrationSample ?? 0,
    snapshot: c.snapshot || null,
    score: c.master + adjust, // ranking: master score + the ACCA LAB's learned nudge
    masterScore: c.master,
    grade: c.grade,
    agreement: c.agreement,
    uncertainty: c.uncertainty,
    qualityLabel: c.dq,
    evidence: `Form ${fx.hs.n}+${fx.as.n} · H2H ${fx.h2h.n} meetings · ${c.voting} models`,
    dataQuality: `Form ${fx.hs.n}+${fx.as.n} · H2H ${fx.h2h.n} meetings · ${c.voting} models`,
    marketOdds: c.price,
    bookmaker: c.bookmaker,
    marketProbability: c.implied,
    edgePct: c.edgePct,
    evPct: c.evPct,
    fairOdds: c.fairOdds,
    pinnacle: c.pinnacle,
    oddsStatus: c.priced ? "priced" : "model_only",
    perModel: c.perModel,
    voting: c.voting,
    explanation: c.explanation,
    failureModes: c.failureModes,
  };
}

// Real market intelligence for one fixture from the odds result map — the
// three-way prices feed the market-implied ensemble model, and every
// candidate market price feeds the edge/EV comparison.
function marketIntelFor(fx, oddsMap) {
  const date = String(fx.kickoff).slice(0, 10);
  const get = (label) =>
    oddsMap.get(oddsKey({ date, home: fx.home, away: fx.away, marketLabel: label }));
  const three = [get("Home Win"), get("Draw"), get("Away Win")];
  let threeWay = null;
  if (three.every((o) => o && o.price)) {
    threeWay = {
      p1: three[0].implied,
      pX: three[1].implied,
      p2: three[2].implied,
      overround: three[0].implied + three[1].implied + three[2].implied,
    };
  }
  const prices = {};
  fx.legs.forEach((l) => {
    const o = get(l.label);
    if (o && o.price) {
      prices[l.key] = {
        price: o.price,
        bookmaker: o.bookmaker,
        implied: o.implied,
        pinnacle: o.pinnacle,
        timestamp: o.timestamp || null,
      };
    }
  });
  return { threeWay, prices };
}

let boardCache = { key: "", at: 0, promise: null };
const BOARD_TTL_MS = 10 * 60 * 1000;

// Build the 5-day board: every league scanned, every fixture analyzed by the
// multi-model ensemble, every candidate market priced against the real
// bookmaker layer, and ONLY quality-gate-passing picks shown — ranked per day
// and per Lagos session.
export function buildWinRabaBoard({ onProgress, force, marketAdjust, calibration, learnedWeights } = {}) {
  const key = lagosTodayKey();
  if (!force && boardCache.promise && boardCache.key === key && Date.now() - boardCache.at < BOARD_TTL_MS) {
    return boardCache.promise;
  }
  const promise = (async () => {
    const dates = windowDateKeys();
    let done = 0;
    const tick = () => {
      done++;
      if (onProgress) onProgress(done, WR_LEAGUES.length);
    };

    // 1) DATA LAYER — verified season files per league (real fixtures, real
    //    results, real kickoff times). Missing files no-op safely.
    const perLeague = await Promise.all(
      WR_LEAGUES.map(async (lg) => {
        try {
          const ms = await loadLeague(lg.code);
          const played = ms.filter((m) => m.score?.ft);
          const upcoming = ms.filter((m) => {
            const ko = kickoffOf(m);
            return (
              ko &&
              !m.score?.ft &&
              dates.includes(m.date) &&
              new Date(ko).getTime() > Date.now()
            );
          });
          tick();
          return { lg, played, upcoming };
        } catch {
          tick();
          return { lg, played: [], upcoming: [] }; // league unavailable — never guessed in
        }
      })
    );

    // 2) MODELS — independent multi-model forecasts per fixture (pre-market)
    const analyses = [];
    let fixturesScanned = 0;
    perLeague.forEach(({ lg, played, upcoming }) => {
      fixturesScanned += upcoming.length;
      upcoming.forEach((m) => {
        const fx = analyzeFixture({
          home: m.team1,
          away: m.team2,
          league: lg.label,
          leagueCode: lg.code,
          kickoff: kickoffOf(m),
          played,
          calibration,
          learnedWeights,
          marketAdjust,
        });
        if (fx) {
          fx.marketAdjust = marketAdjust || {};
          analyses.push({ lg, m, fx, fid: fixtureIdOf(lg.code, m) });
        }
      });
    });

    // 3) MARKET LAYER — one provider call for every candidate market plus the
    //    three-way prices the market-implied ensemble model needs.
    const legs = [];
    analyses.forEach(({ fx }) => {
      const date = String(fx.kickoff).slice(0, 10);
      const base = { date, home: fx.home, away: fx.away, league: fx.league };
      [["Home Win", fx.raw1X2.p1], ["Draw", fx.raw1X2.pX], ["Away Win", fx.raw1X2.p2]].forEach(
        ([label, prob]) => legs.push({ ...base, marketLabel: label, prob })
      );
      fx.legs.forEach((c) =>
        legs.push({ ...base, marketLabel: c.label, prob: c.rawProb })
      );
    });
    let oddsMap = new Map();
    let oddsStatus = "unavailable";
    try {
      const res = await attachRealOdds(legs, { maxLeagues: 12 });
      oddsMap = res.map;
      oddsStatus = res.providerStatus;
    } catch {
      oddsStatus = "unavailable";
    }

    // 4) ENSEMBLE + CALIBRATION + QUALITY GATE — final scoring with the
    //    market included, then the gate. Nothing is manufactured to fill a slot.
    const picks = [];
    const rejected = [];
    const bigHammer = [];
    const obsEntries = [];
    let marketsScanned = 0;
    analyses.forEach(({ lg, m, fx, fid }) => {
      const fin = fx.finalize(marketIntelFor(fx, oddsMap));
      marketsScanned += fin.marketsScanned;
      const qualifying = fin.candidates.filter((c) => c.qualifies);
      fin.candidates
        .filter((c) => !c.qualifies)
        .forEach((c) =>
          rejected.push({ home: fx.home, away: fx.away, market: c.marketLabel, reason: c.rejectReason })
        );
      // MODEL OBSERVATIONS — every analyzed candidate (qualified OR rejected)
      // is exposed to the research ledger: evaluation without pretending each
      // one was a recommended bet. Purely additive; WIN RABA's own UI and
      // ledgers are untouched.
      fin.candidates.forEach((c) =>
        obsEntries.push({
          fixtureId: fid,
          home: fx.home,
          away: fx.away,
          league: lg.label,
          leagueCode: lg.code,
          kickoff: fx.kickoff,
          lagosDateKey: lagosDateKey(fx.kickoff),
          session: sessionOfKickoff(fx.kickoff),
          modelsUnavailable: fin.diagnostics?.unavailable || [],
          evidence: `Form ${fx.hs.n}+${fx.as.n} · H2H ${fx.h2h.n} meetings · ${c.voting} models`,
          c,
        })
      );
      if (!qualifying.length) return; // nothing qualified — the slot stays empty

      // One board selection per fixture — the strongest qualifying candidate.
      const best = qualifying
        .map((c) => ({ c, rank: c.master + (marketAdjust?.[c.marketKey] || 0) }))
        .sort((a, b) => b.rank - a.rank)[0].c;
      const shaped = pickShape(best, fx, fid, lg, dates);
      if (shaped.dayIndex < 1 || !shaped.session) return; // outside the Lagos window — never forced in
      picks.push(shaped);

      // BIG HAMMER — priced 3.00+ individual picks with the stricter gates.
      const hammers = qualifying.filter(isBigHammer);
      if (hammers.length) {
        const bh = hammers.sort((a, b) => b.master - a.master)[0];
        bigHammer.push({ ...pickShape(bh, fx, fid, lg, dates), bigHammer: true });
      }
    });

    // 5) Morning report — the honest scan summary.
    const grades = { "ULTRA ELITE": 0, ELITE: 0, STRONG: 0, QUALIFYING: 0 };
    picks.forEach((p) => {
      if (grades[p.grade] != null) grades[p.grade]++;
    });
    const report = {
      fixturesScanned,
      fixturesAnalyzed: analyses.length,
      leaguesScanned: WR_LEAGUES.length,
      marketsScanned,
      rejected: rejected.length,
      qualifying: picks.length,
      grades,
      bigHammer: bigHammer.length,
      modelVersion: RX_MODEL_VERSION,
      scannedAt: new Date().toISOString(),
      // Structural availability — disclosed, never guessed:
      unavailableData: [
        "xG model — no verified expected-goals feed is connected",
        "lineup / injury model — no verified lineup or injury feed is connected",
        "first-half / second-half models — no premium half-time markets are offered",
      ],
    };

    const byDate = {};
    picks.forEach((p) => {
      (byDate[p.lagosDateKey] ||= []).push(p);
    });
    const days = dates.map((dKey, i) => {
      const list = (byDate[dKey] || []).sort((a, b) => b.score - a.score);
      return {
        dateKey: dKey,
        label: lagosDayLabel(dKey),
        dayIndex: i + 1,
        all: list,
        morning: list.filter((p) => p.session === "morning"),
        evening: list.filter((p) => p.session === "evening"),
      };
    });

    return {
      windowStart: dates[0],
      dates,
      days,
      bigHammer,
      rejected,
      observations: obsEntries,
      report,
      oddsStatus,
      scannedAt: new Date().toISOString(),
    };
  })();

  boardCache = { key, at: Date.now(), promise };
  return promise;
}

// Build an accumulator from ranked picks. One selection per fixture —
// same-match legs are never stacked (they are correlated, and a bookie won't
// take them as independent legs anyway).
export function buildAcca(level, picks, stake = WR_PAPER_STAKE) {
  const seenFx = new Set();
  const legs = (picks || []).filter((p) => {
    if (seenFx.has(p.fixtureId)) return false;
    seenFx.add(p.fixtureId);
    return true;
  });
  const allPriced = legs.length > 0 && legs.every((p) => p.marketOdds > 1);
  const priceOf = (p) => (allPriced ? p.marketOdds : 1 / p.prob);
  const combinedOdds = legs.reduce((acc, p) => acc * priceOf(p), 1);
  const combinedProb = legs.reduce((acc, p) => acc * p.prob, 1);

  // Correlation control — legs sharing a team make simple multiplication
  // approximate; flag it instead of pretending the product is exact.
  const teamCount = {};
  let correlated = false;
  legs.forEach((p) => {
    [p.home, p.away].forEach((t) => {
      teamCount[t] = (teamCount[t] || 0) + 1;
      if (teamCount[t] > 1) correlated = true;
    });
  });

  const riskLevel = combinedProb >= 0.55 ? "LOW" : combinedProb >= 0.3 ? "MEDIUM" : "HIGH";
  return {
    level,
    legs,
    legsCount: legs.length,
    combinedOdds: Number(combinedOdds.toFixed(2)),
    oddsBasis: allPriced ? "real" : "model",
    combinedProbability: combinedProb,
    riskLevel,
    correlated,
    correlationNote: correlated
      ? "CORRELATED SELECTIONS — two legs share a team, so the combined probability is an approximation, not an exact product."
      : "",
    paperStake: stake,
    potentialReturn: Math.round(stake * combinedOdds),
  };
}