// RX VALIDATION — the hard data-validation gate, freshness engine, red-flag
// engine and provenance builder for the RX-2.0 ensemble. Nothing here invents
// data: every check either passes, or the fixture/candidate is rejected with
// the exact reason. Core rule: no prediction exists when a critical
// calculation returned invalid data.

// Minimum UNCERTAINTY-ADJUSTED edge a priced candidate needs to qualify,
// scaled by odds band — longshot protection (a high price never earns an easy
// pass just because the raw edge looks positive).
export const RX_MIN_ADJ_EDGE_LOW = 1.5; // odds < 2.00 (pp)
export const RX_MIN_ADJ_EDGE_MID = 2.5; // 2.00–2.99
export const RX_MIN_ADJ_EDGE_HIGH = 4.0; // 3.00+ — longshot territory

export const minAdjEdgeFor = (price) =>
  price >= 3 ? RX_MIN_ADJ_EDGE_HIGH : price >= 2 ? RX_MIN_ADJ_EDGE_MID : RX_MIN_ADJ_EDGE_LOW;

export const finiteOr = (x, fallback = null) =>
  typeof x === "number" && Number.isFinite(x) ? x : fallback;

// === HARD FIXTURE GATE ===
// DATA → VALIDATION — a fixture that fails any critical check never reaches
// the models. Never guesses: no kickoff time = no session classification, no
// passed kickoff = no pre-match prediction (no data leakage).
export function validateFixture({ home, away, league, kickoff, now = Date.now() }) {
  const reasons = [];
  const h = String(home || "").trim();
  const a = String(away || "").trim();
  if (!h || !a) reasons.push("invalid teams — a fixture without two named teams never enters");
  if (h && a && h.toLowerCase() === a.toLowerCase())
    reasons.push("team identity collision — home and away resolve to the same club");
  if (!String(league || "").trim()) reasons.push("invalid competition — no verified league label");
  const ms = kickoff ? new Date(kickoff).getTime() : null;
  if (!Number.isFinite(ms))
    reasons.push("invalid kickoff — no verified kickoff time; the Lagos session can never be classified honestly");
  else if (ms <= now)
    reasons.push("KICKOFF LOCK — kickoff has passed; a pre-match prediction now would leak the result");
  return { ok: reasons.length === 0, reasons, kickoffMs: Number.isFinite(ms) ? ms : null };
}

// === DATA FRESHNESS ENGINE ===
// Every input carries a freshness label. Odds staleness is enforced upstream
// (stale quotes are excluded before pricing), so a priced candidate is fresh
// by construction; form freshness is measured against the kickoff.
export function freshnessOf({ oddsTsMs, formLastPlayedMs, kickoffMs, now = Date.now(), oddsTtlMinutes = 30 }) {
  const odds = !oddsTsMs
    ? "unavailable"
    : now - oddsTsMs <= oddsTtlMinutes * 60000
    ? "fresh"
    : "stale";
  const formDays =
    formLastPlayedMs && kickoffMs && kickoffMs > formLastPlayedMs
      ? (kickoffMs - formLastPlayedMs) / 86400000
      : null;
  const form = formDays == null ? "unknown" : formDays <= 14 ? "fresh" : formDays <= 28 ? "aging" : "stale";
  return { odds, form, formDays: formDays != null ? Math.round(formDays) : null };
}

// === RED-FLAG ENGINE ===
// WARN flags are shown with the pick; any BLOCK flag rejects the candidate.
export function redFlagsOf({
  priced, oddsFresh, minForm, h2hN, agreement, uncertainty,
  leagueSides, fatigue, price, adjEdgePct, minAdjEdge,
}) {
  const flags = [];
  if (oddsFresh === "stale")
    flags.push({ severity: "WARN", text: "Odds snapshot is stale — the recorded price may no longer be quotable" });
  if (!priced)
    flags.push({ severity: "WARN", text: "Market unpriced by the provider — edge is unverified" });
  if (fatigue)
    flags.push({ severity: "WARN", text: "A side is on short rest (<3 days) — rotation risk" });
  if (!h2hN)
    flags.push({ severity: "WARN", text: "No head-to-head history in the window" });
  if (minForm < 6)
    flags.push({ severity: "WARN", text: `Short evidence window (${minForm} verified form games)` });
  if (leagueSides < 60)
    flags.push({ severity: "WARN", text: "Thin league sample — league baseline less reliable" });
  if (agreement < 0.8)
    flags.push({ severity: "WARN", text: `Models only ${Math.round(agreement * 100)}% in agreement — a dissenting model can be the right one` });
  if (priced && adjEdgePct != null && minAdjEdge != null && adjEdgePct < minAdjEdge)
    flags.push({
      severity: "BLOCK",
      text: `Adjusted edge ${adjEdgePct}pp is below the ${minAdjEdge}pp minimum required at odds ${Number(price).toFixed(2)} — uncertainty overwhelms the edge`,
    });
  if (uncertainty > 0.6)
    flags.push({ severity: "BLOCK", text: "Uncertainty EXTREME — the prediction process cannot support a selection" });
  return flags;
}

// === PICK QUALITY ===
// The reliability of the prediction PROCESS, explicitly separate from the
// estimated probability. Lineup/injury data is structurally unavailable in
// this system, so quality is measured on what is actually connected.
export function pickQualityOf({ dq, agreement, priced, adjEdgePct, minAdjEdge, uncertainty, oddsFresh }) {
  if (dq === "LOW" || uncertainty > 0.45 || agreement < 0.75) return "LOW";
  if (
    priced &&
    oddsFresh !== "stale" &&
    adjEdgePct != null &&
    minAdjEdge != null &&
    adjEdgePct >= minAdjEdge &&
    agreement >= 0.85 &&
    dq === "HIGH"
  )
    return "HIGH";
  return "MEDIUM";
}

// === FALSE-CONFIDENCE REMOVAL ===
// Several models agreeing is never enough for a 97–99% claim: the displayed
// confidence is capped by pricing status, uncertainty and agreement.
export function confidenceCap({ priced, uncertainty, agreement }) {
  const base = priced ? 97 : 92; // no real price = no 97–99% claims, ever
  return Math.max(50, Math.round(base - uncertainty * 20 - (1 - agreement) * 10));
}

// === DATA PROVENANCE ===
// The audit record of every major input behind a prediction — source,
// timestamp, freshness, value and quality — so any prediction can be traced
// back to exactly what produced it.
export function buildProvenance({
  league, leagueCode, kickoff, calibration, learnedWeights,
  odds, rates, minForm, h2hN, scannedAt,
}) {
  const r2 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
  return {
    recordedAt: scannedAt,
    fixture: { source: "openfootball verified season files (football.json CDN)", league, leagueCode, kickoff },
    form: { source: "openfootball verified results", freshnessBasis: "last played date vs kickoff", games: minForm, h2h: h2hN },
    ratings: {
      source: "date-decayed attack/defence rates (half-life 60d)",
      homeXg: r2(rates?.lh),
      awayXg: r2(rates?.la),
      homeAdvantage: "1.12 / 0.92 goal multipliers",
    },
    odds: odds || { source: "none — model-only candidate, no real price claimed" },
    calibration: {
      source: "settled pre-kickoff EnginePrediction ledger",
      ready: !!calibration?.ready,
      sample: calibration?.sample ?? 0,
    },
    weights: {
      basis: learnedWeights ? "LEARNED — out-of-sample Brier weighting" : "BASELINE WEIGHTS — NOT YET LEARNED",
    },
  };
}