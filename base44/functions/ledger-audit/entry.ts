import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// LEDGER AUDIT FETCH — server-side read of the settlement-audit ledger layers.
// The browser's entity reads share a per-user traffic quota that the Learning
// Hub's background sync keeps hot; server-side reads do not. This function is
// the fallback transport for the settlement auditor: it READS ONLY (never
// writes), projects the narrow fields the cross-check needs, and reports
// per-layer failures honestly so the client never mistakes a failed read for
// "nothing settled". Admin-only.

const LAYERS = {
  KalaModelObservation: [
    "id", "observation_key", "model_version", "fixture_id", "home", "away",
    "market_key", "market_label", "status", "settled_at", "actual_home", "actual_away",
  ],
  GlobalPredictionLedger: [
    "id", "global_prediction_id", "source_section", "model_version", "home", "away",
    "market_key", "market_label", "status", "settled_at", "actual_home", "actual_away",
  ],
  GlobalOutcomeLedger: [
    "id", "global_prediction_id", "settlement", "final_home", "final_away", "settled_at",
  ],
  RunOPick: [
    "id", "runo_id", "observation_key", "home", "away", "market_key", "market_label",
    "status", "settled_at", "recorded_at",
  ],
  MonsterPick: [
    "id", "monster_id", "observation_key", "home", "away", "market_key", "market_label",
    "status", "settled_at", "recorded_at",
  ],
};

const PAGE = 400; // bounded per-layer read — the auditor cross-checks recent settled windows
// The platform's entity READ quota is APP-wide (browser and server share it),
// and the Learning Hub's own background sync keeps it hot — a first pass can
// come back 429 "retry after ~17s". The function therefore RETRIES failed
// layers with backoff, waiting out the quota window server-side, instead of
// surfacing a partial result the moment a burst hits.
const RETRY_DELAY_MS = 20000;
const RETRY_PASSES = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (String(user.role || "") !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const svc = base44.asServiceRole;
    const layers = {};
    const failed = new Set(Object.keys(LAYERS));

    const readLayer = async (name) => {
      const fields = LAYERS[name];
      const rows = await svc.entities[name].filter({}, "-updated_date", PAGE);
      layers[name] = (Array.isArray(rows) ? rows : []).map((r) => {
        const o = {};
        for (const f of fields) o[f] = r[f];
        return o;
      });
      failed.delete(name);
    };

    for (const name of Object.keys(LAYERS)) {
      try {
        await readLayer(name);
      } catch (e) {
        layers[name] = [];
      }
      await sleep(150); // gentle pacing between layers
    }

    // Backoff passes — wait out the app-wide read quota window and retry only
    // the layers that failed. Each pass is honest: a layer still failing stays
    // in the failures list the client reports as PARTIAL READ.
    for (let pass = 0; pass < RETRY_PASSES && failed.size > 0; pass++) {
      await sleep(RETRY_DELAY_MS);
      for (const name of Array.from(failed)) {
        try {
          await readLayer(name);
        } catch (e) {
          // still throttled — keep it in the failure set
        }
        await sleep(150);
      }
    }

    const failures = Array.from(failed);
    return Response.json({
      ok: failures.length === 0,
      failures,
      layers,
      counts: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.length])),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}