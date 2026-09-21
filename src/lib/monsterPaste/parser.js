// MONSTER PASTE PARSER — turns raw betting-site text (fixtures, kickoff times,
// 1X2 / over-under / BTTS prices) into structured games. Pure and testable:
// no network, no writes. HONEST BY CONSTRUCTION: a line that cannot be
// confidently classified is kept as an unparseable line for the user to see —
// valid games are never dropped because one line failed, and nothing is ever
// invented from a line that did not parse.

// === TEAM NAME NORMALIZATION — the paste side of the fixture matcher ===
// Lowercase, strip accents/punctuation, strip club suffixes, resolve the
// common short-name aliases. The verified-feed side of the comparison goes
// through the same normalizer, so "Man City" resolves to the same key as
// "Manchester City".
const TEAM_ALIASES = {
  "man city": "manchester city",
  "man united": "manchester united",
  "man utd": "manchester united",
  spurs: "tottenham hotspur",
  wolves: "wolverhampton wanderers",
  psg: "paris saint germain",
  inter: "internazionale",
  juve: "juventus",
  barca: "barcelona",
  "real madrid": "real madrid",
};

export function normalizeTeam(name) {
  let s = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/\b(fc|cf|sc|afc|ac|bk)\b/g, " ");
  s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return TEAM_ALIASES[s] || s;
}

// Token fit: exact, or one token is a prefix of the other (≥3 chars) —
// "bayern" fits "bayern munchen", "dortmund" fits "borussia dortmund".
const tokenFit = (x, y) =>
  x === y || (x.length >= 3 && y.startsWith(x)) || (y.length >= 3 && x.startsWith(y));

// Team match score: 2 = exact normalized identity · 1 = contained/containing
// token match · 0 = no reliable match. Never a fuzzy free-text guess.
export function teamMatchScore(pasted, boardName) {
  const a = normalizeTeam(pasted);
  const b = normalizeTeam(boardName);
  if (!a || !b) return 0;
  if (a === b) return 2;
  const ta = a.split(" ");
  const tb = b.split(" ");
  if (ta.every((x) => tb.some((y) => tokenFit(x, y)))) return 1;
  if (tb.every((y) => ta.some((x) => tokenFit(x, y)))) return 1;
  return 0;
}

// === GAME LINE PARSING ===
const SEP_RE = /^(.+?)\s+(?:vs\.?|v\.?|versus)\s+(.+)$/i;
const SEP_RE2 = /^(.+?)\s+(?:x)\s+(.+)$/i;
const SEP_RE3 = /^(.+?)\s+[-–—]\s+(.+)$/;
const LEADING_TIME_RE = /^(?:\d{1,2}[:.]\d{2}\s*)+/;
const TRAILING_TIME_RE = /(?:\s*\d{1,2}[:.]\d{2})+$/;
const TRAILING_ODDS_RE = /\s+\d{1,3}[.,]\d{1,2}$/;
const ALPHA_RE = /[a-zà-ÿ]/i;

const cleanSide = (s) =>
  String(s || "")
    .replace(LEADING_TIME_RE, "")
    .replace(TRAILING_TIME_RE, "")
    .replace(TRAILING_ODDS_RE, "")
    .replace(/[[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function splitGame(line) {
  for (const re of [SEP_RE, SEP_RE2, SEP_RE3]) {
    const m = line.match(re);
    if (!m) continue;
    const home = cleanSide(m[1]);
    const away = cleanSide(m[2]);
    // both sides must be real team names — an odds line like "Home 1.85 - Draw
    // 3.60" fails this and is classified as odds/junk instead
    if (home.length >= 2 && away.length >= 2 && ALPHA_RE.test(home) && ALPHA_RE.test(away) && !/^\d/.test(home) && !/^\d/.test(away)) {
      const time = (line.match(LEADING_TIME_RE) || [])[0] || (line.match(TRAILING_TIME_RE) || [])[0] || "";
      return { home, away, time: time.trim(), raw: line };
    }
  }
  return null;
}

// === ODDS LINE PARSING ===
const oddsNum = (s) => parseFloat(String(s).replace(",", "."));
const validPrice = (n) => Number.isFinite(n) && n >= 1.01 && n <= 100;

const H_RE = /(?:home|\b1\b)\s*[:\-]?\s*(\d{1,2}[.,]\d{1,2})/i;
const D_RE = /(?:draw|\bx\b|nul)\s*[:\-]?\s*(\d{1,2}[.,]\d{1,2})/i;
const A_RE = /(?:away|\b2\b|guest)\s*[:\-]?\s*(\d{1,2}[.,]\d{1,2})/i;
const OU_RE = /(?:^|\s)(over|o|under|u)\s?(\d(?:[.,]\d)?)\s*[:\-]?\s*(\d{1,2}[.,]\d{1,2})/gi;
const BTTS_RE = /(?:btts|both teams(?:\s+to\s+score)?)\s*[:\-]?\s*(yes|no)?\s*[:\-]?\s*(\d{1,2}[.,]\d{1,2})/i;

// Returns the market prices found on one line, or null when the line is not
// an odds line. A 1X2 entry requires all three prices — a partial fragment is
// never turned into a fabricated price.
function parseOddsLine(line) {
  const found = [];
  const h = line.match(H_RE);
  const d = line.match(D_RE);
  const a = line.match(A_RE);
  if (h && d && a) {
    const prices = [oddsNum(h[1]), oddsNum(d[1]), oddsNum(a[1])];
    if (prices.every(validPrice)) {
      found.push({ market: "1X2", home: prices[0], draw: prices[1], away: prices[2] });
    }
  }
  let m;
  const ouRe = new RegExp(OU_RE.source, "gi");
  while ((m = ouRe.exec(line))) {
    const price = oddsNum(m[3]);
    if (!validPrice(price)) continue;
    const side = /^o/i.test(m[1]) ? "over" : "under";
    found.push({ market: `${side.toUpperCase()} ${m[2].replace(",", ".")}`, side, line: m[2].replace(",", "."), price });
  }
  const b = line.match(BTTS_RE);
  if (b) {
    const price = oddsNum(b[2]);
    if (validPrice(price)) found.push({ market: `BTTS ${(b[1] || "yes").toUpperCase()}`, price });
  }
  return found.length ? found : null;
}

// === MAIN PARSER ===
// Extracts games + odds from raw paste text. Duplicates (including reversed
// home/away copies of the same fixture) are removed and counted; unparseable
// lines are reported, never silently discarded.
export function parseBettingPaste(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const games = [];
  const unparseable = [];
  let marketsDetected = 0;
  let duplicatesRemoved = 0;

  for (const line of lines) {
    const game = splitGame(line);
    if (game) {
      const keyHome = normalizeTeam(game.home);
      const keyAway = normalizeTeam(game.away);
      const dup = games.some((g) => {
        const h = normalizeTeam(g.home);
        const a = normalizeTeam(g.away);
        return (h === keyHome && a === keyAway) || (h === keyAway && a === keyHome);
      });
      if (dup) {
        duplicatesRemoved++;
        continue;
      }
      games.push(game);
      continue;
    }
    const odds = parseOddsLine(line);
    if (odds && games.length) {
      const last = games[games.length - 1];
      last.odds = [...(last.odds || []), ...odds];
      marketsDetected += odds.reduce((n, o) => n + (o.market === "1X2" ? 3 : 1), 0); // individual prices
      continue;
    }
    if (odds && !games.length) {
      // prices with no game above them — nothing to attach to
      unparseable.push(line);
      continue;
    }
    unparseable.push(line);
  }

  return {
    games,
    stats: {
      gamesDetected: games.length,
      marketsDetected,
      duplicatesRemoved,
      unparseableLines: unparseable,
    },
  };
}

// === FIXTURE MATCHER — pasted games against the verified pool ===
// A game matches ONLY when BOTH teams resolve to the SAME verified fixture.
// One unique best match → matched · several equally good matches → review
// (never guessed) · none → not found (INSUFFICIENT DATA, no invented analysis).
export function matchGames(parsedGames, fixtures) {
  const matched = [];
  const review = [];
  const notFound = [];

  for (const g of parsedGames || []) {
    const candidates = [];
    for (const f of fixtures || []) {
      const direct = teamMatchScore(g.home, f.home) + teamMatchScore(g.away, f.away);
      const reversed = teamMatchScore(g.home, f.away) + teamMatchScore(g.away, f.home);
      const score = Math.max(direct, reversed);
      const okHome = teamMatchScore(g.home, f.home) >= 1 || teamMatchScore(g.home, f.away) >= 1;
      const okAway = teamMatchScore(g.away, f.away) >= 1 || teamMatchScore(g.away, f.home) >= 1;
      if (score >= 2 && okHome && okAway) {
        candidates.push({ fixture: f, score, reversed: reversed > direct });
      }
    }
    if (!candidates.length) {
      notFound.push({ home: g.home, away: g.away, reason: "No match in the verified RIDE X fixture pool — INSUFFICIENT DATA. No prediction is invented for an unidentified game." });
      continue;
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (candidates.length > 1 && candidates[1].score === best.score) {
      review.push({ home: g.home, away: g.away, reason: `Team names match ${candidates.length} verified fixtures — kept for review, never auto-guessed.` });
      continue;
    }
    matched.push({
      pasted: g,
      fixtureId: best.fixture.fixtureId,
      home: best.fixture.home,
      away: best.fixture.away,
      league: best.fixture.league,
      kickoff: best.fixture.kickoff,
      lagosDateKey: best.fixture.lagosDateKey,
      session: best.fixture.session,
      reversed: best.reversed,
    });
  }

  return { matched, review, notFound };
}