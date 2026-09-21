// MONSTER 6-DAY ROLLOVER — the professional no-draw strategy engine:
//   1. SIX CONSECUTIVE DAYS, FOUR PICKS PER DAY — the exact "maximum limit"
//      a pro accumulator allows; anything longer is a donation slip.
//   2. NO-DRAW SPORTS ONLY — match-winner markets from the engine's verified
//      pools: tennis, basketball, baseball, American football and ice
//      hockey — sports where the favorite can't be robbed by a draw (the
//      once-a-decade NFL tie voids in the ledger instead of misgrading).
//      NBA sits dark half the year and tennis pairings only exist once the
//      round is drawn — the wider verified pool is what keeps every day
//      of the six carrying real, scrutinized games.
//   3. THE 1.25–1.55 SWEET SPOT — only favorites whose model fair odds sit
//      between 1.25 and 1.55 (≈64.5%–80% probability). Below 1.25 pays too
//      little; above 1.55 is high-risk. Nothing outside the zone is dealt.
//   4. VERIFIED POOLS ONLY — every leg comes from the engine's scrutinized
//      pools (real completed matches on both sides, H2H checked), so nothing
//      is ever invented. One pick per game per day, and a pick dealt on an
//      earlier day never comes back (persistent dealt-pick memory).
//   5. HONEST DAY DIAGNOSTICS — every rollover date is scanned individually
//      and reports exactly what the verified feeds returned:
//      PREDICTIONS_GENERATED / UNSUPPORTED_MARKET (fixtures found, none
//      eligible) / NO_FIXTURES (an off-season day reports a real zero —
//      never padded) / API_ERROR (a feed failed). Pool coverage was widened;
//      the prediction model itself was NOT changed — the pipeline stays
//      fixtures → eligibility filters → existing prediction model.

import { SLIP_SPORTS, scanSportPool } from "@/lib/multiSportSlips";
import { scanBasketballPool } from "@/lib/basketballSlips";
import { espnLeagueFeed, espnTennisScan } from "@/lib/espnSports";
import { getScanStatus } from "@/lib/scanStatus";
import { loadDealtMemory, recordDealt, saveDealtMemory, wasDealtBefore, todayKey } from "@/lib/dealtPickMemory";

export const ROLLOVER_DAYS = 6;
export const LEGS_PER_DAY = 4;
export const ZONE_MIN_ODDS = 1.25;
export const ZONE_MAX_ODDS = 1.55;

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The 7 dates the tennis scan asks for individually (today + 6) — the exact
// same list buildTennisPool requests, so the diagnostics read the very same
// cached scan instead of issuing a second one.
const tennisScanDates = () => [...Array(7)].map((_, i) => addDays(todayKey(), i));

// DAY DIAGNOSTICS — what each verified feed REALLY returned per date:
// pre-eligibility fixture counts (every fixture carried, before any filter)
// plus each pool's scan status. This layer only observes the pools; it never
// touches the prediction model.
async function scanDayDiagnostics() {
  const dates = tennisScanDates();
  const byDate = {};
  dates.forEach((d) => { byDate[d] = {}; });
  const bySport = {};

  // Tennis — the proxy's own per-date stats from the same cached scan
  try {
    const scan = await espnTennisScan(dates);
    for (const d of scan.dayStats) {
      if (byDate[d.date]) byDate[d.date].Tennis = d.fixtures;
      if (d.status !== "success") bySport.Tennis = "API_ERROR";
    }
    if (bySport.Tennis !== "API_ERROR") bySport.Tennis = "OK";
  } catch (err) {
    console.error("[MONSTER] tennis day diagnostics failed:", err?.message || err);
    bySport.Tennis = "API_ERROR";
  }

  // League sports — the same cached league feeds the pools read; every
  // fixture is counted per kickoff date. NBA's off-season is an honest zero.
  const leagues = [
    { sport: "Basketball", espn: "basketball/nba", label: "NBA", past: 14 },
    { sport: "Basketball", espn: "basketball/wnba", label: "WNBA", past: 14 },
    ...SLIP_SPORTS.filter((s) => s.espn).map((s) => ({ sport: s.name, espn: s.espn, label: s.name, past: s.resultsDays || 12 })),
  ];
  await Promise.all(
    leagues.map(async (l) => {
      try {
        const { fixtures } = await espnLeagueFeed(l.espn, l.label, l.past, 7);
        for (const f of fixtures || []) {
          if (byDate[f.dateEvent]) byDate[f.dateEvent][l.label] = (byDate[f.dateEvent][l.label] || 0) + 1;
        }
        if (bySport[l.sport] !== "API_ERROR") bySport[l.sport] = "OK";
      } catch (err) {
        console.error(`[MONSTER] ${l.label} day diagnostics failed:`, err?.message || err);
        bySport[l.sport] = "API_ERROR";
      }
    })
  );

  // The pool scans' own outcomes (registry kept by scanSportPool /
  // scanBasketballPool) — a failed pool shows API_ERROR even when the raw
  // league feed was reachable.
  const poolScans = {
    Tennis: getScanStatus("tennis").state,
    Basketball: getScanStatus("basketball").state,
    ...Object.fromEntries(SLIP_SPORTS.filter((s) => s.espn).map((s) => [s.name, getScanStatus(s.key).state])),
  };
  for (const [sport, st] of Object.entries(poolScans)) {
    if (st === "API_ERROR") bySport[sport] = "API_ERROR";
  }
  return { byDate, bySport };
}

export async function buildMonsterRollover(force = false) {
  const tennisCfg = SLIP_SPORTS.find((s) => s.key === "tennis");
  const pointsCfgs = SLIP_SPORTS.filter((s) => s.espn); // NFL · MLB · NHL — the verified points-sport pools
  const pools = await Promise.all([
    scanSportPool(tennisCfg, force).catch(() => []),
    scanBasketballPool(force).catch(() => []),
    ...pointsCfgs.map((c) => scanSportPool(c, force).catch(() => [])),
  ]);
  const labels = ["Tennis", "Basketball", ...pointsCfgs.map((c) => c.name)];

  const diag = await scanDayDiagnostics();

  const mem = loadDealtMemory();
  const SCOPE = "monster6";
  const today = todayKey();

  // Every value-zone favorite across all the pools, grouped by kickoff date
  const byDate = new Map();
  pools.forEach((pool, i) => {
    const sport = labels[i];
    for (const g of pool || []) {
      for (const c of g.valueCands || []) {
        if (!g.date) continue;
        if (!byDate.has(g.date)) byDate.set(g.date, []);
        byDate.get(g.date).push({ g, c, sport });
      }
    }
  });

  const days = [];
  for (let d = 0; d < ROLLOVER_DAYS; d++) {
    const date = addDays(today, d);
    const cands = (byDate.get(date) || [])
      .filter(({ g, c }) => !wasDealtBefore(mem, SCOPE, `${g.date}|${g.home}|${g.away}`, `${c.label}`, today))
      .sort((a, b) => b.c.prob - a.c.prob);
    const eligible = cands.length;

    const legs = [];
    const games = new Set();
    for (const { g, c, sport } of cands) {
      if (legs.length >= LEGS_PER_DAY) break;
      const gk = `${g.date}|${g.home}|${g.away}`;
      if (games.has(gk)) continue; // one pick per game per day
      games.add(gk);
      // Only a REAL provider kickoff timestamp is carried through — the
      // tennis feed's date-only placeholder never masquerades as a time.
      const realKickoff = g.timestamp && !String(g.timestamp).endsWith("T12:00:00Z") ? g.timestamp : "";
      legs.push({
        date: g.date,
        home: g.home,
        away: g.away,
        league: g.league,
        sport,
        fixtureId: g.fixtureId,
        timestamp: realKickoff,
        side: c.label, // raw market key — the ledger settles it against the real final score
        marketLabel: c.label === "1" ? `${g.home} to Win` : `${g.away} to Win`,
        probability: c.prob,
        fairOdds: 1 / c.prob,
        h2h: g.h2h,
        rates: g.rates,
      });
      recordDealt(mem, SCOPE, gk, c.label, today);
    }

    // HONEST DAY STATUS — evidence first, never a silent empty day.
    const fixtureMap = diag.byDate[date] || {};
    const fixtureCount = Object.values(fixtureMap).reduce((a, b) => a + (Number(b) || 0), 0);
    const feedErrors = Object.entries(diag.bySport).filter(([, st]) => st === "API_ERROR").map(([s]) => s);
    let status;
    if (legs.length > 0) status = "PREDICTIONS_GENERATED";
    else if (fixtureCount > 0) status = "UNSUPPORTED_MARKET";
    else if (feedErrors.length && feedErrors.length === Object.keys(diag.bySport).length) status = "API_ERROR";
    else status = "NO_FIXTURES";
    console.info(`[MONSTER] date=${date} fixtures=${fixtureCount} eligible=${eligible} predictions=${legs.length} status=${status}`);

    days.push({
      day: d + 1,
      date,
      legs,
      combined: legs.reduce((o, l) => o * l.fairOdds, 1),
      winProb: legs.reduce((p, l) => p * l.probability, 1),
      status,
      eligible,
      fixtureCount,
      fixtures: fixtureMap,
      feedErrors,
    });
  }

  saveDealtMemory(mem, today);
  return {
    days,
    totalLegs: days.reduce((n, d) => n + d.legs.length, 0),
    totalOdds: days.reduce((o, d) => o * d.combined, 1),
    winProb: days.reduce((p, d) => p * d.winProb, 1),
    scan: { bySport: diag.bySport },
  };
}