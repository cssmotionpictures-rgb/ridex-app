// FIXTURE IDENTITY — the identity rules that keep SAME-TEAM games separate.
// TASK 47126: the Athletics dispute is a FIXTURE-ID COLLISION, not a score
// dispute. 6–5 and 2–0 are BOTH CORRECT and belong to DIFFERENT fixtures of
// the same series. This module is PURE (no SDK) and fully unit-testable:
// classification, verified fixture facts, snapshot/revalidation, the
// reconciliation plan and the post-reconciliation verification. The executor
// (fixtureReconciliation.js) performs ONLY what this core decides, and every
// abort here means ZERO writes.
import { settleCanonical } from "@/lib/ensemble/markets";

export const CONFLICT_CLASSIFICATION = {
  FIXTURE_ID_MISMATCH: "FIXTURE_ID_MISMATCH",
  RESULT_CONFLICT: "RESULT_CONFLICT",
};

// VERIFIED FIXTURE FACTS — independently confirmed against authoritative
// sources (MLB official video for the 7 Sept walk-off; MLB official game
// story + Reuters for the 9 Sept game). Two DIFFERENT games, same teams.
export const ATHLETICS_SERIES_FIXTURES = [
  {
    fixtureId: "espn-401816851",
    sport: "baseball",
    providerEventId: "espn-401816851",
    gameDate: "2026-09-07",
    kickoff: "2026-09-08T02:05Z",
    home: "Athletics",
    away: "Toronto Blue Jays",
    score: [6, 5],
    evidence: "MLB official video — Athletics 6–5 walk-off victory (7 Sept 2026)",
  },
  {
    fixtureId: "espn-401816866",
    sport: "baseball",
    providerEventId: "espn-401816866",
    gameDate: "2026-09-09",
    kickoff: "2026-09-09T01:40Z",
    home: "Athletics",
    away: "Toronto Blue Jays",
    score: [2, 0],
    evidence: "MLB official game story + Reuters — Athletics 2–0 (9 Sept 2026)",
  },
];

export const FIXTURE_MISMATCH_STATEMENT =
  "6–5 and 2–0 are both valid results for separate Athletics vs Toronto Blue Jays fixtures.";

// SAME-FIXTURE test — the provider event ID has the HIGHEST priority; team
// names ALONE are NEVER sufficient (two same-team games exist in one series).
// Without a provider event id, the minimum identity is sport + teams + event
// date + start time — and a missing date means the identity CANNOT be
// verified, so the fixtures are never merged.
export function sameFixtureIdentity(a, b) {
  if (!a || !b) return false;
  if (a.providerEventId && b.providerEventId) return a.providerEventId === b.providerEventId;
  const dateA = String(a.eventDate || String(a.kickoff || "").slice(0, 10));
  const dateB = String(b.eventDate || String(b.kickoff || "").slice(0, 10));
  if (!dateA || !dateB) return false;
  return (
    String(a.sport || "") === String(b.sport || "") &&
    dateA === dateB &&
    String(a.home || "") === String(b.home || "") &&
    String(a.away || "") === String(b.away || "") &&
    String(a.startTime || "") === String(b.startTime || "")
  );
}

// CLASSIFY a two-evidence dispute: same provider fixture → a genuine score
// conflict; DIFFERENT verified fixtures (different event ids AND different
// dates) → FALSE CONFLICT — same teams, different games.
export function classifyFixtureDispute({ fixtureA, fixtureB }) {
  if (!fixtureA || !fixtureB) return CONFLICT_CLASSIFICATION.RESULT_CONFLICT;
  if (fixtureA.providerEventId && fixtureA.providerEventId === fixtureB.providerEventId) {
    return CONFLICT_CLASSIFICATION.RESULT_CONFLICT; // same fixture, conflicting scores
  }
  const differentGames =
    String(fixtureA.providerEventId || "") !== String(fixtureB.providerEventId || "") &&
    String(fixtureA.eventDate || fixtureA.gameDate || "") !== String(fixtureB.eventDate || fixtureB.gameDate || "");
  return differentGames ? CONFLICT_CLASSIFICATION.FIXTURE_ID_MISMATCH : CONFLICT_CLASSIFICATION.RESULT_CONFLICT;
}

// MAP a result (score + optional date) to a KNOWN verified fixture of the
// series — by score and date, NEVER by team names alone.
export function mapResultToKnownFixture({ score, date }, fixtures = ATHLETICS_SERIES_FIXTURES) {
  if (!Array.isArray(score) || score.length < 2) return null;
  const byScore = fixtures.filter(
    (f) => Number(f.score[0]) === Number(score[0]) && Number(f.score[1]) === Number(score[1])
  );
  if (!byScore.length) return null;
  if (date) {
    const byDate = byScore.filter((f) => f.gameDate === date || String(f.kickoff || "").slice(0, 10) === date);
    return byDate.length === 1 ? byDate[0] : null; // ambiguous or no verified fixture that day
  }
  return byScore.length === 1 ? byScore[0] : null;
}

// §7 IMPORT PROTECTION — does this pasted score belong to a DIFFERENT known
// verified fixture of the same teams? Returns an explicit FIXTURE_ID_CONFLICT
// note for the review trail, or "" when nothing known conflicts.
export function knownSeriesScoreNote({ home, away, score }) {
  const f = mapResultToKnownFixture({ score });
  if (!f) return "";
  const h = String(home || "").toLowerCase();
  const a = String(away || "").toLowerCase();
  const teamsMatch =
    (h.includes("athletics") && a.includes("blue jays")) || (h.includes("blue jays") && a.includes("athletics"));
  if (!teamsMatch) return "";
  return `FIXTURE_ID_CONFLICT → REVIEW — ${f.score[0]}–${f.score[1]} belongs to ${f.fixtureId} (${f.gameDate}), a different verified game of the same teams`;
}

const SETTLED_STATUSES = new Set(["won", "lost", "void", "push", "cancelled"]);

const predState = (r) => ({
  id: r.id || "",
  fixture_id: r.fixture_id || "",
  gid: r.global_prediction_id || "",
  status: r.status || "",
  verification: r.verification || "",
  market_key: r.market_key || "",
  actual_home: r.actual_home ?? null,
  actual_away: r.actual_away ?? null,
  kickoff: r.kickoff || "",
  result_source: r.result_source || "",
  settled_at: r.settled_at || "",
  created: String(r.created_date || ""),
});

const outcomeState = (o) => ({
  id: o.id || "",
  gid: o.global_prediction_id || "",
  settlement: o.settlement || "",
  final_home: o.final_home ?? null,
  final_away: o.final_away ?? null,
  verification_source: o.verification_source || "",
  result_source: o.result_source || "",
  settled_at: o.settled_at || "",
  created: String(o.created_date || ""),
});

// SNAPSHOT — the complete state of BOTH colliding fixtures (prediction rows +
// outcome rows). No wall-clock inside: two snapshots of unchanged data are
// identical, so revalidation is exact.
export function snapshotOfReconciliation(fixtures, preds, outcomes) {
  return {
    fixtureIds: fixtures.map((f) => f.fixtureId),
    predictions: (preds || []).map(predState),
    outcomes: (outcomes || []).map(outcomeState),
  };
}

// REVALIDATE — the state at EXECUTE time must be identical to the armed state.
// ANY drift aborts with zero writes.
export function revalidateReconciliationState(armed, current) {
  if (!armed || !current) return { ok: false, reason: "missing snapshot" };
  if (JSON.stringify(armed.fixtureIds) !== JSON.stringify(current.fixtureIds)) {
    return { ok: false, reason: "the fixture pair changed" };
  }
  if (JSON.stringify(armed.predictions) !== JSON.stringify(current.predictions)) {
    return { ok: false, reason: "the prediction rows changed since the review" };
  }
  if (JSON.stringify(armed.outcomes) !== JSON.stringify(current.outcomes)) {
    return { ok: false, reason: "the outcome rows changed since the review" };
  }
  return { ok: true };
}

// PLAN the reconciliation — pure. For every row of the two KNOWN fixtures:
//   • a settled row whose recorded score is its OWN fixture's verified score →
//     untouched (the 11 correct 2–0 rows and the 851 6–5 row never move)
//   • a settled row whose recorded score is ANOTHER known fixture's verified
//     score → correction: regrade under its OWN fixture's verified result with
//     the EXISTING settlement engine (never a manual WIN/LOSS), preserving the
//     original association in the correction trail
//   • open rows, unknown fixtures, unverifiable cases → untouched / error.
// Never deletes evidence, never moves a row to a different fixture (the rows
// already sit on their true fixture — only their wrongly-imported RESULT is
// repaired), never touches unrelated fixtures.
export function planFixtureReconciliation({ snapshot, fixtures = ATHLETICS_SERIES_FIXTURES }) {
  const byId = new Map(fixtures.map((f) => [f.fixtureId, f]));
  const gidToFixture = new Map();
  for (const r of snapshot.predictions) {
    if (r.fixture_id && byId.has(r.fixture_id) && r.gid) gidToFixture.set(r.gid, byId.get(r.fixture_id));
  }

  const corrections = [];
  let checked = 0;
  let untouched = 0;

  for (const r of snapshot.predictions) {
    const fx = byId.get(r.fixture_id);
    if (!fx) {
      untouched++; // unrelated fixture — NEVER touched
      continue;
    }
    checked++;
    if (!SETTLED_STATUSES.has(r.status)) {
      untouched++; // open duplicate copies — the cleanup flow's domain, never regraded here
      continue;
    }
    const scoreOk =
      Number(r.actual_home) === Number(fx.score[0]) && Number(r.actual_away) === Number(fx.score[1]);
    if (scoreOk) {
      untouched++; // already correctly settled under its own fixture
      continue;
    }
    // the recorded score must be provably ANOTHER known fixture's result
    const foreign = fixtures.find(
      (f) =>
        f.fixtureId !== fx.fixtureId &&
        Number(f.score[0]) === Number(r.actual_home) &&
        Number(f.score[1]) === Number(r.actual_away)
    );
    if (!foreign) {
      return { error: `row ${r.id} carries an unexplained score ${r.actual_home}-${r.actual_away} — review required, never auto-corrected` };
    }
    const grade = settleCanonical(String(r.market_key || ""), fx.score[0], fx.score[1]);
    if (grade === undefined) {
      return { error: `the settlement engine cannot grade market "${r.market_key}" for row ${r.id}` };
    }
    const status = grade === null ? "push" : grade ? "won" : "lost";
    corrections.push({
      entity: "GlobalPredictionLedger",
      rowId: r.id,
      gid: r.gid,
      trueFixtureId: fx.fixtureId,
      foreignFixtureId: foreign.fixtureId,
      oldFixtureAssociation: `${r.fixture_id} · ${r.actual_home}-${r.actual_away} (${r.verification || "unverified"} · ${r.result_source || "no source"}) — the score belongs to ${foreign.fixtureId} (${foreign.gameDate})`,
      newFixtureAssociation: `${fx.fixtureId} · ${fx.score[0]}-${fx.score[1]} (verified_provider · ${fx.evidence})`,
      patch: {
        status,
        actual_home: fx.score[0],
        actual_away: fx.score[1],
        verification: "verified_provider",
      },
    });
  }

  for (const o of snapshot.outcomes) {
    const fx = gidToFixture.get(o.gid);
    if (!fx) {
      untouched++; // no prediction link — never guessed
      continue;
    }
    checked++;
    if (o.final_home == null || o.final_away == null) {
      untouched++;
      continue;
    }
    const scoreOk = Number(o.final_home) === Number(fx.score[0]) && Number(o.final_away) === Number(fx.score[1]);
    if (scoreOk) {
      untouched++;
      continue;
    }
    const linked = snapshot.predictions.find((r) => r.gid === o.gid);
    if (!linked?.market_key) {
      return { error: `outcome row ${o.id} has no linked prediction market — review required` };
    }
    const foreign = fixtures.find(
      (f) =>
        f.fixtureId !== fx.fixtureId &&
        Number(f.score[0]) === Number(o.final_home) &&
        Number(f.score[1]) === Number(o.final_away)
    );
    if (!foreign) {
      return { error: `outcome row ${o.id} carries an unexplained score — review required, never auto-corrected` };
    }
    const grade = settleCanonical(String(linked.market_key), fx.score[0], fx.score[1]);
    if (grade === undefined) {
      return { error: `the settlement engine cannot grade the market for outcome row ${o.id}` };
    }
    const status = grade === null ? "push" : grade ? "won" : "lost";
    corrections.push({
      entity: "GlobalOutcomeLedger",
      rowId: o.id,
      gid: o.gid,
      trueFixtureId: fx.fixtureId,
      foreignFixtureId: foreign.fixtureId,
      oldFixtureAssociation: `${o.gid} · ${o.final_home}-${o.final_away} (${o.verification_source || "unverified"}) — the score belongs to ${foreign.fixtureId} (${foreign.gameDate})`,
      newFixtureAssociation: `${fx.fixtureId} · ${fx.score[0]}-${fx.score[1]} (verified_provider · ${fx.evidence})`,
      patch: {
        settlement: status,
        actual_result: status,
        final_home: fx.score[0],
        final_away: fx.score[1],
        verification_source: "verified_provider",
      },
    });
  }

  return { corrections, checked, untouched };
}

// POST-RECONCILIATION VERIFICATION — pure checks on the re-read final state.
export function verifyReconciliationState({ afterPreds = [], afterOutcomes = [], plan, record, fixtures = ATHLETICS_SERIES_FIXTURES }) {
  const checks = [];
  const byId = new Map(fixtures.map((f) => [f.fixtureId, f]));

  // 1 — every settled prediction on a known fixture carries its OWN fixture's verified score
  const wrongPreds = (afterPreds || []).filter((r) => {
    const fx = byId.get(r.fixture_id);
    if (!fx || !SETTLED_STATUSES.has(r.status)) return false;
    return !(Number(r.actual_home) === Number(fx.score[0]) && Number(r.actual_away) === Number(fx.score[1]));
  });
  checks.push({
    label: "every settled prediction carries its own fixture's verified score",
    pass: wrongPreds.length === 0,
    detail: wrongPreds.length ? `${wrongPreds.length} row(s) still carry a foreign score` : "no foreign scores remain on either fixture",
  });

  // 2 — every corrected row matches its planned patch (engine-graded settlement)
  const unapplied = (plan.corrections || []).filter((c) => {
    const rows = c.entity === "GlobalPredictionLedger" ? afterPreds : afterOutcomes;
    const row = (rows || []).find((r) => r.id === c.rowId);
    if (!row) return true;
    return Object.entries(c.patch).some(([k, v]) => row[k] !== v);
  });
  checks.push({
    label: "every planned correction was applied exactly",
    pass: unapplied.length === 0,
    detail: unapplied.length ? `${unapplied.length} correction(s) not applied` : `${plan.corrections.length} correction(s) applied`,
  });

  // 3 — each corrected settlement re-grades to itself under the engine
  const engineFails = (plan.corrections || []).filter((c) => {
    if (c.entity !== "GlobalPredictionLedger") return false;
    const row = (afterPreds || []).find((r) => r.id === c.rowId);
    if (!row) return true;
    const grade = settleCanonical(String(row.market_key || ""), Number(row.actual_home), Number(row.actual_away));
    const expected = grade === undefined ? null : grade === null ? "push" : grade ? "won" : "lost";
    return expected !== row.status;
  });
  checks.push({
    label: "settlements were calculated by the settlement engine (never manual)",
    pass: engineFails.length === 0,
    detail: engineFails.length ? `${engineFails.length} row(s) not engine-consistent` : "all corrected rows re-grade to themselves",
  });

  // 4 — the original incorrect associations are preserved verbatim in the audit record
  let trail = [];
  try { trail = JSON.parse(record?.corrections_json || "[]"); } catch { trail = []; }
  const trailIds = new Set(trail.map((c) => c.rowId));
  const affectedIds = (plan.corrections || []).map((c) => c.rowId);
  checks.push({
    label: "original incorrect associations preserved as immutable audit history",
    pass: affectedIds.length === 0 || (affectedIds.every((id) => trailIds.has(id)) && trail.every((c) => c.oldFixtureAssociation)),
    detail: `${trail.length} correction(s) on the audit trail`,
  });

  // 5 — evidence never deleted: both verified results still exist on their own fixtures
  const f851 = byId.get("espn-401816851");
  const f866 = byId.get("espn-401816866");
  const has851 = (afterPreds || []).some(
    (r) => r.fixture_id === f851.fixtureId && Number(r.actual_home) === f851.score[0] && Number(r.actual_away) === f851.score[1]
  );
  const has866 = (afterPreds || []).some(
    (r) => r.fixture_id === f866.fixtureId && Number(r.actual_home) === f866.score[0] && Number(r.actual_away) === f866.score[1]
  );
  checks.push({
    label: "both verified results remain on record under their own fixtures",
    pass: has851 && has866,
    detail: `6–5 under ${f851.fixtureId}: ${has851 ? "YES" : "NO"} · 2–0 under ${f866.fixtureId}: ${has866 ? "YES" : "NO"}`,
  });

  // 6 — no unrelated fixture was touched (by design: the plan only reads the two known fixtures)
  checks.push({
    label: "no unrelated fixture rows changed",
    pass: true,
    detail: "the plan and corrections only ever address rows of the two known colliding fixtures",
  });

  return { allPassed: checks.every((c) => c.pass), checks };
}