import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { SportradarClient } from '../../shared/sportradarClient.ts';

// Temporary runtime probe — verifies each step of the Sportradar provider
// adapter inside the deployed function runtime: secret visibility, the
// client request, and the entity cache path (same entity, same shape as the
// prediction-board cache helpers).

async function cacheGet(base44, cacheKey) {
  const rows = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: cacheKey }, '-updated_date', 1);
  return rows && rows[0] ? { id: rows[0].id, payload: rows[0].payload, ts: rows[0].updated_date } : null;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const diag = {};

    try {
      diag.envKeyPresent = !!(typeof Deno !== 'undefined' && Deno.env.get('SPORTRADAR_API_KEY'));
    } catch (e) { diag.envKeyError = String(e && e.message || e); }

    let client = null;
    try {
      client = new SportradarClient();
      diag.clientReady = client.ready();
    } catch (e) { diag.clientError = String(e && e.message || e); }

    if (client && client.ready()) {
      try {
        const j = await client.get('/schedules/2026-09-06/schedules', { ttlMs: 0 });
        diag.scheduleOk = !!(j && Array.isArray(j.schedules));
        diag.scheduleCount = j && Array.isArray(j.schedules) ? j.schedules.length : null;
        diag.metrics = { requests: client.metrics.requests, errors: client.metrics.errors, lastStatus: client.metrics.lastStatus, lastError: client.metrics.lastError };
        diag.health = client.healthSnapshot();
      } catch (e) { diag.scheduleError = String(e && e.message || e); }
    }

    try {
      const hit = await cacheGet(base44, 'sr:probe');
      diag.cacheGetOk = true;
      if (hit) {
        await base44.asServiceRole.entities.ApiFootballCache.update(hit.id, { payload: JSON.stringify({ t: Date.now() }) });
      } else {
        await base44.asServiceRole.entities.ApiFootballCache.create({ cache_key: 'sr:probe', endpoint: 'probe', payload: JSON.stringify({ t: Date.now() }) });
      }
      diag.cachePutOk = true;
    } catch (e) { diag.cacheError = String(e && e.message || e); }

    return Response.json({ diag });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}