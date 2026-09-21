import {
  describe, expect, it,
} from "vitest";
import {
  MAX_ODDS_AGE_MINUTES,
  classifyMovement,
  combineOdds,
  edgePoints,
  expectedValuePct,
  fairOdds,
  findDuplicateKeys,
  fixturePickKey,
  hasDuplicateFixture,
  impliedProbability,
  decimalFromImplied,
  isSimulatedEvent,
  isStale,
  marketAvailability,
  matchFixture,
  movementPercentage,
  normalizeBookmaker,
  normalizeMarketKey,
  optimizeAccumulator,
  parseMarketRequest,
  pickBestPrice,
  resolveOddsProvider,
  targetAverageOdds,
  validateRealOddsRecord,
} from "@/lib/oddsMath";

// ============ odds conversion / implied probability / fair odds / EV ============
describe("odds conversions", () => {
  it("converts decimal odds to implied probability", () => {
    expect(impliedProbability(2)).toBeCloseTo(0.5);
    expect(impliedProbability(1.27)).toBeCloseTo(0.7874, 3);
    expect(impliedProbability(1)).toBeNull(); // 1.0 is not a price
  });

  it("converts implied probability back to decimal odds", () => {
    expect(decimalFromImplied(0.5)).toBeCloseTo(2);
    expect(decimalFromImplied(0.91)).toBeCloseTo(1.0989, 3);
  });

  it("computes model fair odds from probability", () => {
    expect(fairOdds(0.91)).toBeCloseTo(1.0989, 3);
    expect(fairOdds(0)).toBeNull();
  });

  it("computes expected value from model probability and REAL price", () => {
    // spec example: model 91%, real 1.27 → EV +15.57%
    expect(expectedValuePct(0.91, 1.27)).toBeCloseTo(15.57, 1);
    expect(expectedValuePct(0.5, 2)).toBeCloseTo(0);
    expect(expectedValuePct(0.4, 2)).toBeLessThan(0); // negative EV is negative
  });

  it("computes the model edge over the bookmaker implied probability", () => {
    // model 91% vs implied 78.74% → +12.26 pts
    expect(edgePoints(0.91, 1.27)).toBeCloseTo(12.26, 1);
  });
});

// ============ accumulator odds / target odds ============
describe("accumulator odds", () => {
  it("multiplies prices with logs (no overflow, exact product)", () => {
    expect(combineOdds([1.5, 2, 1.25])).toBeCloseTo(3.75);
    const big = combineOdds(new Array(50).fill(3));
    // log-based product — relative precision, where naive multiplication overflows
    expect(big / Math.pow(3, 50)).toBeCloseTo(1, 10);
  });

  it("ignores invalid prices instead of inventing one", () => {
    expect(combineOdds([1.5, 0, -2, "abc"])).toBeCloseTo(1.5);
    expect(combineOdds([])).toBe(1);
  });

  it("computes the target average odds per leg (1,000,000^(1/50) ≈ 1.3183)", () => {
    expect(targetAverageOdds(1000000, 50)).toBeCloseTo(1.3183, 3);
  });
});

// ============ fixture matching / duplicate detection ============
describe("fixture matching", () => {
  it("matches the same club under different naming", () => {
    expect(matchFixture("Bologna FC 1909", "US Sassuolo Calcio", "Bologna", "Sassuolo")).toBe(true);
    expect(matchFixture("Valencia CF", "FC Barcelona", "Valencia", "Barcelona")).toBe(true);
    expect(matchFixture("RCD Espanyol de Barcelona", "Sevilla FC", "Espanyol", "Sevilla")).toBe(true);
  });

  it("rejects different fixtures", () => {
    expect(matchFixture("Arsenal", "Chelsea", "Aston Villa", "Chelsea")).toBe(false);
    expect(matchFixture("Arsenal", "Chelsea", "Arsenal", "Manchester City")).toBe(false);
  });

  it("builds a stable pick key for the same game + market", () => {
    const a = fixturePickKey({ date: "2026-09-06", home: "Valencia CF", away: "FC Barcelona", marketLabel: "1" });
    const b = fixturePickKey({ date: "2026-09-06", home: "Valencia", away: "Barcelona", marketLabel: "1 · Valencia to Win" });
    expect(a).toBe(b);
  });

  it("detects duplicate (game, market) picks", () => {
    const legs = [
      { date: "2026-09-06", home: "Arsenal", away: "Chelsea", marketLabel: "1" },
      { date: "2026-09-06", home: "Arsenal FC", away: "Chelsea FC", marketLabel: "Home Win" },
      { date: "2026-09-06", home: "Juventus", away: "Milan", marketLabel: "Over 2.5" },
    ];
    expect(findDuplicateKeys(legs)).toHaveLength(1);
    expect(hasDuplicateFixture(legs)).toBe(true);
  });

  it("flags the same game with a DIFFERENT market as distinct picks but one fixture", () => {
    const legs = [
      { date: "2026-09-06", home: "Arsenal", away: "Chelsea", marketLabel: "1" },
      { date: "2026-09-06", home: "Arsenal", away: "Chelsea", marketLabel: "Over 2.5" },
    ];
    expect(findDuplicateKeys(legs)).toHaveLength(0);
    expect(hasDuplicateFixture(legs)).toBe(true);
  });
});

// ============ market normalization / availability ============
describe("market normalization", () => {
  it("normalizes Over/Under/BTTS/1X2 labels to pick keys", () => {
    expect(normalizeMarketKey("Over 1.5")).toBe("O1.5");
    expect(normalizeMarketKey("Under 3.5 Goals")).toBe("U3.5");
    expect(normalizeMarketKey("Both Teams To Score")).toBe("BTTS_Y");
    expect(normalizeMarketKey("1X")).toBe("1X");
  });

  it("maps labels to provider market requests", () => {
    expect(parseMarketRequest("Over 1.5")).toEqual({ market: "totals", side: "o", point: 1.5 });
    expect(parseMarketRequest("Under 2.5")).toEqual({ market: "totals", side: "u", point: 2.5 });
    expect(parseMarketRequest("1 · Valencia to Win")).toEqual({ market: "h2h", side: "1" });
    expect(parseMarketRequest("Draw")).toEqual({ market: "h2h", side: "X" });
    expect(parseMarketRequest("Both Teams To Score - Yes")).toEqual({ market: "btts", side: "Y" });
    expect(parseMarketRequest("Both Teams To Score - No")).toEqual({ market: "btts", side: "N" });
  });

  it("reports unavailable markets as MARKET NOT AVAILABLE — never a price", () => {
    expect(parseMarketRequest("Over 2.5 + BTTS Yes").unsupported).toBe(true);
    expect(parseMarketRequest("Team Total Over 1.5").unsupported).toBe(true);
    expect(parseMarketRequest("1X").unsupported).toBe(true);
    expect(parseMarketRequest("Corners Over 8.5").unsupported).toBe(true);
    expect(marketAvailability("corners").available).toBe(false);
    expect(marketAvailability("h2h").available).toBe(true);
  });
});

// ============ same-game combination handling ============
describe("same-game combinations", () => {
  it("refuses to price same-game combos as a single bookmaker price", () => {
    const r = parseMarketRequest("Over 1.5 + Both Teams To Score Yes");
    expect(r.unsupported).toBe(true);
    expect(r.reason).toMatch(/COMBINATION PRICE NOT AVAILABLE/i);
  });
});

// ============ bookmaker normalization / best price ============
describe("bookmaker normalization", () => {
  it("normalizes provider bookmaker names", () => {
    expect(normalizeBookmaker("1xbet")).toBe("1xBet");
    expect(normalizeBookmaker("Unibet (SE)")).toBe("Unibet");
    expect(normalizeBookmaker("william hill")).toBe("William Hill");
    expect(normalizeBookmaker("  Pinnacle ")).toBe("Pinnacle");
  });

  it("selects the BEST real price and preserves every bookmaker price", () => {
    const r = pickBestPrice([
      { price: 1.25, bookmaker: "Bookmaker A" },
      { price: 1.23, bookmaker: "Bookmaker B" },
      { price: 1.27, bookmaker: "Bookmaker C" },
    ]);
    expect(r.best.price).toBe(1.27);
    expect(r.best.bookmaker).toBe("Bookmaker C");
    expect(r.all).toHaveLength(3); // every price preserved for comparison
    expect(r.books).toBe(3);
    expect(pickBestPrice([{ price: 1.0, bookmaker: "X" }])).toBeNull(); // 1.01 floor
  });
});

// ============ stale / missing odds rejection ============
describe("odds freshness", () => {
  it("rejects stale odds beyond the freshness window", () => {
    const now = Date.now();
    expect(isStale(new Date(now - 31 * 60000).toISOString(), MAX_ODDS_AGE_MINUTES, now)).toBe(true);
    expect(isStale(new Date(now - 10 * 60000).toISOString(), MAX_ODDS_AGE_MINUTES, now)).toBe(false);
  });

  it("applies the tighter live window", () => {
    const now = Date.now();
    expect(isStale(new Date(now - 6 * 60000).toISOString(), 5, now)).toBe(true);
    expect(isStale(new Date(now - 4 * 60000).toISOString(), 5, now)).toBe(false);
  });

  it("treats missing/garbage timestamps as stale", () => {
    expect(isStale(null)).toBe(true);
    expect(isStale("not-a-date")).toBe(true);
  });
});

// ============ odds movement / steam / drift ============
describe("odds movement", () => {
  it("computes movement percentage per the spec formula", () => {
    expect(movementPercentage(1.4, 1.25)).toBeCloseTo(-10.71, 1);
  });

  it("labels STEAM only from real history (price shortened ≥5%)", () => {
    expect(classifyMovement(1.5, 1.3).label).toBe("STEAM");
    expect(classifyMovement(1.5, 1.3).direction).toBe("down");
    expect(classifyMovement(1.4, 1.25).label).toBe("STEAM"); // spec example
  });

  it("labels DRIFT when the price lengthened ≥5%", () => {
    expect(classifyMovement(1.3, 1.5).label).toBe("DRIFT");
    expect(classifyMovement(1.3, 1.5).direction).toBe("up");
  });

  it("does not label small movements or single prices", () => {
    expect(classifyMovement(1.25, 1.26).label).toBe("STABLE");
    expect(classifyMovement(null, 1.3).label).toBe("NO HISTORY");
  });
});

// ============ simulated / SRL rejection ============
describe("simulated event rejection", () => {
  it("rejects SRL / simulated / esports events", () => {
    expect(isSimulatedEvent({ sportKey: "soccer_epl_srl", home: "Arsenal", away: "Chelsea" })).toBe(true);
    expect(isSimulatedEvent({ league: "La Liga SRL" })).toBe(true);
    expect(isSimulatedEvent({ home: "Esoccer Battle", away: "Zoomers" })).toBe(true);
    expect(isSimulatedEvent({ sportKey: "soccer_epl", home: "Arsenal", away: "Chelsea", event_id: "736393803" })).toBe(false);
  });
});

// ============ model / bookmaker separation ============
describe("model vs bookmaker separation", () => {
  it("accepts a complete REAL odds record", () => {
    const rec = {
      provider: "The Odds API",
      bookmaker: "Betfair",
      event_id: "73639380311449b9494a3230cf1356ba",
      home_team: "Valencia",
      away_team: "Barcelona",
      market: "totals",
      selection: "Over 1.5",
      decimal_odds: 1.25,
      timestamp: "2026-09-05T20:18:02Z",
    };
    expect(validateRealOddsRecord(rec).valid).toBe(true);
  });

  it("rejects records with missing required fields", () => {
    const rec = { provider: "The Odds API", bookmaker: "Betfair", decimal_odds: 1.25, timestamp: "2026-09-05T20:18:02Z" };
    const v = validateRealOddsRecord(rec);
    expect(v.valid).toBe(false);
    expect(v.missing).toContain("event_id");
    expect(v.missing).toContain("market");
  });

  it("NEVER accepts a model estimate as a bookmaker price", () => {
    const rec = {
      provider: "Model Engine",
      bookmaker: "Ride X Model",
      event_id: "x",
      home_team: "A",
      away_team: "B",
      market: "h2h",
      selection: "1",
      decimal_odds: 1.03, // the model's fair odds posing as a bookmaker price
      timestamp: "2026-09-05T20:18:02Z",
    };
    const v = validateRealOddsRecord(rec);
    expect(v.valid).toBe(false);
    expect(v.issues.join(" ")).toMatch(/MODEL\/BOOKMAKER SEPARATION/);
  });

  it("rejects impossible prices and bad timestamps", () => {
    const base = { provider: "The Odds API", bookmaker: "Betfair", event_id: "x", home_team: "A", away_team: "B", market: "h2h", selection: "1" };
    expect(validateRealOddsRecord({ ...base, decimal_odds: 1.001, timestamp: "2026-09-05T20:18:02Z" }).valid).toBe(false);
    expect(validateRealOddsRecord({ ...base, decimal_odds: 1.5, timestamp: "garbage" }).valid).toBe(false);
  });
});

// ============ API fallback ============
describe("odds provider fallback", () => {
  it("uses the first healthy provider in priority order", () => {
    const r = resolveOddsProvider([{ name: "OddsJam", status: "error" }, { name: "The Odds API", status: "ok" }]);
    expect(r.status).toBe("ok");
    expect(r.provider).toBe("The Odds API");
  });

  it("reports REAL ODDS UNAVAILABLE when every provider fails — never a model price", () => {
    const r = resolveOddsProvider([{ name: "OddsJam", status: "error" }, { name: "The Odds API", status: "missing_key" }]);
    expect(r.status).toBe("unavailable");
    expect(r.label).toBe("REAL ODDS UNAVAILABLE");
  });

  it("handles no providers configured", () => {
    expect(resolveOddsProvider([]).status).toBe("unavailable");
  });
});

// ============ 50-leg optimizer ============
describe("50-leg optimizer", () => {
  const leg = (i, price, prob, ev) => ({
    date: `2026-09-${String((i % 7) + 10).padStart(2, "0")}`,
    home: `Home ${i}`,
    away: `Away ${i}`,
    marketLabel: "1",
    prob,
    price,
    evPct: ev,
  });

  it("keeps only positive-EV legs, one per fixture, capped at 50", () => {
    const cands = [
      leg(1, 2.1, 0.6, 26), // ok
      leg(1, 2.0, 0.62, 24), // SAME fixture, positive EV — must hit the duplicate-fixture gate
      leg(2, 1.5, 0.5, -25), // negative EV
      ...Array.from({ length: 60 }, (_, i) => leg(i + 3, 1.25, 0.9, 12.5)), // positive EV, unique, no trim
    ];
    const r = optimizeAccumulator(cands, { target: 1000000, maxLegs: 50, minLegs: 20 });
    expect(r.chosen).toHaveLength(50);
    expect(r.chosen.filter((c) => c.evPct <= 0)).toHaveLength(0);
    expect(r.rejected.some((x) => x.reason.includes("duplicate fixture"))).toBe(true);
    expect(r.rejected.some((x) => x.reason.includes("50-leg limit reached"))).toBe(true);
  });

  it("trims overshooting legs toward the 1,000,000 target without editing prices", () => {
    const cands = Array.from({ length: 40 }, (_, i) => leg(i, 1.6, 0.9, 44));
    const r = optimizeAccumulator(cands, { target: 1000000, maxLegs: 50, minLegs: 20 });
    // the trim tolerance is log-based: combined stays inside the engine's
    // overshoot window (ln(target) × 1.05) and never dips below the 20-leg floor
    expect(r.combined).toBeLessThanOrEqual(Math.exp(Math.log(1000000) * 1.05) + 1);
    expect(r.chosen.length).toBeGreaterThanOrEqual(20);
    // every kept price is an unmodified candidate price
    const prices = new Set(cands.map((c) => c.price));
    r.chosen.forEach((c) => expect(prices.has(c.price)).toBe(true));
  });

  it("selects the full 50 when the combined stays under target", () => {
    const cands = Array.from({ length: 50 }, (_, i) => leg(i, 1.32, 0.9, 18.8));
    const r = optimizeAccumulator(cands, { target: 1000000, maxLegs: 50, minLegs: 20 });
    expect(r.chosen).toHaveLength(50);
    expect(r.combined).toBeCloseTo(combineOdds(cands.map((c) => c.price)));
  });
});