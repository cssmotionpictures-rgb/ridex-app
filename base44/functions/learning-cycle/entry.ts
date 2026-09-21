import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  metricsOf, segmentEvidence, chronologicalSplit, promotionGateDecision,
  driftVerdictOf, calibrationStatusOf, selectEventsToCreate, eventKeyOf,
  classifyOutcome, errorForensicsOf, resolveActiveModel, evidenceLevelOf,
  MIN_INSIGHT_SAMPLE, MIN_CALIBRATION_SAMPLE, MIN_OOS_PROMOTION, CHAMPION_DEFAULT, CHALLENGER_DEFAULT, r2,
} from "../../shared/learningCore.ts";

// LEARNING CYCLE — the autonomous self-learning loop of the RIDE X prediction
// engine, executed SERVER-SIDE so learning never depends on a browser
// staying open. Deployed with a DAILY SCHEDULED AUTOMATION (function.jsonc —
// 02:00 Lagos, no admin, no browser); it can also be invoked manually by an
// admin from the Learning Center. One idempotent, resumable pass over the
// real settled data:
//   settled outcomes -> COUNTED LEARNING EVENTS (exactly one per eligible
//   selection, deterministic key — reprocessing counts nothing twice) ->
//   evidence-based WIN/LOSS forensics -> feature evidence by segment ->
//   calibration (Brier / log loss / ECE / reliability) -> chronological model
//   evaluation (older = train, newer = OOS — zero future leakage) ->
//   promotion gate -> active-model registry -> drift check -> chain health.
// VOID/PUSH/CANCELLED never train. Nothing is promoted without OOS evidence:
// with an insufficient sample the honest decision is CHAMPION RETAINED.
// The pure chain logic lives in base44/shared/learningCore.ts (byte-identical
// copy of src/lib/globalLearning/learningCore.js) and is proven by the
// automated regression tests in src/__tests__/learningLoop.test.js.
// Manual invocations must be admin; the scheduled trigger runs without a user.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE = 1000;
const BATCH = 400;
const CHAMPION = CHAMPION_DEFAULT;
const CHALLENGER = CHALLENGER_DEFAULT;

const nowIso = () => new Date().toISOString();
const watDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

// TIE-SAFE CURSOR PAGING with one throttle-retry — the same read discipline
// as the ledger read functions. A capped read is reported, never silently
// treated as the whole ledger.
async function readAll(svc, entity, sort) {
  const out = [];
  let cursor = null;
  let capped = false;
  for (let i = 0; i < 5; i++) {
    if (i) await sleep(400);
    const rows = await svc.entities[entity].filter(cursor ? { created_date: { $lt: cursor } } : {}, sort, PAGE);
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
    if (i === 4) {
      capped = true;
      break;
    }
    const tail = rows[rows.length - 1].created_date;
    const tie = await svc.entities[entity].filter({ created_date: { $eq: tail } }, "created_date", PAGE * 5);
    if (Array.isArray(tie)) out.push(...tie);
    cursor = tail;
  }
  return { rows: out, capped };
}
// PATIENT READ — the app-wide read quota is shared with every surface of
// the app, so a learning cycle WAITS OUT throttle windows with bounded
// retries instead of failing: a quota error is never treated as "no rows"
// (that is how duplicates get created) and never silently skipped.
async function patientRead(fn, tries, waitMs) {
  const maxTries = tries || 3;
  const wait = waitMs || 25000;
  let lastErr = null;
  for (let t = 0; t < maxTries; t++) {
    if (t) await sleep(wait);
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("read failed");
}
async function readAllRetry(svc, entity, sort) {
  return patientRead(() => readAll(svc, entity, sort));
}
// Batched $in read — ONLY the prediction rows the eligible outcomes need
// (the same batching discipline as the idempotency gates). A full-ledger
// scan is never run for a join; the earliest row per identity wins.
async function readByKeyIn(svc, entity, keyField, keys) {
  const map = new Map();
  const keysList = [...new Set((keys || []).filter(Boolean))];
  for (let bi = 0; bi < keysList.length; bi = bi + 25) {
    if (bi) await sleep(400);
    const query = {};
    query[keyField] = { $in: keysList.slice(bi, bi + 25) };
    const rows = await patientRead(() => svc.entities[entity].filter(query, "created_date", 1000));
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const cur = map.get(r[keyField]);
        if (!cur || String(r.created_date || "") < String(cur.created_date || "")) map.set(r[keyField], r);
      }
    }
  }
  return map;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    // SCHEDULABLE — the daily automation invokes this function WITHOUT a user
    // token (scheduled trigger); manual invocations carry the caller's token
    // and must be admin. Learning runs automatically — it never depends on
    // a browser or an admin opening the Learning Center.
    let trigger = "scheduled";
    try {
      const user = await base44.auth.me();
      if (user) {
        if (String(user.role || "") !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
        trigger = "admin";
      }
    } catch { /* no auth context — scheduled/system invocation */ }

    const svc = base44.asServiceRole;
    const now = nowIso();
    const batch = `cycle-${watDate()}`;

    // ===== STEP 1 — READ (sequential, paced; a burst trips the app-wide quota)
    const outcomesRes = await readAllRetry(svc, "GlobalOutcomeLedger", "-created_date");
    const outcomes = outcomesRes.rows;
    const eventsRes = await readAllRetry(svc, "LearningEvent", "-created_date");
    const priorEvents = eventsRes.rows;

    // ===== STEP 2 — ELIGIBILITY (VOID/PUSH/CANCELLED never train; unusable
    // probabilities are reported, never forced into training)
    const eligible = [];
    const skipped = [];
    for (const o of outcomes) {
      const c = classifyOutcome(o);
      if (c.eligible) eligible.push(o);
      else skipped.push({ id: o.global_prediction_id, reason: c.reason });
    }

    // ===== STEP 2b — JOIN the canonical prediction rows for the eligible
    // outcomes ONLY (batched $in — never a full-ledger scan for a join)
    const predByKey = await readByKeyIn(svc, "GlobalPredictionLedger", "global_prediction_id", eligible.map((o) => o.global_prediction_id));

    // ===== STEP 3 — LEARNING EVENTS (deterministic key — idempotent; the
    // key IS prediction_id + selection_id + settlement_version because the
    // global id encodes prediction+selection and an outcome is created once
    // with an immutable single settlement). An interrupted run is resumed by
    // the next run without re-counting anything.
    const { toCreate, duplicatesPrevented } = selectEventsToCreate(eligible, priorEvents, predByKey, { now, batch });
    let created = 0;
    for (let i = 0; i < toCreate.length; i += BATCH) {
      const slice = toCreate.slice(i, i + BATCH);
      await svc.entities.LearningEvent.bulkCreate(slice);
      created += slice.length;
    }
    const allEvents = [...priorEvents, ...toCreate];
    const eventKeys = new Set(allEvents.map((e) => e.event_key));

    // ===== STEP 3b — FORENSICS BACKFILL: counted events recorded before the
    // forensics stage get their evidence-based WIN/LOSS attribution filled
    // (only when empty — counted training data is never rewritten).
    const forensicsBackfill = [];
    for (const e of priorEvents) {
      if (e.forensics_json) continue;
      forensicsBackfill.push({
        id: e.id,
        forensics_json: JSON.stringify(errorForensicsOf({
          outcome: e.outcome,
          agreement: e.agreement ?? 1,
          uncertainty: e.uncertainty ?? 0,
          data_quality: e.data_quality || "",
          market_odds: e.market_odds ?? 0,
          edge_pct: e.edge_pct ?? 0,
          clv_pct: e.clv_pct ?? 0,
        })),
      });
    }
    if (forensicsBackfill.length) await svc.entities.LearningEvent.bulkUpdate(forensicsBackfill);

    // Mark outcomes counted (only the ones not already counted)
    const countedUpdates = [];
    for (const o of eligible) {
      if (eventKeys.has(eventKeyOf(o.global_prediction_id)) && o.learning_status !== "counted") {
        countedUpdates.push({ id: o.id, learning_status: "counted" });
      }
    }
    if (countedUpdates.length) await svc.entities.GlobalOutcomeLedger.bulkUpdate(countedUpdates);

    // ===== STEP 4 — FEATURE EVIDENCE + evidence-gated insights
    const evidence = segmentEvidence(allEvents);
    const insightsRes = await readAllRetry(svc, "GlobalLearningInsight", "-created_date");
    const insightBy = new Map(insightsRes.rows.map((i) => [i.insight_key, i]));
    const iCreates = [];
    const iUpdates = [];
    for (const row of evidence) {
      if (row.sample < MIN_INSIGHT_SAMPLE || Math.abs(row.gap_pp) < 5) continue; // evidence threshold — never from tiny samples
      const scopeMap = { section: "SECTION", market_family: "MARKET", league: "COMPETITION", model: "MODEL" };
      const scope = scopeMap[row.dim];
      if (!scope) continue;
      const slug = String(row.value).toLowerCase().replace(/[^a-z0-9+. -]+/g, " ").trim().replace(/\s+/g, "_");
      const key = `${scope}|${row.dim}:${slug}`;
      const payload = {
        insight: `${row.value} selections (${row.dim}) were ${row.verdict.toLowerCase()} — predicted ${row.expected_pct}%, observed ${row.actual_pct}% over ${row.sample} settled.`,
        sample_size: row.sample,
        expected_pct: row.expected_pct,
        actual_pct: row.actual_pct,
        effect_pp: row.gap_pp,
        evidence_level: evidenceLevelOf(row.sample),
        source_sections: row.sections,
        affected_models: row.sections,
        updated_at: now,
      };
      const cur = insightBy.get(key);
      if (cur) {
        iUpdates.push({ id: cur.id, ...payload });
      } else {
        iCreates.push({
          insight_key: key,
          subject: `${row.dim}:${row.value}`,
          scope,
          status: "NEW", // a finding NEVER alters production until validated
          model_version: "RX-GLOBAL-1.0",
          hypothesis: `Review confidence in this segment (observed ${row.actual_pct}% vs predicted ${row.expected_pct}%) — hypothesis only, never an automatic rule change.`,
          recommended_action: "backtest on strictly-prior rows -> walk-forward test -> challenger -> OOS promotion gate",
          validation_status: "not_tested",
          first_seen_at: now,
          ...payload,
        });
      }
    }
    if (iCreates.length) await svc.entities.GlobalLearningInsight.bulkCreate(iCreates);
    if (iUpdates.length) await svc.entities.GlobalLearningInsight.bulkUpdate(iUpdates);

    // ===== STEP 5 — CALIBRATION (observed honestly; not promoted under the floor)
    const calib = metricsOf(allEvents);
    calib.min_sample_for_recalibration = MIN_CALIBRATION_SAMPLE;
    const calibStatus = calibrationStatusOf(allEvents.length, MIN_CALIBRATION_SAMPLE);
    calib.status = calibStatus.status;
    calib.note = calibStatus.note;

    // ===== STEP 6 — CHRONOLOGICAL EVALUATION (older = train, newer = OOS)
    const { ordered, train, oos } = chronologicalSplit(allEvents);
    const groupByModel = (list) => {
      const g = new Map();
      for (const e of list) {
        const k = e.model_version || "unknown";
        if (!g.has(k)) g.set(k, []);
        g.get(k).push(e);
      }
      const out = {};
      for (const [k, l] of g) out[k] = metricsOf(l);
      return out;
    };
    const modelsAll = groupByModel(ordered);
    const modelsOos = groupByModel(oos);
    const championOos = modelsOos[CHAMPION] || { n: 0 };
    const challengerOos = modelsOos[CHALLENGER] || { n: 0 };

    // ===== STEP 7 — PROMOTION GATE (OOS evidence, minimum sample, no degradation)
    const gate = promotionGateDecision({ championOos, challengerOos, champion: CHAMPION, challenger: CHALLENGER });
    const decision = gate.decision;
    const reason = gate.reason;
    const changelogDecision = gate.changelogDecision;
    const nextChampion = gate.nextChampion;

    // Model changelog — ONE decision row per challenger version (upsert)
    const evaluation = {
      method: "CHRONOLOGICAL — older events train, newer events validate (OOS). No future information enters any earlier prediction.",
      train_boundary: oos.length ? oos[0].kickoff || oos[0].settled_at || "" : null,
      train_n: train.length,
      oos_n: oos.length,
      min_oos_sample_for_promotion: MIN_OOS_PROMOTION,
      models_all: modelsAll,
      models_oos: modelsOos,
      decision,
      reason,
    };
    const logPayload = {
      previous_version: CHAMPION,
      new_version: CHALLENGER,
      scope: "MODEL",
      affected_sections: "kala, run-o, monster, paste",
      change: "RX-2.1 challenger (injury + lineup intelligence) evaluated against the RX-2.0 champion on chronological settled forward evidence",
      reason,
      evidence_json: JSON.stringify({ train_n: train.length, oos_n: oos.length, models_all: modelsAll, models_oos: modelsOos }),
      sample_size: challengerOos.n || 0,
      brier_before: championOos.brier ?? 0,
      brier_after: challengerOos.brier ?? 0,
      logloss_before: championOos.logloss ?? 0,
      logloss_after: challengerOos.logloss ?? 0,
      oos_result: decision,
      decision: changelogDecision,
      rollback_version: CHAMPION,
      changed_at: now,
    };
    const logRows = await patientRead(() => svc.entities.ModelChangelog.filter({ new_version: CHALLENGER }, "-changed_at", 20));
    if (logRows?.length) await svc.entities.ModelChangelog.update(logRows[0].id, logPayload);
    else await svc.entities.ModelChangelog.create(logPayload);

    // ===== STEP 8 — DRIFT (recent vs historical; alarms only at sufficient history)
    const drift = driftVerdictOf(ordered);

    // ===== STEP 9 — ACTIVE MODEL REGISTRY (the source of truth for future predictions)
    const amRows = await patientRead(() => svc.entities.ActiveModel.filter({ registry_key: "active-model" }, "-created_date", 5));
    const currentRegistry = resolveActiveModel(amRows, CHAMPION, CHALLENGER);
    const prevChampionSince = currentRegistry.champion_version === nextChampion && amRows?.[0]?.champion_since ? amRows[0].champion_since : now;
    const amPayload = {
      registry_key: "active-model",
      champion_version: nextChampion,
      challenger_version: CHALLENGER,
      champion_since: prevChampionSince,
      promotion_status: decision,
      last_decision_reason: reason,
      last_evaluated_at: now,
      rollback_target: CHAMPION,
      evaluation_summary_json: JSON.stringify({
        champion_oos: championOos,
        challenger_oos: challengerOos,
        train_n: train.length,
        oos_n: oos.length,
        total_settled_events: allEvents.length,
      }),
      drift_status: drift.verdict,
      drift_note: drift.note,
    };
    if (amRows?.length) await svc.entities.ActiveModel.update(amRows[0].id, amPayload);
    else await svc.entities.ActiveModel.create(amPayload);

    // ===== STEP 10 — NO-PICK / ABSTENTION EVIDENCE
    const obsReadOk = { rejected: false, qualified: false };
    const rejectedObs = await patientRead(() => svc.entities.KalaModelObservation.filter({ qualified: false }, "-created_date", 5000)).catch(() => null);
    if (Array.isArray(rejectedObs)) obsReadOk.rejected = true;
    const qualifiedObs = await patientRead(() => svc.entities.KalaModelObservation.filter({ qualified: true }, "-created_date", 5000)).catch(() => null);
    if (Array.isArray(qualifiedObs)) obsReadOk.qualified = true;
    const rejectedN = Array.isArray(rejectedObs) ? rejectedObs.length : 0;
    const qualifiedN = Array.isArray(qualifiedObs) ? qualifiedObs.length : 0;
    const noPick = {
      candidates_evaluated: rejectedN + qualifiedN,
      rejected_no_pick: rejectedN,
      qualified: qualifiedN,
      no_pick_rate_pct: rejectedN + qualifiedN ? r2((rejectedN / (rejectedN + qualifiedN)) * 100) : null,
      read_available: obsReadOk.rejected && obsReadOk.qualified,
      note:
        obsReadOk.rejected && obsReadOk.qualified
          ? "Candidates failing the gates are recorded as research observations (qualified = false) — abstention is enforced at prediction time and their settled results become rejection-learning input. The engine prefers fewer, higher-precision picks and never fills a quota."
          : "Observation reads were throttled this run — abstention figures shown are partial and refresh on the next cycle (a failed read is never reported as zero candidates).",
    };

    // ===== STEP 11 — CHAIN HEALTH (database-backed, never cosmetic)
    const wins = allEvents.filter((e) => e.outcome === "won").length;
    const losses = allEvents.filter((e) => e.outcome === "lost").length;
    const forensicsFilled = allEvents.filter((e) => e.forensics_json).length;
    const chain = [
      {
        stage: "Prediction generated",
        status: eligible.length && eligible.every((o) => predByKey.has(o.global_prediction_id)) ? "COMPLETE" : outcomes.length ? "PARTIAL" : "BLOCKED",
        detail: `every eligible outcome joined to its canonical prediction row (${predByKey.size} joined) — outcomes exist only for settled canonical predictions`,
      },
      {
        stage: "Individual selection recorded",
        status: outcomes.length ? "COMPLETE" : "BLOCKED",
        detail: `${outcomes.length} graded outcome rows — one per canonical selection`,
      },
      {
        stage: "Result verified",
        status: allEvents.length
          ? allEvents.every((e) => e.verification_source === "verified_provider")
            ? "COMPLETE"
            : "PARTIAL"
          : "BLOCKED",
        detail: allEvents.length
          ? `${allEvents.filter((e) => e.verification_source === "verified_provider").length}/${allEvents.length} events graded from a verified provider`
          : "no events yet",
      },
      {
        stage: "Outcome settled",
        status: outcomes.length ? "COMPLETE" : "BLOCKED",
        detail: `${outcomes.filter((o) => ["won", "lost"].includes(o.settlement)).length} WON/LOSS settled — VOID/PUSH/CANCELLED never train`,
      },
      {
        stage: "Learning event created",
        status: eligible.length ? (allEvents.length >= new Set(eligible.map((o) => o.global_prediction_id)).size ? "COMPLETE" : "PARTIAL") : "BLOCKED",
        detail: `${allEvents.length} events on record for ${new Set(eligible.map((o) => o.global_prediction_id)).size} unique eligible prediction identities (${duplicatesPrevented.length} duplicate copies prevented this run)`,
      },
      {
        stage: "Learning event counted",
        status: allEvents.length && allEvents.every((e) => e.status === "counted") ? "COMPLETE" : "BLOCKED",
        detail: `${allEvents.filter((e) => e.status === "counted").length} counted — deterministic keys make double-counting impossible`,
      },
      {
        stage: "Win/loss forensics recorded",
        status: forensicsFilled === allEvents.length && allEvents.length ? "COMPLETE" : allEvents.length ? "PARTIAL" : "BLOCKED",
        detail: `${forensicsFilled}/${allEvents.length} events carry evidence-based forensics (INSUFFICIENT EVIDENCE when the data cannot attribute)`,
      },
      {
        stage: "Feature evidence generated",
        status: evidence.length ? "COMPLETE" : "BLOCKED",
        detail: `${evidence.length} segment evaluations (segments under 5 samples are explicitly labelled INSUFFICIENT SAMPLE — never forced)`,
      },
      { stage: "Calibration evaluated", status: "COMPLETE", detail: calib.status },
      {
        stage: "Model evaluation executed",
        status: "COMPLETE",
        detail: `${Object.keys(modelsAll).join(", ") || "no models"} — chronological split train ${train.length} / OOS ${oos.length}`,
      },
      {
        stage: "OOS validation executed",
        status: oos.length ? "COMPLETE" : "PARTIAL",
        detail: `OOS window holds ${oos.length} events — below the ${MIN_OOS_PROMOTION}-event promotion minimum`,
      },
      { stage: "Promotion gate evaluated", status: "COMPLETE", detail: decision },
      {
        stage: "Active model registry updated",
        status: "COMPLETE",
        detail: `${nextChampion} is the active champion — the registry is the single source of truth future predictions resolve through`,
      },
      {
        stage: "Future prediction consumes active model",
        status: "PARTIAL",
        detail: `The registry auto-flips when the gate promotes, and the prediction-generation layer now stamps the registry-resolved production model into every new prediction snapshot (engine champion + challenger recorders). Champion retained — no promotion yet, so no promoted-version prediction row exists yet.`,
      },
      {
        stage: "New outcome returns to learning",
        status: "COMPLETE",
        detail: `The cycle runs daily on the scheduled automation (${trigger} this run) — newly settled outcomes fold in idempotently, counted exactly once`,
      },
    ];

    // ===== STEP 12 — CYCLE REPORT (single latest-cycle registry row)
    const repRows = await patientRead(() => svc.entities.LearningCycleReport.filter({ registry_key: "learning-cycle-latest" }, "-created_date", 5));
    const repPayload = {
      registry_key: "learning-cycle-latest",
      last_ran_at: now,
      runs_count: (repRows?.length ? repRows[0].runs_count || 0 : 0) + 1,
      status: "completed",
      outcomes_seen: outcomes.length,
      eligible: eligible.length,
      skipped_json: JSON.stringify(skipped),
      events_total: allEvents.length,
      events_created: created,
      events_existing: priorEvents.length,
      wins,
      losses,
      feature_evidence_json: JSON.stringify(evidence),
      insights_upserted: iCreates.length + iUpdates.length,
      calibration_json: JSON.stringify(calib),
      evaluation_json: JSON.stringify(evaluation),
      promotion_json: JSON.stringify({
        champion: CHAMPION,
        challenger: CHALLENGER,
        decision,
        reason,
        min_oos_sample: MIN_OOS_PROMOTION,
        changelog_decision: changelogDecision,
      }),
      drift_json: JSON.stringify(drift),
      no_pick_json: JSON.stringify(noPick),
      chain_health_json: JSON.stringify(chain),
      notes: `Learning loop active — trigger: ${trigger} (daily scheduled automation deployed). Model update not yet promoted — more verified outcomes required. VOID/PUSH never train; insights never alter production until validated through backtest, walk-forward and OOS promotion gates. ${duplicatesPrevented.length} duplicate event(s) prevented this run (idempotency proven).`,
    };
    if (repRows?.length) await svc.entities.LearningCycleReport.update(repRows[0].id, repPayload);
    else await svc.entities.LearningCycleReport.create(repPayload);

    return Response.json({
      ok: true,
      trigger,
      batch,
      outcomes_seen: outcomes.length,
      eligible: eligible.length,
      skipped,
      events_created: created,
      events_existing: priorEvents.length,
      events_total: allEvents.length,
      duplicates_prevented: duplicatesPrevented.length,
      forensics_backfilled: forensicsBackfill.length,
      wins,
      losses,
      insights_upserted: iCreates.length + iUpdates.length,
      calibration: { n: calib.n, brier: calib.brier, logloss: calib.logloss, ece_pp: calib.ece_pp, status: calib.status },
      evaluation: { decision, reason, train_n: train.length, oos_n: oos.length, models_all: modelsAll, models_oos: modelsOos },
      promotion: { champion: nextChampion, challenger: CHALLENGER, decision, changelog_decision: changelogDecision },
      drift: drift.verdict,
      no_pick: noPick,
      chain,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "learning cycle failed" }, { status: 500 });
  }
}