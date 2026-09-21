// MONSTER ENGINE data layer — the dashboard's single source of truth.
// Every card is REAL engine data from the verified pools (ESPN/Sportradar
// feeds, scrutinized form on both sides). Nothing here is invented — no mock
// superstars, no fabricated edges, honest probabilities only.

import { scanSportPool, SLIP_SPORTS } from "@/lib/multiSportSlips";
import { scanBasketballPool } from "@/lib/basketballSlips";
import { getWeekDeal } from "@/lib/slipDealing";
import { todayKey } from "@/lib/dealtPickMemory";

export const MONSTER_SPORTS = [
  { key: "tennis", label: "🎾 TENNIS", scene: "tennis", tagline: "The easiest sport to win — a pure two-way market with no draws, decided by one player's verified set-win record. The engine shows BOTH players' live model probabilities on every card." },
  { key: "basketball", label: "🏀 BASKETBALL", scene: "basketball", tagline: "No draws — overtime always crowns a winner. Real NBA/WNBA scoring & conceding rates price the moneyline, totals and team lines on both sides." },
  { key: "football", label: "⚽ FOOTBALL", scene: "football", tagline: "The hardest market — draws land 25–30% of the time, so only one best 90%+ verified pick per game survives the gate here." },
  { key: "baseball", label: "⚾ BASEBALL", scene: "baseball", tagline: "Real run-scoring rates from verified MLB games — moneyline, totals and team lines priced from actual form on both sides." },
  { key: "american_football", label: "🏈 AM. FOOTBALL", scene: "nfl", tagline: "A 28-day form window over the NFL's low-volume schedule — every points projection comes from real final scores." },
  { key: "ice_hockey", label: "🏒 ICE HOCKEY", scene: "hockey", tagline: "Goal rates from verified NHL fixtures — totals and moneyline priced from real scoring, never guessed." },
];

function cardsFromPool(pool, source) {
  return (pool || []).slice(0, 15).map((g) => {
    const best = [...(g.cands || [])].sort((a, b) => (b.prob || 0) - (a.prob || 0))[0] || null;
    return {
      title: g.league || source,
      home: g.home,
      away: g.away,
      date: g.date,
      h2h: g.h2h,
      rates: g.rates,
      p1: g.rawP?.p1 ?? null,
      p2: g.rawP?.p2 ?? null,
      live: g.live || false,
      liveScore: g.liveScore || null,
      realOdds: g.realOdds || null,
      pickLabel: best?.label || null,
      prob: best?.prob || null,
      source,
    };
  });
}

export async function getMonsterCards(sportKey) {
  if (sportKey === "football") {
    const deal = await getWeekDeal().catch(() => null);
    return (deal?.chopPicks || []).slice(0, 12).map((l) => ({
      title: l.league || "Football engine",
      home: l.home,
      away: l.away,
      date: l.date,
      h2h: l.h2h,
      rates: l.rates,
      p1: null,
      p2: null,
      pickLabel: l.marketLabel,
      prob: l.probability,
      source: "Football engine — one best 90%+ verified pick per game",
    }));
  }
  if (sportKey === "basketball") {
    const pool = await scanBasketballPool().catch(() => []);
    return cardsFromPool(pool, "Basketball engine — NBA/WNBA verified form on both sides");
  }
  const cfg = SLIP_SPORTS.find((s) => s.key === sportKey);
  if (!cfg) return [];
  const pool = await scanSportPool(cfg).catch(() => []);
  return cardsFromPool(pool, `${cfg.name} engine — verified form on both sides`);
}

// TODAY'S MONSTER DOUBLE — the top two value-zone favorites (1.25–1.55 fair
// odds) across the no-draw pools, exactly the double the strategy prescribes.
// Honest by construction: odds are exact model fair odds and the win chance
// is the two probabilities multiplied — never an invented "edge".
export async function getMonsterDouble() {
  const tennisCfg = SLIP_SPORTS.find((s) => s.key === "tennis");
  const [tennisPool, bballPool] = await Promise.all([
    scanSportPool(tennisCfg).catch(() => []),
    scanBasketballPool().catch(() => []),
  ]);
  const all = [];
  const collect = (pool, sport) => {
    for (const g of pool || []) {
      for (const c of g.valueCands || []) {
        all.push({ sport, g, c });
      }
    }
  };
  collect(tennisPool, "Tennis");
  collect(bballPool, "Basketball");
  const today = todayKey();
  const todayLegs = all.filter((x) => x.g.date === today);
  const legs = (todayLegs.length >= 2 ? todayLegs : all)
    .sort((a, b) => (b.c.prob || 0) - (a.c.prob || 0))
    .slice(0, 2)
    .map(({ sport, g, c }) => ({
      sport,
      home: g.home,
      away: g.away,
      league: g.league,
      date: g.date,
      marketLabel: c.label === "1" ? `${g.home} to Win` : `${g.away} to Win`,
      probability: c.prob,
      fairOdds: 1 / c.prob,
      realOdds: c.realOdds || null,
    }));
  // REAL combined price when every leg carries a real bookmaker quote —
  // otherwise the double stays priced at exact model fair odds.
  const realPrices = legs.map((l) => Number(l.realOdds?.price) || 0);
  const combinedReal = realPrices.length && realPrices.every((p) => p > 1) ? realPrices.reduce((o, p) => o * p, 1) : null;
  return {
    legs,
    combined: legs.reduce((o, l) => o * l.fairOdds, 1),
    combinedReal,
    winProb: legs.reduce((p, l) => p * l.probability, 1),
    fromToday: legs.length > 0 && legs.every((l) => l.date === today),
  };
}