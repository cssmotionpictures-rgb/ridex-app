import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// OPENLIGADB PROXY — the OFFICIAL German league feed (Bundesliga, 2.
// Bundesliga, 3. Liga), a keyless public API proxied server-side for CORS.
// Returns each requested league-season's full match archive normalized to
// the engine's shape: date (UTC), home, away, and the REAL final score for
// finished games. Upcoming matches are CONFIRMED scheduled fixtures carried
// by the league's own feed. This function NEVER generates, projects or
// estimates anything — only data the official feed actually carries.

const LEAGUES = ['bl1', 'bl2', 'bl3'];

// Final result = the league's own "Endergebnis" (resultTypeID 2). Never
// derived from the goal list, never guessed.
function finalScore(match) {
  const rs = Array.isArray(match.matchResults) ? match.matchResults : [];
  const fin = rs.find((r) => r.resultTypeID === 2) || rs.find((r) => /endergebnis/i.test(String(r.resultName || '')));
  if (fin && Number.isFinite(fin.pointsTeam1) && Number.isFinite(fin.pointsTeam2)) {
    return [fin.pointsTeam1, fin.pointsTeam2];
  }
  return null;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try {
      body = await req.json();
    } catch {}

    const thisYear = new Date().getUTCFullYear();
    const leagues = (Array.isArray(body.leagues) && body.leagues.length ? body.leagues : LEAGUES)
      .map(String)
      .filter((l) => /^bl[123]$/.test(l));
    const seasons = (Array.isArray(body.seasons) && body.seasons.length ? body.seasons : [thisYear])
      .map(Number)
      .filter((s) => Number.isInteger(s) && s >= 2010 && s <= thisYear + 1)
      .slice(0, 4);

    const results = await Promise.all(leagues.map(async (league) => {
      const bySeason = await Promise.all(seasons.map(async (season) => {
        try {
          const r = await fetch(`https://api.openligadb.de/getmatchdata/${league}/${season}`, {
            headers: { accept: 'application/json' },
          });
          if (!r.ok) return { season, status: 'error', reason: `provider ${r.status}` };
          const raw = await r.json();
          const matches = (Array.isArray(raw) ? raw : [])
            .map((m) => {
              const date = String(m.matchDateTimeUTC || m.matchDateTime || '').slice(0, 10);
              const home = (m.team1 && (m.team1.teamName || m.team1.shortName)) || '';
              const away = (m.team2 && (m.team2.teamName || m.team2.shortName)) || '';
              const ft = m.matchIsFinished === true ? finalScore(m) : null;
              return { id: String(m.matchID ?? ''), date, home, away, ft };
            })
            .filter((x) => x.date && x.home && x.away);
          return { season, status: 'ok', matches };
        } catch {
          return { season, status: 'error', reason: 'provider unreachable' };
        }
      }));
      return { league, seasons: bySeason };
    }));

    return Response.json({ status: 'ok', provider: 'OpenLigaDB', results });
  } catch (error) {
    return Response.json({ error: error.message, status: 'error' }, { status: 500 });
  }
}