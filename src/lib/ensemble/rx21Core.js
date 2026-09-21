// RX-2.1 CORE (pure) — the challenger model's math, deliberately free of any
// SDK or network import so it is directly unit-testable.
//
// RX-2.1 ADDS two intelligence layers on top of the untouched RX-2.0
// champion ensemble:
//  - INJURY INTELLIGENCE — an additional ensemble voter derived from verified
//    API-Football injury data. Impact is a transparent ABSENCE-COUNT PROXY:
//    no player-importance feed is connected, so it is never dressed up as a
//    player-value model. The voter votes ONLY on Home Win / Away Win, because
//    an honest shift cannot be derived for draws or goal markets.
//  - LINEUP INTELLIGENCE — confirmed lineups REDUCE uncertainty and improve
//    the risk picture; they never shift point estimates (no player-importance
//    data exists to support an honest probability shift). An unconfirmed
//    lineup close to kickoff raises a WARN risk flag.
//
// RX-2.0 is never modified. RX-2.1 runs in parallel as a research challenger
// and is promoted only on out-of-sample evidence (100+ common settled rows
// and a 5%+ Brier improvement — see championChallengerComparison).

export const RX21_MODEL_VERSION = "RX-2.1";
// Transparent BASELINE challenger weight — deliberately conservative so the
// new enrichment cannot dominate the champion ensemble. Learned challenger
// weights begin only after a sufficient settled sample.
export const RX21_INJURY_VOTER_WEIGHT = 0.22;
// Max probability shift the injury voter may apply to its own vote.
export const RX21_INJURY_SHIFT = 0.15;
export const RX21_LINEUP_UNC_REDUCTION = 0.06; // confirmed lineups reduce uncertainty
export const RX21_LINEUP_RISK_MIN = 45; // minutes-to-kickoff below which an unconfirmed lineup is a WARN flag
// RX-2.0's qualification floors, mirrored here so the challenger faces the
// SAME gates as the champion — never softer, never lowered for volume.
export const RX21_MIN_QUALIFY_PROB = 0.68;
export const RX21_MIN_AGREEMENT = 0.75;
// Confidence caps (spec): priced 97 / unpriced 92 — never 99/100/"guaranteed".
export const RX21_CONF_CAP_PRICED = 97;
export const RX21_CONF_CAP_UNPRICED = 92;
// === EXPECTED-GOALS (xG) RESEARCH VOTE ===
// Transparent BASELINE research weight + max shift — deliberately conservative.
// The xG vote is RECORDED AS AN ABLATION ONLY: it never changes a recorded
// challenger probability; it becomes a real voter only after out-of-sample
// validation promotes it (the same rule that governs every model change).
export const RX21_XG_VOTER_WEIGHT = 0.18;
export const RX21_XG_MAX_SHIFT = 0.12;

export const clamp21 = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// === CROSS-PROVIDER TEAM-NAME EQUIVALENCE (pure) ===
// The board's fixtures come from the openfootball verified feed, injuries and
// lineups from API-Football — the same club is named differently across the
// two providers ("Sporting Clube de Braga" vs "Braga"). Exact normalized
// equality first; token-subset equivalence second (legal-form tokens like
// FC/CF/SC/AC and connectors stripped, accents folded). The caller rejects
// AMBIGUOUS matches — a name is never force-fit onto the wrong club.
const normTeam = (s) =>
  String(s || "")
    // letters NFD cannot decompose (ø, đ, ß, ł, þ …) — transliterate explicitly
    .replace(/[øØđĐßłŁþÞ]/g, (c) => ({ ø: "o", Ø: "O", đ: "d", Đ: "D", ß: "ss", ł: "l", Ł: "L", þ: "th", Þ: "th" }[c]))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const TEAM_LEGAL_TOKENS = new Set([
  "fc", "cf", "sc", "ac", "as", "afc", "cfc", "ca", "cd", "sd", "fk", "sk", "if", "bk",
  "sv", "tsv", "vfb", "vfl", "spvgg", "club", "clube", "clubde", "1", "de", "da", "do", "dos", "el", "al", "the",
]);
const teamTokens = (s) =>
  normTeam(s)
    .split(" ")
    .filter((t) => t && !TEAM_LEGAL_TOKENS.has(t));
export function teamNameMatches(a, b) {
  if (!a || !b) return false;
  if (normTeam(a) === normTeam(b)) return true;
  const ta = teamTokens(a);
  const tb = teamTokens(b);
  if (!ta.length || !tb.length) return false;
  const smaller = ta.length <= tb.length ? ta : tb;
  const larger = smaller === ta ? tb : ta;
  let strong = 0;
  for (const t of smaller) {
    if (!larger.includes(t)) return false;
    if (t.length >= 3) strong++;
  }
  return strong >= 1;
}

// Apply calibration identically to ensemble/calibration.calibrate — a
// versioned challenger never invents its own calibration.
export function applyCalibration(p, cal) {
  if (!cal || !cal.ready || typeof cal.factorFor !== "function") return p;
  return clamp21(p * cal.factorFor(p), 0.3, 0.995);
}

// === IMMUTABLE KEYS — a challenger row never rewrites another row ===
export const challengerKey = (fixtureId, marketKey) => `${fixtureId}|${marketKey}|RX-2.1`;
export const challengerKeyV2 = (fixtureId, marketKey) => `${fixtureId}|${marketKey}|RX-2.1:v2`;

const versionOf = (key) => {
  const m = /:v(\d+)$/.exec(String(key || ""));
  return m ? Number(m[1]) : 1;
};

// Latest row per base key (fixture|market) — a pre-kickoff lineup
// confirmation creates :v2; comparisons always use the newest version.
export function latestByBaseKey(rows) {
  const best = new Map();
  for (const r of rows || []) {
    const base = String(r.observation_key || "").replace(/\|RX-2\.1(:v\d+)?$/, "");
    if (!base) continue;
    const cur = best.get(base);
    if (!cur || versionOf(r.observation_key) > versionOf(cur.observation_key)) best.set(base, r);
  }
  return best;
}

// === INJURY INTELLIGENCE (pure) ===
// records = verified API-Football injury rows for this team on the fixture's
// day. null (no data) is UNKNOWN — never treated as zero absences.
export function injuryImpactOf(records) {
  if (!Array.isArray(records)) return null;
  let out = 0;
  let doubtful = 0;
  for (const r of records) {
    const type = String(r?.player?.type || "").toLowerCase();
    if (type.includes("question")) doubtful++;
    else out++;
  }
  return {
    out,
    doubtful,
    impact: clamp21(0.15 * out + 0.05 * doubtful, 0, 1),
    basis: "absence-count proxy — no player-importance feed connected",
  };
}

// Positive delta = the AWAY side is more weakened → favors the home side.
export function injuryDeltaOf(homeImpact, awayImpact) {
  if (homeImpact == null || awayImpact == null) return null; // unknown ≠ zero
  return clamp21(awayImpact - homeImpact, -1, 1);
}

// === EXPECTED-GOALS (xG) RESEARCH (pure) ===
// Verified recent xG form (from the xg transport) → a transparent research
// vote for markets where an honest expected-goals shift exists. null = no
// honest vote exists (draws, double chance, missing data). Basis: an
// expected-goals proxy — never dressed up as a shot-quality model.
export function expectedGoalsTotalOf(xg) {
  const hf = Number(xg?.home?.xgFor);
  const af = Number(xg?.away?.xgFor);
  if (!Number.isFinite(hf) || !Number.isFinite(af)) return null;
  return Math.round((hf + af) * 100) / 100;
}

export function xgVoteOf(marketKey, xg) {
  if (!xg || xg.status !== "matched") return null;
  const homeFor = Number(xg.home?.xgFor);
  const homeAgainst = Number(xg.home?.xgAgainst);
  const awayFor = Number(xg.away?.xgFor);
  const awayAgainst = Number(xg.away?.xgAgainst);
  if (![homeFor, homeAgainst, awayFor, awayAgainst].every(Number.isFinite)) return null;
  const cap = (v) => clamp21(v, 0.5 - RX21_XG_MAX_SHIFT, 0.5 + RX21_XG_MAX_SHIFT);
  const k = String(marketKey || "");
  const lineM = /^[OU]([\d.]+)$/.exec(k);
  if (lineM) {
    const line = Number(lineM[1]);
    const diff = homeFor + awayFor - line; // expected total goals vs the line
    return cap(0.5 + (k.startsWith("O") ? diff : -diff) * 0.22);
  }
  const total = homeFor + awayFor;
  if (k === "BTTS_Y") return cap(0.5 + (total - 2.4) * 0.18);
  if (k === "BTTS_N") return cap(0.5 - (total - 2.4) * 0.18);
  if (k === "1" || k === "2") {
    const edge = (homeFor + awayAgainst) / 2 - (awayFor + homeAgainst) / 2; // attack vs opposing defense
    return cap(0.5 + (k === "1" ? edge : -edge) * 0.2);
  }
  return null; // draws / double chance — no honest xG shift exists
}

// RESEARCH ABLATION ONLY — what the challenger probability WOULD be with the
// xG voter added. The recorded RX-2.1 probability is NEVER changed by this.
export function xgAblationOf(c, xg, weights, calibration) {
  const vote = xgVoteOf(c?.marketKey, xg);
  if (vote == null) return null;
  const ens = challengerEnsemble(c.perModel, vote, weights, RX21_XG_VOTER_WEIGHT, "xg");
  if (!ens) return null;
  const calibrated = applyCalibration(ens.prob, calibration);
  if (!Number.isFinite(calibrated)) return null;
  return { E_xg: calibrated, xgVote: vote, xgWeight: RX21_XG_VOTER_WEIGHT };
}

// === CHALLENGER ENSEMBLE (pure) ===
// Re-blends the champion's per-model votes plus the injury voter using the
// champion's model weights (passed in — a mirror of RX_MODELS, supplied by the
// recording layer). Replicates the engine's weighted-mean + agreement math.
export function challengerEnsemble(perModel, injuryVote, weights, injuryWeight = RX21_INJURY_VOTER_WEIGHT, voteKey = "injury") {
  const voters = Object.entries(perModel || {})
    .map(([k, p]) => ({ k, p: Number(p), w: k === voteKey ? injuryWeight : (weights?.[k] ?? 0.08) }))
    .filter((v) => Number.isFinite(v.p));
  if (injuryVote != null && !voters.some((v) => v.k === voteKey)) {
    voters.push({ k: voteKey, p: injuryVote, w: injuryWeight });
  }
  if (!voters.length) return null;
  const wsum = voters.reduce((s, v) => s + v.w, 0) || 1;
  const prob = voters.reduce((s, v) => s + v.p * (v.w / wsum), 0);
  if (!Number.isFinite(prob)) return null; // numeric corruption — no candidate
  const variance = voters.reduce((s, v) => s + (v.w / wsum) * (v.p - prob) ** 2, 0);
  const cv = prob > 0 ? Math.sqrt(Math.max(0, variance)) / Math.max(prob, 1e-6) : 1;
  return {
    prob: clamp21(prob, 0.01, 0.995),
    agreement: clamp21(1 - cv * 1.8, 0, 1),
    voting: voters.length,
    perModel: Object.fromEntries(voters.map((v) => [v.k, Math.round(v.p * 1000) / 1000])),
  };
}

export const gradeOf21 = (master) => {
  if (master >= 95) return "ULTRA ELITE";
  if (master >= 90) return "ELITE";
  if (master >= 85) return "STRONG";
  if (master >= 80) return "QUALIFYING";
  return "WATCH";
};

// The RX-2.1 challenger candidate. `c` is the champion's candidate (untouched),
// `enrich` = { injuryDelta, lineupStatus, minutesToKickoff }, `weights` = the
// champion model weights, `calibration` = the live calibration state.
// Returns null on numeric corruption — the candidate is rejected, never fudged.
export function challengerCandidate(c, enrich, weights, calibration, opts = {}) {
  if (!c || !c.marketKey) return null;
  const minProb = opts.minProb ?? RX21_MIN_QUALIFY_PROB;
  const minAgreement = opts.minAgreement ?? RX21_MIN_AGREEMENT;

  const injDelta = Number.isFinite(enrich?.injuryDelta) ? enrich.injuryDelta : null;
  const votesOnInjury = injDelta != null && ["1", "2"].includes(c.marketKey);
  const injuryVote = votesOnInjury
    ? clamp21((Number(c.ensemble) || 0) + (c.marketKey === "1" ? 1 : -1) * RX21_INJURY_SHIFT * injDelta, 0.01, 0.995)
    : null;

  const ens21 = challengerEnsemble(c.perModel, injuryVote, weights);
  if (!ens21) return null;
  const calibrated21 = applyCalibration(ens21.prob, calibration);
  // PROBABILITY SANITY — no NaN, Infinity or impossible values ever qualify.
  if (!Number.isFinite(calibrated21) || calibrated21 <= 0 || calibrated21 >= 1) return null;

  // LINEUP INTELLIGENCE — confirmation reduces uncertainty; it never moves
  // the point estimate. Unconfirmed close to kickoff = WARN risk flag.
  const lineup = enrich?.lineupStatus || "";
  let uncertainty21 = clamp21(Number(c.uncertainty) || 0, 0, 1);
  if (lineup === "confirmed") uncertainty21 = clamp21(uncertainty21 - RX21_LINEUP_UNC_REDUCTION, 0, 1);
  const flags = [...(Array.isArray(c.flags) ? c.flags : [])];
  const minutes = Number(enrich?.minutesToKickoff);
  if (
    lineup && lineup !== "confirmed" && lineup !== "unavailable" &&
    Number.isFinite(minutes) && minutes >= 0 && minutes <= RX21_LINEUP_RISK_MIN
  ) {
    flags.push({ id: "lineup_unknown_close", severity: "WARN", label: `Lineup not confirmed within ${RX21_LINEUP_RISK_MIN} min of kickoff` });
  }

  // ODDS INTELLIGENCE — the SAME real price the champion used; the edge is
  // recomputed against the margin-adjusted benchmark where it is known.
  const priced = !!c.priced && (Number(c.price) || 0) > 1;
  const implied = priced ? 1 / c.price : 0;
  const bench = priced ? (c.marginImplied ?? implied) : 0;
  const rawEdgePct = priced ? Math.round((calibrated21 - implied) * 1000) / 10 : 0;
  const edgePct = priced ? Math.round((calibrated21 - bench) * 1000) / 10 : 0;
  const haircut = Math.round((uncertainty21 * 6 + (1 - ens21.agreement) * 4) * 10) / 10;
  const adjEdgePct = priced ? Math.round((edgePct - haircut) * 10) / 10 : null;
  const minAdjEdge = c.minAdjEdge ?? null;

  // KALA MASTER SCORE — derived from the champion's recorded score so every
  // shared component cancels; only probability/agreement/edge/uncertainty move.
  const pc = (p) => clamp21((p - 0.5) / 0.45, 0, 1);
  const ac = (a) => clamp21((a - 0.6) / 0.4, 0, 1);
  const ec = (e) => clamp21((e + 2) / 10, 0, 1);
  const master = clamp21(
    Math.round(
      (Number(c.master) || 0) +
        34 * (pc(calibrated21) - pc(Number(c.calibrated) || 0)) +
        16 * (ac(ens21.agreement) - ac(Number(c.agreement) || 0)) +
        (priced ? 14 * (ec(edgePct) - ec(Number(c.edgePct) || 0)) : 0) +
        7 * ((Number(c.uncertainty) || 0) - uncertainty21)
    ),
    0,
    100
  );

  const blocked = flags.some((f) => f.severity === "BLOCK");
  const qualifies =
    calibrated21 >= minProb &&
    ens21.agreement >= minAgreement &&
    c.dq !== "LOW" &&
    !blocked &&
    !(priced && minAdjEdge != null && adjEdgePct != null && adjEdgePct < minAdjEdge);

  const rejectReason = !qualifies
    ? calibrated21 < minProb
      ? `RX-2.1 probability ${Math.round(calibrated21 * 100)}% below the qualifying floor`
      : ens21.agreement < minAgreement
      ? `RX-2.1 LOW MODEL AGREEMENT (${Math.round(ens21.agreement * 100)}%) — consensus fails`
      : c.dq === "LOW"
      ? "Data quality LOW — never enters premium selections"
      : priced && adjEdgePct != null && adjEdgePct < minAdjEdge
      ? `RX-2.1 adjusted edge ${adjEdgePct}pp below the ${minAdjEdge}pp floor required at odds ${Number(c.price).toFixed(2)}`
      : "RX-2.1 master score below the qualifying bar"
    : "";

  // ABLATION — A (champion models recomputed), B (+ injuries), D (full
  // RX-2.1). C (lineups) does not move point estimates — it moves
  // uncertainty only, recorded as uncertainty20/21 below. The data decides
  // whether RX-2.1 is better; nothing is assumed.
  const baseEns = challengerEnsemble(c.perModel, null, weights);
  const A = baseEns ? applyCalibration(baseEns.prob, calibration) : null;
  // xG RESEARCH ABLATION — what the challenger WOULD say with a verified
  // expected-goals voter. Research-only: it never moves calibrated21, the
  // recorded probability, the master score or qualification. Promotion
  // happens only on out-of-sample evidence, like every model change.
  const xgResearch = xgAblationOf(c, enrich?.xg, weights, calibration);
  const ablation = {
    note: "A/B/D are calibrated probabilities. C (lineups) affects uncertainty only — see uncertainty20/21. E (expected goals) is research-only — the recorded probability is unchanged until out-of-sample evidence promotes it.",
    A_rx20_models_recomputed: A,
    B_injuries: votesOnInjury ? calibrated21 : null,
    D_rx21: calibrated21,
    E_xg: xgResearch?.E_xg ?? null,
    xg: {
      status: enrich?.xg?.status || "not_checked",
      expTotal: expectedGoalsTotalOf(enrich?.xg),
      homeFor: enrich?.xg?.home?.xgFor ?? null,
      awayFor: enrich?.xg?.away?.xgFor ?? null,
      basis: "verified expected-goals form — research ablation, never a recorded voter",
    },
    champion_recorded: Number(c.calibrated) || null,
    uncertainty20: Number.isFinite(Number(c.uncertainty)) ? c.uncertainty : null,
    uncertainty21,
  };

  return {
    prob: ens21.prob,
    calibrated: calibrated21,
    agreement: ens21.agreement,
    voting: ens21.voting,
    perModel: ens21.perModel,
    injuryVote,
    injuryDelta: injDelta,
    lineupStatus: lineup,
    uncertainty: uncertainty21,
    master,
    grade: gradeOf21(master),
    qualifies,
    rejectReason,
    flags,
    priced,
    price: c.price || 0,
    implied,
    marginImplied: c.marginImplied ?? 0,
    rawEdgePct,
    edgePct,
    adjEdgePct,
    minAdjEdge,
    evPct: priced ? Math.round((calibrated21 * c.price - 1) * 1000) / 10 : 0,
    fairOdds: Math.round((1 / calibrated21) * 100) / 100,
    displayConf: Math.min(
      Math.round(calibrated21 * 100),
      priced ? RX21_CONF_CAP_PRICED : RX21_CONF_CAP_UNPRICED
    ),
    ablation,
  };
}

// A pre-kickoff lineup confirmation creates a NEW immutable snapshot (:v2).
// Point estimates are unchanged; uncertainty is reduced; the WARN flag is
// cleared; qualification is re-evaluated on the same hard floors. The v1 row
// is never touched.
export function promoteLineupSnapshot(row, lineup) {
  const u20 = Number(row.uncertainty) || 0;
  const u21 = clamp21(u20 - RX21_LINEUP_UNC_REDUCTION, 0, 1);
  const master21 = clamp21(Math.round((Number(row.kala_score) || 0) + 7 * (u20 - u21)), 0, 100);
  let flags = [];
  try { flags = JSON.parse(row.flags_json || "[]"); } catch { flags = []; }
  const flags21 = flags.filter((f) => f && f.id !== "lineup_unknown_close");
  const blocked = flags21.some((f) => f && f.severity === "BLOCK");
  const calibrated = Number(row.calibrated_probability) || 0;
  const priced = (Number(row.market_odds) || 0) > 1;
  const adjEdge = Number(row.adjusted_edge_pct);
  const minAdj = Number(row.min_adj_edge);
  const qualifies =
    calibrated >= RX21_MIN_QUALIFY_PROB &&
    (Number(row.agreement) || 0) >= RX21_MIN_AGREEMENT &&
    row.data_quality !== "LOW" &&
    !blocked &&
    !(priced && Number.isFinite(adjEdge) && Number.isFinite(minAdj) && adjEdge < minAdj);
  let snap = {};
  try { snap = JSON.parse(row.snapshot_json || "{}"); } catch { snap = {}; }
  return {
    observation_key: challengerKeyV2(row.fixture_id, row.market_key),
    lineup_status: "confirmed",
    uncertainty: u21,
    kala_score: master21,
    flags_json: JSON.stringify(flags21),
    qualified: qualifies,
    reject_reason: qualifies ? "" : row.reject_reason || "RX-2.1 gate re-evaluated at lineup confirmation",
    snapshot_json: JSON.stringify({
      ...snap,
      rx21_lineup_confirmation: {
        supersedes: row.observation_key,
        reason: "CONFIRMED LINEUPS became available pre-kickoff — new immutable snapshot. Point estimates unchanged; uncertainty reduced.",
        prevUncertainty: u20,
        lineup: lineup || null,
      },
    }),
    recorded_at: new Date().toISOString(),
    capture_status: "pending",
    closing_snapshots_json: "[]",
    status: "open",
  };
}

export function challengerSummary(rows) {
  const all = Array.isArray(rows) ? rows : [];
  const latest = [...latestByBaseKey(all).values()];
  const settled = latest.filter((r) => ["won", "lost"].includes(r.status));
  const matched = latest.filter((r) => r.injury_status === "matched");
  return {
    rowsTotal: all.length,
    latest: latest.length,
    versioned: all.length - latest.length,
    injuryInformed: matched.length,
    injuryUnmatched: latest.filter((r) => r.injury_status === "unmatched").length,
    injuryUnavailable: latest.filter((r) => r.injury_status === "unavailable").length,
    injuryAbsentees: matched.reduce((s, r) => s + (Number(r.injury_absences_home) || 0) + (Number(r.injury_absences_away) || 0), 0),
    lineupConfirmed: latest.filter((r) => r.lineup_status === "confirmed").length,
    lineupUnchecked: latest.filter((r) => !r.lineup_status).length,
    qualified: latest.filter((r) => r.qualified).length,
    settled: settled.length,
    won: settled.filter((r) => r.status === "won").length,
    lost: settled.filter((r) => r.status === "lost").length,
  };
}

// CHAMPION / CHALLENGER head-to-head on IDENTICAL settled candidates.
// Promotion requires 100+ common settled rows and a 5%+ Brier improvement —
// the existing promotion rule. Nothing is ever promoted from a thin sample,
// and RX-2.0 stays champion until the evidence says otherwise.
export function championChallengerComparison(rows20, rows21) {
  const l20 = latestByBaseKey(Array.isArray(rows20) ? rows20 : []);
  const l21 = latestByBaseKey(Array.isArray(rows21) ? rows21 : []);
  let n = 0;
  let b20 = 0;
  let b21 = 0;
  for (const [base, r21] of l21) {
    const r20 = l20.get(base);
    if (!r20) continue;
    if (!["won", "lost"].includes(r21.status) || !["won", "lost"].includes(r20.status)) continue;
    const y = r21.status === "won" ? 1 : 0;
    const p20 = Number(r20.calibrated_probability);
    const p21 = Number(r21.calibrated_probability);
    if (!Number.isFinite(p20) || !Number.isFinite(p21)) continue;
    n++;
    b20 += (p20 - y) ** 2;
    b21 += (p21 - y) ** 2;
  }
  if (!n) {
    return { n: 0, brier20: null, brier21: null, improvementPct: null, verdict: "INSUFFICIENT — no common settled rows yet; the comparison begins after the first verified results" };
  }
  const B20 = Math.round((b20 / n) * 10000) / 10000;
  const B21 = Math.round((b21 / n) * 10000) / 10000;
  const improvementPct = Math.round((1 - B21 / Math.max(B20, 1e-6)) * 1000) / 10;
  const verdict =
    n >= 100
      ? improvementPct >= 5
        ? "PROMOTABLE — 100+ out-of-sample rows with a 5%+ Brier improvement (explicit confirmation still required before RX-2.1 replaces RX-2.0 on the boards)"
        : "NOT PROMOTED — sample is sufficient but the challenger has not earned a 5% Brier improvement; RX-2.0 stays champion"
      : `INSUFFICIENT — ${n}/100+ common settled rows; RX-2.0 stays champion`;
  return { n, brier20: B20, brier21: B21, improvementPct, verdict };
}