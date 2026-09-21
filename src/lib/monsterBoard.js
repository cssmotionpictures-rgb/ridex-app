// MONSTER — the daily intelligent selection board logic. MONSTER never runs a
// separate model: it READS the same RX-2.0 ensemble board every prediction
// surface uses (the worldwide verified fixture pool + the real bookmaker odds
// layer), then applies the MONSTER architecture — qualification gate, watch
// band, priority ranking, correlation control and the 13-selection daily
// TARGET. The target is a ceiling, NEVER a quota: 0, 1, 3 or 7 qualifying
// selections are all honest outcomes. The historical 13 winning selections
// are the RESEARCH SAMPLE: their distilled characteristics are ONE ranked
// input (architecture similarity), never an override — current evidence
// always wins. Internal methodology is never exposed to customers.

import { lagosDateKey, lagosTodayKey } from "@/lib/lagosTime";

export const MONSTER_MODEL_VERSION = "MONSTER-1.0";
export const MONSTER_TARGET = 13; // the daily target — a ceiling, never a quota
export const MONSTER_BOARD_FLOOR = 80; // below this a candidate NEVER enters the board
export const MONSTER_WATCH_FLOOR = 70; // interesting, but never board material

export const MONSTER_WINDOWS = [
  { key: "today", label: "TODAY" },
  { key: "tomorrow", label: "TOMORROW" },
  { key: "24h", label: "NEXT 24 HOURS" },
  { key: "48h", label: "NEXT 48 HOURS" },
  { key: "5d", label: "5 DAYS" },
];
export const MONSTER_SESSIONS = [
  { key: "all", label: "ALL" },
  { key: "morning", label: "MORNING" },
  { key: "evening", label: "EVENING" },
];

// MONSTER tier — the customer-facing band of the selection score (0–100).
export function tierOfMonster(score) {
  if (score >= 90) return "MONSTER ELITE";
  if (score >= MONSTER_BOARD_FLOOR) return "MONSTER STRONG";
  if (score >= MONSTER_WATCH_FLOOR) return "MONSTER WATCH";
  return "NOT QUALIFIED";
}

// === MONSTER ARCHITECTURE — internal research input, never customer-facing ===
// Distilled from the historical 13 winning selections (the RESEARCH SAMPLE):
// the typical price band, the consensus level and the preference for genuinely
// priced, high-quality selections. ONE ranked input among many — the sample
// NEVER overrides current evidence.
export const MONSTER_ARCH = {
  oddsBand: [1.3, 3.5],
  consensusFloor: 0.75,
};

export function architectureSimilarity(p) {
  const o = p.marketOdds || 0;
  const priced = o > 1;
  const inBand = priced && o >= MONSTER_ARCH.oddsBand[0] && o <= MONSTER_ARCH.oddsBand[1];
  let s = 0;
  if (priced) s += 0.3;
  if (inBand) s += 0.3;
  if ((p.agreement ?? 1) >= MONSTER_ARCH.consensusFloor) s += 0.2;
  if ((p.qualityLabel || p.quality) === "HIGH") s += 0.2;
  return Math.round(s * 100) / 100;
}

const flagIdOf = (f) => String((f && (f.id || f)) || "").toLowerCase();

// The MONSTER gate — the qualification standard. Below the board floor a
// candidate can still be WATCH (interesting, disclosed, NEVER on the ticket);
// LOW data quality and blocking red flags are excluded entirely.
export function monsterGate(p) {
  const score = p.masterScore ?? p.score ?? 0;
  const lowQ = (p.qualityLabel || p.quality) === "LOW";
  const blocked = (p.flags || []).some((f) => flagIdOf(f).startsWith("block"));
  if (lowQ) return { pass: false, watch: false, reason: "LOW data quality never enters MONSTER" };
  if (blocked) return { pass: false, watch: false, reason: "Blocking red flag on the candidate" };
  if (score >= MONSTER_BOARD_FLOOR) return { pass: true, watch: false, reason: "" };
  if (score >= MONSTER_WATCH_FLOOR) return { pass: false, watch: true, reason: "Below the MONSTER qualification standard" };
  return { pass: false, watch: false, reason: "Below the MONSTER standard" };
}

function inWindow(p, windowKey, todayKey, tomorrowKey, nowMs) {
  const ko = new Date(p.kickoff).getTime();
  if (!Number.isFinite(ko) || ko <= nowMs) return false; // a started match is never a fresh selection
  if (/^\d{4}-\d{2}-\d{2}$/.test(windowKey)) return p.lagosDateKey === windowKey; // one specific board day
  switch (windowKey) {
    case "today": return p.lagosDateKey === todayKey;
    case "tomorrow": return p.lagosDateKey === tomorrowKey;
    case "24h": return ko <= nowMs + 24 * 3600000;
    case "48h": return ko <= nowMs + 48 * 3600000;
    default: return true; // 5d — the board's own verified window
  }
}

const Q_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

// MONSTER priority — the ordered ranking standard. Strongest current evidence
// first; the historical architecture is an input, never the final authority.
function priorityCompare(a, b) {
  const sa = a.masterScore ?? a.score ?? 0;
  const sb = b.masterScore ?? b.score ?? 0;
  if (sb !== sa) return sb - sa; // 1. strongest current evidence
  const qa = Q_RANK[a.qualityLabel || a.quality] ?? 1;
  const qb = Q_RANK[b.qualityLabel || b.quality] ?? 1;
  if (qa !== qb) return qa - qb; // selection quality
  const aa = architectureSimilarity(a); // architecture similarity (research sample)
  const ab = architectureSimilarity(b);
  if (aa !== ab) return ab - aa;
  const ea = (a.marketOdds || 0) > 1 ? a.edgePct || 0 : -1; // price quality
  const eb = (b.marketOdds || 0) > 1 ? b.edgePct || 0 : -1;
  if (eb !== ea) return eb - ea;
  return (a.uncertainty || 0) - (b.uncertainty || 0); // low uncertainty
}

// Correlation control — while the board is filling, no two selections share a
// team and max 3 come from one competition. Parked candidates rejoin the
// ranked list after the diversified board (still valid qualified picks,
// flagged with their correlation risk).
function diversify(list) {
  const sorted = [...list].sort(priorityCompare);
  const out = [];
  const parked = [];
  const teams = new Map();
  const comps = new Map();
  for (const p of sorted) {
    if (out.length < MONSTER_TARGET) {
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

// Correlation risk of one selection against the rest of the board.
export function correlationRiskOf(p, selected) {
  const rest = (selected || []).filter((x) => x !== p);
  if (rest.some((x) => [x.home, x.away].some((t) => t === p.home || t === p.away))) return "HIGH";
  const sameComp = rest.filter((x) => x.leagueCode === p.leagueCode).length;
  return sameComp >= 2 ? "MEDIUM" : "LOW";
}

// Build the MONSTER board view from the engine board — pure, no writes.
// Targets 13 daily selections but NEVER forces them: the board simply holds
// every genuinely qualified selection, up to the target.
export function buildMonster(board, { windowKey = "today", session = "all" } = {}) {
  const nowMs = Date.now();
  const todayKey = lagosTodayKey();
  const tomorrowKey = lagosDateKey(nowMs + 86400000);
  const all = (board?.days || []).flatMap((d) => d.all || []);
  const pool = all.filter(
    (p) => inWindow(p, windowKey, todayKey, tomorrowKey, nowMs) && (!session || session === "all" || p.session === session)
  );
  const qualified = [];
  const watch = [];
  const rejected = [];
  pool.forEach((p) => {
    const gate = monsterGate(p);
    if (gate.pass) qualified.push(p);
    else if (gate.watch) watch.push(p);
    else rejected.push({ pick: p, reason: gate.reason });
  });
  const ranked = diversify(qualified);
  const boardPicks = ranked.slice(0, MONSTER_TARGET);
  return {
    poolSize: pool.length,
    qualifiedCount: qualified.length,
    board: boardPicks,
    watch: [...watch].sort((a, b) => (b.masterScore ?? b.score ?? 0) - (a.masterScore ?? a.score ?? 0)),
    rejected,
    ranked,
    correlation: Object.fromEntries(boardPicks.map((p) => [`${p.fixtureId}|${p.marketKey}`, correlationRiskOf(p, boardPicks)])),
  };
}

// WHY MONSTER SELECTED IT — factual, customer-safe reasons only. Technical
// methodology is never exposed.
export function whyMonster(p) {
  const reasons = [];
  if ((p.marketOdds || 0) > 1 && (p.edgePct || 0) > 0) reasons.push("A real market price that the analysis rates as value");
  if ((p.agreement ?? 1) >= 0.8) reasons.push("Strong agreement across the analysis");
  if ((p.qualityLabel || p.quality) === "HIGH") reasons.push("Reliable, complete match information");
  reasons.push("Ranked among the strongest available selections in this window");
  return reasons.slice(0, 4);
}

// Risk flags recorded with the selection — disclosed, never hidden.
export function riskFlagsOf(p) {
  const out = [];
  (p.flags || []).forEach((f) => out.push(String((f && (f.label || f.id || f)) || "")));
  (p.failureModes || []).slice(0, 3).forEach((f) => out.push(String(f)));
  return out.filter(Boolean);
}

// Customer-facing risk band of one selection.
export function riskOfMonster(p) {
  const u = p.uncertainty ?? 0;
  if (u < 0.25) return "LOW";
  if (u < 0.45) return "MODERATE";
  return "HIGH";
}

// The short, understandable card explanation — never technical methodology.
export function shortExplanation(p) {
  const k = String(p.marketKey || "");
  if (k === "1") return `RIDE X identifies ${p.home} as the stronger selection based on the available match information.`;
  if (k === "2") return `RIDE X identifies ${p.away} as the stronger selection based on the available match information.`;
  if (["1X", "X2", "12", "DNB1", "DNB2"].includes(k)) return "RIDE X identifies this as the safer outcome based on the available match information.";
  if (/^O/.test(k) || /^U/.test(k)) return "RIDE X identifies a goals pattern in this match based on the available match information.";
  if (/^BTTS/.test(k)) return "RIDE X identifies a both-teams scoring pattern based on the available match information.";
  return "RIDE X identifies this as a strong selection based on the available match information.";
}