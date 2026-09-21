// PURE ODDS MATH — the single source of truth for every odds calculation in
// the Ride X prediction engine. This module has ZERO imports: it is covered
// end-to-end by the automated test suite (npm test) and must never touch the
// SDK, the browser or a provider. It NEVER converts a model number into a
// bookmaker price — that separation is enforced by validateRealOddsRecord
// and asserted by tests.

export const MAX_ODDS_AGE_MINUTES = 30;
export const MAX_LIVE_ODDS_AGE_MINUTES = 5;
export const STEAM_DRIFT_THRESHOLD = 0.05; // 5% minimum movement before STEAM/DRIFT is labelled

// ---------- conversions ----------
export function impliedProbability(decimalOdds) {
  const o = Number(decimalOdds);
  return o > 1 ? 1 / o : null;
}

export function decimalFromImplied(probability) {
  const p = Number(probability);
  return p > 0 && p < 1 ? 1 / p : null;
}

export function fairOdds(modelProbability) {
  const p = Number(modelProbability);
  return p > 0 && p <= 1 ? 1 / p : null;
}

export function expectedValuePct(modelProbability, decimalOdds) {
  const p = Number(modelProbability);
  const o = Number(decimalOdds);
  if (!(p > 0) || !(o > 1)) return null;
  return (p * o - 1) * 100;
}

export function edgePoints(modelProbability, decimalOdds) {
  const p = Number(modelProbability);
  const imp = impliedProbability(decimalOdds);
  if (!(p > 0) || imp == null) return null;
  return (p - imp) * 100;
}

// ---------- accumulator (log-based, no float overflow) ----------
export function combineOdds(prices) {
  const arr = (Array.isArray(prices) ? prices : []).map(Number).filter((o) => o > 1);
  if (!arr.length) return 1;
  return Math.exp(arr.reduce((s, o) => s + Math.log(o), 0));
}

export function targetAverageOdds(target, legs) {
  const t = Number(target);
  const n = Number(legs);
  return t > 1 && n > 0 ? Math.pow(t, 1 / n) : null;
}

// ---------- freshness ----------
export function isStale(timestamp, maxAgeMinutes = MAX_ODDS_AGE_MINUTES, now = Date.now()) {
  const ts = timestamp ? new Date(timestamp).getTime() : 0;
  if (!Number.isFinite(ts) || ts <= 0) return true;
  return now - ts > maxAgeMinutes * 60000;
}

// ---------- odds movement ----------
export function movementPercentage(openingOdds, currentOdds) {
  const o = Number(openingOdds);
  const c = Number(currentOdds);
  if (!(o > 1) || !(c > 1)) return null;
  return ((c - o) / o) * 100;
}

// STEAM = price shortened (money in), DRIFT = price lengthened. A single
// current price is never labelled — only real history between two snapshots.
export function classifyMovement(openingOdds, currentOdds, threshold = STEAM_DRIFT_THRESHOLD) {
  const mv = movementPercentage(openingOdds, currentOdds);
  if (mv == null) return { label: "NO HISTORY", movementPct: null, direction: "none" };
  if (mv <= -threshold * 100) return { label: "STEAM", movementPct: mv, direction: "down" };
  if (mv >= threshold * 100) return { label: "DRIFT", movementPct: mv, direction: "up" };
  return { label: "STABLE", movementPct: mv, direction: mv < 0 ? "down" : mv > 0 ? "up" : "none" };
}

// ---------- bookmaker normalization ----------
const BOOKMAKER_CANON = {
  "1xbet": "1xBet",
  "10bet": "10Bet",
  "888sport": "888sport",
  "bet365": "bet365",
  "betfair": "Betfair",
  "betsson": "Betsson",
  "betvictor": "BetVictor",
  "bwin": "bwin",
  "comeon": "ComeOn",
  "livescorebet": "LiveScore Bet",
  "marathonbet": "Marathonbet",
  "matchbook": "Matchbook",
  "pinnacle": "Pinnacle",
  "smarkets": "Smarkets",
  "tipico": "Tipico",
  "unibet": "Unibet",
  "williamhill": "William Hill",
  "william hill": "William Hill",
};

export function normalizeBookmaker(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/\s*\([^)]*\)\s*$/, "").trim(); // strip region suffixes like "(SE)"
  if (!s) return "";
  const key = s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  return BOOKMAKER_CANON[key] || s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- market normalization ----------
// The same market on the same game is always the SAME pick key, whichever
// pool produced the leg.
export function normalizeMarketKey(label) {
  const s = String(label || "").trim();
  if (["1", "X", "2", "1X", "X2", "12"].includes(s)) return s;
  if (/^1\s*·/.test(s) || /^home win$/i.test(s)) return "1";
  if (/^2\s*·/.test(s) || /^away win$/i.test(s)) return "2";
  if (/^draw$/i.test(s)) return "X";
  const ou = /^Over\s*([\d.]+)/i.exec(s);
  if (ou) return `O${ou[1]}`;
  const uu = /^Under\s*([\d.]+)/i.exec(s);
  if (uu) return `U${uu[1]}`;
  if (/^Both Teams To Score/i.test(s)) return "BTTS_Y";
  if (/Not To Score/i.test(s)) return "BTTS_N";
  if (/corner/i.test(s)) return `CORNERS:${s}`;
  return s;
}

// Which markets the connected odds provider actually prices. Anything else is
// MARKET NOT AVAILABLE — the engine never manufactures the price.
export const PROVIDER_MARKETS = {
  h2h: true, // 1 / X / 2
  totals: true, // Over / Under goals
  btts: true, // Both Teams To Score Yes/No
  team_totals: false,
  corners: false,
  double_chance: false,
};

export function marketAvailability(marketKey) {
  if (PROVIDER_MARKETS[marketKey] === true) return { available: true };
  return {
    available: false,
    reason: "MARKET NOT AVAILABLE — the connected odds provider does not price this market; no price is ever invented",
  };
}

// Parse a leg's market label into an actual provider request. Same-game
// combinations are explicitly rejected — they are not a single bookmaker
// price, so multiplying would fabricate one.
export function parseMarketRequest(label) {
  const s = String(label || "").trim();
  if (!s) return { unsupported: true, reason: "no market on the leg" };
  if (s.includes("+")) {
    return {
      unsupported: true,
      reason: "COMBINATION PRICE NOT AVAILABLE FROM ODDS PROVIDER — same-game combos are not priced by the feed; a multiplied price would not be a bookmaker price",
    };
  }
  if (/corner/i.test(s)) {
    return { unsupported: true, reason: "CORNER MARKETS — MARKET NOT AVAILABLE from the connected odds provider" };
  }
  const btts = /(both teams to score|btts)/i.exec(s);
  if (btts) {
    if (/no/i.test(s.replace(btts[0], "")) || /Not To Score/i.test(s)) return { market: "btts", side: "N" };
    return { market: "btts", side: "Y" };
  }
  let m = /^(Over|Under)\s*([\d.]+)(?:\s*Goals?)?$/i.exec(s);
  if (m) return { market: "totals", side: m[1].toLowerCase() === "over" ? "o" : "u", point: Number(m[2]) };
  if (s === "1" || /^1\s*·/.test(s) || /^home win$/i.test(s)) return { market: "h2h", side: "1" };
  if (s === "2" || /^2\s*·/.test(s) || /^away win$/i.test(s)) return { market: "h2h", side: "2" };
  if (s === "X" || /^draw$/i.test(s)) return { market: "h2h", side: "X" };
  if (["1X", "X2", "12"].includes(s)) {
    return { unsupported: true, reason: "DOUBLE CHANCE — MARKET NOT AVAILABLE from the connected odds provider" };
  }
  return { unsupported: true, reason: "market not offered by the connected odds provider — MARKET NOT AVAILABLE" };
}

// ---------- fixture matching ----------
const STRIP_TOKENS = new Set(["fc", "cf", "afc", "ac", "as", "sc", "bc", "if", "bk", "sk", "fk", "afc"]);

export function normalizeTeamName(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    // strip legal suffixes (fc, cf, ac…) and FOUNDING YEARS (Bologna FC 1909 →
    // bologna) — but keep meaningful digits (Telstar 1963 vs Home 1 stay
    // distinct teams, so different fixtures never false-match).
    .filter((t) => t && !STRIP_TOKENS.has(t) && !(/^(18|19|20)\d{2}$/.test(t) && t >= 1800))
    .join(" ")
    .trim();
}

function tokenMatch(a, b) {
  const x = normalizeTeamName(a);
  const y = normalizeTeamName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  const tx = x.split(" ");
  const ty = y.split(" ");
  const inter = tx.filter((t) => ty.includes(t)).length;
  return inter >= 2 && inter / Math.min(tx.length, ty.length) >= 0.6;
}

export function matchFixture(homeA, awayA, homeB, awayB) {
  return tokenMatch(homeA, homeB) && tokenMatch(awayA, awayB);
}

// ---------- duplicate detection ----------
export function fixturePickKey(leg) {
  return `${leg?.date || ""}|${normalizeTeamName(leg?.home)}|${normalizeTeamName(leg?.away)}|${normalizeMarketKey(leg?.marketLabel)}`;
}

export function findDuplicateKeys(legs) {
  const counts = new Map();
  for (const l of legs || []) {
    const k = fixturePickKey(l);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

export function hasDuplicateFixture(legs) {
  const games = new Map();
  for (const l of legs || []) {
    const gk = `${l?.date || ""}|${normalizeTeamName(l?.home)}|${normalizeTeamName(l?.away)}`;
    if (games.has(gk)) return true;
    games.set(gk, true);
  }
  return false;
}

// ---------- simulated / SRL rejection ----------
export function isSimulatedEvent(rec) {
  const hay = [
    rec?.sportKey || rec?.sport_key || "",
    rec?.league || "",
    rec?.eventId || rec?.event_id || "",
    rec?.home || rec?.home_team || "",
    rec?.away || rec?.away_team || "",
  ]
    .join(" ")
    .toLowerCase();
  return /(^|[^a-z])srl([^a-z]|$)|simulated|e-?soccer|esports/.test(hay);
}

// ---------- real-odds record contract ----------
const MODEL_SOURCE_RE = /\b(model|engine|estimate|fair|projection|ride ?x)\b/i;

// Every real bookmaker odds record MUST contain: provider, bookmaker,
// event_id, home_team, away_team, market, selection, decimal_odds,
// timestamp. A model fair odds number is NEVER a valid bookmaker price.
export function validateRealOddsRecord(rec) {
  const required = ["provider", "bookmaker", "event_id", "home_team", "away_team", "market", "selection", "decimal_odds", "timestamp"];
  const missing = required.filter((f) => rec == null || rec[f] === null || rec[f] === undefined || rec[f] === "");
  const issues = [];
  if (rec) {
    if (!(Number(rec.decimal_odds) > 1.01)) issues.push("decimal_odds must be a real quoted price above 1.01");
    if (!Number.isFinite(new Date(rec.timestamp).getTime())) issues.push("timestamp must be a real quote time");
    if (MODEL_SOURCE_RE.test(String(rec.provider || "")) || MODEL_SOURCE_RE.test(String(rec.bookmaker || ""))) {
      issues.push("MODEL/BOOKMAKER SEPARATION — a model estimate may never be presented as a bookmaker price");
    }
    if (isSimulatedEvent(rec)) issues.push("simulated/SRL events are rejected");
  }
  return { valid: missing.length === 0 && issues.length === 0, missing, issues };
}

// ---------- best price selection (all prices preserved) ----------
export function pickBestPrice(quotes) {
  const list = (quotes || [])
    .filter((q) => q && Number(q.price) > 1.01)
    .map((q) => ({ price: Number(q.price), bookmaker: normalizeBookmaker(q.bookmaker), timestamp: q.timestamp }));
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => b.price - a.price);
  return { best: sorted[0], all: sorted, books: list.length };
}

// ---------- provider fallback ----------
// Priority-ordered providers; the first healthy one wins. If every configured
// provider fails the engine says REAL ODDS UNAVAILABLE — it never falls back
// to a model number posing as a price.
export function resolveOddsProvider(providers) {
  for (const p of providers || []) {
    if (p && p.status === "ok") return { status: "ok", provider: p.name };
  }
  return {
    status: "unavailable",
    label: "REAL ODDS UNAVAILABLE",
    reason: "every configured odds provider failed — no bookmaker-priced accumulator is produced",
  };
}

// ---------- 50-leg optimizer ----------
// Real prices only. Safest (highest model probability, then best EV) first,
// one selection per fixture, positive-EV requirement, capped at maxLegs;
// then trim the highest-priced legs while the combined price overshoots the
// target by more than `overshoot`. An actual bookmaker price is NEVER
// modified to hit the target.
export function optimizeAccumulator(candidates, opts = {}) {
  const target = Number(opts.target) || 1000000;
  const logTarget = Math.log(target);
  const maxLegs = Number(opts.maxLegs) || 50;
  const minLegs = Math.min(Number(opts.minLegs) || 20, maxLegs);
  const overshoot = Number(opts.overshoot) || 1.05;

  const sorted = [...(candidates || [])].sort(
    (a, b) => (b.prob || 0) - (a.prob || 0) || (b.evPct ?? -1) - (a.evPct ?? -1)
  );
  const chosen = [];
  const rejected = [];
  const seenGame = new Set();
  for (const c of sorted) {
    if ((c.evPct ?? -1) <= 0) {
      rejected.push({ c, reason: "poor value — model sees no edge at the real price" });
      continue;
    }
    const gk = `${c.date || ""}|${normalizeTeamName(c.home)}|${normalizeTeamName(c.away)}`;
    if (seenGame.has(gk)) {
      rejected.push({ c, reason: "duplicate fixture — max 1 selection per match" });
      continue;
    }
    seenGame.add(gk);
    if (chosen.length < maxLegs) chosen.push(c);
    else rejected.push({ c, reason: `${maxLegs}-leg limit reached` });
  }
  let logs = chosen.reduce((s, c) => s + Math.log(c.price), 0);
  while (logs > logTarget * overshoot && chosen.length > minLegs) {
    let idx = 0;
    chosen.forEach((c, i) => {
      if (c.price > chosen[idx].price) idx = i;
    });
    const [rem] = chosen.splice(idx, 1);
    logs -= Math.log(rem.price);
    rejected.unshift({ c: rem, reason: "trimmed — target reached, this leg's real price would overshoot the target" });
  }
  return { chosen, rejected, combined: Math.exp(logs) };
}