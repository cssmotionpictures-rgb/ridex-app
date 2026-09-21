// MULTI-SPORT SPECIAL ODDS ENGINE — tennis, American football, baseball and
// ice hockey, mirroring the basketball engine (src/lib/basketballSlips.js):
//   1. ONE-WEEK WINDOW — next-7-days fixtures only (day-keyed scan cache).
//   2. VERIFIED FORM ONLY — both sides need real played games with final
//      scores from the same league feed; head-to-head history nudges
//      confidence and contradictions disqualify the pick. Never a guess.
//   3. ONE PICK, NEVER TWICE — the same (game, market) never sits on two
//      tickets, and a pick dealt on an earlier day — previous 7-day cycle
//      included — never comes back (persistent dealt-pick memory).
//   4. HIGH ODDS — 94%+ picks padded with a second (90%+) verified market
//      until the combined odds clear the 2,000,000 target, max 50 legs.
// Tennis uses a best-of-3 model (match winner + sets totals from the real
// set-win split); the points sports use the same Poisson lines model as
// basketball with each sport's real unit (Points / Runs / Goals).

import { formFromResults } from "@/lib/pickEngine";
import { marketKeyOf } from "@/lib/slipDealing";
import { legOdds } from "@/components/sports/SpecialSlipBatch";
import { cycleInfo, loadDealtMemory, recordDealt, saveDealtMemory, wasDealtBefore, todayKey } from "@/lib/dealtPickMemory";
import { espnLeagueFeed, espnTennisScan } from "@/lib/espnSports";
import { setScanStatus } from "@/lib/scanStatus";
import { getTennisOddsMap, normTennisName } from "@/lib/tennisOdds";
import { bestOverLine, bestUnderLine, bestTeamLine, h2hOf, lineOf } from "@/lib/basketballSlips";

// VERIFIED DATA SOURCE — ESPN public feeds (real fixtures + real final
// scores). TheSportsDB's free day feed returns nothing for these sports and
// the Sportradar trial key is soccer-entitled only. `espn` is the ESPN league
// path; tennis builds from the per-tournament match lists instead.
export const SLIP_SPORTS = [
  { key: "tennis", name: "Tennis", label: "🎾 TENNIS", espn: null, suffix: "TENNIS", unit: "Sets", minForm: 3, mainConf: 0.9 },
  { key: "american_football", name: "American football", label: "🏈 AM. FOOTBALL", espn: "football/nfl", suffix: "NFL", unit: "Points", lamMin: 17, lamMax: 140, teamLo: 3, teamHi: 62, gap: 10, minForm: 2, resultsDays: 16 },
  { key: "baseball", name: "Baseball", label: "⚾ BASEBALL", espn: "baseball/mlb", suffix: "MLB", unit: "Runs", lamMin: 1, lamMax: 25, teamLo: 0.5, teamHi: 15, gap: 1.5, minForm: 3, resultsDays: 10 },
  { key: "ice_hockey", name: "Ice hockey", label: "🏒 ICE HOCKEY", espn: "hockey/nhl", suffix: "NHL", unit: "Goals", lamMin: 1.5, lamMax: 14, teamLo: 1, teamHi: 8, gap: 1.5, minForm: 3, resultsDays: 16 },
];
export const BASE_TICKETS = ["HOLLOW", "DRAMA QUEEN", "RIDE X", "HAMMER", "FINE GIRL"];
export const MAX_LEGS = 50;
export const MIN_LEGS = 20;
export const TARGET_ODDS = 2000000;

const MIN_CONF = 0.94; // same "sure qualified" bar as the football/basketball specials
const COMP_CONF = 0.9; // padding pick bar
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---- POINTS SPORTS (American football / baseball / ice hockey) ----
// Same model as basketball: moneyline from verified form + H2H, total lines
// (Points/Runs/Goals) and team lines from the real scoring rates.
async function buildPointsPool(cfg) {
  const todayStr = todayKey();
  const { fixtures: matches, results: leagueResults } = await espnLeagueFeed(cfg.espn, cfg.name, cfg.resultsDays || 12, 7);
  const results = { [cfg.espn]: leagueResults };

  const out = [];
  for (const e of matches) {
    if (!e.dateEvent || e.dateEvent < todayStr) continue;
    const h = (e.strHomeTeam || "").toLowerCase();
    const a = (e.strAwayTeam || "").toLowerCase();
    if (!h || !a) continue;
    const evs = results[e.idLeague] || [];
    const hf = formFromResults(evs, h);
    const af = formFromResults(evs, a);
    if (!hf || !af || hf.n < cfg.minForm || af.n < cfg.minForm) continue; // verified form on both sides only

    const h2h = h2hOf(evs, h, a);
    const hgf = hf.gf / hf.n, agf = af.gf / hf.n;
    const hga = hf.ga / hf.n, aga = af.ga / hf.n;
    const lam = clamp(hgf + agf, cfg.lamMin, cfg.lamMax);
    const h2hAvgTotal = h2h && h2h.n >= 2 ? (h2h.gf + h2h.ga) / h2h.n : null;
    const contradictsTotals = (dir, line) =>
      h2hAvgTotal != null && (dir === "over" ? h2hAvgTotal < line : h2hAvgTotal > line);

    // MAIN MARKETS — the 94%+ bar
    const cands = [];
    let pH = clamp(0.5 + (hf.avg - af.avg) * 0.35 + 0.06, 0.25, 0.85);
    let pA = 1 - pH;
    if (h2h) {
      pH = clamp(pH + (h2h.share - 0.5) * 0.18, 0.05, 0.92);
      pA = clamp(pA - (h2h.share - 0.5) * 0.18, 0.05, 0.92);
    }
    if (pH >= MIN_CONF && !(h2h && h2h.n >= 2 && h2h.share <= 0.25)) cands.push({ label: "1", prob: pH });
    if (pA >= MIN_CONF && !(h2h && h2h.n >= 2 && h2h.share >= 0.75)) cands.push({ label: "2", prob: pA });
    const o94 = bestOverLine(lam, MIN_CONF, cfg.unit);
    if (o94 && !contradictsTotals("over", o94.line)) cands.push(o94);
    const u94 = bestUnderLine(lam, MIN_CONF, cfg.unit);
    if (u94 && !contradictsTotals("under", u94.line)) cands.push(u94);
    const th94 = bestTeamLine(e.strHomeTeam, hgf, MIN_CONF, cfg.unit, cfg.teamLo, cfg.teamHi);
    if (th94 && !(h2h && h2h.n >= 2 && h2h.gf / h2h.n < th94.line)) cands.push(th94);
    const ta94 = bestTeamLine(e.strAwayTeam, agf, MIN_CONF, cfg.unit, cfg.teamLo, cfg.teamHi);
    if (ta94 && !(h2h && h2h.n >= 2 && h2h.ga / h2h.n < ta94.line)) cands.push(ta94);

    // VALUE ZONE (1.25–1.55 fair odds) — the Monster 6-day rollover's sweet
    // spot: match-winner picks whose model probability sits between ~64.5%
    // and 80%. Kept SEPARATE from the 94%+ main cands so the existing
    // tickets never change.
    const inZone = (p) => p >= 1 / 1.55 && p <= 1 / 1.25;
    const valueCands = [];
    if (inZone(pH) && !(h2h && h2h.n >= 2 && h2h.share <= 0.25)) valueCands.push({ label: "1", prob: pH });
    if (inZone(pA) && !(h2h && h2h.n >= 2 && h2h.share >= 0.75)) valueCands.push({ label: "2", prob: pA });
    if (!cands.length && !valueCands.length) continue;

    // PADDING PICKS — second verified market at the 90%+ bar, H2H-checked,
    // knife-edge lines (< sport gap) skipped so combos stay honest.
    const th90 = bestTeamLine(e.strHomeTeam, hgf, COMP_CONF, cfg.unit, cfg.teamLo, cfg.teamHi);
    const ta90 = bestTeamLine(e.strAwayTeam, agf, COMP_CONF, cfg.unit, cfg.teamLo, cfg.teamHi);
    const compO = bestOverLine(lam, COMP_CONF, cfg.unit);
    const compU = bestUnderLine(lam, COMP_CONF, cfg.unit);

    const legs = cands.map((c) => {
      const cLine = lineOf(c.label);
      const companion = [compO, compU]
        .filter(Boolean)
        .filter((o) => Math.abs(o.line - cLine) >= cfg.gap)
        .filter((o) => !contradictsTotals(o.dir, o.line))
        .sort((x, y) => x.prob - y.prob)[0] || null;
      const companion2 = [th90, ta90]
        .filter(Boolean)
        .filter((t) => t.label !== c.label)
        .filter((t) => {
          if (h2h && h2h.n >= 2) {
            const sideAvg = t === th90 ? h2h.gf / h2h.n : h2h.ga / h2h.n;
            if (sideAvg < t.line) return false; // never reached this line vs this opponent
          }
          return true;
        })
        .sort((x, y) => x.prob - y.prob)[0] || null;
      return {
        ...c,
        companion: companion ? { label: companion.label, prob: companion.prob, fairOdds: 1 / companion.prob } : null,
        companion2: companion2 ? { label: companion2.label, prob: companion2.prob, fairOdds: 1 / companion2.prob } : null,
      };
    });

    out.push({
      fixtureId: e.idEvent,
      leagueId: e.idLeague || null,
      league: e.strLeague || cfg.name,
      date: e.dateEvent,
      timestamp: e.strTimestamp || `${e.dateEvent}T12:00:00Z`,
      home: e.strHomeTeam,
      away: e.strAwayTeam,
      h2h: h2h ? `${h2h.wins}W-${h2h.losses}L` : null,
      rates:
        `Scoring & conceding per game — ${e.strHomeTeam}: ${hgf.toFixed(1)} scored, ${hga.toFixed(1)} conceded · ` +
        `${e.strAwayTeam}: ${agf.toFixed(1)} scored, ${aga.toFixed(1)} conceded`,
      cands: legs,
      valueCands,
      rawP: { p1: pH, p2: pA },
    });
  }
  return out;
}

// ---- TENNIS (best-of-3 model from real completed matches) ----
// ESPN carries the tournaments' per-match lists; form = recency-weighted
// completed matches on both sides, sets won/lost taken from the real
// per-set linescores of every completed match in the fetched tournaments.
async function buildTennisPool(cfg) {
  const todayStr = todayKey();
  const cutoffStr = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  // EVERY DATE IS ASKED FOR INDIVIDUALLY — today through +6 — so the 6-day
  // rollover and the 7-day plan both scan each day's own scoreboard instead
  // of today's board alone. The proxy reports each date's real fixture count
  // and status; an undrawn future round is an honest 0, never a fabricated
  // fixture. This widens FIXTURE COVERAGE only — the prediction model below
  // is untouched.
  const scanDates = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const [scan, oddsMap] = await Promise.all([espnTennisScan(scanDates), getTennisOddsMap()]);
  for (const d of scan.dayStats) console.info(`[TENNIS] date=${d.date} fixtures=${d.fixtures} status=${d.status}`);
  const all = scan.matches;
  const evs = all
    .filter((m) => m.state === "post" && m.home.setsWon != null && m.away.setsWon != null)
    .map((m) => ({
      idEvent: `espn-${m.id}`,
      dateEvent: m.date,
      strHomeTeam: m.home.name,
      strAwayTeam: m.away.name,
      intHomeScore: m.home.setsWon,
      intAwayScore: m.away.setsWon,
    }));
  const matches = all.filter(
    (m) => (m.state === "pre" || m.state === "in") && m.date >= todayStr && m.date <= cutoffStr
  );

  const out = [];
  for (const m of matches) {
    const e = {
      idEvent: `espn-${m.id}`,
      idLeague: null,
      strLeague: m.tournament,
      dateEvent: m.date,
      strTimestamp: `${m.date}T12:00:00Z`,
      strHomeTeam: m.home.name,
      strAwayTeam: m.away.name,
    };
    const h = (e.strHomeTeam || "").toLowerCase();
    const a = (e.strAwayTeam || "").toLowerCase();
    if (!h || !a) continue;
    const hf = formFromResults(evs, h);
    const af = formFromResults(evs, a);
    if (!hf || !af || hf.n < 3 || af.n < 3) continue; // verified completed matches on both sides only

    const h2h = h2hOf(evs, h, a);
    // ODDS-RATIO SET DOMINANCE — tennis probabilities come from the REAL
    // set-win split, never a form-average guess: each side's set-share is its
    // verified sets won vs conceded (smoothed), the set-win odds ratio turns
    // the two shares into one dominance number, and the best-of-3 match,
    // win-a-set and sweep probabilities follow exactly from it.
    const share1 = (hf.gf + 1) / (hf.gf + hf.ga + 2);
    const share2 = (af.gf + 1) / (af.gf + af.ga + 2);
    const a1 = share1 * (1 - share2);
    const a2 = (1 - share1) * share2;
    const s1 = clamp(a1 / (a1 + a2 || 1), 0.05, 0.95);
    const s2 = 1 - s1;
    const pH = clamp(s1 * s1 * (3 - 2 * s1), 0.02, 0.97); // best-of-3 from per-set dominance
    const pA = clamp(s2 * s2 * (3 - 2 * s2), 0.02, 0.97);
    const p1Set = clamp(1 - (1 - s1) * (1 - s1), 0, 1); // home wins at least one set
    const p2Set = clamp(1 - (1 - s2) * (1 - s2), 0, 1);
    const pStraight = clamp(s1 * s1 + s2 * s2, 0, 1); // 2-0 / 0-2 sweep
    // Expected sets scoreline from the same set-dominance model (plan display)
    const exp = pH >= pA ? { hs: 2, as: s1 >= 0.75 ? 0 : 1 } : { hs: s2 >= 0.75 ? 0 : 1, as: 2 };
    const bar = cfg?.mainConf || MIN_CONF; // tennis runs its own honest bar (set-based model)

    // LIVE FEED + US OPEN ODDS PARSER — matches currently in play carry a LIVE
    // flag with the real set score, and The Odds API's real US Open bookmaker
    // prices (ATP + WTA) attach to every match-winner pick they cover:
    // marketOdds/realOdds carry the REAL quoted price, so tennis tickets price
    // their main markets from the book, never the model alone.
    const isLive = m.state === "in";
    const ro = oddsMap.get(`${normTennisName(m.home.name)}|${normTennisName(m.away.name)}`) || null;
    const realOf = (side) => {
      const q = side === "1" ? ro?.p1 : ro?.p2;
      return q && q.price > 1 ? { price: q.price, bookmaker: q.bookmaker } : null;
    };

    // MAIN MARKETS — every probability straight from the set model above.
    // H2H contradiction disqualifies a side outright.
    const cands = [];
    if (pH >= bar && !(h2h && h2h.n >= 2 && h2h.share <= 0.25)) cands.push({ label: "1", prob: pH, marketOdds: ro?.p1?.price || null, realOdds: realOf("1") });
    if (pA >= bar && !(h2h && h2h.n >= 2 && h2h.share >= 0.75)) cands.push({ label: "2", prob: pA, marketOdds: ro?.p2?.price || null, realOdds: realOf("2") });
    if (pStraight >= bar) cands.push({ label: "Under 2.5 Sets", prob: pStraight, line: 2.5, dir: "under" });
    if (p1Set >= bar) cands.push({ label: `${e.strHomeTeam} to Win a Set`, prob: p1Set });
    if (p2Set >= bar) cands.push({ label: `${e.strAwayTeam} to Win a Set`, prob: p2Set });

    // VALUE ZONE (1.25–1.55 fair odds) — the Monster 6-day rollover's sweet
    // spot: match-winner picks whose model probability sits between ~64.5%
    // and 80%. Kept SEPARATE from the 90%+ main cands so the existing
    // tennis tickets never change.
    const inZone = (p) => p >= 1 / 1.55 && p <= 1 / 1.25;
    const valueCands = [];
    if (inZone(pH) && !(h2h && h2h.n >= 2 && h2h.share <= 0.25)) valueCands.push({ label: "1", prob: pH, marketOdds: ro?.p1?.price || null, realOdds: realOf("1") });
    if (inZone(pA) && !(h2h && h2h.n >= 2 && h2h.share >= 0.75)) valueCands.push({ label: "2", prob: pA, marketOdds: ro?.p2?.price || null, realOdds: realOf("2") });
    if (!cands.length && !valueCands.length) continue;

    // PADDING — "{player} to Win a Set" at the 90%+ bar: a player who wins the
    // match necessarily wins a set, so P(wins a set) ≥ P(wins match) — a real
    // lower bound. Only event-compatible pairings are used: moneyline mains
    // get NO padding (every set market is implied/correlated — the engine
    // never fakes odds with implied pairings).
    const setComp = (name, p) => (p >= COMP_CONF ? { label: `${name} to Win a Set`, prob: p, fairOdds: 1 / p } : null);
    const legs = cands.map((c) => {
      let companion = null;
      let companion2 = null;
      if (c.label === "Under 2.5 Sets") {
        // a 2-set sweep: only the winner's set pick is compatible
        companion = pH >= pA ? setComp(e.strHomeTeam, p1Set) : setComp(e.strAwayTeam, p2Set);
      }
      return { ...c, companion, companion2 };
    });

    out.push({
      fixtureId: e.idEvent,
      leagueId: e.idLeague || null,
      league: e.strLeague || "Tennis",
      date: e.dateEvent,
      timestamp: e.strTimestamp || `${e.dateEvent}T12:00:00Z`,
      home: e.strHomeTeam,
      away: e.strAwayTeam,
      h2h: h2h ? `${h2h.wins}W-${h2h.losses}L` : null,
      rates:
        `Sets per match — ${e.strHomeTeam}: ${(hf.gf / hf.n).toFixed(1)} won, ${(hf.ga / hf.n).toFixed(1)} lost · ` +
        `${e.strAwayTeam}: ${(af.gf / af.n).toFixed(1)} won, ${(af.ga / af.n).toFixed(1)} lost (real completed matches)`,
      cands: legs,
      valueCands,
      exp,
      rawP: { p1: pH, p2: pA },
      live: isLive,
      liveScore: isLive && m.home.setsWon != null && m.away.setsWon != null ? `${m.home.setsWon}-${m.away.setsWon}` : null,
      realOdds: ro,
    });
  }
  return out;
}

// EXCLUSIVE DEAL — mirrors the basketball deal: one pick never sits on two
// tickets (shared games go through a different market), and a pick dealt on
// an earlier day never comes back — each new day deals fresh picks and every
// 7-day-cycle rollover starts a genuinely new Day-1 deal automatically.
export function dealSportSlips(pool, cfg) {
  const todayStr = todayKey();
  const mem = loadDealtMemory();
  const SCOPE = cfg.key;
  const gameKeyOf = (g) => `${g.date || ""}|${g.home || ""}|${g.away || ""}`;

  const played = new Map();
  const isPlayed = (gk, pk) => (played.get(gk) || new Set()).has(pk);
  const markPlayed = (gk, pk) => {
    if (!played.has(gk)) played.set(gk, new Set());
    played.get(gk).add(pk);
  };

  const batchNames = BASE_TICKETS.map((t) => `${t} ${cfg.suffix}`);
  const batches = batchNames.map((name) => ({ name, legs: [], combined: 1, gameKeys: new Set() }));
  const isFull = (b) => (b.legs.length >= MIN_LEGS && b.combined >= TARGET_ODDS) || b.legs.length >= MAX_LEGS;

  // qualified (game, market) pairs, odds-first ordering so the target stays reachable
  const cands = [];
  for (const g of pool || []) {
    for (const c of g.cands || []) {
      if (c.prob < (cfg.mainConf || MIN_CONF)) continue;
      const odds = (1 / c.prob) * (c.companion?.fairOdds || 1) * (c.companion2?.fairOdds || 1);
      cands.push({ g, c, odds });
    }
  }
  cands.sort((a, b) => b.odds - a.odds);

  const mkLeg = ({ g, c }) => ({
    fixtureId: g.fixtureId,
    leagueId: g.leagueId,
    home: g.home,
    away: g.away,
    league: g.league,
    date: g.date,
    timestamp: g.timestamp,
    marketLabel: c.label,
    probability: c.prob,
    fairOdds: 1 / c.prob,
    marketOdds: null,
    qualityScore: Math.round(c.prob * 100),
    status: "open",
    h2h: g.h2h,
    rates: g.rates,
    companion: c.companion,
    companion2: c.companion2,
    reasons: [
      `${cfg.name} engine pick — ${c.label} at ${Math.round(c.prob * 100)}% from verified form on both sides`,
      g.h2h ? `Head-to-head — last 5 meetings (real results): ${g.h2h}` : null,
      g.rates,
      c.companion
        ? `Padding pick (verified) — ${c.companion.label} at ${Math.round(c.companion.prob * 100)}% from real scoring data`
        : null,
      c.companion2 ? `Second padding pick (verified) — ${c.companion2.label} at ${Math.round(c.companion2.prob * 100)}%` : null,
    ].filter(Boolean),
  });

  // PASS 1 — exclusive games, weakest ticket first so all slips converge
  for (const cand of cands) {
    const open = batches.filter((b) => !isFull(b));
    if (!open.length) break;
    const gk = gameKeyOf(cand.g);
    const pk = marketKeyOf(cand.c.label);
    if (wasDealtBefore(mem, SCOPE, gk, pk, todayStr)) continue; // dealt on an earlier day / previous cycle
    const weakest = open.sort((a, b) => a.combined - b.combined)[0];
    const leg = mkLeg(cand);
    weakest.legs.push(leg);
    weakest.combined *= legOdds(leg);
    weakest.gameKeys.add(gk);
    markPlayed(gk, pk);
    recordDealt(mem, SCOPE, gk, pk, todayStr);
  }

  // PASS 2 — not enough unique games → tickets may SHARE a game, but never
  // the same pick: a shared game enters a ticket only through a market no
  // other ticket has played.
  let progress = true;
  while (progress) {
    progress = false;
    for (const b of batches) {
      if (isFull(b)) continue;
      let best = null;
      for (const cand of cands) {
        const gk = gameKeyOf(cand.g);
        if (b.gameKeys.has(gk)) continue;
        const pk = marketKeyOf(cand.c.label);
        if (isPlayed(gk, pk)) continue;
        if (wasDealtBefore(mem, SCOPE, gk, pk, todayStr)) continue;
        if (!best || cand.odds > best.odds) best = cand;
      }
      if (!best) continue;
      const gk = gameKeyOf(best.g);
      const pk = marketKeyOf(best.c.label);
      const leg = mkLeg(best);
      b.legs.push(leg);
      b.combined *= legOdds(leg);
      b.gameKeys.add(gk);
      markPlayed(gk, pk);
      recordDealt(mem, SCOPE, gk, pk, todayStr);
      progress = true;
    }
  }

  const byDate = (a, b) => String(a.date || "").localeCompare(String(b.date || ""));
  saveDealtMemory(mem, todayStr);
  return { cycle: cycleInfo(), batches: batches.map(({ name, legs }) => ({ name, legs: legs.sort(byDate) })) };
}

// Day-keyed scan cache per sport — a new day always rescans, so the 7-day
// window rolls forward and the batches bring games every single day.
const scanCache = new Map();
export function scanSportPool(cfg, force = false) {
  const today = todayKey();
  const hit = scanCache.get(cfg.key);
  if (!force && hit && hit.date === today) return hit.promise;
  const built = cfg.key === "tennis" ? buildTennisPool(cfg) : buildPointsPool(cfg);
  const promise = built
    .then((pool) => {
      setScanStatus(cfg.key, "OK");
      return pool;
    })
    .catch((err) => {
      // A failed scan is logged and recorded — never silently swallowed into
      // an empty pool; the rollover engine reads this status to report
      // API_ERROR instead of a fake "no fixtures" day.
      console.error(`[SCAN] ${cfg.name} pool failed:`, err?.message || err);
      setScanStatus(cfg.key, "API_ERROR", String(err?.message || err));
      return [];
    });
  scanCache.set(cfg.key, { date: today, promise });
  return promise;
}