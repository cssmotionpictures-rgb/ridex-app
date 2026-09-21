// VERIFIED EXPECTED-GOALS (xG) ENRICHMENT — the research layer that deepens
// the injury/lineup intelligence with real expected-goals form. Source: the
// public Understat xG feed through the app's own zero-credit proxy
// (base44/functions/understat-xg — no API key, no quota, cached 24h
// server-side; the provider plan's "last fixtures" restriction does not apply).
// NOTHING is fabricated: a competition the source does not cover is
// UNAVAILABLE, an unmatched team is UNMATCHED never "zero xG", and AMBIGUOUS
// name matches are rejected — a name is never force-fit onto the wrong club.
//
// The xG layer is RECORDED AS A RESEARCH ABLATION ONLY (see rx21Core): it
// never changes a recorded challenger probability; it becomes a real voter
// only after out-of-sample validation promotes it.
import { base44 } from "@/api/base44Client";
import { teamNameMatches } from "./rx21Core";

export const XG_MAX_FIXTURES_PER_SCAN = 3;
export const XG_KICKOFF_WINDOW_H = 48; // only near candidates are ever enriched

// openfootball league code → the xG source's competition slug
export const XG_LEAGUE_SLUGS = {
  "en.1": "EPL",
  "es.1": "La_Liga",
  "de.1": "Bundesliga",
  "it.1": "Serie_A",
  "fr.1": "Ligue_1",
  "nl.1": "Eredivisie",
  "pt.1": "Primeira",
  "ru.1": "RFPL",
  "en.2": "Championship",
  "es.2": "Segunda",
};

const HOUR = 3600000;
const leagueCache = new Map(); // slug|season → { at, teams }

// Pure — match one team name onto the source's team list. 0 or AMBIGUOUS
// matches return null — never guessed.
export function matchXgTeam(teams, name) {
  const hits = (teams || []).filter((t) => teamNameMatches(name, t?.name));
  return hits.length === 1 ? hits[0] : null;
}

// European league season = the calendar year it starts (Aug Y → May Y+1).
export function xgSeasonOf(kickoffIso) {
  const d = new Date(kickoffIso);
  const y = Number.isFinite(d?.getTime?.()) ? d.getUTCFullYear() : new Date().getUTCFullYear();
  return d.getUTCMonth() + 1 >= 7 ? y : y - 1;
}

async function leagueXgTeams(slug, season) {
  const key = `${slug}|${season}`;
  const hit = leagueCache.get(key);
  if (hit && Date.now() - hit.at < (hit.teams?.length ? 12 * HOUR : 30 * 60e3)) return hit.teams;
  let teams = null;
  try {
    const res = await base44.functions.invoke("understat-xg", { league: slug, season });
    const data = res?.data ?? res;
    teams = Array.isArray(data?.data?.teams)
      ? data.data.teams
      : Array.isArray(data?.teams)
        ? data.teams
        : null;
  } catch {
    teams = null; // feed down — honestly unavailable
  }
  leagueCache.set(key, { at: Date.now(), teams });
  return teams;
}

// Full verified xG intelligence for one fixture. status:
//  matched — both sides matched with sufficient verified xG form
//  unmatched — a side is not on the source's team list for this competition
//  unavailable — the competition is not covered, or the feed is down/empty
export async function fixtureXgIntel(leagueCode, kickoffIso, home, away) {
  const slug = XG_LEAGUE_SLUGS[String(leagueCode || "")];
  if (!slug) return { status: "unavailable", reason: "no verified xG source covers this competition" };
  const teams = await leagueXgTeams(slug, xgSeasonOf(kickoffIso));
  if (!teams || !teams.length) return { status: "unavailable", reason: "xG feed unavailable" };
  const h = matchXgTeam(teams, home);
  const a = matchXgTeam(teams, away);
  if (!h || !a) return { status: "unmatched" };
  return {
    status: "matched",
    home: { xgFor: h.xgFor, xgAgainst: h.xgAgainst, matches: h.matches },
    away: { xgFor: a.xgFor, xgAgainst: a.xgAgainst, matches: a.matches },
    fetchedAt: new Date().toISOString(),
  };
}