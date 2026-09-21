// SETTLEMENT VERIFICATION ROUTINE — an independent auditor that cross-references
// the day's settled results against the prediction ledger. Every settled row is
// RE-GRADED from its own stored real final score under the market's canonical
// settlement rule, then cross-referenced across three layers: the immutable
// observation ledger (authoritative), the Global Prediction Ledger (ingestion)
// and the Global Outcome Ledger (analysis), plus the mirrored section rows
// (RUN O, MONSTER). A mismatch is FLAGGED, never silently corrected — this
// routine reports; it does not write.
import { base44 } from "@/api/base44Client";
import { settleCanonical } from "@/lib/ensemble/markets";
import { loadObservations } from "@/lib/ensemble/observations";
import { lagosTodayKey } from "@/lib/lagosTime";
import { globalPredictionId } from "./globalId";

const SETTLED = new Set(["won", "lost", "void"]);
const DAY = 86400000;
const verOf = (key) => {
  const m = /:v(\d+)$/.exec(String(key || ""));
  return m ? Number(m[1]) : 1;
};

// Lagos is UTC+1 year-round — a Lagos date key converts to an exact UTC instant.
export function windowStartOf(dateKey) {
  return new Date(`${dateKey}T00:00:00+01:00`).getTime();
}

// Expected grade of a settled row from its own stored real final score, under
// the market's canonical settlement rule — the same rule the settlement path
// itself uses, so a correct row always re-grades to itself.
// "won" | "lost" | "void" | undefined (cannot re-verify — no honest grade).
export function regradeOf(row) {
  const h = Number(row?.actual_home);
  const a = Number(row?.actual_away);
  if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0) return undefined;
  const res = settleCanonical(String(row.market_key || ""), h, a);
  if (res === undefined) return undefined; // unknown market — never verified by generic logic
  return res === null ? "void" : res ? "won" : "lost";
}

// PURE cross-check — directly unit-testable, no SDK. All collections are plain
// row arrays. Returns { checked, breakdown, mismatches, severityCounts, allConsistent }.
export function crossCheckSettlements({
  observations = [], ledger = [], outcomes = [], runo = [], monster = [],
  windowStart = 0,
} = {}) {
  const mismatches = [];
  const add = (severity, kind, section, summary) =>
    mismatches.push({ severity, kind, section, summary });

  const settledInWindow = (r) =>
    SETTLED.has(r?.status) && r?.settled_at && new Date(r.settled_at).getTime() >= windowStart;

  const ledgerByGid = new Map((ledger || []).map((r) => [r.global_prediction_id, r]));
  const outcomeByGid = new Map();
  (outcomes || []).forEach((o) => {
    if (o?.global_prediction_id && !outcomeByGid.has(o.global_prediction_id)) {
      outcomeByGid.set(o.global_prediction_id, o);
    }
  });
  const obsByKey = new Map((observations || []).map((o) => [o.observation_key, o]));

  // 1 — AUTHORITATIVE OBSERVATIONS settled in the window: re-grade each one and
  // confirm the global ledger and outcome ledger agree with it.
  let checkedObservations = 0;
  (observations || []).filter(settledInWindow).forEach((o) => {
    checkedObservations++;
    const label = `${o.home} vs ${o.away} (${o.market_label || o.market_key})`;

    const expected = regradeOf(o);
    if (expected === undefined) {
      add("MED", "GRADE_UNVERIFIABLE", "observation-ledger", `${label} — the stored score or market cannot be re-verified, accuracy unknown`);
    } else if (expected !== o.status) {
      add("HIGH", "GRADE_MISMATCH", "observation-ledger", `${label} marked ${String(o.status).toUpperCase()} but the stored final score ${o.actual_home}-${o.actual_away} grades ${expected.toUpperCase()}`);
    }

    const gid = globalPredictionId("kala", o.model_version, o.fixture_id, o.market_key, verOf(o.observation_key));
    const g = ledgerByGid.get(gid);
    if (!g) {
      add("MED", "MISSING_GLOBAL_ROW", "global-ledger", `${label} (${o.model_version}) settled but never ingested into the global ledger — run a section sync`);
    } else if (g.status !== o.status) {
      add("HIGH", "GLOBAL_STATUS_MISMATCH", "global-ledger", `${label} is ${String(o.status).toUpperCase()} in the observation ledger but ${String(g.status).toUpperCase()} in the global ledger`);
    }

    const oc = outcomeByGid.get(gid);
    if (!oc) {
      add("MED", "MISSING_OUTCOME", "outcome-ledger", `${label} settled with no outcome row — win/loss analysis cannot run`);
    } else {
      if (oc.settlement !== o.status) {
        add("HIGH", "OUTCOME_MISMATCH", "outcome-ledger", `${label} outcome row says ${String(oc.settlement).toUpperCase()} but the observation settled ${String(o.status).toUpperCase()}`);
      }
      if (Number(oc.final_home) !== Number(o.actual_home) || Number(oc.final_away) !== Number(o.actual_away)) {
        add("HIGH", "OUTCOME_SCORE_MISMATCH", "outcome-ledger", `${label} outcome row stored the score ${oc.final_home}-${oc.final_away} but the real score was ${o.actual_home}-${o.actual_away}`);
      }
    }
  });

  // 2 — GLOBAL LEDGER rows settled in the window (every section): re-grade from
  // the stored real score and confirm an outcome row exists.
  let checkedLedger = 0;
  (ledger || []).filter(settledInWindow).forEach((g) => {
    checkedLedger++;
    const expected = regradeOf(g);
    if (expected !== undefined && expected !== g.status) {
      add("HIGH", "GRADE_MISMATCH", "global-ledger", `${g.home} vs ${g.away} (${g.market_label || g.market_key}) marked ${String(g.status).toUpperCase()} but the stored final score ${g.actual_home}-${g.actual_away} grades ${expected.toUpperCase()}`);
    }
    if (!outcomeByGid.has(g.global_prediction_id)) {
      add("MED", "MISSING_OUTCOME", "outcome-ledger", `${g.home} vs ${g.away} (${g.market_label || g.market_key}, ${g.source_section}) settled with no outcome row`);
    }
  });

  // 3 — MIRRORED SECTION ROWS (RUN O, MONSTER): every settled or still-open
  // mirror must agree with the authoritative observation it links to.
  let checkedMirrors = 0;
  const mirrorCheck = (rows, section) => {
    (rows || []).forEach((r) => {
      const o = obsByKey.get(r.observation_key);
      if (!o || !SETTLED.has(o.status)) return;
      checkedMirrors++;
      const label = `${r.home} vs ${r.away} (${r.market_label || r.market_key})`;
      if (r.status === "open") {
        add("MED", "MIRROR_UNSETTLED", section, `${label} is still OPEN although the authoritative observation settled ${String(o.status).toUpperCase()} — settlement mirroring has not run for it yet`);
      } else if (r.status !== o.status) {
        add("HIGH", "MIRROR_MISMATCH", section, `${label} is marked ${String(r.status).toUpperCase()} on the ${section.toUpperCase()} board but the authoritative observation says ${String(o.status).toUpperCase()}`);
      }
    });
  };
  mirrorCheck(runo, "run-o");
  mirrorCheck(monster, "monster");

  const severityCounts = mismatches.reduce((m, x) => {
    m[x.severity] = (m[x.severity] || 0) + 1;
    return m;
  }, {});
  const checked = checkedObservations + checkedLedger + checkedMirrors;
  return {
    checked,
    breakdown: {
      observations: checkedObservations,
      globalLedger: checkedLedger,
      mirrors: checkedMirrors,
    },
    mismatches,
    severityCounts,
    allConsistent: mismatches.length === 0,
  };
}

// Loads every ledger layer and runs the cross-check for the last N Lagos days
// (days = 1 → the day's settled results). Reads run SEQUENTIALLY with pacing —
// a burst of parallel reads trips the platform's entity-traffic limit — and
// every layer reports whether it was actually read: a throttled read is NEVER
// presented as "nothing settled".
const LAYER_GAP = 400; // pace reads — burst reads trip the platform traffic limit
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readLayer(promise) {
  try {
    const rows = await promise;
    return { rows: Array.isArray(rows) ? rows : [], ok: true };
  } catch {
    return { rows: [], ok: false };
  }
}

// Paged read that lets a failure ESCAPE (unlike fetchAll, which swallows it) so
// the auditor can report a partial read instead of a false empty.
async function readPaged(entity) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(LAYER_GAP);
    const page = await base44.entities[entity].filter({}, "-created_date", 1000);
    if (!page?.length) break;
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

// SERVER-ASSISTED READ (the back door) — when the browser's direct reads are
// throttled, a single admin backend function fetches every layer server-side
// (service-role reads do not share the browser's traffic quota) and returns
// the projected rows. The auditor still runs the SAME pure cross-check on
// them; if the server route also fails, the client partial read stands and
// is reported honestly — never presented as "nothing settled".
async function readLayersServer() {
  const res = await base44.functions.invoke("ledger-audit", {});
  const d = res?.data ?? res;
  if (!d || d.error) throw new Error(String(d?.error || "ledger-audit failed"));
  return d;
}

export async function verifySettlements({ days = 1 } = {}) {
  const dateKey = lagosTodayKey();
  const windowStart = windowStartOf(dateKey) - (Math.max(1, days) - 1) * DAY;

  // PRIMARY ROUTE — the admin server function. The platform's entity READ quota
  // is APP-wide (browser and server share it), so five parallel client reads
  // only heat the quota the audit then suffers under. One server call reads
  // every layer (with its own backoff retries) for a fraction of the traffic,
  // and the pure cross-check runs on exactly the same rows either way.
  let route = "server-assisted";
  let readFailures = 0;
  let rows = null;
  try {
    const d = await readLayersServer();
    rows = {
      observations: d.layers.KalaModelObservation,
      ledger: d.layers.GlobalPredictionLedger,
      outcomes: d.layers.GlobalOutcomeLedger,
      runo: d.layers.RunOPick,
      monster: d.layers.MonsterPick,
    };
  } catch {
    // FALLBACK — direct paced client reads when the server route is unavailable.
    // Every layer reports whether it was actually read: a throttled read is
    // NEVER presented as "nothing settled".
    route = "direct";
    const observations = await readLayer(loadObservations(1000));
    await sleep(LAYER_GAP);
    const ledger = await readLayer(readPaged("GlobalPredictionLedger"));
    await sleep(LAYER_GAP);
    const outcomes = await readLayer(readPaged("GlobalOutcomeLedger"));
    await sleep(LAYER_GAP);
    const runo = await readLayer(base44.entities.RunOPick.filter({}, "-recorded_at", 1000));
    await sleep(LAYER_GAP);
    const monster = await readLayer(base44.entities.MonsterPick.filter({}, "-recorded_at", 1000));

    readFailures = [observations, ledger, outcomes, runo, monster].filter((l) => !l.ok).length;
    rows = {
      observations: observations.rows,
      ledger: ledger.rows,
      outcomes: outcomes.rows,
      runo: runo.rows,
      monster: monster.rows,
    };
  }

  const report = crossCheckSettlements({ ...rows, windowStart });
  return {
    dateKey,
    days: Math.max(1, days),
    windowStartIso: new Date(windowStart).toISOString(),
    verifiedAt: new Date().toISOString(),
    route,
    readFailures,
    ...report,
  };
}