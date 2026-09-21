// VERIFIED ENRICHMENT TRANSPORT (RX-2.1) — injuries + confirmed lineups from
// API-Football through the app's own zero-credit proxy (base44/functions/
// api-football, main key first — the dead secondary key is last in rotation),
// with per-endpoint client caching to protect the free-plan daily quota.
// NOTHING is fabricated: an unavailable feed returns null and is recorded as
// UNAVAILABLE; an unmatched team is UNKNOWN, never "zero injuries"; a lineup
// is CONFIRMED only when the provider actually published it.
import { base44 } from "@/api/base44Client";
import { normalizeName } from "@/lib/cornerFeed";
import { trackCall } from "./providerHealth";
import { injuryImpactOf, injuryDeltaOf, teamNameMatches } from "./rx21Core";
import { unwrapApiFootballEnvelope } from "./apiFootballPayload";

export async function invokeApiFootball(endpoint, params) {
  const t0 = Date.now();
  try {
    // Envelope unwrapping lives in the pure, regression-tested module
    // apiFootballPayload.js (SDK wrapper → body {cached, data} → chunked cache).
    const res = await base44.functions.invoke("api-football", { endpoint, params });
    const ms = Date.now() - t0;
    const { payload, error, cached } = unwrapApiFootballEnvelope(res);
    if (error) {
      trackCall("api-football", { ok: false, error, ms, endpoint });
      return null;
    }
    trackCall("api-football", { ok: true, ms, cached, endpoint, results: payload?.results ?? null });
    return payload;
  } catch (e) {
    trackCall("api-football", { ok: false, error: String(e?.message || e), ms: Date.now() - t0, endpoint });
    return null;
  }
}

// --- injuries by kickoff UTC date (client TTL 3h; the server caches 6h) ---
// null = UNAVAILABLE — never an empty "no injuries" claim.
// PLAN WINDOW: the provider's own restriction message limits the free plan to
// roughly yesterday..tomorrow+1 — dates outside it are marked UNAVAILABLE
// without wasting a request, and disclosed as a plan limitation.
const utcDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
export function injuryDateInPlanWindow(date) {
  return date >= utcDay(-1) && date <= utcDay(1);
}
const injCache = new Map();
export async function injuriesByDate(date) {
  if (!injuryDateInPlanWindow(date)) return null; // outside the plan window — honestly unavailable
  const hit = injCache.get(date);
  if (hit && Date.now() - hit.at < (hit.rows ? 3 * 3600e3 : 10 * 60e3)) return hit.rows;
  const data = await invokeApiFootball("injuries", { date });
  const rows = Array.isArray(data?.response) ? data.response : null;
  injCache.set(date, { at: Date.now(), rows });
  return rows;
}

// Match a fixture's two teams onto the day's verified injury rows.
// A missing team match is UNKNOWN (null) — never zero absences.
export function matchInjuries(rows, home, away, kickoff) {
  if (!Array.isArray(rows)) return { status: "unavailable", home: null, away: null };
  const koDay = String(kickoff).slice(0, 10);
  const byTeam = new Map();
  for (const r of rows) {
    const k = normalizeName(r?.team?.name || "");
    if (!k) continue;
    if (!byTeam.has(k)) byTeam.set(k, []);
    byTeam.get(k).push(r);
  }
  // CROSS-PROVIDER NAME MATCH — openfootball fixture names vs API-Football
  // injury team names ("Sporting Clube de Braga" vs "Braga"). Exact first,
  // token-subset equivalence second; AMBIGUOUS matches are rejected — a name
  // is never force-fit onto the wrong club. No match stays UNKNOWN, never zero.
  const forTeam = (name) => {
    const exact = byTeam.get(normalizeName(name));
    if (exact) return exact.filter((r) => String(r?.fixture?.date || "").slice(0, 10) === koDay);
    const hits = [...new Set([...byTeam.keys()].filter((k) => teamNameMatches(name, k)))];
    if (hits.length !== 1) return null; // 0 or ambiguous — unknown, never zero
    return byTeam.get(hits[0]).filter((r) => String(r?.fixture?.date || "").slice(0, 10) === koDay);
  };
  const h = forTeam(home);
  const a = forTeam(away);
  return { status: h != null && a != null ? "matched" : "unmatched", home: h, away: a };
}

// Full injury intelligence for one fixture — impact scores + delta + status.
export function injuryIntel(rows, home, away, kickoff) {
  const m = matchInjuries(rows, home, away, kickoff);
  const homeImpact = injuryImpactOf(m.home);
  const awayImpact = injuryImpactOf(m.away);
  return {
    status: m.status,
    homeImpact,
    awayImpact,
    delta: injuryDeltaOf(homeImpact?.impact ?? null, awayImpact?.impact ?? null),
  };
}

// --- API-Football fixture-id map per date (needed to resolve lineups) ---
// Uncertain team mappings are REJECTED, never guessed.
const fxIdCache = new Map();
export async function apiFixtureIdsForDate(date) {
  const hit = fxIdCache.get(date);
  if (hit && Date.now() - hit.at < (hit.map ? 30 * 60e3 : 10 * 60e3)) return hit.map;
  const data = await invokeApiFootball("fixtures", { date });
  const resp = Array.isArray(data?.response) ? data.response : null;
  if (!resp) {
    fxIdCache.set(date, { at: Date.now(), map: null });
    return null;
  }
  const map = new Map();
  const ambiguous = new Set();
  resp.forEach((f) => {
    const k = `${normalizeName(f?.teams?.home?.name)}|${normalizeName(f?.teams?.away?.name)}`;
    const id = f?.fixture?.id;
    if (!id || !k || k.startsWith("|") || k.endsWith("|")) return;
    if (map.has(k) && map.get(k) !== id) ambiguous.add(k);
    else map.set(k, id);
  });
  ambiguous.forEach((k) => map.delete(k)); // uncertain mapping — rejected
  fxIdCache.set(date, { at: Date.now(), map });
  return map;
}

// Resolve a board fixture (openfootball naming) onto the API-Football fixture
// map — exact first, cross-provider equivalence second, AMBIGUOUS rejected.
export function resolveFixtureId(map, home, away) {
  if (!map) return null;
  const direct = map.get(`${normalizeName(home)}|${normalizeName(away)}`);
  if (direct) return direct;
  let hit = null;
  let count = 0;
  for (const [k, id] of map) {
    const [kh, ka] = k.split("|");
    if (teamNameMatches(home, kh) && teamNameMatches(away, ka) && id !== hit) {
      hit = id;
      count++;
    }
  }
  return count === 1 ? hit : null; // 0 or ambiguous — unmatched, never guessed
}

// --- confirmed lineups (publish close to kickoff) ---
const lineupCache = new Map();
export async function lineupFor(date, home, away) {
  const map = await apiFixtureIdsForDate(date);
  if (!map) return { status: "unavailable" };
  const id = resolveFixtureId(map, home, away);
  if (!id) return { status: "unmatched" };
  const hit = lineupCache.get(id);
  if (hit && Date.now() - hit.at < (hit.lu?.status === "confirmed" ? 3600e3 : 5 * 60e3)) return hit.lu;
  const data = await invokeApiFootball("fixtures/lineups", { fixture: id });
  const resp = Array.isArray(data?.response) ? data.response : null;
  let lu;
  if (!resp) lu = { status: "unavailable", apiFixtureId: id };
  else if (resp.length < 2) lu = { status: "no_lineup", apiFixtureId: id };
  else
    lu = {
      status: "confirmed",
      apiFixtureId: id,
      home: { formation: resp[0]?.formation || "", xi: (resp[0]?.startXI || []).length },
      away: { formation: resp[1]?.formation || "", xi: (resp[1]?.startXI || []).length },
      confirmedAt: new Date().toISOString(),
    };
  lineupCache.set(id, { at: Date.now(), lu });
  return lu;
}