// ============================================================
// RIDE X MASTER MONSTER — the autonomous decision engine.
//
// One button: ANALYZE → DIAGNOSE → DECIDE → PROCESS →
// RE-MEASURE → CORRECT (only if needed) → VERIFY → DELIVER.
//
// The DSP chain itself lives in aiMastering.js (reused, not
// replaced). This module adds: source condition classification,
// confidence-weighted per-stage decisions, a normalization-aware
// loudness strategy, up to 2 corrective passes with candidate
// rollback, a measured quality score, and a translation check.
// Everything here traces back to a measured number — no fake
// confidence, no fake scores.
// ============================================================

import {
  measureLoudness, measureBands, measurePeaks, measureLevel,
  measureStereo, bandRmsDb, detectGroove, preMasterCheck, analyzeMix,
} from "@/lib/masterAnalysis";
import { buildAdaptiveParams, reviewMaster, qualityGate } from "@/lib/adaptiveMaster";
import {
  MASTER_PRESETS, renderMaster, normalizeToCeiling, applyGain,
  resampleBuffer, audioBufferToWav,
} from "@/lib/aiMastering";
import { buildAutoBass } from "@/lib/autoBaseline";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sev = (x) => clamp(x, 0, 1); // severity 0..1

// ------------------------------------------------------------
// 1. SOURCE CONDITION CLASSIFIER — a track can hold MANY
//    conditions at once; it is never forced into one bucket.
// ------------------------------------------------------------
export function classifySource(a) {
  const b = a.bands || {};
  const sub = b.sub ?? -60, bass = b.bass ?? -60, lowMid = b.lowMid ?? -60;
  const mid = b.mid ?? -60, presence = b.presence ?? -60, air = b.air ?? -60;
  const conds = [];
  const add = (key, label) => conds.push({ key, label });
  if (a.integratedLufs < -22) add("quiet", "Quiet premaster");
  if (a.integratedLufs > -8.5 && a.crestDb < 6) add("mastered", "Already loud / mastered-like");
  if (a.clipRuns > 50) add("clipped", "Clipped source");
  else if (a.clipRuns > 0) add("cliplight", "Light clipping");
  if (a.crestDb < 4) add("overlimited", "Over-limited");
  else if (a.crestDb >= 9 && a.crestDb <= 18) add("healthy", "Dynamically healthy");
  else if (a.crestDb > 18) add("verydynamic", "Very dynamic");
  const airGap = presence - air;
  if (airGap > 16) add("dark", "Dark top end");
  if (airGap < 5) add("bright", "Bright");
  if (lowMid - mid > 2.5) add("muddy", "Low-mid buildup (muddy)");
  if (sub - bass < -12) add("thin", "Thin low end");
  if (sub - bass > 4) add("bassheavy", "Sub-heavy");
  if (presence - mid > -4) add("vocalforward", "Vocal-forward");
  else if (presence - mid < -8) add("vocalrecessed", "Vocal-recessed");
  const harshGap = Math.max(0, (a.highBandDb ?? -42) - (a.harshBandDb ?? -48));
  if (harshGap < 4.5) add("harsh", "Harsh / sibilant region");
  if (!a.mono) {
    if (a.correlation < 0.2) add("phaserisk", "Phase risk");
    else if (a.correlation > 0.9) add("monocompat", "Mono-compatible");
    if (a.widthDb > -4) add("wide", "Wide stereo");
    else if (a.widthDb < -20) add("narrow", "Narrow stereo");
  }
  const structural = ["muddy", "dark", "bright", "thin", "bassheavy", "harsh", "clipped", "overlimited", "mastered", "phaserisk"];
  if (!conds.some((c) => structural.includes(c.key))) add("cleanpre", "Clean premaster");
  return conds;
}

// ------------------------------------------------------------
// 2. GENRE FAMILY — a confidence-weighted CLUE, never a fact.
//    It only nudges the personality and loudness envelope.
// ------------------------------------------------------------
export function detectGenreFamily(a) {
  const b = a.bands || {};
  const g = a.groove;
  const guesses = [];
  if (g) {
    if (g.bpm >= 108 && g.bpm <= 126 && (b.sub ?? -60) >= (b.bass ?? -60) - 3)
      guesses.push({ family: "Amapiano", confidence: 0.6 });
    if (g.bpm >= 95 && g.bpm <= 118 && (b.presence ?? -60) > (b.mid ?? -60) - 6)
      guesses.push({ family: "Afrobeats", confidence: 0.5 });
    if (g.bpm >= 126 && g.bpm <= 145 && a.crestDb < 9)
      guesses.push({ family: "House / Dance", confidence: 0.45 });
    if (g.bpm >= 138 && a.crestDb < 6 && (b.harsh ?? -60) > (b.presence ?? -60))
      guesses.push({ family: "Trap / Hip-hop", confidence: 0.4 });
    if (g.bpm >= 60 && g.bpm <= 92 && a.crestDb > 14)
      guesses.push({ family: "Acoustic / Singer-songwriter", confidence: 0.35 });
  } else if (a.crestDb > 18) {
    guesses.push({ family: "Cinematic / Classical", confidence: 0.3 });
  }
  if (!guesses.length) guesses.push({ family: "Modern pop / urban", confidence: 0.2 });
  guesses.sort((x, y) => y.confidence - x.confidence);
  return guesses[0];
}

const PERSONALITY_BY_FAMILY = {
  "Amapiano": "amapiano",
  "Afrobeats": "afrobeats",
  "House / Dance": "signature",
  "Trap / Hip-hop": "punchy",
  "Acoustic / Singer-songwriter": "signature",
  "Cinematic / Classical": "signature",
  "Modern pop / urban": "signature",
};

// ------------------------------------------------------------
// 3. LOUDNESS STRATEGY — normalization-aware, never one number
//    for every song. Streaming normalizes playback (Spotify's
//    normal reference is −14 LUFS); louder masters get MORE
//    true-peak headroom to survive lossy encoding.
// ------------------------------------------------------------
export function loudnessStrategy(a, family) {
  const limited = a.integratedLufs > -9 && a.crestDb < 6;
  const veryDynamic = a.crestDb > 15 || (a.lra ?? 0) > 12;
  const damaged = a.clipRuns > 50;

  let target = -10.5; // modern default between the streaming norm and loud club masters
  if (family === "Cinematic / Classical" || family === "Acoustic / Singer-songwriter") target = -13;
  else if (family === "Trap / Hip-hop" || family === "House / Dance") target = -9.8;
  else if (family === "Amapiano" || family === "Afrobeats") target = -10;

  if (veryDynamic) target = Math.min(target, -12); // keep the life in the music
  if (limited) target = Math.min(target, a.integratedLufs + 0.5); // already loud: don't chase loudness
  if (damaged) target = Math.min(target, -11);
  target = clamp(target, -14, -7);

  // True-peak envelope: −1 dBTP near the streaming norm, more headroom for louder targets.
  let ceiling = -1;
  if (target > -11.5) ceiling = -1.2;
  if (target > -9.5) ceiling = -1.5;

  let maxPush = limited ? 1.5 : veryDynamic ? 2.5 : damaged ? 2 : 5;
  const notes = [];
  if (limited) notes.push("source already loud — loudness not chased, punch preserved");
  if (veryDynamic) notes.push("very dynamic source — target kept lower to preserve musical life");
  if (damaged) notes.push("clipping in the source — target capped for safety");
  if (target > -11.5) notes.push("louder target — extra true-peak headroom for lossy encoding");
  return { targetLufs: target, ceilingDb: ceiling, maxPush, limited, veryDynamic, damaged, notes };
}

// ------------------------------------------------------------
// 4. PLAN — build the chain. Reuses the proven adaptive core
//    (buildAdaptiveParams) and layers measured severities /
//    confidences on top. Low confidence ⇒ less processing.
// ------------------------------------------------------------
export function planChain(a, presetKey) {
  const family = detectGenreFamily(a);
  const autoKey = PERSONALITY_BY_FAMILY[family.family] || "signature";
  const personalityKey = presetKey && MASTER_PRESETS[presetKey] ? presetKey : autoKey;
  const base = MASTER_PRESETS[personalityKey] || MASTER_PRESETS.signature;
  const p = buildAdaptiveParams(a, base);
  const strategy = loudnessStrategy(a, family.family);
  p.targetLufs = strategy.targetLufs;
  p.ceilingDb = strategy.ceilingDb;
  p.maxPush = Math.min(p.maxPush ?? 6, strategy.maxPush);
  if (a.durationSec < 25) p.maxPush = Math.min(p.maxPush, 2); // little signal ⇒ stay conservative

  const b = a.bands || {};
  const lowMidMid = (b.lowMid ?? -60) - (b.mid ?? -60);
  const mudSev = sev((lowMidMid - 2) / 5);
  const airGap = (b.presence ?? -60) - (b.air ?? -60);
  const darkSev = sev((airGap - 14) / 8);
  const brightSev = airGap < 5 ? 1 : 0;
  const subExcess = (b.sub ?? -60) - (b.bass ?? -60);
  const subSev = sev((subExcess - 3) / 5);
  const thinSev = sev((-12 - subExcess) / 8);
  const harshGap = Math.max(0, (a.highBandDb ?? -42) - (a.harshBandDb ?? -48));
  const harshSev = sev((6 - harshGap) / 4);
  const dynSev = a.crestDb < 6 ? sev((6 - a.crestDb) / 4) : 0;

  const D = (stage, action, confidence, reason) => ({
    stage, action, confidence: Math.round(clamp(confidence, 5, 98)), reason,
  });
  const tonalNeeded = mudSev > 0.15 || darkSev > 0.15 || brightSev;
  const decisions = [
    D("Tonal correction", tonalNeeded ? "applied" : "bypassed",
      tonalNeeded ? 60 + 35 * Math.max(mudSev, darkSev, brightSev * 0.5) : 88,
      mudSev > 0.15 ? `low-mid buildup measured (+${lowMidMid.toFixed(1)} dB) — corrective cut`
        : darkSev > 0.15 ? "top end measures dark — gradual air lift"
        : brightSev ? "already bright — air boost suppressed"
        : "tonal balance measured healthy — no corrective EQ"),
    D("Low-end management", subSev > 0.15 || thinSev > 0.15 ? "applied" : "bypassed",
      subSev > 0.15 || thinSev > 0.15 ? 65 + 30 * Math.max(subSev, thinSev) : 90,
      subSev > 0.15 ? "sub energy measured excessive — dynamically controlled"
        : thinSev > 0.15 ? "low end measured thin — controlled weight added"
        : "kick/sub relationship measured healthy — untouched"),
    D("Dynamic control", dynSev > 0.1 ? "applied" : "bypassed",
      dynSev > 0.1 ? 60 + 30 * dynSev : 92,
      dynSev > 0.1 ? "source measures dense — gentle glue, punch protected" : "dynamics measured healthy — minimal compression"),
    D("Sibilance / harshness", harshSev > 0.2 ? "applied" : "bypassed",
      harshSev > 0.2 ? 60 + 30 * harshSev : 90,
      harshSev > 0.2 ? "harsh-region concentration measured — minimum effective reduction" : "no problematic high-frequency concentration — bypassed"),
    D("Stereo processing", p.width > 0 ? "applied" : "bypassed",
      p.width > 0 ? 55 : a.mono || (a.correlation ?? 1) < 0.5 ? 93 : 75,
      p.width > 0 ? "narrow and phase-safe — subtle width opened"
        : a.mono ? "mono source — widening bypassed"
        : (a.correlation ?? 1) < 0.5 ? "phase risk measured — widening bypassed to protect mono playback"
        : "stereo field already wide enough — bypassed"),
    D("Saturation", p.drive > 0 ? "applied" : "bypassed",
      p.drive > 0 ? 60 : a.clipRuns > 20 || (a.integratedLufs > -9 && a.crestDb < 6) ? 94 : 70,
      p.drive > 0 ? "clean source — subtle harmonic enhancement"
        : a.clipRuns > 20 ? "source shows damage — saturation skipped"
        : "not needed — bypassed"),
    D("Loudness strategy", strategy.maxPush > 0 ? "applied" : "bypassed",
      strategy.limited ? 70 : 85,
      `target ${strategy.targetLufs.toFixed(1)} LUFS · ceiling ${strategy.ceilingDb} dBTP${strategy.limited ? " — already-loud source, loudness not chased" : ""}`),
  ];

  return {
    params: p, personalityKey, family,
    conditions: classifySource(a), decisions, strategy,
    uncertain: a.durationSec < 25,
  };
}

// ------------------------------------------------------------
// 5. QUALITY SCORE — derived only from measured conditions.
// ------------------------------------------------------------
export function scoreBreakdown(a) {
  const b = a.bands || {};
  const sub = b.sub ?? -60, bass = b.bass ?? -60, lowMid = b.lowMid ?? -60;
  const mid = b.mid ?? -60, presence = b.presence ?? -60, air = b.air ?? -60;

  let tonal = 100;
  const subBass = sub - bass;
  if (subBass > 4) tonal -= Math.min(15, (subBass - 4) * 2.5);
  if (subBass < -14) tonal -= 6;
  const mud = lowMid - mid;
  if (mud > 2) tonal -= Math.min(12, (mud - 2) * 3);
  const airGap = presence - air;
  if (airGap > 14) tonal -= Math.min(10, (airGap - 14) * 0.8);
  if (airGap < 4) tonal -= 6;

  let dynamics = 100;
  if (a.crestDb < 3) dynamics -= 35; else if (a.crestDb < 5) dynamics -= 18; else if (a.crestDb < 7) dynamics -= 8;
  if ((a.lra ?? 0) > 0 && a.lra < 1.5 && a.crestDb < 8) dynamics -= 10;

  let loudness = 100;
  if (a.truePeakDb > -0.7) loudness -= 35; else if (a.truePeakDb > -1.0) loudness -= 15;
  if (a.samplePeakDb > -0.2) loudness -= 10;
  if (a.integratedLufs > -7) loudness -= 10;

  let stereo = 100;
  if (!a.mono) {
    if (a.correlation < 0) stereo -= 40; else if (a.correlation < 0.2) stereo -= 20; else if (a.correlation < 0.4) stereo -= 8;
    if (a.widthDb > -3) stereo -= 10;
  }

  let integrity = 100;
  if (a.clipRuns > 50) integrity -= 40; else if (a.clipRuns > 5) integrity -= 20; else if (a.clipRuns > 0) integrity -= 6;
  if (Math.abs(a.dcOffset ?? 0) > 0.002) integrity -= 6;

  const subs = {
    tonal: Math.round(clamp(tonal, 0, 100)),
    dynamics: Math.round(clamp(dynamics, 0, 100)),
    loudness: Math.round(clamp(loudness, 0, 100)),
    stereo: Math.round(clamp(stereo, 0, 100)),
    integrity: Math.round(clamp(integrity, 0, 100)),
  };
  subs.total = Math.round(
    subs.tonal * 0.25 + subs.dynamics * 0.2 + subs.loudness * 0.25 + subs.stereo * 0.15 + subs.integrity * 0.15
  );
  return subs;
}

// ------------------------------------------------------------
// 6. WORLDWIDE TRANSLATION CHECK — technical compatibility,
//    not a simulation of physical playback systems.
// ------------------------------------------------------------
export function translationCheck(a) {
  const b = a.bands || {};
  const checks = [];
  if (a.mono) checks.push({ system: "Mono playback", status: "ok", note: "Source is mono — collapses losslessly." });
  else if ((a.correlation ?? 1) >= 0.5) checks.push({ system: "Mono playback", status: "ok", note: `Correlation ${a.correlation.toFixed(2)} — safe mono collapse.` });
  else if ((a.correlation ?? 1) >= 0.2) checks.push({ system: "Mono playback", status: "caution", note: "Moderate phase difference — check mono playback." });
  else checks.push({ system: "Mono playback", status: "risk", note: "Low correlation — content may thin out in mono." });

  const lowWeight = (b.sub ?? -60) - (b.lowMid ?? -60);
  checks.push(lowWeight > 2
    ? { system: "Phone & laptop speakers", status: "caution", note: "A lot of energy sits below ~150 Hz, which small speakers can't reproduce — check the balance on a phone." }
    : { system: "Phone & laptop speakers", status: "ok", note: "Low-end weight sits above the sub-only region — translates to small speakers." });

  const presGap = (b.presence ?? -60) - (b.mid ?? -60);
  checks.push(presGap < -8
    ? { system: "Earbuds & headphones", status: "caution", note: "Presence region measures low — vocals may sound distant on earbuds." }
    : { system: "Earbuds & headphones", status: "ok", note: "Presence region translates well." });

  checks.push(a.truePeakDb <= -1
    ? { system: "Streaming encoding (lossy)", status: "ok", note: `True peak ${a.truePeakDb.toFixed(1)} dBTP — enough headroom for lossy encoding.` }
    : { system: "Streaming encoding (lossy)", status: "caution", note: "True peak close to full scale — lossy encoders may introduce overs." });

  if (!a.mono && a.widthDb > -3) checks.push({ system: "Consumer stereo systems", status: "caution", note: "Very wide side energy — some hi-fis may sound unfocused." });
  else checks.push({ system: "Consumer stereo systems", status: "ok", note: "Stereo image within safe width." });
  return checks;
}

// ------------------------------------------------------------
// 7. MULTI-PASS ORCHESTRATION
// ------------------------------------------------------------
async function renderCandidate(decoded, p, ctx) {
  const { useRhythm, groove, bassBuffer, bassLevel } = ctx;
  let rendered = await renderMaster(decoded, p, useRhythm, groove, bassBuffer, bassLevel, 0);
  normalizeToCeiling(rendered, p.ceilingDb);
  let lufs = (await measureLoudness(rendered)).integratedLufs;
  let delta = p.targetLufs - lufs;
  if (delta > 0.5 && p.maxPush > 0) {
    rendered = await renderMaster(decoded, p, useRhythm, groove, bassBuffer, bassLevel, Math.min(delta, p.maxPush));
    normalizeToCeiling(rendered, p.ceilingDb);
    lufs = (await measureLoudness(rendered)).integratedLufs;
    delta = p.targetLufs - lufs;
  }
  if (delta < -0.3) applyGain(rendered, Math.pow(10, delta / 20));
  const after = await analyzeMix(rendered);
  return { buffer: rendered, analysis: after, params: p, score: scoreBreakdown(after) };
}

// Extra problem detection beyond the existing review pass.
function monsterAdjust(before, after, p) {
  const notes = [];
  const next = { ...p, punch: { ...p.punch }, glue: { ...p.glue } };
  let rerender = false;
  if ((before.lra ?? 0) > 4 && (after.lra ?? 0) < before.lra * 0.45) {
    next.maxPush = 0;
    next.glue = { ...next.glue, ratio: Math.max(1.5, next.glue.ratio - 0.5) };
    rerender = true;
    notes.push("loudness push reduced — dynamics were being flattened");
  }
  if (((after.bands?.harsh ?? -60) - (before.bands?.harsh ?? -60)) > 3) {
    next.harshGain = (next.harshGain ?? -2) - 1.5;
    rerender = true;
    notes.push("harshness region re-tamed");
  }
  return { rerender, params: next, notes };
}

// Candidate selection — the loudest candidate never wins by default.
// Ties and small gains keep the earlier, less-processed render (fail-safe).
function pickBetter(cur, cand) {
  if (cand.analysis.truePeakDb > cand.params.ceilingDb + 0.5) return false;
  if (cand.analysis.crestDb < 3 && cur.analysis.crestDb >= 3) return false;
  return cand.score.total > cur.score.total + 0.5;
}

// opts: { decoded, analysis?, presetKey, autoBass, bassRhythm,
//         sampleRate, bitDepth, onStage(key), onAnalysis(a), onReport(r) }
// Returns the WAV blob; throws (never delivers) if the gate fails.
export async function runMasterMonster(opts = {}) {
  const decoded = opts.decoded;
  if (!decoded || !decoded.length) throw new Error("No decoded audio provided");
  const out = (k) => opts.onStage?.(k);

  // ---- PASS 0: staged, real analysis (each label = real work) ----
  let a = opts.analysis;
  if (!a) {
    out("listening");
    const loudness = await measureLoudness(decoded);
    out("spectrum");
    const bands = measureBands(decoded);
    out("lowend");
    const lowBandDb = bandRmsDb(decoded, "low");
    out("dynamics");
    const level = measureLevel(decoded);
    const peaks = measurePeaks(decoded);
    out("stereo");
    const stereo = measureStereo(decoded);
    a = {
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      durationSec: decoded.duration,
      ...loudness, ...peaks, ...level, ...stereo, bands,
      lowBandDb,
      highBandDb: bandRmsDb(decoded, "high"),
      harshBandDb: bandRmsDb(decoded, "harsh"),
      groove: detectGroove(decoded),
    };
    a.warnings = preMasterCheck(a);
  }
  opts.onAnalysis?.(a);

  // ---- DECIDE ----
  out("planning");
  const plan = planChain(a, opts.presetKey);
  const p = plan.params;

  const wantBass = opts.autoBass === true; // opt-in creative layer
  const useRhythm = !!opts.bassRhythm;
  const groove = (useRhythm || wantBass) ? (a.groove || detectGroove(decoded)) : null;
  let bassBuffer = null, bassLevel = 0;
  if (wantBass) {
    try {
      const autoBass = await buildAutoBass(decoded, groove, plan.personalityKey);
      if (autoBass) { bassBuffer = autoBass.buffer; bassLevel = autoBass.level; }
    } catch {}
  }
  const ctx = { useRhythm, groove, bassBuffer, bassLevel };

  // ---- PASS 1: first master ----
  out("render");
  let best = await renderCandidate(decoded, p, ctx);
  let passes = 1;
  const candidates = [{ label: "A", score: best.score.total }];
  const corrections = [];

  // ---- SELF-CHECK + up to 2 corrective passes ----
  for (let iter = 0; iter < 2; iter++) {
    out("verify");
    const adj = reviewMaster(a, best.analysis, best.params);
    const extra = monsterAdjust(a, best.analysis, best.params);
    if (!adj.rerender && !extra.rerender) break;

    out("correct");
    let merged = best.params;
    if (adj.rerender) merged = adj.params;
    if (extra.rerender) merged = { ...merged, ...extra.params };
    const cand = await renderCandidate(decoded, merged, ctx);
    candidates.push({ label: String.fromCharCode(65 + passes), score: cand.score.total });
    passes++;

    if (!pickBetter(best, cand)) {
      corrections.push("correction pass rolled back — the earlier render was already better (fail-safe kept it)");
      break; // ROLLBACK: previous better version stays the master
    }
    best = cand;
    corrections.push(...(adj.corrections || []), ...extra.notes);
  }

  // ---- FINAL VERIFICATION + EXPORT ----
  out("finalize");
  const finalBuffer = await resampleBuffer(best.buffer, opts.sampleRate);
  const gate = qualityGate(finalBuffer, decoded, { ceilingDb: p.ceilingDb });
  if (!gate.ok) throw new Error(`Master failed validation: ${gate.issues.join(", ")}`);

  const report = {
    before: a,
    after: best.analysis,
    quality: gate,
    target: p.targetLufs,
    corrections: reviewMaster(a, best.analysis, best.params).corrections?.length ? corrections : corrections,
    personality: plan.personalityKey,
    family: plan.family,
    conditions: plan.conditions,
    decisions: plan.decisions,
    strategy: plan.strategy,
    scoreBreakdown: best.score,
    passes,
    candidates,
    translation: translationCheck(best.analysis),
    exportTip: `This master targets ${p.targetLufs.toFixed(1)} LUFS with ${p.ceilingDb} dBTP true-peak headroom — ready for streaming delivery as-is. For an archive copy, export 24-bit at your source sample rate.`,
  };
  opts.onReport?.(report);
  return audioBufferToWav(finalBuffer, opts.bitDepth === 24 ? 24 : 16);
}