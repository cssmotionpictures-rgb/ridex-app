// SPORTYBET MARKET NORMALIZATION + CANONICAL SETTLEMENT
// Maps SportyBet market/pick vocabulary onto RIDE X canonical market keys so
// every imported historical leg can be graded independently from its FT score.
// The ORIGINAL market name and pick text are always preserved alongside the
// mapping — normalization never rewrites history. Markets whose official
// settlement cannot be derived from an FT goals score (corners, per-half
// markets, early goals, quarter lines with split stakes…) are honestly NOT
// settleable — never guessed, never silently settled.

// Ticket outcome text → normalized state. Unknown wording returns "" (absent).
export function normalizeOutcomeText(raw) {
  const t = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return "";
  if (/^(win|won|winner|winning)\b/.test(t)) return "won";
  if (/^(loss|lost|lose|losing)\b/.test(t)) return "lost";
  if (/^(push|void|refund|stake returned)\b/.test(t)) return "push";
  if (/^(pending|unsettled|open|upcoming|live|not started|in play)\b/.test(t)) return "pending";
  if (/^(cancelled|canceled|cash ?out)\b/.test(t)) return "cancelled";
  return "";
}

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

// SportyBet market + pick → canonical normalization record (or null when the
// pick is unrecognizable). settleable=false means the FT goals score alone
// can never grade this market — the leg is retained but never auto-settled.
export function normalizeSportyBetMarket(rawMarket, rawPick) {
  const market = norm(rawMarket);
  const pl = norm(rawPick).replace(/\u2212/g, "-");
  if (!pl) return null;

  // — markets an FT goals score can never grade —
  if (/corner/.test(market) || /corner/.test(pl)) {
    return { engineKey: "", canonical: "CORNERS", family: "corners", settleable: false, note: "corner markets need corner counts — not derivable from FT goals" };
  }
  if (/win either half/.test(pl) || /win either half/.test(market)) {
    return { engineKey: "", canonical: "WIN_EITHER_HALF", family: "special", settleable: false, note: "per-half goals are not derivable from FT goals alone" };
  }
  if (/early goal/.test(market) || /early goal/.test(pl)) {
    return { engineKey: "", canonical: "EARLY_GOALS", family: "special", settleable: false, note: "goal timing is not derivable from FT goals" };
  }
  if (/goal bounds?/.test(market)) {
    return { engineKey: "", canonical: "GOAL_BOUNDS", family: "special", settleable: false, note: "interval structure is not derivable from FT goals" };
  }
  if (/(?:^|\s)(?:1st|first|2nd|second)\s*(?:half|ht)\b/.test(market)) {
    return { engineKey: "", canonical: "HALF_MARKET", family: "half", settleable: false, note: "per-half result is not derivable from FT goals" };
  }

  // — combined markets: "Away or Over 2.5", "Home & Over 2.5", "Home/Away and Over 2.5" —
  let joiner = null;
  let parts = null;
  if (/\s+(?:&|and)\s+/.test(pl)) {
    joiner = "and";
    parts = pl.split(/\s+(?:&|and)\s+/);
  } else if (/\s+or\s+/.test(pl) && /\b(?:over|under|o|u)\s*\.?\s*\d/.test(pl) && !/^(?:home|away|draw)\s+or\s+(?:home|away|draw)$/.test(pl)) {
    // an OR combo only when a totals component is present — plain "home or draw" is double chance
    joiner = "or";
    parts = pl.split(/\s+or\s+/);
  }
  if (parts && parts.length >= 2) {
    const comps = parts.map((p) => normalizeSportyBetMarket(market, p));
    if (comps.every(Boolean)) {
      return {
        engineKey: "", canonical: "COMBINED", family: "combined",
        settleable: comps.every((c) => c.settleable), joiner, components: comps,
        note: comps.every((c) => c.settleable) ? "" : "a component cannot be graded from FT goals",
      };
    }
    return { engineKey: "", canonical: "COMBINED", family: "combined", settleable: false, joiner, components: comps, note: "a component could not be normalized" };
  }

  // — BTTS —
  if (/both teams|btts|\bgg\b/.test(market)) {
    if (/^(yes|y|gg)\b/.test(pl)) return { engineKey: "BTTS_Y", canonical: "BTTS_YES", family: "btts", settleable: true, note: "" };
    if (/^(no|n|ng)\b/.test(pl)) return { engineKey: "BTTS_N", canonical: "BTTS_NO", family: "btts", settleable: true, note: "" };
    return { engineKey: "", canonical: "BTTS", family: "btts", settleable: false, note: "yes/no not stated" };
  }

  // — team totals: "Home Over 0.5", "Away Under 1.5" —
  const tt = /^(home|away|1|2)\s+(?:team\s+)?(?:goals?\s*)?(over|under|o|u)\s*\.?\s*(\d+(?:\.\d+)?)$/.exec(pl);
  if (tt) {
    if (/\.(25|75)$/.test(tt[3])) return { engineKey: "", canonical: "TEAM_TOTALS", family: "team goals", settleable: false, note: "quarter line — split-stake settlement, not auto-graded" };
    const side = /^(home|1)$/.test(tt[1]) ? "H" : "A";
    const kind = tt[2][0] === "u" ? "U" : "O";
    return {
      engineKey: `T${side}${kind}${tt[3]}`,
      canonical: `TEAM_TOTALS_${side === "H" ? "HOME" : "AWAY"}_${kind === "U" ? "UNDER" : "OVER"}_${tt[3].replace(".", "_")}`,
      family: "team goals", settleable: true, note: "",
    };
  }
  if (/team (goals?|totals?)/.test(market)) {
    const g = /^(?:over|under|o|u)\s*\.?\s*(\d+(?:\.\d+)?)$/.exec(pl);
    if (g) return { engineKey: "", canonical: "TEAM_TOTALS", family: "team goals", settleable: false, note: "team side not stated — goals cannot be attributed" };
  }

  // — match totals: "Over 2.5", "Under 3", "O2.5 goals" —
  const tot = /^(?:goals?\s*)?(over|under|o|u)\s*\.?\s*(\d+(?:\.\d+)?)\s*(?:goals?)?$/.exec(pl);
  if (tot) {
    if (/\.(25|75)$/.test(tot[2])) return { engineKey: "", canonical: "TOTALS", family: "over/under", settleable: false, note: "quarter line — split-stake settlement, not auto-graded" };
    const kind = tot[1][0] === "u" ? "U" : "O";
    return {
      engineKey: `${kind}${tot[2]}`,
      canonical: `${kind === "U" ? "UNDER" : "OVER"}_${tot[2].replace(".", "_")}`,
      family: "over/under", settleable: true, note: "",
    };
  }

  // — Asian handicap: "Home -1.5", "Away +2", "Home ( -1 ) Goals" —
  const ah = /^(home|away|1|2)?\s*\(?\s*([+-]?\d+(?:\.\d+)?)\s*\)?\s*(?:goals?|g)?$/.exec(pl);
  if (ah && (ah[1] || /asian|handicap|\bah\b/.test(market))) {
    if (!ah[1]) return { engineKey: "", canonical: "ASIAN_HANDICAP", family: "asian handicap", settleable: false, note: "side not stated" };
    if (/\.(25|75)$/.test(ah[2])) return { engineKey: "", canonical: "ASIAN_HANDICAP", family: "asian handicap", settleable: false, note: "quarter line — split-stake settlement, not auto-graded" };
    const side = /^(home|1)$/.test(ah[1]) ? "1" : "2";
    if (Number(ah[2]) === 0) {
      return { engineKey: `DNB${side}`, canonical: side === "1" ? "DRAW_NO_BET_HOME" : "DRAW_NO_BET_AWAY", family: "draw no bet", settleable: true, note: "AH 0 = draw no bet" };
    }
    return {
      engineKey: `AH${side}:${ah[2]}`,
      canonical: `ASIAN_HANDICAP_${side === "1" ? "HOME" : "AWAY"}_${ah[2].replace("-", "NEG ").replace("+", "POS ")}`,
      family: "asian handicap", settleable: true, note: "",
    };
  }

  // — Draw No Bet —
  if (/dnb|draw no bet/.test(market) || /draw no bet/.test(pl)) {
    const side = /\b(away|2)\b/.test(pl) && !/\bhome\b/.test(pl) ? "2" : (/\b(home|1)\b/.test(pl) ? "1" : "");
    if (side) return { engineKey: `DNB${side}`, canonical: side === "1" ? "DRAW_NO_BET_HOME" : "DRAW_NO_BET_AWAY", family: "draw no bet", settleable: true, note: "" };
    return { engineKey: "", canonical: "DNB", family: "draw no bet", settleable: false, note: "side not stated" };
  }

  // — Double chance (incl. "Home/Away" slash forms) —
  if (/^(?:1x|home\s*(?:or|\/)\s*draw|draw\s*(?:or|\/)\s*home)$/.test(pl)) return { engineKey: "1X", canonical: "DOUBLE_CHANCE_HOME_DRAW", family: "double chance", settleable: true, note: "" };
  if (/^(?:x2|draw\s*(?:or|\/)\s*away|away\s*(?:or|\/)\s*draw)$/.test(pl)) return { engineKey: "X2", canonical: "DOUBLE_CHANCE_DRAW_AWAY", family: "double chance", settleable: true, note: "" };
  if (/^(?:12|home\s*(?:or|\/)\s*away|away\s*(?:or|\/)\s*home)$/.test(pl)) return { engineKey: "12", canonical: "DOUBLE_CHANCE_HOME_AWAY", family: "double chance", settleable: true, note: "" };

  // — 1X2 —
  if (/^(?:home(?: win)?|1)$/.test(pl)) return { engineKey: "1", canonical: "MATCH_WIN_HOME", family: "1x2", settleable: true, note: "" };
  if (/^(?:away(?: win)?|2)$/.test(pl)) return { engineKey: "2", canonical: "MATCH_WIN_AWAY", family: "1x2", settleable: true, note: "" };
  if (/^(?:draw|x)$/.test(pl)) return { engineKey: "X", canonical: "MATCH_WIN_DRAW", family: "1x2", settleable: true, note: "" };

  // — Asian handicap market stated but line unparseable —
  if (/asian|handicap|\bah\b/.test(market)) {
    return { engineKey: "", canonical: "ASIAN_HANDICAP", family: "asian handicap", settleable: false, note: "handicap line could not be parsed" };
  }
  return null;
}

// Canonical settlement from the FT score under the market's official rule.
// → "won" | "lost" | "push" | null (cannot be graded — never guessed).
export function settleSportyBetPick(normMarket, homeGoals, awayGoals) {
  const n = normMarket;
  if (!n || !n.settleable) return null;
  const h = Number(homeGoals);
  const a = Number(awayGoals);
  if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0) return null;

  if (n.family === "combined") {
    const outcomes = n.components.map((c) => settleSportyBetPick(c, h, a));
    if (outcomes.some((o) => o == null)) return null;
    if (n.joiner === "or") {
      if (outcomes.includes("won")) return "won";
      if (outcomes.every((o) => o === "lost")) return "lost";
      return "push";
    }
    if (outcomes.includes("lost")) return "lost";
    if (outcomes.every((o) => o === "won")) return "won";
    return "push";
  }

  const k = n.engineKey;
  const tot = /^([OU])(\d+(?:\.\d+)?)$/.exec(k);
  if (tot) {
    const t = h + a;
    const line = Number(tot[2]);
    if (tot[1] === "O") return t > line ? "won" : t === line ? "push" : "lost";
    return t < line ? "won" : t === line ? "push" : "lost";
  }
  const tt = /^T([HA])([OU])(\d+(?:\.\d+)?)$/.exec(k);
  if (tt) {
    const goals = tt[1] === "H" ? h : a;
    const line = Number(tt[3]);
    if (tt[2] === "O") return goals > line ? "won" : goals === line ? "push" : "lost";
    return goals < line ? "won" : goals === line ? "push" : "lost";
  }
  const ah = /^AH([12]):([+-]?[\d.]+)$/.exec(k);
  if (ah) {
    const line = Number(ah[2]);
    const margin = ah[1] === "1" ? h + line - a : a + line - h;
    return margin > 0 ? "won" : margin === 0 ? "push" : "lost";
  }
  switch (k) {
    case "1": return h > a ? "won" : "lost";
    case "X": return h === a ? "won" : "lost";
    case "2": return h < a ? "won" : "lost";
    case "1X": return h >= a ? "won" : "lost";
    case "X2": return h <= a ? "won" : "lost";
    case "12": return h !== a ? "won" : "lost";
    case "DNB1": return h === a ? "push" : h > a ? "won" : "lost";
    case "DNB2": return h === a ? "push" : h < a ? "won" : "lost";
    case "BTTS_Y": return h > 0 && a > 0 ? "won" : "lost";
    case "BTTS_N": return h === 0 || a === 0 ? "won" : "lost";
    default: return null;
  }
}

// Historical odds-band buckets for segmented odds-band learning.
export const ODDS_BANDS = [
  ["<1.10", 0, 1.1],
  ["1.10–1.19", 1.1, 1.2],
  ["1.20–1.29", 1.2, 1.3],
  ["1.30–1.39", 1.3, 1.4],
  ["1.40–1.49", 1.4, 1.5],
  ["1.50–1.59", 1.5, 1.6],
  ["1.60–1.79", 1.6, 1.8],
  ["1.80–1.99", 1.8, 2.0],
  ["2.00–2.49", 2.0, 2.5],
  ["2.50–2.99", 2.5, 3.0],
  ["3.00+", 3.0, Infinity],
];

export function oddsBandOf(odds) {
  const o = Number(odds) || 0;
  const b = ODDS_BANDS.find(([, lo, hi]) => o >= lo && o < hi);
  return b ? b[0] : "";
}