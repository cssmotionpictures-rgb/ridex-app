// chunkedCache.ts — shared chunked entity-payload cache for the external-data
// proxy functions (API-Football, TheSportsDB). Entity payload fields cap well
// below 32KB (~26KB single-record writes are rejected), so large JSON is
// stored as 12KB slices plus a small meta record pointing at them. The meta
// row is updated in place; chunk rows are upserted by their #chunkN key.

const CHUNK = 12000;

// Strip the { __cache, chunks, data } wrapper the write path adds, until the
// real payload sits at the top. A wrapped payload whose chunks were never
// assembled is a cache miss — the caller refetches live data instead of
// serving garbage that silently empties every downstream pool.
const unwrap = (d: any) => {
  while (d && typeof d === "object" && d.__cache) {
    if (d.chunks > 0) return null;
    d = d.data;
  }
  return d;
};

// Returns { fresh, data, meta } or null (miss / unreadable). `fresh` is false
// when the row exists but its TTL has passed — callers can still serve it as
// stale when the upstream provider fails.
export async function readCache(base44: any, key: string, ttl: number) {
  try {
    const metas = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: key }, "-created_date", 1);
    const meta = metas?.[0];
    if (!meta) return null;
    const ts = new Date(meta.updated_date || meta.created_date).getTime();
    const fresh = (Date.now() - ts) / 1000 < ttl;
    const parsed = JSON.parse(meta.payload);
    let data;
    if (parsed && parsed.__cache) {
      if (parsed.chunks > 0) {
        const parts: string[] = [];
        for (let i = 0; i < parsed.chunks; i++) {
          const recs = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: `${key}#chunk${i}` }, "-created_date", 1);
          if (!recs?.[0]) return null; // incomplete — treat as a cache miss
          parts.push(JSON.parse(recs[0].payload).c);
        }
        // The assembled json is the same {__cache, chunks, data} wrapper the
        // single-record path strips — unwrap it here too so every consumer
        // sees the same shape no matter how the payload was stored.
        data = unwrap(JSON.parse(parts.join("")));
        if (data === null) return null;
      } else {
        // Guard against double-wrapped rows (a past write stored the wrapper
        // itself as data): unwrap until the real payload sits at the top.
        data = unwrap(parsed.data);
        if (data === null) return null;
      }
    } else {
      data = parsed; // legacy single-record payload (full API body)
    }
    return { fresh, data, meta };
  } catch {
    return null;
  }
}

// Upsert a payload into the chunked cache. Best effort — a cache write failure
// must never fail the request it serves.
export async function writeCache(base44: any, key: string, endpoint: string, data: any, meta: any) {
  try {
    const json = JSON.stringify({ __cache: true, chunks: 0, data });
    if (json.length <= CHUNK) {
      const payload = json;
      if (meta?.id) {
        await base44.asServiceRole.entities.ApiFootballCache.update(meta.id, { payload });
      } else {
        await base44.asServiceRole.entities.ApiFootballCache.create({ cache_key: key, endpoint, payload });
      }
      return;
    }
    // large payload — store as slices
    const n = Math.ceil(json.length / CHUNK);
    for (let i = 0; i < n; i++) {
      const ckey = `${key}#chunk${i}`;
      const cpayload = JSON.stringify({ c: json.slice(i * CHUNK, (i + 1) * CHUNK) });
      const existing = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: ckey }, "-created_date", 1);
      if (existing?.[0]) {
        await base44.asServiceRole.entities.ApiFootballCache.update(existing[0].id, { payload: cpayload });
      } else {
        await base44.asServiceRole.entities.ApiFootballCache.create({ cache_key: ckey, endpoint, payload: cpayload });
      }
    }
    const mpayload = JSON.stringify({ __cache: true, chunks: n });
    if (meta?.id) {
      await base44.asServiceRole.entities.ApiFootballCache.update(meta.id, { payload: mpayload });
    } else {
      await base44.asServiceRole.entities.ApiFootballCache.create({ cache_key: key, endpoint, payload: mpayload });
    }
  } catch (e) {
    console.error("cache write failed:", e?.message || e);
  }
}