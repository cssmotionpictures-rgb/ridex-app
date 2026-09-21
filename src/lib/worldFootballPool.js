import { apiFootball } from "@/lib/apiFootball";
import { formOf, scrutinizedMarkets, h2hLabel } from "@/lib/slipPool";

// WORLDWIDE LEAGUE POOL — every competition the openfootball season files
// don't carry, scanned through API-FOOTBALL (keyed server-side, chunk-cached,
// never exposed to the browser). The SAME scrutiny as every other pool:
// verified recency-weighted form on BOTH sides from REAL final scores, the
// head-to-head contradiction gate, and the scrutinized 1X2 / totals / BTTS
// markets computed from the exact same core the openfootball pools use.
//
// Honest by construction: a league whose window the API plan doesn't cover
// (or that has no verified data) simply contributes NOTHING — the slips are
// never padded with a guess. Empty is honest; fake never is.

export const WORLD_LEAGUES = [
  { id: 71, label: "Serie A (Brazil)" },
  { id: 128, label: "Liga Profesional (Argentina)" },
  { id: 253, label: "Major League Soccer" },
  { id: 262, label: "Liga MX (Mexico)" },
  { id: 98, label: "J1 League (Japan)" },
  { id: 292, label: "K League 1 (South Korea)" },
  { id: 307, label: "Saudi Pro League" },
  { id: 183, label: "A-League (Australia)" },
  { id: 113, label: "Allsvenskan (Sweden)" },
  { id: 103, label: "Eliteserien (Norway)" },
  { id: 119, label: "Superliga (Denmark)" },
  { id: 218, label: "Austrian Bundesliga" },
  { id: 195, label: "Swiss Super League" },
  { id: 106, label: "Ekstraklasa (Poland)" },
  { id: 233, label: "Egyptian Premier League" },
  { id: 288, label: "South Africa PSL" },
  { id: 169, label: "Chinese Super League" },
];

// Season year the providers key on — European Aug–May leagues use the year
// the season STARTS. Leagues the plan/season doesn't serve no-op safely.
const now = new Date();
export const WORLD_SEASON = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

const FORM_WINDOW_DAYS = 45;
const FIXTURE_WINDOW_DAYS = 7;

// api-football fixture → openfootball match shape, so the SAME scrutiny core
// (formOf / h2h / scrutinizedMarkets) runs over both pools without forks.
function toMatch(f) {
  if (!f?.fixture?.date || !f?.teams?.home?.name || !f?.teams?.away?.name) return null;
  const gh = f.goals?.home;
  const ga = f.goals?.away;
  return {
    date: String(f.fixture.date).slice(0, 10),
    kickoff: f.fixture.date, // REAL provider kickoff timestamp (session split uses it, never a guess)
    team1: f.teams.home.name,
    team2: f.teams.away.name,
    score: gh != null && ga != null ? { ft: [Number(gh), Number(ga)] } : null,
  };
}

let cache = { date: "", promise: null };

// One scan per day (the deal is day-keyed anyway): every worldwide league's
// upcoming fixtures with verified form on both sides, in market-pool shape
// so the exclusive week deal deals them like any other game.
export function buildWorldPool(force = false) {
  const today = new Date().toISOString().slice(0, 10);
  if (!force && cache.promise && cache.date === today) return cache.promise;
  cache = {
    date: today,
    promise: (async () => {
      const from = new Date(Date.now() - FORM_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + FIXTURE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
      const results = await Promise.all(
        WORLD_LEAGUES.map(async (lg) => {
          try {
            const data = await apiFootball("fixtures", {
              league: String(lg.id),
              season: String(WORLD_SEASON),
              from,
              to,
              timezone: "UTC",
            });
            const fixtures = (data && data.response) || [];
            if (!fixtures.length) return [];
            const matches = fixtures.map(toMatch).filter(Boolean);
            const played = matches.filter((m) => m.score?.ft);
            const upcoming = matches.filter((m) => !m.score?.ft && m.date >= today);
            if (!upcoming.length) return [];
            const teams = new Set(upcoming.flatMap((m) => [m.team1, m.team2]));
            const forms = {};
            teams.forEach((t) => {
              forms[t] = formOf(played, t);
            });
            const out = [];
            upcoming.forEach((m, i) => {
              const hf = forms[m.team1];
              const af = forms[m.team2];
              if (!hf || !af) return; // scrutiny: no verified form on both sides, no pick — ever
              const mk = scrutinizedMarkets(m.team1, m.team2, hf, af, played);
              out.push({
                reals: mk.reals,
                exp: mk.exp,
                kickoff: m.kickoff || null,
                confirmed: false,
                fixtureId: `world-${lg.id}-${m.date}-${i}`,
                date: m.date,
                timestamp: `${m.date}T12:00:00Z`,
                home: m.team1,
                away: m.team2,
                league: lg.label,
                srcText: "verified worldwide pool (API-FOOTBALL)",
                h2h: h2hLabel(m.team1, m.team2, mk.h2h),
                h2hGoals: mk.h2hGoals,
                rates: mk.rates,
                sugar: mk.sugar,
                seven: mk.seven,
                risky: mk.risky,
              });
            });
            return out;
          } catch {
            return []; // league unavailable (quota/plan/network) — never guessed in
          }
        })
      );
      return results.flat();
    })().catch(() => []),
  };
  return cache.promise;
}