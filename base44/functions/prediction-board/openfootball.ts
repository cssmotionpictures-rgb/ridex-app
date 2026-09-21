// openfootball.ts — server-side football data layer. Season fixtures AND
// played results from the openfootball open-data repository via jsDelivr
// (keyless, credit-free, reachable from the app's server environment).
// The league table, form, momentum and head-to-head are all COMPUTED from
// real match results — never invented, never hardcoded.

const CDN = "https://cdn.jsdelivr.net/gh/openfootball/football.json@master";

// Competition registry. Files that don't exist for a season simply return
// null and the league is skipped — coverage is always what the provider
// actually supplies. offset = the league country's UTC offset (hours).
export const LEAGUES = [
  { code: "en.1", name: "Premier League", country: "England", tier: 1, offset: 1 },
  { code: "en.2", name: "Championship", country: "England", tier: 2, offset: 1 },
  { code: "en.3", name: "League One", country: "England", tier: 2, offset: 1 },
  { code: "en.4", name: "League Two", country: "England", tier: 2, offset: 1 },
  { code: "en.5", name: "National League", country: "England", tier: 3, offset: 1 },
  { code: "es.1", name: "La Liga", country: "Spain", tier: 1, offset: 2 },
  { code: "es.2", name: "La Liga 2", country: "Spain", tier: 2, offset: 2 },
  { code: "it.1", name: "Serie A", country: "Italy", tier: 1, offset: 2 },
  { code: "it.2", name: "Serie B", country: "Italy", tier: 2, offset: 2 },
  { code: "de.1", name: "Bundesliga", country: "Germany", tier: 1, offset: 2 },
  { code: "de.2", name: "2. Bundesliga", country: "Germany", tier: 2, offset: 2 },
  { code: "fr.1", name: "Ligue 1", country: "France", tier: 1, offset: 2 },
  { code: "fr.2", name: "Ligue 2", country: "France", tier: 2, offset: 2 },
  { code: "nl.1", name: "Eredivisie", country: "Netherlands", tier: 1, offset: 2 },
  { code: "nl.2", name: "Eerste Divisie", country: "Netherlands", tier: 2, offset: 2 },
  { code: "pt.1", name: "Primeira Liga", country: "Portugal", tier: 1, offset: 1 },
  { code: "be.1", name: "Belgian Pro League", country: "Belgium", tier: 1, offset: 2 },
  { code: "at.1", name: "Austrian Bundesliga", country: "Austria", tier: 2, offset: 2 },
  { code: "ch.1", name: "Swiss Super League", country: "Switzerland", tier: 2, offset: 2 },
  { code: "gr.1", name: "Super League Greece", country: "Greece", tier: 2, offset: 3 },
  { code: "dk.1", name: "Danish Superliga", country: "Denmark", tier: 2, offset: 2 },
  { code: "no.1", name: "Eliteserien", country: "Norway", tier: 2, offset: 2 },
  { code: "se.1", name: "Allsvenskan", country: "Sweden", tier: 2, offset: 2 },
  { code: "pl.1", name: "Ekstraklasa", country: "Poland", tier: 2, offset: 2 },
  { code: "ru.1", name: "Russian Premier League", country: "Russia", tier: 2, offset: 3 },
  { code: "ua.1", name: "Ukrainian Premier League", country: "Ukraine", tier: 2, offset: 3 },
  { code: "ro.1", name: "Liga I", country: "Romania", tier: 2, offset: 3 },
  { code: "sc.1", name: "Scottish Premiership", country: "Scotland", tier: 2, offset: 1 },
  { code: "tr.1", name: "Turkish Super Lig", country: "Turkey", tier: 1, offset: 3 },
];

export function leagueReliability(tier) {
  return tier === 1 ? 1 : tier === 2 ? 0.7 : 0.4;
}

// openfootball season dirs run Aug–May: from July on, the new season applies.
export function currentSeasonYear(now) {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function seasonDir(sy) {
  return `${sy}-${String(sy + 1).slice(-2)}`;
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function cacheGet(base44, cacheKey) {
  try {
    const rows = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: cacheKey }, "-updated_date", 1);
    const row = rows && rows[0];
    if (!row) return null;
    const ts = new Date(row.updated_date || row.created_date).getTime() || 0;
    return { id: row.id, payload: row.payload, ts };
  } catch {
    return null;
  }
}

export async function cachePut(base44, cacheKey, endpoint, payloadStr, existingId) {
  try {
    let id = existingId || null;
    if (!id) {
      const rows = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: cacheKey }, "-updated_date", 1);
      id = rows && rows[0]?.id;
    }
    if (id) {
      await base44.asServiceRole.entities.ApiFootballCache.update(id, { payload: payloadStr });
    } else {
      await base44.asServiceRole.entities.ApiFootballCache.create({ cache_key: cacheKey, endpoint, payload: payloadStr });
    }
  } catch (e) {
    console.error("cache write failed:", e?.message || e);
  }
}

function trimMatches(j) {
  const out = [];
  for (const m of (j?.matches || [])) {
    const t1 = typeof m.team1 === "string" ? m.team1 : m.team1?.name || "";
    const t2 = typeof m.team2 === "string" ? m.team2 : m.team2?.name || "";
    if (!t1 || !t2 || !m.date) continue;
    const ft = m.score && Array.isArray(m.score.ft) ? m.score.ft : null;
    out.push({
      date: m.date,
      time: m.time || "",
      team1: t1,
      team2: t2,
      hs: ft ? Number(ft[0]) : null,
      as: ft ? Number(ft[1]) : null,
      played: ft != null,
    });
  }
  return out;
}

// One league-season of fixtures + results. Current season cached 3h (results
// stream in as matches finish); finished seasons cached 30 days. Full seasons
// (up to 552 matches ≈ 60KB) exceed the per-field size cap, so the match list
// is stored in CHUNKS — one small row per 120 matches plus a meta row with the
// chunk count.
const SEASON_CHUNK = 120;

async function readSeasonChunks(base44, key) {
  try {
    const metaHit = await cacheGet(base44, `${key}:meta`);
    if (!metaHit) return null;
    const meta = JSON.parse(metaHit.payload);
    const matches = [];
    for (let i = 0; i < (meta.n || 0) && i < 40; i++) {
      const c = await cacheGet(base44, `${key}:c${i}`);
      if (!c) return null; // incomplete season — treat as no cache
      matches.push(...JSON.parse(c.payload));
    }
    return { matches, ts: metaHit.ts };
  } catch {
    return null;
  }
}

export async function fetchSeason(base44, code, seasonYear, isCurrent) {
  const key = `of:season:${code}:${seasonYear}`;
  const ttl = isCurrent ? 3 * 3600 : 30 * 86400;
  const cached = await readSeasonChunks(base44, key);
  if (cached && cached.matches.length && (Date.now() - cached.ts) / 1000 < ttl) return cached.matches;
  const j = await fetchJson(`${CDN}/${seasonDir(seasonYear)}/${code}.json`);
  if (!j || !Array.isArray(j.matches) || !j.matches.length) {
    if (cached && cached.matches.length) return cached.matches; // stale serve beats fake data
    return null;
  }
  const matches = trimMatches(j);
  const n = Math.max(1, Math.ceil(matches.length / SEASON_CHUNK));
  await cachePut(base44, `${key}:meta`, "openfootball", JSON.stringify({ n }), null);
  for (let i = 0; i < n; i++) {
    const slice = matches.slice(i * SEASON_CHUNK, (i + 1) * SEASON_CHUNK);
    await cachePut(base44, `${key}:c${i}`, "openfootball", JSON.stringify(slice), null);
  }
  return matches;
}

// Compute the full league table, per-team game logs and league goal average
// from real played results.
export function deriveSeason(matches) {
  const table = {};
  const games = {};
  let gfSum = 0;
  let gp = 0;
  const ensure = (name) => {
    if (!table[name]) {
      table[name] = { name, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, home: { gp: 0, gf: 0, ga: 0 }, away: { gp: 0, gf: 0, ga: 0 }, rank: 0, form: "" };
    }
    return table[name];
  };
  for (const m of (matches || [])) {
    if (!m.played || m.hs == null || m.as == null) continue;
    const h = ensure(m.team1);
    const a = ensure(m.team2);
    h.gp++; a.gp++;
    h.gf += m.hs; h.ga += m.as; a.gf += m.as; a.ga += m.hs;
    h.home.gp++; h.home.gf += m.hs; h.home.ga += m.as;
    a.away.gp++; a.away.gf += m.as; a.away.ga += m.hs;
    if (m.hs > m.as) { h.w++; a.l++; }
    else if (m.hs < m.as) { a.w++; h.l++; }
    else { h.d++; a.d++; }
    (games[m.team1] ||= []).push({ date: m.date, opp: m.team2, gf: m.hs, ga: m.as });
    (games[m.team2] ||= []).push({ date: m.date, opp: m.team1, gf: m.as, ga: m.hs });
    gfSum += m.hs + m.as;
    gp++;
  }
  for (const t of Object.values(table)) {
    const g = (games[t.name] || []).sort((x, y) => (x.date < y.date ? -1 : 1));
    t.form = g.slice(-5).map((x) => (x.gf > x.ga ? "W" : x.gf === x.ga ? "D" : "L")).join("");
  }
  const pts = (t) => t.w * 3 + t.d;
  const gd = (t) => t.gf - t.ga;
  const ranked = Object.values(table).sort((x, y) => (pts(y) - pts(x)) || (gd(y) - gd(x)) || (y.gf - x.gf));
  ranked.forEach((t, i) => { t.rank = i + 1; });
  return { table, games, lgGpg: gp > 0 ? gfSum / gp : 2.7 };
}