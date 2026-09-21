// BASKETBALL SPECIAL ODDS ENGINE — mirrors the football slip structure
// (src/lib/slipPool.js + src/lib/slipDealing.js) for basketball:
//   1. ONE-WEEK WINDOW — fixtures come from the next 7 days only, so the
//      batches bring fresh games every single day (day-keyed scan cache).
//   2. VERIFIED FORM ONLY — both sides need 3+ real played games with final
//      scores from the same league feed; head-to-head history nudges
//      confidence and contradictions disqualify the pick. Never a guess.
//   3. ONE PICK, NEVER TWICE — the same (game, market) never sits on two
//      tickets (tickets may share a game only through a DIFFERENT market),
//      and a pick dealt on an earlier day — previous 7-day cycle included —
//      never comes back (persistent dealt-pick memory, scope "basketball").
//   4. HIGH ODDS — every ticket chains 94%+ picks padded with a second (90%+)
//      verified totals/points market until the combined odds clear the
//      2,000,000 target, max 50 legs.

import { formFromResults, pTotalAtLeast } from "@/lib/pickEngine";
import { espnLeagueFeed } from "@/lib/espnSports";
import { setScanStatus } from "@/lib/scanStatus";
import { srNbaFixtures } from "@/lib/sportradarNba";
import { marketKeyOf } from "@/lib/slipDealing";
import { legOdds } from "@/components/sports/SpecialSlipBatch";
import { cycleInfo, loadDealtMemory, recordDealt, saveDealtMemory, wasDealtBefore, todayKey } from "@/lib/dealtPickMemory";

export const BB_BATCH_NAMES = [
  "HOLLOW BBALL",
  "DRAMA QUEEN BBALL",
  "RIDE X BBALL",
  "HAMMER BBALL",
  "FINE GIRL BBALL",
];
export const MAX_LEGS = 50;
export const MIN_LEGS = 20;
export const TARGET_ODDS = 2000000;

const MIN_CONF = 0.94; // same "sure qualified" bar as the football specials
const COMP_CONF = 0.90; // padding pick bar
const MIN_FORM_GAMES = 3; // both sides need 3+ verified played games (NBA-style schedule plays 2-3 games/week)
const LAM_MIN = 150, LAM_MAX = 260;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// VERIFIED DATA SOURCE — ESPN public feeds. TheSportsDB's free day feed
// returns no basketball fixtures and its per-league results feed returns a
// single event on the free key (not enough form); the Sportradar trial key
// is soccer-entitled only. ESPN carries the real NBA + WNBA schedule and real
// final scores — the scrutiny model below is unchanged.
const BBALL_LEAGUES = [
  { espn: "basketball/nba", label: "NBA" },
  { espn: "basketball/wnba", label: "WNBA" },
];

// Last-5 head-to-head between the two sides from real results
// (share = home side's points share; basketball has no draws).
export function h2hOf(events, t1, t2) {
  const ms = events
    .filter((ev) => {
      if (ev.intHomeScore == null || ev.intAwayScore == null) return false;
      const h = (ev.strHomeTeam || "").toLowerCase();
      const a = (ev.strAwayTeam || "").toLowerCase();
      return (h === t1 && a === t2) || (h === t2 && a === t1);
    })
    .sort((a, b) => String(b.dateEvent || "").localeCompare(String(a.dateEvent || "")))
    .slice(0, 5);
  if (!ms.length) return null;
  let pts = 0, wins = 0, losses = 0, gf = 0, ga = 0;
  ms.forEach((ev) => {
    const hs = Number(ev.intHomeScore), as = Number(ev.intAwayScore);
    const t1Home = (ev.strHomeTeam || "").toLowerCase() === t1;
    const our = t1Home ? hs : as, opp = t1Home ? as : hs;
    gf += our; ga += opp;
    if (our > opp) { pts += 1; wins++; } else losses++;
  });
  return { n: ms.length, wins, losses, share: pts / ms.length, gf, ga };
}

// Best Over line whose model probability clears the bar: maximize k with
// P(total >= k) >= bar. Honest Poisson over the verified scoring rates.
// `unit` labels the line for the calling sport (Points / Runs / Goals).
export function bestOverLine(lam, bar, unit = "Points") {
  for (let k = Math.floor(lam); k > Math.floor(lam) - 45; k--) {
    const p = pTotalAtLeast(lam, k);
    if (p >= bar) return { label: `Over ${k - 0.5} ${unit}`, line: k - 0.5, prob: p, dir: "over" };
  }
  return null;
}
// Best Under line: minimize k with P(total <= k-1) >= bar.
export function bestUnderLine(lam, bar, unit = "Points") {
  for (let k = Math.ceil(lam); k < Math.ceil(lam) + 45; k++) {
    const p = 1 - pTotalAtLeast(lam, k);
    if (p >= bar) return { label: `Under ${k - 0.5} ${unit}`, line: k - 0.5, prob: p, dir: "under" };
  }
  return null;
}
// Best team line: maximize k with P(team >= k) >= bar. lo/hi bound the
// sport's realistic per-team scoring range.
export function bestTeamLine(team, rate, bar, unit = "Points", lo = 60, hi = 140) {
  const lam = clamp(rate, lo, hi);
  for (let k = Math.floor(lam); k > Math.floor(lam) - 45; k--) {
    const p = pTotalAtLeast(lam, k);
    if (p >= bar) return { label: `${team} Over ${k - 0.5} ${unit}`, line: k - 0.5, prob: p };
  }
  return null;
}
export const lineOf = (label) => parseFloat((/([\d.]+)/.exec(String(label)) || [])[1]) || 0;

// Full qualified pool — every next-7-days NBA/WNBA fixture with verified
// form on BOTH sides, carrying its 94%+ market candidates, each padded with
// a second (90%+) verified market. No verified form → the game never enters.
export async function buildBasketballPool() {
  const todayStr = todayKey();
  const feeds = await Promise.all(BBALL_LEAGUES.map((l) => espnLeagueFeed(l.espn, l.label, 14, 7)));
  const matches = feeds.flatMap((f) => f.fixtures);
  // SPORTRADAR NBA (production key) — supplements the ESPN fixture list with
  // the official NBA schedule: real game ids, teams and tip-offs. Duplicates
  // (same day + same two teams) are merged, never double-counted; results for
  // the form gate still come from the ESPN results feed per league.
  const srGames = await srNbaFixtures().catch(() => []);
  const seen = new Set(matches.map((m) => `${m.dateEvent}|${String(m.strHomeTeam || "").toLowerCase()}|${String(m.strAwayTeam || "").toLowerCase()}`));
  for (const g of srGames) {
    const k = `${g.date}|${String(g.home || "").toLowerCase()}|${String(g.away || "").toLowerCase()}`;
    if (!k.includes("||") && !seen.has(k)) {
      seen.add(k);
      matches.push({ idEvent: g.id, idLeague: "sr:nba", strLeague: "NBA", dateEvent: g.date, strTimestamp: g.scheduled, strHomeTeam: g.home, strAwayTeam: g.away });
    }
  }
  const results = {};
  BBALL_LEAGUES.forEach((l, idx) => {
    results[l.espn] = feeds[idx].results;
  });

  const out = [];
  for (const e of matches) {
    if (!e.dateEvent || e.dateEvent < todayStr) continue;
    const h = (e.strHomeTeam || "").toLowerCase();
    const a = (e.strAwayTeam || "").toLowerCase();
    if (!h || !a) continue;
    const evs = results[e.idLeague] || [];
    const hf = formFromResults(evs, h);
    const af = formFromResults(evs, a);
    if (!hf || !af || hf.n < MIN_FORM_GAMES || af.n < MIN_FORM_GAMES) continue; // verified form on both sides only

    const h2h = h2hOf(evs, h, a);
    const hgf = hf.gf / hf.n, agf = af.gf / hf.n;
    const hga = hf.ga / hf.n, aga = af.ga / hf.n;
    const lam = clamp(hgf + agf, LAM_MIN, LAM_MAX);
    const h2hAvgTotal = h2h && h2h.n >= 2 ? (h2h.gf + h2h.ga) / h2h.n : null;
    const contradictsTotals = (dir, line) =>
      h2hAvgTotal != null && (dir === "over" ? h2hAvgTotal < line : h2hAvgTotal > line);

    // MAIN MARKETS — the 94%+ bar
    const cands = [];
    // moneyline (form + H2H nudge; a record that contradicts disqualifies)
    let pH = clamp(0.5 + (hf.avg - af.avg) * 0.35 + 0.08, 0.25, 0.82);
    let pA = 1 - pH;
    if (h2h) {
      pH = clamp(pH + (h2h.share - 0.5) * 0.18, 0.05, 0.9);
      pA = clamp(pA - (h2h.share - 0.5) * 0.18, 0.05, 0.9);
    }
    if (pH >= MIN_CONF && !(h2h && h2h.n >= 2 && h2h.share <= 0.25)) cands.push({ label: "1", prob: pH });
    if (pA >= MIN_CONF && !(h2h && h2h.n >= 2 && h2h.share >= 0.75)) cands.push({ label: "2", prob: pA });
    // total-points lines at the 94% bar (basketball's "Over 0.5 / Under 3.5" equivalents)
    const o94 = bestOverLine(lam, MIN_CONF);
    if (o94 && !contradictsTotals("over", o94.line)) cands.push(o94);
    const u94 = bestUnderLine(lam, MIN_CONF);
    if (u94 && !contradictsTotals("under", u94.line)) cands.push(u94);
    // team-points lines at the 94% bar
    const th94 = bestTeamLine(e.strHomeTeam, hgf, MIN_CONF);
    if (th94 && !(h2h && h2h.n >= 2 && h2h.gf / h2h.n < th94.line)) cands.push(th94);
    const ta94 = bestTeamLine(e.strAwayTeam, agf, MIN_CONF);
    if (ta94 && !(h2h && h2h.n >= 2 && h2h.ga / h2h.n < ta94.line)) cands.push(ta94);

    // VALUE ZONE (1.25–1.55 fair odds) — the Monster 6-day rollover's sweet
    // spot: match-winner picks whose model probability sits between ~64.5%
    // and 80%. Kept SEPARATE from the 94%+ main cands so the existing
    // basketball tickets never change.
    const inZone = (p) => p >= 1 / 1.55 && p <= 1 / 1.25;
    const valueCands = [];
    if (inZone(pH) && !(h2h && h2h.n >= 2 && h2h.share <= 0.25)) valueCands.push({ label: "1", prob: pH });
    if (inZone(pA) && !(h2h && h2h.n >= 2 && h2h.share >= 0.75)) valueCands.push({ label: "2", prob: pA });
    if (!cands.length && !valueCands.length) continue;

    // PADDING PICKS — a second verified market on the SAME game at the 90%+
    // bar. Skipped whenever H2H contradicts, or lines sit knife-edge
    // (<15 pts apart), so every combo stays honestly computable.
    const th90 = bestTeamLine(e.strHomeTeam, hgf, COMP_CONF);
    const ta90 = bestTeamLine(e.strAwayTeam, agf, COMP_CONF);
    const compO = bestOverLine(lam, COMP_CONF);
    const compU = bestUnderLine(lam, COMP_CONF);

    const legs = cands.map((c) => {
      const cLine = lineOf(c.label);
      const companion = [compO, compU]
        .filter(Boolean)
        .filter((o) => Math.abs(o.line - cLine) >= 15)
        .filter((o) => !contradictsTotals(o.dir, o.line))
        .sort((x, y) => x.prob - y.prob)[0] || null; // best odds that still clears the bar
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
      league: e.strLeague || "Basketball",
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
      exp: { hs: Math.round(hgf), as: Math.round(agf) }, // expected scoreline from the real scoring rates
      rawP: { p1: pH, p2: pA },
    });
  }
  return out;
}

// EXCLUSIVE DEAL — mirrors the football week deal for the basketball tickets:
// one pick never sits on two tickets (shared games go through a different
// market), and a pick dealt on an earlier day never comes back — so each new
// day deals fresh picks and every 7-day-cycle rollover starts a genuinely new
// Day-1 deal automatically.
export function dealBasketballSlips(pool) {
  const todayStr = todayKey();
  const mem = loadDealtMemory();
  const SCOPE = "basketball";
  const gameKeyOf = (g) => `${g.date || ""}|${g.home || ""}|${g.away || ""}`;

  const played = new Map();
  const isPlayed = (gk, pk) => (played.get(gk) || new Set()).has(pk);
  const markPlayed = (gk, pk) => {
    if (!played.has(gk)) played.set(gk, new Set());
    played.get(gk).add(pk);
  };

  const batches = BB_BATCH_NAMES.map((name) => ({ name, legs: [], combined: 1, gameKeys: new Set() }));
  const isFull = (b) => (b.legs.length >= MIN_LEGS && b.combined >= TARGET_ODDS) || b.legs.length >= MAX_LEGS;

  // qualified (game, market) pairs, odds-first ordering so the target stays reachable
  const cands = [];
  for (const g of pool || []) {
    for (const c of g.cands || []) {
      if (c.prob < MIN_CONF) continue;
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
      `Basketball engine pick — ${c.label} at ${Math.round(c.prob * 100)}% from verified form on both sides`,
      g.h2h ? `Head-to-head — last 5 meetings (real results): ${g.h2h}` : null,
      g.rates,
      c.companion
        ? `Padding pick (verified) — ${c.companion.label} at ${Math.round(c.companion.prob * 100)}% from real scoring rates`
        : "No second market cleared the 90% scrutiny bar for this game — main market only",
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

// Day-keyed scan cache — a new day always rescans, so the 7-day window rolls
// forward and the batches bring games every single day, forever.
let poolPromise = null;
let poolDate = "";
export function scanBasketballPool(force = false) {
  const today = todayKey();
  if (!force && poolPromise && poolDate === today) return poolPromise;
  poolDate = today;
  poolPromise = buildBasketballPool()
    .then((pool) => {
      setScanStatus("basketball", "OK");
      return pool;
    })
    .catch((err) => {
      // Logged and recorded, never silently swallowed — an off-season NBA is
      // a real zero-fixture day; a fetch failure is API_ERROR.
      console.error("[SCAN] Basketball pool failed:", err?.message || err);
      setScanStatus("basketball", "API_ERROR", String(err?.message || err));
      return [];
    });
  return poolPromise;
}