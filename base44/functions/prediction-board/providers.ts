// providers.ts — multi-provider football data layer for the model engine.
// Independent sources (API-Football, Sportmonks, optional Sportradar) with
// server-side credentials, TTL caching, health tracking, team-name
// normalization and cross-provider fixture matching. A provider that fails,
// isn't configured, or lacks coverage contributes NOTHING — data is never
// invented and coverage is never assumed. Keys never leave the server.

import { cacheGet, cachePut } from "./openfootball.ts";
import { SportradarClient, coverageLevel } from "../../shared/sportradarClient.ts";

const env = (k) => (typeof Deno !== "undefined" ? Deno.env.get(k) : undefined);

export const PROVIDER_DEFAULTS = {
  apiFootball: { enabled: true, priority: 1, label: "API-Football" },
  sportmonks: { enabled: true, priority: 2, label: "Sportmonks" },
  sportradar: { enabled: true, priority: 3, label: "Sportradar" },
  openfootball: { enabled: true, priority: 4, label: "openfootball" },
};

// Registry merged from the stored config row (PredictionConfig.provider_registry).
export function providerRegistry(row) {
  const reg = {};
  for (const [k, v] of Object.entries(PROVIDER_DEFAULTS)) reg[k] = { ...v };
  let custom = row?.provider_registry;
  if (typeof custom === "string") {
    try { custom = JSON.parse(custom); } catch { custom = null; }
  }
  if (custom && typeof custom === "object") {
    for (const k of Object.keys(reg)) {
      if (custom[k] && typeof custom[k] === "object" && custom[k].enabled !== undefined) {
        reg[k].enabled = !!custom[k].enabled;
      }
    }
  }
  return reg;
}

// ---------------------------------------------------------------- health ---
const healthKey = (p) => `provider:health:${p}`;

export async function healthGet(base44, p) {
  const hit = await cacheGet(base44, healthKey(p));
  if (!hit) return { status: "UNKNOWN", lastSuccess: null, lastError: null, requestsToday: null };
  try {
    return JSON.parse(hit.payload);
  } catch {
    return { status: "UNKNOWN", lastSuccess: null, lastError: null, requestsToday: null };
  }
}

async function healthPut(base44, p, patch) {
  const hit = await cacheGet(base44, healthKey(p));
  let prev = {};
  if (hit) { try { prev = JSON.parse(hit.payload); } catch { prev = {}; } }
  const today = new Date().toISOString().slice(0, 10);
  const merged = {
    ...prev,
    ...patch,
    day: today,
    requestsToday: prev.day === today ? (prev.requestsToday || 0) + 1 : 1,
    updated: new Date().toISOString(),
  };
  await cachePut(base44, healthKey(p), "provider-health", JSON.stringify(merged), hit ? hit.id : null);
}

// One provider request with timeout + health tracking. 429 → RATE LIMITED,
// 401/403 → AUTH ERROR, other failures → OFFLINE/DEGRADED.
async function fetchJsonHealth(base44, provider, url, headers, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const r = await fetch(url, { headers: headers || {}, signal: ctrl.signal });
    if (r.status === 429) { await healthPut(base44, provider, { status: "RATE LIMITED", lastError: "HTTP 429" }); return null; }
    if (r.status === 401 || r.status === 403) { await healthPut(base44, provider, { status: "AUTH ERROR", lastError: `HTTP ${r.status}` }); return null; }
    if (!r.ok) { await healthPut(base44, provider, { status: "DEGRADED", lastError: `HTTP ${r.status}` }); return null; }
    const j = await r.json();
    await healthPut(base44, provider, { status: "ONLINE", lastSuccess: new Date().toISOString(), lastError: null, lastLatencyMs: Date.now() - started });
    return j;
  } catch (e) {
    await healthPut(base44, provider, { status: "OFFLINE", lastError: String(e?.message || e).slice(0, 160) });
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ------------------------------------------------- team normalization ---
// normalizeTeamName — lowercase, strip diacritics/punctuation and club-suffix
// tokens so "Manchester City FC" and "Manchester City" compare equal.
// Distinctive words (United, City, Athletic…) are KEPT so two different clubs
// never merge.
const normMemo = new Map();
const DROP_TOKENS = new Set([
  "fc", "cf", "afc", "cfc", "sc", "ac", "as", "bk", "sk", "if", "ik", "ff",
  "ab", "club", "team", "calcio", "fbc", "ssc", "acf", "cd", "ud", "the",
]);

export function normalizeTeamName(name) {
  const raw = String(name || "");
  if (normMemo.has(raw)) return normMemo.get(raw);
  let s = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[.'’\-–_/]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = s.split(" ").filter((t) => t && !DROP_TOKENS.has(t));
  const out = (tokens.length ? tokens : s.split(" ")).join(" ");
  normMemo.set(raw, out);
  return out;
}

export function nameTokens(name) {
  const key = `T:${name || ""}`;
  if (normMemo.has(key)) return normMemo.get(key);
  const set = new Set(normalizeTeamName(name).split(" ").filter(Boolean));
  normMemo.set(key, set);
  return set;
}

// Two names match when their normalized token sets are identical, or one is
// a full subset of the other AND they share a distinctive (≥4 chars) token.
export function tokenMatch(sa, sb) {
  if (!sa.size || !sb.size) return false;
  const sub = (x, y) => x.size <= y.size && [...x].every((t) => y.has(t));
  if (sub(sa, sb) || sub(sb, sa)) {
    for (const t of sa) if (t.length >= 4 && sb.has(t)) return true;
  }
  return false;
}

export function teamsMatch(a, b) {
  return tokenMatch(nameTokens(a), nameTokens(b));
}

// ----------------------------------------------------------- API-Football ---
const AF = "apiFootball";

// Shared API-Football fetch with rate-limit + plan-window handling. The
// current plan caps requests per minute — a rate limit marks RATE LIMITED and
// callers short-circuit for 60s instead of hammering the provider. Failures
// are NEVER cached as empty data.
async function afFetch(base44, path) {
  const h = await healthGet(base44, AF);
  if (h?.status === "RATE LIMITED" && h?.updated && Date.now() - Date.parse(h.updated) < 60000) {
    return { shortCircuit: true };
  }
  const k = env("API_FOOTBALL_KEY_V2") || env("API_FOOTBALL_KEY") || env("FOOTBALL_API_KEY");
  if (!k) {
    await healthPut(base44, AF, { status: "AUTH ERROR", lastError: "missing API key" });
    return { shortCircuit: true };
  }
  const j = await fetchJsonHealth(base44, AF, `https://v3.football.api-sports.io${path}`, { "x-apisports-key": k });
  const errs = j?.errors;
  const hasErr = errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length);
  if (j && hasErr) {
    const errObj = Array.isArray(errs) ? { error: errs[0] } : errs;
    const msg = String(Object.values(errObj)[0] || "");
    if ("rateLimit" in errObj || /rate limit/i.test(msg)) {
      await healthPut(base44, AF, { status: "RATE LIMITED", lastError: msg.slice(0, 160) });
      return { shortCircuit: true };
    }
    if (/free plan|your subscription|try from/i.test(msg)) {
      // Plan-window restriction (dates outside the rolling window) — honest
      // empty data for THIS request, cacheable.
      return { j: { response: [] }, planLimited: true };
    }
    await healthPut(base44, AF, { status: "DEGRADED", lastError: msg.slice(0, 160) });
    return { shortCircuit: true };
  }
  return { j };
}

// Cache rows are packed arrays [id, utc, league, country, home, away] —
// the database caps single fields well below the provider's full ~1.5k
// fixture response, so packing keeps a full match day under the cap.
const unpackAf = (r) => Array.isArray(r)
  ? { id: r[0], utc: r[1], league: r[2], country: r[3], home: r[4], away: r[5], coverage: r[6] ?? null }
  : r; // legacy full-object rows

// Keep a fixture when its competition matches one of the engine's scanned
// leagues: same country AND a shared distinctive league-name token. Provider
// league names differ slightly ("Jupiler Pro League" vs "Belgian Pro
// League", "Liga 1" vs "Liga I") — token matching bridges that without
// ever guessing a whole unknown competition in.
function afLeagueWanted(f, wanted) {
  const ft = nameTokens(f.league || "");
  return (wanted || []).some((w) => w.country === (f.country || "") && (
    tokenMatch(ft, w.tokens) || [...ft].some((t) => t.length >= 4 && w.tokens.has(t))
  ));
}

// All fixtures for one date, filtered to the engine's scanned competitions.
// Cached 6h (packed). Rate-limited / degraded responses stale-serve instead
// of poisoning the cache.
export async function afFixturesForDate(base44, dateKey, enabled, wantedLeagues) {
  if (!enabled) return [];
  const key = `af:fixtures:${dateKey}`;
  const hit = await cacheGet(base44, key);
  if (hit && (Date.now() - hit.ts) / 1000 < 6 * 3600) {
    try { return JSON.parse(hit.payload).map(unpackAf); } catch { /* fall through */ }
  }
  const { shortCircuit, j } = await afFetch(base44, `/fixtures?date=${dateKey}`);
  if (shortCircuit) {
    if (hit) { try { return JSON.parse(hit.payload).map(unpackAf); } catch { return []; } }
    return [];
  }
  let fixtures = [];
  if (j && Array.isArray(j.response)) {
    const wanted = (wantedLeagues || []).map((l) => ({ country: l.country, tokens: nameTokens(l.name) }));
    fixtures = j.response
      .map((f) => ({
        id: f.fixture?.id,
        utc: f.fixture?.date,
        league: f.league?.name,
        country: f.league?.country,
        home: f.teams?.home?.name,
        away: f.teams?.away?.name,
      }))
      .filter((x) => x.id && x.utc && x.home && x.away)
      .filter((x) => !wanted.length || afLeagueWanted(x, wanted));
  }
  await cachePut(base44, key, "api-football", JSON.stringify(fixtures.map((x) => [x.id, x.utc, x.league, x.country, x.home, x.away])), hit ? hit.id : null);
  return fixtures;
}

// Real bookmaker odds for one fixture, averaged across bookmakers per market.
// Keys: Home / Draw / Away / O0.5..O3.5 / U0.5..U3.5 / BTTS_Y / BTTS_N.
const AF_BETS = {
  "Match Winner": { Home: "Home", Draw: "Draw", Away: "Away" },
  "Goals Over/Under": {},
  "Both Teams Score": { Yes: "BTTS_Y", No: "BTTS_N" },
};

export async function afOddsForFixture(base44, fixtureId) {
  const key = `af:odds:${fixtureId}`;
  const hit = await cacheGet(base44, key);
  if (hit && (Date.now() - hit.ts) / 1000 < 30 * 60) {
    try { return JSON.parse(hit.payload); } catch { /* fall through */ }
  }
  const { shortCircuit, j } = await afFetch(base44, `/odds?fixture=${fixtureId}`);
  if (shortCircuit) return null;
  const bookmakers = j?.response?.[0]?.bookmakers || [];
  const acc = {};
  let bookmakerCount = 0;
  for (const b of bookmakers) {
    bookmakerCount++;
    for (const bet of b.bets || []) {
      const table = AF_BETS[bet.name];
      if (!table) continue;
      for (const v of bet.values || []) {
        const decimal = Number(v.odd);
        if (!Number.isFinite(decimal) || decimal <= 1) continue;
        let label = table[v.value];
        if (bet.name === "Goals Over/Under" && /^\d\.5$/.test(v.value)) label = v.value.replace("Over ", "O").replace("Under ", "U");
        if (bet.name === "Goals Over/Under" && (v.value.startsWith("Over ") || v.value.startsWith("Under "))) {
          label = v.value.startsWith("Over ") ? `O${v.value.slice(5)}` : `U${v.value.slice(6)}`;
        }
        if (!label) continue;
        (acc[label] ||= []).push(decimal);
      }
    }
  }
  const out = {};
  for (const [label, list] of Object.entries(acc)) out[label] = list.reduce((x, y) => x + y, 0) / list.length;
  if (bookmakerCount > 0) out._bookmakers = bookmakerCount;
  await cachePut(base44, key, "api-football-odds", JSON.stringify(out), hit ? hit.id : null);
  return out;
}

// ---------------------------------------------------------------- Sportmonks ---
const SM = "sportmonks";
const smToken = () => env("SPORTMONKS_API_TOKEN");

function smIso(startingAt) {
  try {
    const ms = Date.parse(String(startingAt).replace(" ", "T") + "Z");
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  } catch {
    return null;
  }
}

// Fixtures for one date from the subscribed competitions. Cached 6h.
export async function smFixturesForDate(base44, dateKey, enabled) {
  if (!enabled) return [];
  const key = `sm:fixtures:${dateKey}`;
  const hit = await cacheGet(base44, key);
  if (hit && (Date.now() - hit.ts) / 1000 < 6 * 3600) {
    try { return JSON.parse(hit.payload); } catch { /* fall through */ }
  }
  const token = smToken();
  if (!token) {
    await healthPut(base44, SM, { status: "AUTH ERROR", lastError: "missing API token" });
    return [];
  }
  const j = await fetchJsonHealth(
    base44, SM,
    `https://api.sportmonks.com/v3/football/fixtures/date/${dateKey}?api_token=${token}&include=league&per_page=100`
  );
  let fixtures = [];
  if (Array.isArray(j?.data)) {
    fixtures = j.data
      .map((f) => {
        const names = String(f.name || "").split(" vs ");
        return {
          id: f.id,
          utc: smIso(f.starting_at),
          league: f.league?.name,
          country: null,
          home: names[0] || null,
          away: names[1] || null,
        };
      })
      .filter((x) => x.id && x.utc && x.home && x.away);
  } else if (j?.error) {
    await healthPut(base44, SM, { status: "DEGRADED", lastError: String(j.error?.message || j.error).slice(0, 160) });
  }
  await cachePut(base44, key, "sportmonks", JSON.stringify(fixtures), hit ? hit.id : null);
  return fixtures;
}

// Real odds for one fixture — 1X2 only (market id 1, labels Home/Draw/Away),
// averaged across bookmakers. Cached 30 min.
export async function smOddsForFixture(base44, fixtureId) {
  const key = `sm:odds:${fixtureId}`;
  const hit = await cacheGet(base44, key);
  if (hit && (Date.now() - hit.ts) / 1000 < 30 * 60) {
    try { return JSON.parse(hit.payload); } catch { /* fall through */ }
  }
  const token = smToken();
  if (!token) return null;
  const j = await fetchJsonHealth(
    base44, SM,
    `https://api.sportmonks.com/v3/football/fixtures/${fixtureId}?api_token=${token}&include=odds`
  );
  const odds = j?.data?.odds || [];
  const acc = {};
  let bookmakerCount = new Set();
  for (const o of odds) {
    if (o.market_id !== 1) continue; // 1X2 only — verified mapping, never guessed
    const decimal = Number(o.odd);
    if (!Number.isFinite(decimal) || decimal <= 1) continue;
    if (o.bookmaker_id) bookmakerCount.add(o.bookmaker_id);
    if (!o.label) continue;
    (acc[o.label] ||= []).push(decimal);
  }
  const out = {};
  for (const [label, list] of Object.entries(acc)) out[label] = list.reduce((x, y) => x + y, 0) / list.length;
  if (bookmakerCount.size) out._bookmakers = bookmakerCount.size;
  await cachePut(base44, key, "sportmonks-odds", JSON.stringify(out), hit ? hit.id : null);
  return out;
}

// -------------------------------------------------------------- Sportradar ---
// Soccer API v4 (trial) — premium cross-validation layer. The centralized
// SportradarClient (base44/shared) handles x-api-key auth, the ~1 req/s trial
// rate limit, bounded retries and TTL caching; this adapter maps daily
// schedules into the same fixture shape as the other providers, carrying each
// event's real COVERAGE level. Sportradar supplies DATA, never odds — the
// odds loop skips it. Coverage varies by competition and is never assumed.
export function sportradarReady() {
  return !!env("SPORTRADAR_API_KEY");
}

let srClientSingleton = null;
function srClient() {
  if (!srClientSingleton) srClientSingleton = new SportradarClient();
  return srClientSingleton;
}

// League filter: country AND (token match OR shared distinctive token OR
// de-spaced name equality — openfootball "La Liga" vs Sportradar "LaLiga").
// Never guesses an unknown competition in.
function srLeagueWanted(f, wanted) {
  if (!wanted.length) return true;
  const ft = nameTokens(f.league || "");
  const fFlat = normalizeTeamName(f.league || "").replace(/\s+/g, "");
  return wanted.some((w) => w.country === (f.country || "") && (
    tokenMatch(ft, w.tokens) ||
    [...ft].some((t) => t.length >= 4 && w.tokens.has(t)) ||
    w.flat === fFlat
  ));
}

// Fixtures for one date from Sportradar daily schedules, filtered to the
// engine's scanned competitions. Cached 6h (packed rows, coverage included).
// Rate-limited/degraded responses stale-serve instead of poisoning the cache.
export async function srFixturesForDate(base44, dateKey, enabled, wantedLeagues) {
  if (!enabled) return [];
  const key = `sr:fixtures:${dateKey}`;
  const hit = await cacheGet(base44, key);
  if (hit && (Date.now() - hit.ts) / 1000 < 6 * 3600) {
    try { return JSON.parse(hit.payload).map(unpackAf); } catch { /* fall through */ }
  }
  if (!sportradarReady()) {
    await healthPut(base44, "sportradar", { status: "AUTH ERROR", lastError: "missing API key" });
    return [];
  }
  const client = srClient();
  const j = await client.get(`/schedules/${dateKey}/schedules`, { ttlMs: 30 * 60 * 1000 });
  const snap = client.healthSnapshot();
  await healthPut(base44, "sportradar", {
    status: snap.status, lastSuccess: snap.lastSuccess, lastError: snap.lastError, lastLatencyMs: snap.lastLatencyMs,
  });
  if (!j || !Array.isArray(j.schedules)) {
    if (hit) { try { return JSON.parse(hit.payload).map(unpackAf); } catch { return []; } }
    return [];
  }
  const wanted = (wantedLeagues || []).map((l) => ({
    country: l.country, tokens: nameTokens(l.name), flat: normalizeTeamName(l.name).replace(/\s+/g, ""),
  }));
  const fixtures = [];
  for (const e of j.schedules) {
    const se = e?.sport_event;
    if (!se?.id || !se.start_time) continue;
    const ctx = se.sport_event_context || {};
    const comp = ctx.competition?.name;
    const country = ctx.category?.name || null;
    const comps = Array.isArray(se.competitors) ? se.competitors : [];
    const home = comps.find((c) => c.qualifier === "home")?.name;
    const away = comps.find((c) => c.qualifier === "away")?.name;
    if (!comp || !home || !away) continue; // incomplete entry — never guessed
    if (!srLeagueWanted({ league: comp, country }, wanted)) continue;
    fixtures.push({ id: se.id, utc: se.start_time, league: comp, country, home, away, coverage: coverageLevel(se.coverage).level });
  }
  // Packed rows can exceed the per-field size cap when the league filter is
  // empty (a full 200-event schedule) — cache only what fits; the next call
  // re-fetches rather than silently losing the cache.
  const packed = JSON.stringify(fixtures.map((x) => [x.id, x.utc, x.league, x.country, x.home, x.away, x.coverage]));
  if (packed.length < 28000) {
    await cachePut(base44, key, "sportradar", packed, hit ? hit.id : null);
  }
  return fixtures;
}

// -------------------------------------------------------------- odds utils ---
// Merge odds maps from multiple providers (average shared labels — a real
// consensus of real prices, never an invention).
export function mergeOddsMaps(maps) {
  const acc = {};
  for (const m of maps || []) {
    for (const [k, v] of Object.entries(m || {})) {
      if (k.startsWith("_")) continue;
      if (Number.isFinite(v) && v > 1) (acc[k] ||= []).push(v);
    }
  }
  const out = {};
  for (const [k, list] of Object.entries(acc)) out[k] = list.reduce((x, y) => x + y, 0) / list.length;
  return out;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Margin-free implied probability + average decimal odds for one market.
// Returns null when the odds map doesn't genuinely cover that market.
export function marketOddsInfo(odds, marketKey) {
  const o = odds || {};
  const inv = (x) => (Number.isFinite(x) && x > 1 ? 1 / x : null);
  const h = inv(o.Home), d = inv(o.Draw), a = inv(o.Away);
  const norm = (vals) => {
    const valid = vals.filter((x) => x != null);
    if (valid.length !== vals.length || !valid.length) return null;
    const s = valid.reduce((x, y) => x + y, 0);
    return valid.map((x) => x / s);
  };

  let implied = null, decimal = null;
  if (marketKey === "1" || marketKey === "X" || marketKey === "2" ||
      marketKey === "1X" || marketKey === "X2" || marketKey === "12") {
    const n = norm([h, d, a]);
    if (!n) return null;
    const [pH, pD, pA] = n;
    if (marketKey === "1") { implied = pH; decimal = o.Home; }
    else if (marketKey === "X") { implied = pD; decimal = o.Draw; }
    else if (marketKey === "2") { implied = pA; decimal = o.Away; }
    else if (marketKey === "1X") { implied = pH + pD; decimal = 1 / Math.max(pH + pD, 0.01); }
    else if (marketKey === "X2") { implied = pD + pA; decimal = 1 / Math.max(pD + pA, 0.01); }
    else { implied = pH + pA; decimal = 1 / Math.max(pH + pA, 0.01); }
  } else if (/^[OU]\d\.5$/.test(marketKey)) {
    const line = marketKey.slice(1);
    const ov = inv(o[`O${line}`]), un = inv(o[`U${line}`]);
    if (ov == null || un == null) return null;
    const s = ov + un;
    implied = marketKey[0] === "O" ? ov / s : un / s;
    decimal = marketKey[0] === "O" ? o[`O${line}`] : o[`U${line}`];
  } else if (marketKey === "BTTS_Y" || marketKey === "BTTS_N") {
    const y = inv(o.BTTS_Y), n = inv(o.BTTS_N);
    if (y == null || n == null) return null;
    const s = y + n;
    implied = marketKey === "BTTS_Y" ? y / s : n / s;
    decimal = marketKey === "BTTS_Y" ? o.BTTS_Y : o.BTTS_N;
  } else {
    return null;
  }
  if (implied == null || decimal == null || !Number.isFinite(decimal)) return null;
  return { decimal, impliedProb: clamp(implied, 0.01, 0.99), marketKey };
}

// ------------------------------------------------- competition discovery ---
// Build the global competition registry from ACTUAL provider responses in the
// scanned window — a provider only appears for a competition it really
// returned fixtures for. Never hard-coded coverage.
export function buildCompetitionRegistry(providerFixtures, ofLeagues) {
  const map = new Map();
  const add = (name, country, provider, fixtures) => {
    const key = `${country || "—"}|${normalizeTeamName(name)}`;
    if (!map.has(key)) {
      map.set(key, { name: name || "—", country: country || null, providers: {}, fixturesInWindow: 0 });
    }
    const e = map.get(key);
    e.providers[provider] = true;
    e.fixturesInWindow += fixtures || 0;
  };
  for (const l of ofLeagues || []) if (l.hasData) add(l.name, l.country, "openfootball", 0);
  for (const day of Object.values(providerFixtures || {})) {
    for (const f of day.af || []) add(f.league, f.country, "apiFootball", 1);
    for (const f of day.sm || []) add(f.league, f.country, "sportmonks", 1);
    for (const f of day.sr || []) add(f.league, f.country, "sportradar", 1);
  }
  return {
    generatedAt: new Date().toISOString(),
    competitions: [...map.values()].sort(
      (x, y) => y.fixturesInWindow - x.fixturesInWindow || String(x.name).localeCompare(String(y.name))
    ),
  };
}