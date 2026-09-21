// CANONICAL MARKET REGISTRY — one internal market ID per bettable meaning.
// Different provider naming conventions (The Odds API 'h2h', 'totals', 'btts',
// engine keys '1'/'O2.5'/'BTTS_Y'…) all map to the SAME canonical ID, and
// incompatible markets are never compared against each other.
// Every canonical market carries its own SETTLEMENT RULE — settlement is
// never generic final-score logic; it follows the market's official
// settlement period (90 minutes unless the provider explicitly defines
// otherwise).

export const SETTLEMENT_RULES = {
  FULL_TIME_90: "FULL_TIME_90 — graded on the 90-minute result only; extra time and shootouts never count",
  TOTALS_FT90: "TOTALS_FT90 — goals within the market's official settlement period (90 minutes)",
  BTTS_FT90: "BTTS_FT90 — both teams score at least once within 90 minutes per market rules",
  DNB_FT90: "DNB_FT90 — draw no bet: a 90-minute draw Voids the selection (stakes returned)",
};

// settle(homeGoals, awayGoals) → true (won) | false (lost) | null (void)
const lineOf = (key) => {
  const m = /^[OU]([\d.]+)$/.exec(key);
  return m ? Number(m[1]) : null;
};

const totalGoals = (h, a) => h + a;

export function settleCanonical(engineKey, homeGoals, awayGoals) {
  const h = Number(homeGoals);
  const a = Number(awayGoals);
  if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0) return undefined; // invalid score — never settles
  const line = lineOf(engineKey);
  switch (true) {
    case engineKey === "1": return h > a;
    case engineKey === "X": return h === a;
    case engineKey === "2": return h < a;
    case engineKey === "1X": return h >= a;
    case engineKey === "X2": return h <= a;
    case engineKey === "12": return h !== a;
    case engineKey === "DNB1": return h === a ? null : h > a;
    case engineKey === "DNB2": return h === a ? null : h < a;
    case /^O/.test(engineKey): return totalGoals(h, a) > line;
    case /^U/.test(engineKey): return totalGoals(h, a) < line;
    case engineKey === "BTTS_Y": return h > 0 && a > 0;
    case engineKey === "BTTS_N": return h === 0 || a === 0;
    default: return undefined; // unknown market — never settled by generic logic
  }
}

// Engine market key → canonical internal ID + settlement rule.
export function canonicalOf(engineKey) {
  const line = lineOf(engineKey);
  const map = {
    "1": ["MATCH_WIN_HOME", SETTLEMENT_RULES.FULL_TIME_90],
    X: ["MATCH_WIN_DRAW", SETTLEMENT_RULES.FULL_TIME_90],
    "2": ["MATCH_WIN_AWAY", SETTLEMENT_RULES.FULL_TIME_90],
    "1X": ["DOUBLE_CHANCE_HOME_DRAW", SETTLEMENT_RULES.FULL_TIME_90],
    X2: ["DOUBLE_CHANCE_DRAW_AWAY", SETTLEMENT_RULES.FULL_TIME_90],
    "12": ["DOUBLE_CHANCE_HOME_AWAY", SETTLEMENT_RULES.FULL_TIME_90],
    DNB1: ["DRAW_NO_BET_HOME", SETTLEMENT_RULES.DNB_FT90],
    DNB2: ["DRAW_NO_BET_AWAY", SETTLEMENT_RULES.DNB_FT90],
    BTTS_Y: ["BTTS_YES", SETTLEMENT_RULES.BTTS_FT90],
    BTTS_N: ["BTTS_NO", SETTLEMENT_RULES.BTTS_FT90],
  };
  if (map[engineKey]) return { id: map[engineKey][0], rule: map[engineKey][1] };
  if (/^O/.test(engineKey)) return { id: `OVER_${String(line).replace(".", "_")}`, rule: SETTLEMENT_RULES.TOTALS_FT90 };
  if (/^U/.test(engineKey)) return { id: `UNDER_${String(line).replace(".", "_")}`, rule: SETTLEMENT_RULES.TOTALS_FT90 };
  return { id: "", rule: "" };
}

// TEAM ID REGISTRY — canonical internal team identity. With a single verified
// fixture feed the canonical ID is the feed's fixture/team key; the alias map
// below records every provider-side name variant seen during odds matching so
// that when a SECOND provider is introduced, teams are joined by registry
// entry, never by string name alone. Ambiguous matches (one internal team
// matching two provider teams or vice versa) are DATA CONFLICTS — the
// candidate is rejected, never silently resolved.
export function canonicalTeamId(teamName, leagueCode) {
  return `tm:${leagueCode || "x"}:${String(teamName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}