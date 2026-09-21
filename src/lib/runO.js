// RUN O — the premium high-confidence command center logic. RUN O never runs
// a separate model: it READS the same RX-2.0 ensemble board every prediction
// surface uses, then applies its own stricter quality gate, correlation
// control and ranking on top. Nothing is manufactured: if fewer than 3 or 8
// candidates genuinely qualify, the missing positions stay empty. Honest
// language only — HIGHEST CONFIDENCE / STRONGEST EVIDENCE, never a guarantee.

import { lagosDateKey, lagosTodayKey } from "@/lib/winRaba";

export const RUNO_MODEL_VERSION = "RUNO-1.0";
export const RUNO_MIN_SCORE = 80; // below this a candidate NEVER qualifies for RUN O

export const RUNO_WINDOWS = [
  { key: "today", label: "TODAY" },
  { key: "tomorrow", label: "TOMORROW" },
  { key: "24h", label: "NEXT 24 HOURS" },
  { key: "48h", label: "NEXT 48 HOURS" },
  { key: "5d", label: "NEXT 5 DAYS" },
];
export const RUNO_SESSIONS = [
  { key: "all", label: "ALL" },
  { key: "morning", label: "MORNING" },
  { key: "evening", label: "EVENING" },
];

// RUN O tier — the displayed band of the RUN O score (0–100).
export function tierOf(score) {
  if (score >= 95) return "RUN O ULTRA ELITE";
  if (score >= 90) return "RUN O ELITE";
  if (score >= 85) return "RUN O STRONG";
  if (score >= 80) return "RUN O QUALIFIED";
  return "NOT QUALIFIED";
}

const flagIdOf = (f) => String((f && (f.id || f)) || "").toLowerCase();

// The RUN O gate — stricter than the engine's own qualification gate.
export function runoGate(p) {
  const score = p.masterScore ?? p.score ?? 0;
  if (score < RUNO_MIN_SCORE)
    return { pass: false, reason: `Score below the RUN O qualification standard` };
  if ((p.qualityLabel || p.quality) === "LOW")
    return { pass: false, reason: "LOW data quality never enters RUN O" };
  if ((p.flags || []).some((f) => flagIdOf(f).startsWith("block")))
    return { pass: false, reason: "Blocking red flag on the candidate" };
  return { pass: true, reason: "" };
}

function inWindow(p, windowKey, todayKey, tomorrowKey, nowMs) {
  const ko = new Date(p.kickoff).getTime();
  if (!Number.isFinite(ko)) return false;
  switch (windowKey) {
    case "today": return p.lagosDateKey === todayKey && ko > nowMs;
    case "tomorrow": return p.lagosDateKey === tomorrowKey;
    case "24h": return ko > nowMs && ko <= nowMs + 24 * 3600000;
    case "48h": return ko > nowMs && ko <= nowMs + 48 * 3600000;
    default: return true; // the board itself is the verified 5-day window
  }
}

// Correlation-aware ranking: the top 8 prefer diversified opportunities — no
// two selections share a team, max 3 from one competition. Parked candidates
// rejoin the ranked list after the diversified top 8 (still valid qualified
// picks, just not premium-board material). One selection per fixture is
// already guaranteed by the engine board.
function diversify(list) {
  const sorted = [...list].sort((a, b) => (b.masterScore ?? b.score ?? 0) - (a.masterScore ?? a.score ?? 0));
  const out = [];
  const parked = [];
  const teams = new Map();
  const comps = new Map();
  for (const p of sorted) {
    if (out.length < 8) {
      const teamClash = [p.home, p.away].some((t) => (teams.get(t) || 0) > 0);
      const compFull = (comps.get(p.leagueCode) || 0) >= 3;
      if (teamClash || compFull) { parked.push(p); continue; }
    }
    out.push(p);
    [p.home, p.away].forEach((t) => teams.set(t, (teams.get(t) || 0) + 1));
    comps.set(p.leagueCode, (comps.get(p.leagueCode) || 0) + 1);
  }
  return [...out, ...parked];
}

// Correlation risk of one selection against the rest of the selected set.
export function correlationRiskOf(p, selected) {
  const rest = (selected || []).filter((x) => x !== p);
  if (rest.some((x) => [x.home, x.away].some((t) => t === p.home || t === p.away))) return "HIGH";
  const sameComp = rest.filter((x) => x.leagueCode === p.leagueCode).length;
  return sameComp >= 2 ? "MEDIUM" : "LOW";
}

// WHY RUN O SELECTED IT — factual reasons only, each supported by the
// recorded data. Never invented, never padded.
export function whyRunO(p) {
  const reasons = [];
  if (p.voting) reasons.push(`${p.voting} independent model components voted on this market`);
  if (p.agreement != null) reasons.push(`strong agreement across the analysis (${Math.round(p.agreement * 100)}%)`);
  if ((p.marketOdds || 0) > 1 && (p.edgePct || 0) > 0)
    reasons.push(`positive verified edge +${p.edgePct}pp vs the real ${p.bookmaker || "bookmaker"} price`);
  if (p.oddsStatus === "model_only") reasons.push("strong unpriced model consensus — no real price carried this market");
  if ((p.qualityLabel || p.quality) === "HIGH") reasons.push("HIGH data quality across form, head-to-head and market inputs");
  if (p.explanation?.why) reasons.push(p.explanation.why);
  return reasons.filter(Boolean).slice(0, 6);
}

// Risk flags recorded with the selection — disclosed, never hidden.
export function riskFlagsOf(p) {
  const out = [];
  (p.flags || []).forEach((f) => out.push(String((f && (f.label || f.id || f)) || "")));
  (p.failureModes || []).slice(0, 3).forEach((f) => out.push(String(f)));
  return out.filter(Boolean);
}

// Build the RUN O board view from the engine board — pure, no writes.
export function buildRunO(board, { windowKey = "5d", session = "all" } = {}) {
  const nowMs = Date.now();
  const todayKey = lagosTodayKey();
  const tomorrowKey = lagosDateKey(nowMs + 86400000);
  const all = (board?.days || []).flatMap((d) => d.all || []);
  const pool = all.filter(
    (p) => inWindow(p, windowKey, todayKey, tomorrowKey, nowMs) && (!session || session === "all" || p.session === session)
  );
  const qualified = [];
  const rejected = [];
  pool.forEach((p) => {
    const gate = runoGate(p);
    if (gate.pass) qualified.push(p);
    else rejected.push({ pick: p, reason: gate.reason });
  });
  const ranked = diversify(qualified);
  const top8 = ranked.slice(0, 8);
  return {
    poolSize: pool.length,
    qualifiedCount: qualified.length,
    rejected,
    ranked,
    top3: ranked.slice(0, 3),
    top8,
    correlation: Object.fromEntries(top8.map((p) => [`${p.fixtureId}|${p.marketKey}`, correlationRiskOf(p, top8)])),
  };
}

// DATA HEALTH — the honest scan summary. Missing providers are disclosed,
// never guessed.
export function scanHealthOf(board, runo, enrichment = {}) {
  const report = board?.report || {};
  const reasons = {};
  (board?.rejected || []).forEach((r) => { reasons[r.reason] = (reasons[r.reason] || 0) + 1; });
  const enrichRows = Object.values(enrichment || {});
  return {
    fixturesScanned: report.fixturesScanned || 0,
    candidatesAnalyzed: (board?.observations || []).length,
    engineQualified: report.qualifying || 0,
    engineRejected: report.rejected || 0,
    runoPool: runo?.poolSize || 0,
    runoQualified: runo?.qualifiedCount || 0,
    runoRejected: runo?.rejected?.length || 0,
    topRejectionReasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 5),
    oddsStatus: board?.oddsStatus || "unavailable",
    modelVersion: report.modelVersion || "",
    unavailableData: report.unavailableData || [],
    injuryCoverage: enrichRows.filter((e) => e.injuryStatus === "matched").length,
    lineupCoverage: enrichRows.filter((e) => (e.lineupStatus || "") !== "").length,
    enrichmentCandidates: enrichRows.length,
  };
}