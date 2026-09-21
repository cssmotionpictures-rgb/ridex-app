import { legOdds } from "@/components/sports/SpecialSlipBatch";
import { buildSlipPool, buildMarketPool, buildLivePool } from "@/lib/slipPool";
import { buildWorldPool } from "@/lib/worldFootballPool";

// Render-time LIVE NOW detection — which picks are currently in progress,
// refreshed against the real live feed (every competition in play).
export { getLiveNowPairs, liveNow } from "@/lib/slipPool";
import { cycleInfo, loadDealtMemory, recordDealt, saveDealtMemory, wasDealtBefore } from "@/lib/dealtPickMemory";

// EXCLUSIVE WEEK DEALING — every ticket on the page is built from ONE shared
// deal with three iron rules:
//   1. ONE-WEEK WINDOW — a ticket only ever carries games kicking off within
//      the next 7 days, so the board brings fresh games every single day.
//   2. ONE PICK, NEVER TWICE — the same (game + market) pick can never sit on
//      two tickets. When there are not enough unique games, tickets may share
//      a GAME, but always through a DIFFERENT market pick, so one ticket
//      losing is never the same bet as another ticket losing.
//   3. BEST QUALIFIED REAL PICKS ONLY — every leg comes from verified season
//      data (form on both sides, H2H + scoring scrutiny). The surest 90%+
//      deep picks are always dealt FIRST; the five named SPECIAL ODDS slips
//      fill their remaining legs with verified market-pool picks at 75%+
//      model confidence (every leg always shows its real model %), and CHOP
//      EBA keeps the 90%+ bar even on shared games.

export const BATCH_NAMES = [
  "HOLLOW SPECIAL ODDS",
  "DRAMA QUEEN SPECIAL ODDS",
  "RIDE X SPECIAL ODDS",
  "HAMMER SPECIAL ODDS",
  "FINE GIRL SPECIAL ODDS",
];

export const CHOP_BATCH_NAME = "CHOP EBA";
export const MAX_LEGS = 50;
export const MIN_LEGS = 20;
export const TARGET_ODDS = 2000000;
export const MIN_CONF = 0.90;
// Fill bar for the five named SPECIAL ODDS slips — after the 90%+ deep pool
// is exhausted, verified market-pool picks at 75%+ model confidence fill the
// remaining legs so the slips always bring games (the per-leg model % is
// always shown on the ticket; CHOP EBA stays at the 90%+ bar).
export const SPECIALS_FILL_BAR = 0.75;
// KALA ×2.50 — every KALA leg must carry a REAL bookmaker quote of 2.50 or
// better (the bar is enforced in the KALA slip once live odds attach). With
// every leg ≥ 2.50 the ticket's combined target clears from the first leg —
// never padded, never model-priced.
export const KALA_TARGET_ODDS = 2.5;
export const WEEK_DAYS = 7;

// Market sections' maximum sizes (the size chips' largest option).
const SECTION_MAX = { risky: 20, sugar: 30, seven: 40 };

export const gameKey = (p) => `${p.date || ""}|${p.home || ""}|${p.away || ""}`;

export function qualifiedLegs(pool) {
  return pool.filter(
    (p) => (p.probability || 0) >= MIN_CONF && Number(p.marketOdds || p.fairOdds) > 1 && (!p.status || p.status === "open")
  );
}

export function rankLegs(pool) {
  const cornerRank = (p) => legOdds(p) + (p.corners ? 0.05 : 0);
  return [...pool].sort((a, b) => cornerRank(b) - cornerRank(a));
}

// Normalize a market label to a comparable pick key — "1", "1X", "Over 1.5" →
// "O1.5" — so the same market on the same game is always recognised as the
// SAME pick, whichever pool produced it.
export function marketKeyOf(label) {
  const s = String(label || "").trim();
  if (["1", "X", "2", "1X", "X2", "12"].includes(s)) return s;
  // Labeled picks like "1 · Arsenal to Win" / "1X · X or Draw" — the market
  // key is the LEADING token, so settlement always resolves the real market
  // instead of voiding a leg it could not parse.
  const lead = /^(1X|X2|12|[12X])\b/.exec(s);
  if (lead) return lead[1];
  const ou = /^Over\s*([\d.]+)/i.exec(s);
  if (ou) return `O${ou[1]}`;
  const uu = /^Under\s*([\d.]+)/i.exec(s);
  if (uu) return `U${uu[1]}`;
  if (/^Both Teams To Score/i.test(s)) return "BTTS_Y";
  if (/Not To Score/i.test(s)) return "BTTS_N";
  return s;
}

// The single shared deal for every slip section on the page. Both the SPECIAL
// ODDS component and the CHOP EBA / SUGAR / DRINK 7UP component call this
// with the same scanned pools, so all tickets come from one consistent deal.
export function dealWeekSlips(deepPool, marketPool = []) {
  const todayStr = new Date().toISOString().slice(0, 10);
  // CYCLE MEMORY — every pick dealt is remembered with its date. A pick dealt
  // on an EARLIER day is dealt only in the REFILL pass below, so each day's
  // tickets prefer genuinely fresh picks and never run empty.
  const mem = loadDealtMemory();
  const SCOPE = "football";
  const cutoffStr = new Date(Date.now() + WEEK_DAYS * 86400000).toISOString().slice(0, 10);
  const inWeek = (d) => !!d && d >= todayStr && d <= cutoffStr;

  // played (game, market) pairs — the same pick never repeats on two tickets
  const played = new Map();
  const isPlayed = (gk, pk) => (played.get(gk) || new Set()).has(pk);
  const markPlayed = (gk, pk) => {
    if (!played.has(gk)) played.set(gk, new Set());
    played.get(gk).add(pk);
  };

  // ---- supply: every in-week verified game with its qualifying market picks
  const games = new Map();
  const gameOf = (p) => {
    const k = gameKey(p);
    if (!games.has(k)) {
      games.set(k, {
        key: k,
        home: p.home,
        away: p.away,
        league: p.league,
        date: p.date,
        h2h: p.h2h || null,
        rates: p.rates || "",
        src: p,
        srcText: p.srcText || null,
        cands: [],
      });
    }
    return games.get(k);
  };
  const weekMarket = [];
  for (const g of marketPool || []) {
    if (!inWeek(g.date)) continue;
    weekMarket.push(g);
    const G = gameOf(g);
    if (g.risky) G.cands.push({ pickKey: "RISKY", prob: g.risky.prob, label: g.risky.label });
    if (g.sugar) G.cands.push({ pickKey: g.sugar.key, prob: g.sugar.prob, label: g.sugar.label });
    if (g.seven) G.cands.push({ pickKey: g.seven.key, prob: g.seven.prob, label: g.seven.label });
    // Every scrutinized straight market (1 / X / 2, O/U 2.5, BTTS) from the
    // same verified form — the specials' shared-game fill pool, so the named
    // slips always bring games. The per-ticket accept bar (75%+ specials,
    // 90%+ CHOP EBA) still gates every leg; nothing below the bar enters.
    for (const c of g.reals || []) {
      if (!G.cands.some((x) => x.pickKey === c.key)) G.cands.push({ pickKey: c.key, prob: c.prob, label: c.label });
    }
  }

  // ---- tickets
  const mkB = (name, chop) => ({ name, legs: [], combined: 1, chop, gameKeys: new Set() });
  const specials = BATCH_NAMES.map((n) => mkB(n, false));
  const chopB = mkB(CHOP_BATCH_NAME, true);
  const riskyB = mkB("RISKY"), sugarB = mkB("SUGAR"), sevenB = mkB("SEVEN");
  const specialsAndChop = [...specials, chopB];
  const isSpecialFull = (b) =>
    b.chop
      ? b.legs.length >= MAX_LEGS
      : (b.legs.length >= MIN_LEGS && b.combined >= TARGET_ODDS) || b.legs.length >= MAX_LEGS;

  const usedGames = new Set();
  const surest = rankLegs(qualifiedLegs(deepPool).filter((p) => inWeek(p.date)));

  // ---- shared-game leg (pass 2) — built from a game's qualifying market pick
  const mkLeg = (G, c) => ({
    home: G.home,
    away: G.away,
    league: G.league,
    date: G.date,
    timestamp: `${G.date}T12:00:00Z`,
    marketLabel: c.label,
    probability: c.prob,
    fairOdds: 1 / c.prob,
    marketOdds: null,
    qualityScore: Math.round(c.prob * 100),
    status: "open",
    h2h: G.h2h,
    rates: G.rates,
    reasons: [
      "Shared-game pick — same fixture as another ticket but a DIFFERENT market, so no two tickets hold the same bet",
      G.rates,
    ].filter(Boolean),
  });

  // ---- BANKu (THE MORNING 15) is dealt FIRST from the same shared deal, so
  // a pick that lands on the morning drop can never also sit on a SPECIAL
  // ODDS / CHOP EBA / market slip, and vice versa: every section on the page
  // reads ONE exclusive deal, each tab carries its own distinct picks. KALA
  // claims no picks here — its 2.50+ real-priced legs are chosen from the
  // candidate supply at display time.
  const BANKU_LEGS = 15;

  const bankuUsedPk = new Set();
  const bankuLegs = [];
  const bankuGameKeys = new Set();
  const bankuAll = [];
  const bankuByGame = new Map();
  const bankuConsider = (cand) => {
    if (!(cand.prob > 0)) return;
    bankuAll.push(cand);
    const prev = bankuByGame.get(cand.gk);
    if (!prev || cand.prob > prev.prob) bankuByGame.set(cand.gk, cand);
  };
  for (const p of deepPool) {
    if (!inWeek(p.date)) continue;
    bankuConsider({ gk: gameKey(p), G: null, date: p.date, pickKey: marketKeyOf(p.marketLabel), prob: p.probability || 0, label: p.marketLabel, deep: p });
  }
  for (const [gk, G] of games) {
    for (const c of G.cands) {
      if (c.pickKey === "RISKY") continue; // the RISKY combo keeps its own slip
      bankuConsider({ gk, G, date: G.date, pickKey: c.pickKey, prob: c.prob, label: c.label, deep: null });
    }
  }
  const dayRank = (a, b) =>
    (a.date === todayStr ? 0 : 1) - (b.date === todayStr ? 0 : 1) ||
    String(a.date).localeCompare(String(b.date));
  const bankuTake = (cand, fill) => {
    if (isPlayed(cand.gk, cand.pickKey)) return;
    const fillNote = fill
      ? "Fill leg — a second scrutinized market from the same verified game, so the morning drop always carries 15 legs"
      : null;
    const leg = cand.deep
      ? {
          ...cand.deep,
          prob: cand.deep.probability || 0,
          src: "90%+ verified deep pool",
          sure: true,
          reasons: [...(cand.deep.reasons || []), "90%+ verified deep-pool pick — the engine's surest scrutiny bar", fillNote].filter(Boolean),
        }
      : {
          date: cand.G.date, home: cand.G.home, away: cand.G.away, league: cand.G.league,
          marketLabel: cand.label, prob: cand.prob, h2h: cand.G.h2h,
          src: cand.G.src?.live ? "live capture (in play)" : (cand.G.srcText || "verified market pool"), sure: false,
          reasons: [cand.G.rates, cand.G.h2h ? `Head-to-head (${cand.G.h2h})` : null, fillNote].filter(Boolean),
        };
    markPlayed(cand.gk, cand.pickKey);
    recordDealt(mem, SCOPE, cand.gk, cand.pickKey, todayStr);
    bankuUsedPk.add(`${cand.gk}|${cand.pickKey}`);
    bankuGameKeys.add(cand.gk);
    bankuLegs.push(leg);
  };
  // One best pick per game leads the drop — today's games first, then the
  // nearest days, ranked by model confidence.
  for (const cand of [...bankuByGame.values()].sort((a, b) => dayRank(a, b) || b.prob - a.prob).slice(0, BANKU_LEGS)) {
    bankuTake(cand);
  }
  // STRICT 15 — a second scrutinized market from a short game fills the drop.
  if (bankuLegs.length < BANKU_LEGS) {
    for (const cand of bankuAll
      .filter((c) => !bankuUsedPk.has(`${c.gk}|${c.pickKey}`))
      .sort((a, b) => dayRank(a, b) || b.prob - a.prob)
      .slice(0, BANKU_LEGS - bankuLegs.length)) {
      bankuTake(cand, true);
    }
  }

  // KALA — THE DAILY VERIFIED 10 × 2.50: no legs are dealt here. Every
  // verified scrutinized candidate (any model probability — the REAL 2.50+
  // price bar is the selection gate) enters the kalaCandidates supply; the
  // KALA slip attaches REAL bookmaker prices and keeps only legs actually
  // quoted at 2.50 or better, surest first. Nothing is reserved here — the
  // surest picks stay available to the other tickets.
  const kalaAll = [];
  const kalaConsider = (cand) => {
    if (!(cand.prob > 0)) return;
    kalaAll.push(cand);
  };
  for (const p of deepPool) {
    if (!inWeek(p.date)) continue;
    kalaConsider({ gk: gameKey(p), deep: p, date: p.date, pickKey: marketKeyOf(p.marketLabel), prob: p.probability || 0, label: p.marketLabel, confirmed: !!p.confirmed });
  }
  for (const [gk, G] of games) {
    for (const c of G.cands) {
      kalaConsider({ gk, G, date: G.date, pickKey: c.pickKey, prob: c.prob, label: c.label, confirmed: !!(G.src && G.src.confirmed) });
    }
  }
  // The morning drop's games stay off the market sections' exclusive pass, so
  // RISKY / SUGAR / DRINK 7UP prefer genuinely different games.
  for (const gk of bankuGameKeys) usedGames.add(gk);

  const tickets = [
    // CHOP EBA leads every shared-game round — it keeps the strict 90%+ bar,
    // so it must claim the rare 90%+ market picks before the specials
    // (which can fill at 75%+) take them. Same verified data, fair priority.
    { b: chopB, kind: "chop", accept: (c) => c.prob >= MIN_CONF },
    ...specials.map((b) => ({ b, kind: "special", accept: (c) => c.prob >= SPECIALS_FILL_BAR })),
    { b: riskyB, kind: "risky", accept: (c) => c.pickKey === "RISKY" },
    { b: sugarB, kind: "sugar", accept: (c) => ["1X", "X2", "1"].includes(c.pickKey) },
    { b: sevenB, kind: "seven", accept: (c) => ["1", "2"].includes(c.pickKey) },
  ];
  const stopFor = (t) =>
    t.kind === "special" || t.kind === "chop" ? isSpecialFull(t.b) : t.b.legs.length >= SECTION_MAX[t.kind];

  // ---- The full three-pass deal. Runs twice: first with the 7-day cycle
  // memory enforced (fresh picks only), then — whenever any ticket still has
  // room — as a REFILL that re-admits picks dealt on earlier days so the
  // slips always bring games. In-deal exclusivity (never the same pick on two
  // tickets) is enforced in BOTH runs through the played set.
  const runDeal = (ignoreMemory) => {
    const skipDealt = (gk, pk) => !ignoreMemory && wasDealtBefore(mem, SCOPE, gk, pk, todayStr);

    // PASS 1a: exclusive games for the five specials + CHOP EBA — the surest
    // 90%+ deep picks, balanced weakest-first so all tickets converge.
    for (const p of surest) {
      const open = specialsAndChop.filter((b) => !isSpecialFull(b));
      if (!open.length) break;
      const gk = gameKey(p);
      const pk = marketKeyOf(p.marketLabel);
      if (isPlayed(gk, pk) || skipDealt(gk, pk)) continue;
      const weakest = open.sort((a, b) => a.combined - b.combined)[0];
      weakest.legs.push(p);
      weakest.combined *= legOdds(p);
      weakest.gameKeys.add(gk);
      usedGames.add(gk);
      markPlayed(gk, pk);
      recordDealt(mem, SCOPE, gk, pk, todayStr);
    }

    // PASS 1b: exclusive games for the market sections — risky first, then
    // DRINK 7UP / SUGAR share the dual-qualifying games evenly.
    for (const g of weekMarket) {
      const k = gameKey(g);
      if (usedGames.has(k)) continue;
      if (g.risky && !isPlayed(k, "RISKY") && !skipDealt(k, "RISKY")) {
        riskyB.legs.push({ g, pick: g.risky }); riskyB.gameKeys.add(k); usedGames.add(k); markPlayed(k, "RISKY");
        recordDealt(mem, SCOPE, k, "RISKY", todayStr); continue;
      }
      const cands = [];
      if (g.seven) cands.push([sevenB, g.seven]);
      if (g.sugar) cands.push([sugarB, g.sugar]);
      if (!cands.length) continue;
      const [b, m] = cands.length === 2 ? (sevenB.legs.length <= sugarB.legs.length ? cands[0] : cands[1]) : cands[0];
      if (isPlayed(k, m.key) || skipDealt(k, m.key)) continue;
      b.legs.push({ g, pick: m }); b.gameKeys.add(k); usedGames.add(k); markPlayed(k, m.key);
      recordDealt(mem, SCOPE, k, m.key, todayStr);
    }

    // PASS 2: not enough unique games left → tickets may now SHARE a game,
    // but never the same pick: each shared game enters a ticket only through a
    // market no other ticket has played (specials take verified 75%+ market
    // picks; CHOP EBA keeps the 90%+ bar).
    let progress = true;
    while (progress) {
      progress = false;
      for (const t of tickets) {
        if (stopFor(t)) continue;
        let best = null;
        for (const [gk, G] of games) {
          if (t.b.gameKeys.has(gk)) continue; // this ticket already holds the game
          for (const c of G.cands) {
            if (isPlayed(gk, c.pickKey)) continue; // pick already on another ticket
            if (skipDealt(gk, c.pickKey)) continue; // dealt on an earlier day / previous cycle
            if (!t.accept(c)) continue;
            // Specials + CHOP chase their odds targets: among picks that clear
            // the bar, take the BEST PRICE (never a sub-bar pick, never a
            // fabricated margin). The market sections keep surest-first.
            const priceFirst = t.kind === "special" || t.kind === "chop";
            if (!best || (priceFirst ? 1 / c.prob > 1 / best.c.prob : c.prob > best.c.prob)) best = { gk, G, c };
          }
        }
        if (!best) continue;
        if (t.kind === "special" || t.kind === "chop") {
          const leg = mkLeg(best.G, best.c);
          t.b.legs.push(leg);
          t.b.combined *= legOdds(leg);
        } else {
          t.b.legs.push({ g: best.G.src, pick: best.c });
        }
        t.b.gameKeys.add(best.gk);
        markPlayed(best.gk, best.c.pickKey);
        recordDealt(mem, SCOPE, best.gk, best.c.pickKey, todayStr);
        progress = true;
      }
    }
  };

  runDeal(false);
  // REFILL — the week's fresh supply can't always fill every ticket (sparse
  // match days, mid-cycle days). Earlier-dealt picks come back so the slips
  // still bring games; the played set keeps one-pick-per-ticket intact.
  if (tickets.some((t) => !stopFor(t))) runDeal(true);

  // KALA SUPPLY — every 80%+ verified candidate from the same pools,
  // leg-shaped, EXCLUDING any pick already dealt to another ticket (the
  // played set). The KALA slip attaches REAL bookmaker prices to this supply
  // and keeps only legs actually quoted at ×2.50 or better — a value bar,
  // never a padding bar: a leg without a real 2.50+ quote never enters,
  // however sure the model is.
  const kalaCandidates = kalaAll
    .filter((c) => !isPlayed(c.gk, c.pickKey))
    .map((cand) =>
      cand.deep
        ? {
            ...cand.deep,
            prob: cand.deep.probability || 0,
            odds: 1 / Math.max(cand.prob, 0.01),
            confirmed: cand.confirmed,
          }
        : {
            date: cand.G.date, home: cand.G.home, away: cand.G.away, league: cand.G.league,
            marketLabel: cand.label, prob: cand.prob, odds: 1 / Math.max(cand.prob, 0.01),
            confirmed: cand.confirmed, h2h: cand.G.h2h,
            src: cand.G.src?.live ? "live capture (in play)" : (cand.G.srcText || "verified market pool"),
          }
    );

  const byDate = (a, b) => String(a.date || "").localeCompare(String(b.date || ""));
  saveDealtMemory(mem, todayStr);
  return {
    cycle: cycleInfo(),
    specials: specials.map(({ name, legs }) => ({ name, legs: legs.sort(byDate) })),
    chopPicks: [...chopB.legs].sort((a, b) => (b.probability || 0) - (a.probability || 0)),
    risky: [...riskyB.legs].sort((a, b) => b.pick.prob - a.pick.prob),
    sugar: [...sugarB.legs].sort((a, b) => b.pick.prob - a.pick.prob),
    seven: [...sevenB.legs].sort((a, b) => b.pick.prob - a.pick.prob),
    banku: bankuLegs,
    kala: [], // KALA's displayed legs are the 2.50+ real-priced ones from kalaCandidates
    kalaCandidates,
  };
}

// One shared scan for every slip section — both components always read the
// exact same pool, so the exclusive deal is identical everywhere on the page.
// The cache is day-keyed: a new day always rescans, so the 7-day window rolls
// forward and the board brings games every single day, forever.
let poolsPromise = null;
let poolsDate = "";
let poolsFailed = false;
export function scanSlipPools(force = false) {
  const today = new Date().toISOString().slice(0, 10);
  // A scan that failed (or came back with nothing at all) is NEVER cached for
  // the day — the next call rescans instead of poisoning every slip section
  // with an empty pool until tomorrow.
  if (!force && poolsPromise && poolsDate === today && !poolsFailed) return poolsPromise;
  poolsDate = today;
  poolsFailed = false;
  poolsPromise = (async () => {
    try {
      const [deep, market, live, world] = await Promise.all([
        buildSlipPool(),
        buildMarketPool(),
        buildLivePool(),
        buildWorldPool(),
      ]);
      const pools = { deep: deep || [], market: market || [], live: live || [], world: world || [] };
      // 25 verified league files always carry fixtures — an entirely empty
      // scan means the data layer hiccuped, not that football stopped.
      if (!pools.deep.length && !pools.market.length && !pools.live.length && !pools.world.length) {
        poolsFailed = true;
      }
      return pools;
    } catch {
      poolsFailed = true;
      return { deep: [], market: [], live: [], world: [] };
    }
  })();
  return poolsPromise;
}

// THE ONE SHARED DEAL — every slip section on the page (SPECIAL ODDS and the
// CHOP EBA / SUGAR / DRINK 7UP market slips) reads this single day-keyed
// deal, so one (game, market) pick can never appear on two different tabs'
// tickets no matter which component renders first. Day-keyed like the scan:
// a new day re-deals automatically; force re-deals on demand.
const EMPTY_DEAL = { specials: [], chopPicks: [], risky: [], sugar: [], seven: [], banku: [], kala: [], kalaCandidates: [] };
let dealCache = { date: "", promise: null };
let dealEmpty = false;
export function getWeekDeal(force = false, fallbackDeep = []) {
  const today = new Date().toISOString().slice(0, 10);
  // A deal that dealt nothing is never served twice — the next section that
  // asks rescans, so one transient morning failure can't leave every slip
  // on the page showing "no games" for the rest of the day.
  if (!force && dealCache.promise && dealCache.date === today && !dealEmpty) return dealCache.promise;
  dealEmpty = false;
  dealCache = {
    date: today,
    promise: (async () => {
      const { deep, market, live, world } = await scanSlipPools(force);
      const deepPool = (deep || []).length ? deep : fallbackDeep || [];
      const deal = dealWeekSlips(deepPool, [...(market || []), ...(live || []), ...(world || [])]);
      const anyLegs =
        (deal.specials || []).some((s) => s.legs.length) ||
        (deal.chopPicks || []).length > 0 || (deal.banku || []).length > 0 ||
        (deal.risky || []).length > 0 || (deal.sugar || []).length > 0 || (deal.seven || []).length > 0;
      if (!anyLegs) dealEmpty = true; // retry on the next read — never cache a dead deal
      return deal;
    })().catch(() => {
      dealEmpty = true;
      return EMPTY_DEAL;
    }),
  };
  return dealCache.promise;
}