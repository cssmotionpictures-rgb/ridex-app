// ============================================================
// RIDE X ADAPTIVE MASTER
// The decision layer: turns MEASURED analysis into the actual
// processing parameters, reviews the rendered result, and gates
// the export. Every decision here traces back to a measured
// number from masterAnalysis — no fixed one-size-fits-all curve.
// ============================================================

import { measurePeaks, measureLevel } from "@/lib/masterAnalysis";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Build the adaptive parameter set for one track + preset personality.
// `base` is the preset's personality (targets/tendencies); the analysis
// decides what actually gets applied and what gets bypassed.
export function buildAdaptiveParams(a, base) {
  const p = { ...base, punch: { ...base.punch }, glue: { ...base.glue }, limiter: base.limiter ? { ...base.limiter } : null };
  const b = a.bands || {};
  const sub = b.sub ?? -60;
  const bass = b.bass ?? -60;
  const lowMid = b.lowMid ?? -60;
  const mid = b.mid ?? -60;
  const presence = b.presence ?? -60;
  const air = b.air ?? -60;
  const limited = a.integratedLufs > -9 && a.crestDb < 6;

  // ---- Low-end intelligence ----
  const subExcess = sub - bass;
  if (subExcess > 4) {
    // Excessive sub energy → dynamically control it, never boost it further.
    p.subGain = -Math.min(3, subExcess - 3);
  } else if (subExcess < -10) {
    // Thin mix → controlled low-end weight, not an exaggerated boost.
    p.subGain = Math.min(base.subGain + 1.5, 4);
  } else if (base.subGain > 0 && subExcess > 1) {
    p.subGain = base.subGain * 0.6;
  }
  // Low-mid mud — deepen the corrective cut only when measured buildup exists.
  if (lowMid - mid > 2) p.mudGain = Math.min(base.mudGain - 1.2, base.mudGain);

  // ---- Vocal intelligibility (subtle — mastering, not remixing) ----
  if (presence < mid - 6) p.presenceGain = base.presenceGain + 0.6;

  // ---- Brightness / air ----
  const airGap = presence - air;
  if (airGap < 6) p.airGain = base.airGain * 0.25; // already bright — do NOT add air
  else if (airGap > 14 && base.airGain < 4) p.airGain = base.airGain + 1; // dark — gradual presence lift

  // ---- Harshness / sibilance (measured concentration of the 5.8–9.2 kHz band
  //      vs the whole top end → auto-calibrated dip depth + de-ess squeeze) ----
  const harshGap = Math.max(0, (a.highBandDb ?? -42) - (a.harshBandDb ?? -48));
  p.harshGain = -2 - Math.min(2.2, Math.max(0, (8 - harshGap) * 0.35));
  p.deEssDepth = harshGap < 4 ? 1.5 : 1;

  // ---- Stereo / mid-side ----
  if (a.channels < 2) p.width = 0; // mono source — nothing to widen
  else if (a.correlation < 0.5 || a.widthDb > -6) p.width = 0; // phase-risky or already very wide
  else if (a.correlation > 0.98 && a.widthDb < -20) p.width = 0.1; // narrow + phase-safe: subtle open-up
  else p.width = 0.08;

  // ---- Saturation only when beneficial (never automatic on fragile sources) ----
  if (limited || a.crestDb < 8 || a.clipRuns > 20) {
    p.drive = 0;
    p.bassSweet = Math.min(p.bassSweet ?? 0, 0.12);
  }

  // ---- Compression thresholds calibrated to the mix's measured level ----
  const shift = clamp((a.rmsDb ?? -18) + 18, -8, 8);
  p.punch.threshold = clamp(base.punch.threshold + shift, -40, -6);
  p.glue.threshold = clamp(base.glue.threshold + shift, -40, -4);

  // ---- Dynamic loudness target (never one hardcoded number for every song) ----
  let target = base.targetLufs ?? -10;
  if (limited) target = Math.min(target, a.integratedLufs + 0.5); // already loud: preserve punch
  else if (a.crestDb > 18) target = target - 1; // very dynamic mix: keep more life
  if (a.clipRuns > 20) target = Math.min(target, -11); // damaged source: don't chase loudness
  p.targetLufs = clamp(target, -14, -7);
  p.maxPush = limited ? 1.5 : 6;

  // ---- Auto-mix calibration thresholds (measured, time-domain band levels) ----
  p.cal = {
    lowDb: a.lowBandDb ?? -24,
    highDb: a.highBandDb ?? -42,
    harshGain: p.harshGain,
  };
  return p;
}

// Second pass: analyze the RENDERED RESULT and correct it when needed.
// ANALYZE → MASTER → ANALYZE RESULT → REFINE.
export function reviewMaster(before, after, params) {
  const corrections = [];
  const next = { ...params, punch: { ...params.punch }, cal: params.cal };
  let rerender = false;

  if (before.crestDb > 6 && after.crestDb < 3.5) {
    next.punch = { ...params.punch, ratio: Math.max(2, Math.round(params.punch.ratio / 2)) };
    next.maxPush = 0;
    rerender = true; corrections.push("over-compression backed off");
  }
  if (params.airGain > 1 && ((after.bands?.air ?? 0) - (before.bands?.air ?? 0)) > 5) {
    next.airGain = params.airGain * 0.4;
    rerender = true; corrections.push("excessive brightness reduced");
  }
  if (((before.correlation ?? 1) - (after.correlation ?? 1)) > 0.08) {
    next.width = 0;
    rerender = true; corrections.push("stereo widening removed to protect mono");
  }
  const beforeSubBalance = (before.bands?.sub ?? 0) - (before.bands?.bass ?? 0);
  const afterSubBalance = (after.bands?.sub ?? 0) - (after.bands?.bass ?? 0);
  if (afterSubBalance > beforeSubBalance + 3) {
    next.subGain = Math.min(params.subGain, 0) - 1.5;
    rerender = true; corrections.push("low end re-balanced");
  }
  return { rerender, params: next, corrections };
}

// Final quality gate — a broken file is never delivered.
export function qualityGate(final, source, opts = {}) {
  const issues = [];
  // NaN / infinite samples — scan every sample of the exported buffer.
  outer: for (let c = 0; c < final.numberOfChannels; c++) {
    const d = final.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      if (!Number.isFinite(d[i])) { issues.push("non-finite audio value"); break outer; }
    }
  }
  // Duration / channel integrity (no truncation, no inserted silence).
  if (Math.abs(final.duration - source.duration) > 0.02 * source.duration + 0.1) issues.push("duration mismatch");
  if (final.numberOfChannels !== source.numberOfChannels) issues.push("channel count mismatch");
  // Clipping + true peak within the ceiling.
  const ceiling = opts.ceilingDb ?? -1;
  const peaks = measurePeaks(final);
  if (peaks.samplePeakDb > ceiling + 0.3) issues.push("output clipping");
  if (peaks.truePeakDb > ceiling + 0.5) issues.push("true peak over ceiling");
  // Not accidentally silent.
  const lvl = measureLevel(final);
  const srcLvl = measureLevel(source);
  if (lvl.rmsDb < srcLvl.rmsDb - 25) issues.push("silent output");
  return { ok: issues.length === 0, issues, peaks };
}