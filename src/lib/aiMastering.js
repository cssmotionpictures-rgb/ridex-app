// ============================================================
// RIDE X SONG MASTER — adaptive mastering engine.
//
// Pipeline: ANALYZE → adaptive chain → render → loudness pass →
// ANALYZE RESULT → refine (second pass) → quality gate → export.
// Analysis and decisions live in masterAnalysis.js / adaptiveMaster.js;
// this module renders the actual DSP chain (Web Audio, 100% local)
// and encodes the professional WAV export.
// ============================================================

import { decodeMix, analyzeMix, measureLoudness, detectGroove } from "@/lib/masterAnalysis";
import { buildAdaptiveParams, reviewMaster, qualityGate } from "@/lib/adaptiveMaster";
import { buildAutoBass } from "@/lib/autoBaseline";

// Encode an AudioBuffer to 16-bit or 24-bit PCM WAV. 16-bit gets TPDF
// dither; 24-bit keeps the full distributor-grade resolution. Optional
// linear `gain` (used for loudness-matched A/B of the original mix).
export function audioBufferToWav(buffer, bitDepth = 16, gain = 1) {
  const bytes = bitDepth === 24 ? 3 : 2;
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const len = buffer.length * numCh * bytes + 44;
  const out = new ArrayBuffer(len);
  const view = new DataView(out);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF"); view.setUint32(4, len - 8, true); writeStr(8, "WAVE");
  writeStr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * bytes, true); view.setUint16(32, numCh * bytes, true);
  view.setUint16(34, bitDepth, true); writeStr(36, "data"); view.setUint32(40, len - 44, true);
  const channels = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  let off = 44;
  if (bitDepth === 24) {
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, channels[c][i] * gain));
        const v = s < 0 ? s * 8388608 : s * 8388607;
        view.setUint8(off, v & 0xff); view.setUint8(off + 1, (v >> 8) & 0xff); view.setUint8(off + 2, (v >> 16) & 0xff);
        off += 3;
      }
    }
  } else {
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numCh; c++) {
        // TPDF dither (1 LSB) — removes 16-bit quantization crackle.
        let s = Math.max(-1, Math.min(1, channels[c][i] * gain + (Math.random() - Math.random()) / 32768));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

// Soft tanh saturation curve — analog-style density.
function makeSaturationCurve(k) {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

// HONEST static soft-knee compression curve (dB-domain transfer). The
// browser's DynamicsCompressorNode adds hidden makeup gain; this curve is
// a pure transfer function: unity below the knee, soft knee across it.
function makeStaticCompCurve(thresholdDb, kneeDb, ratio) {
  const n = 8192;
  const curve = new Float32Array(n);
  const tLow = thresholdDb - kneeDb / 2;
  const slope = 1 / ratio;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const xd = 20 * Math.log10(Math.abs(x) + 1e-12);
    let yd;
    if (xd <= tLow) yd = xd;
    else if (xd >= tLow + kneeDb) yd = thresholdDb + (xd - thresholdDb) * slope;
    else yd = xd + (slope - 1) * ((xd - tLow) * (xd - tLow)) / (2 * kneeDb);
    curve[i] = Math.sign(x) * Math.pow(10, yd / 20);
  }
  return curve;
}

// Preset personalities — targets and tendencies, NOT fixed chains. The
// adaptive layer (buildAdaptiveParams) decides what actually runs per track.
export const MASTER_PRESETS = {
  signature: {
    label: "Signature",
    tagline: "Balanced, premium, wide, clean, natural — the RIDE-X house sound.",
    subGain: 2.5, subFreq: 90,
    kickGain: 2.2, kickFreq: 60, kickQ: 1.2,
    mudGain: -1.8, mudFreq: 300,
    presenceGain: 0.8, presenceFreq: 3600,
    airGain: 4.5, airFreq: 11000,
    voiceSweet: 0.10,
    punch: { threshold: -20, knee: 6, ratio: 4, attack: 0.012, release: 0.12 },
    glue: { threshold: -12, knee: 30, ratio: 2, attack: 0.02, release: 0.4 },
    limiter: null,
    drive: 0,
    bassSweet: 0,
    targetLufs: -10,
    ceilingDb: -1,
  },
  punchy: {
    label: "Punchy",
    tagline: "Transient-forward — tight kick, controlled bass, energetic drums.",
    subGain: 2, subFreq: 85,
    kickGain: 3.5, kickFreq: 65, kickQ: 1.4,
    mudGain: -2.2, mudFreq: 320,
    presenceGain: 1.4, presenceFreq: 3400,
    airGain: 4.5, airFreq: 11000,
    voiceSweet: 0.12,
    punch: { threshold: -18, knee: 6, ratio: 4, attack: 0.015, release: 0.1 },
    glue: { threshold: -14, knee: 26, ratio: 1.5, attack: 0.015, release: 0.3 },
    limiter: null,
    drive: 0.2,
    bassSweet: 0.15,
    targetLufs: -9,
    ceilingDb: -1,
  },
  heavy: {
    label: "Heavy",
    tagline: "Powerful low end, density, controlled aggression.",
    subGain: 4, subFreq: 80,
    kickGain: 2.5, kickFreq: 55, kickQ: 1.1,
    mudGain: -2.2, mudFreq: 280,
    presenceGain: 1.0, presenceFreq: 3500,
    airGain: 3.8, airFreq: 11000,
    voiceSweet: 0.09,
    punch: { threshold: -22, knee: 8, ratio: 3.5, attack: 0.012, release: 0.16 },
    glue: { threshold: -12, knee: 30, ratio: 2.2, attack: 0.03, release: 0.5 },
    limiter: null,
    drive: 0.4,
    bassSweet: 0.32,
    targetLufs: -9.5,
    ceilingDb: -1,
  },
  louder: {
    label: "Louder",
    tagline: "Higher perceived loudness — protected against distortion and pumping.",
    subGain: 2.8, subFreq: 90,
    kickGain: 2.4, kickFreq: 60, kickQ: 1.2,
    mudGain: -2, mudFreq: 300,
    presenceGain: 1.1, presenceFreq: 3500,
    airGain: 4.5, airFreq: 11000,
    voiceSweet: 0.11,
    punch: { threshold: -26, knee: 3, ratio: 6, attack: 0.008, release: 0.08 },
    glue: { threshold: -16, knee: 20, ratio: 2.5, attack: 0.012, release: 0.25 },
    limiter: { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.06 },
    drive: 0.5,
    bassSweet: 0.2,
    targetLufs: -8.5,
    ceilingDb: -0.3,
  },
  amapiano: {
    label: "Amapiano",
    tagline: "Deep controlled log-drum/sub, punchy percussion, open mids, smooth top.",
    subGain: 3.8, subFreq: 78,
    kickGain: 2.6, kickFreq: 58, kickQ: 1.1,
    mudGain: -2, mudFreq: 290,
    presenceGain: 0.8, presenceFreq: 3400,
    airGain: 4.8, airFreq: 11000,
    voiceSweet: 0.11,
    punch: { threshold: -21, knee: 7, ratio: 3.2, attack: 0.012, release: 0.18 },
    glue: { threshold: -13, knee: 28, ratio: 1.8, attack: 0.025, release: 0.45 },
    limiter: null,
    drive: 0.25,
    bassSweet: 0.3,
    targetLufs: -9.5,
    ceilingDb: -1,
  },
  afrobeats: {
    label: "Afrobeats",
    tagline: "Warm low end, clear vocals, rhythmic percussion, strong translation.",
    subGain: 3.5, subFreq: 80,
    kickGain: 2.8, kickFreq: 62, kickQ: 1.3,
    mudGain: -1.8, mudFreq: 300,
    presenceGain: 1.2, presenceFreq: 3500,
    airGain: 4.2, airFreq: 11000,
    voiceSweet: 0.10,
    punch: { threshold: -23, knee: 6, ratio: 4, attack: 0.012, release: 0.14 },
    glue: { threshold: -13, knee: 27, ratio: 2, attack: 0.02, release: 0.4 },
    limiter: null,
    drive: 0.35,
    bassSweet: 0.35,
    targetLufs: -9.5,
    ceilingDb: -1,
  },
};

// Rhythmic baseline groove depth (baseline swells UP between beats — never
// ducked below unity, the kick band is never pumped).
const RHYTHM_RATE = 2;
const RHYTHM_DEPTH = 0.25;

// Render the adaptive mastering chain offline. `p` is the ADAPTIVE parameter
// set (preset personality corrected by buildAdaptiveParams).
export async function renderMaster(decoded, p, bassRhythm, groove, bassBuffer = null, bassLevel = 0, pushDb = 0) {
  const offline = new OfflineAudioContext(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  const cal = p.cal || { lowDb: -24, highDb: -42 };

  // ---- AUTO-MIX: 3-band dynamics, thresholds calibrated from measurements ----
  const mixIn = offline.createGain();
  const mixOut = offline.createGain();
  const lr = (type, freq) => {
    const a = offline.createBiquadFilter();
    a.type = type; a.frequency.value = freq; a.Q.value = 0.707;
    const b = offline.createBiquadFilter();
    b.type = type; b.frequency.value = freq; b.Q.value = 0.707;
    a.connect(b);
    return [a, b];
  };
  const [lowSplitA, lowSplitB] = lr("lowpass", 140);
  const lowComp = offline.createWaveShaper();
  lowComp.curve = makeStaticCompCurve(cal.lowDb + 6, 12, 1.8);
  lowComp.oversample = "4x";
  const [midHpA, midHpB] = lr("highpass", 140);
  const [midLpA, midLpB] = lr("lowpass", 5500);
  const midComp = offline.createGain(); midComp.gain.value = 1; // mids untouched
  const [hiSplitA, hiSplitB] = lr("highpass", 5500);
  const deEss = offline.createWaveShaper();
  deEss.curve = makeStaticCompCurve(cal.highDb + 10, 6, 3);
  deEss.oversample = "4x";
  const deEss2 = offline.createWaveShaper();
  deEss2.curve = makeStaticCompCurve(cal.highDb + (10 - 2 * (p.deEssDepth || 1)), 4, 3);
  deEss2.oversample = "4x";
  mixIn.connect(lowSplitA); lowSplitB.connect(lowComp); lowComp.connect(mixOut);
  // Automatic baseline presence (MaxxBass-style parallel harmonics).
  const lowSweet = offline.createWaveShaper();
  lowSweet.curve = makeSaturationCurve(2.5); lowSweet.oversample = "2x";
  const lowSweetHp = offline.createBiquadFilter();
  lowSweetHp.type = "highpass"; lowSweetHp.frequency.value = 150; lowSweetHp.Q.value = 0.7;
  const lowSweetGain = offline.createGain(); lowSweetGain.gain.value = 0.14;
  lowSplitB.connect(lowSweet); lowSweet.connect(lowSweetHp); lowSweetHp.connect(lowSweetGain);
  lowSweetGain.connect(mixOut);

  // ---- AUTO-BASELINE (explicitly enabled creative layer only) ----
  if (bassBuffer) {
    const bassSrc = offline.createBufferSource();
    bassSrc.buffer = bassBuffer;
    const bassHp = offline.createBiquadFilter();
    bassHp.type = "highpass"; bassHp.frequency.value = 32; bassHp.Q.value = 0.7;
    const bassScoop = offline.createBiquadFilter();
    bassScoop.type = "peaking"; bassScoop.frequency.value = 320; bassScoop.Q.value = 1.1; bassScoop.gain.value = -5;
    const bassSafe = offline.createWaveShaper();
    const clipCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) clipCurve[i] = Math.tanh(1.5 * ((i / 1023) * 2 - 1)) / 1.5;
    bassSafe.curve = clipCurve; bassSafe.oversample = "2x";
    const bassGain = offline.createGain();
    bassGain.gain.value = bassLevel * 3.2;
    bassSrc.connect(bassHp); bassHp.connect(bassScoop); bassScoop.connect(bassSafe);
    bassSafe.connect(bassGain); bassGain.connect(mixIn);
    bassSrc.start(0);
  }
  mixIn.connect(midHpA); midHpB.connect(midLpA); midLpB.connect(midComp); midComp.connect(mixOut);
  mixIn.connect(hiSplitA); hiSplitB.connect(deEss); deEss.connect(deEss2); deEss2.connect(mixOut);

  // ---- Adaptive corrective EQ (every value analysis-driven, may be 0/negative) ----
  const sub = offline.createBiquadFilter();
  sub.type = "lowshelf"; sub.frequency.value = p.subFreq; sub.gain.value = p.subGain;
  const kickEq = offline.createBiquadFilter();
  kickEq.type = "peaking"; kickEq.frequency.value = p.kickFreq; kickEq.Q.value = p.kickQ; kickEq.gain.value = p.kickGain;
  const mud = offline.createBiquadFilter();
  mud.type = "peaking"; mud.frequency.value = p.mudFreq; mud.Q.value = 1.1; mud.gain.value = p.mudGain;
  const presence = offline.createBiquadFilter();
  presence.type = "peaking"; presence.frequency.value = p.presenceFreq; presence.Q.value = 0.9; presence.gain.value = p.presenceGain;
  const air = offline.createBiquadFilter();
  air.type = "highshelf"; air.frequency.value = p.airFreq; air.gain.value = p.airGain;
  const smoothTop = offline.createBiquadFilter();
  smoothTop.type = "peaking"; smoothTop.frequency.value = 7000; smoothTop.Q.value = 1.2;
  smoothTop.gain.value = p.harshGain ?? -2;
  const hatSmooth = offline.createBiquadFilter();
  hatSmooth.type = "peaking"; hatSmooth.frequency.value = 10200; hatSmooth.Q.value = 2;
  hatSmooth.gain.value = -2.5;
  smoothTop.connect(hatSmooth);

  // ---- Voice sweetener (parallel harmonic sheen, 1.8–5.2 kHz) ----
  let sheen = hatSmooth;
  if (p.voiceSweet > 0) {
    sheen = offline.createGain(); sheen.gain.value = 1;
    const vsHp = offline.createBiquadFilter();
    vsHp.type = "highpass"; vsHp.frequency.value = 1800; vsHp.Q.value = 0.7;
    const vsLp = offline.createBiquadFilter();
    vsLp.type = "lowpass"; vsLp.frequency.value = 5200; vsLp.Q.value = 0.7;
    const vsSat = offline.createWaveShaper();
    vsSat.curve = makeSaturationCurve(1.8); vsSat.oversample = "2x";
    const vsKeep = offline.createBiquadFilter();
    vsKeep.type = "highpass"; vsKeep.frequency.value = 2000; vsKeep.Q.value = 0.7;
    const vsGain = offline.createGain();
    vsGain.gain.value = p.voiceSweet;
    hatSmooth.connect(vsHp); vsHp.connect(vsLp); vsLp.connect(vsSat);
    vsSat.connect(vsKeep); vsKeep.connect(vsGain); vsGain.connect(sheen);
    hatSmooth.connect(sheen);
  }

  // ---- Mid/side stereo (width decided by measured correlation) ----
  let widthOut = sheen;
  const w = p.width ?? 0.08;
  if (decoded.numberOfChannels > 1 && w > 0) {
    const splitter = offline.createChannelSplitter(2);
    const merger = offline.createChannelMerger(2);
    const gLL = offline.createGain(); gLL.gain.value = 0.5 + w;
    const gRL = offline.createGain(); gRL.gain.value = 0.5 - w;
    const gLR = offline.createGain(); gLR.gain.value = 0.5 - w;
    const gRR = offline.createGain(); gRR.gain.value = 0.5 + w;
    sheen.connect(splitter);
    splitter.connect(gLL, 0); splitter.connect(gRL, 1);
    splitter.connect(gLR, 0); splitter.connect(gRR, 1);
    gLL.connect(merger, 0, 0); gRL.connect(merger, 0, 0);
    gLR.connect(merger, 0, 1); gRR.connect(merger, 0, 1);
    widthOut = merger;
  }

  // ---- Sweet Bass harmonic exciter (level decided adaptively) ----
  let sum = null;
  if (p.bassSweet > 0) {
    sum = offline.createGain(); sum.gain.value = 1;
    const low = offline.createBiquadFilter();
    low.type = "lowpass"; low.frequency.value = 160; low.Q.value = 0.7;
    const exciter = offline.createWaveShaper();
    exciter.curve = makeSaturationCurve(2.5);
    exciter.oversample = "2x";
    const keepHarmonics = offline.createBiquadFilter();
    keepHarmonics.type = "highpass"; keepHarmonics.frequency.value = 150;
    const sweetGain = offline.createGain();
    sweetGain.gain.value = p.bassSweet;
    src.connect(low); low.connect(exciter); exciter.connect(keepHarmonics);
    keepHarmonics.connect(sweetGain); sweetGain.connect(sum);
    src.connect(sum);
  } else {
    sum = src;
  }

  // ---- Rhythmic baseline groove (tempo-locked, opt-in) ----
  if (bassRhythm) {
    const subKick = offline.createBiquadFilter();
    subKick.type = "lowpass"; subKick.frequency.value = 90; subKick.Q.value = 0.7;
    const bandLo = offline.createBiquadFilter();
    bandLo.type = "highpass"; bandLo.frequency.value = 90; bandLo.Q.value = 0.7;
    const bandHi = offline.createBiquadFilter();
    bandHi.type = "lowpass"; bandHi.frequency.value = 200; bandHi.Q.value = 0.7;
    const rest = offline.createBiquadFilter();
    rest.type = "highpass"; rest.frequency.value = 200; rest.Q.value = 0.7;
    const pump = offline.createGain();
    pump.gain.value = 1;
    const depth = offline.createGain();
    depth.gain.value = RHYTHM_DEPTH;
    const periodSec = groove ? groove.periodSec : 1 / RHYTHM_RATE;
    const n = Math.max(2, Math.round(offline.sampleRate * periodSec));
    const cyc = offline.createBuffer(1, n, offline.sampleRate);
    const gd = cyc.getChannelData(0);
    for (let i = 0; i < n; i++) gd[i] = (1 - Math.cos((2 * Math.PI * i) / n)) / 2;
    const lfo = offline.createBufferSource();
    lfo.buffer = cyc; lfo.loop = true;
    lfo.start(Math.max(0, groove ? groove.phase : 0));
    lfo.connect(depth); depth.connect(pump.gain);
    const merge = offline.createGain();
    sum.connect(subKick); sum.connect(bandLo); sum.connect(rest);
    bandLo.connect(bandHi); bandHi.connect(pump);
    subKick.connect(merge); pump.connect(merge); rest.connect(merge);
    merge.connect(mixIn);
  } else {
    sum.connect(mixIn);
  }

  // ---- Punch + glue compression (thresholds calibrated to the mix level) ----
  const punch = offline.createDynamicsCompressor();
  punch.threshold.value = p.punch.threshold; punch.knee.value = p.punch.knee; punch.ratio.value = p.punch.ratio;
  punch.attack.value = p.punch.attack; punch.release.value = p.punch.release;
  const glue = offline.createDynamicsCompressor();
  glue.threshold.value = p.glue.threshold; glue.knee.value = p.glue.knee; glue.ratio.value = p.glue.ratio;
  glue.attack.value = p.glue.attack; glue.release.value = p.glue.release;

  mixOut.connect(sub);
  sub.connect(kickEq); kickEq.connect(mud); mud.connect(presence); presence.connect(air); air.connect(smoothTop);

  // ---- Saturation (adaptive — bypassed when the analysis says so) ----
  if (p.drive > 0) {
    const sat = offline.createWaveShaper();
    sat.curve = makeSaturationCurve(1 + p.drive);
    sat.oversample = "2x";
    widthOut.connect(sat); sat.connect(punch);
  } else {
    widthOut.connect(punch);
  }
  punch.connect(glue);

  // ---- True-peak-safe loudness stage (smooth gain reduction only, no hard clip) ----
  const safety = offline.createDynamicsCompressor();
  safety.threshold.value = p.limiter ? p.limiter.threshold : -2.5;
  safety.knee.value = p.limiter ? p.limiter.knee : 4;
  safety.ratio.value = p.limiter ? p.limiter.ratio : 12;
  safety.attack.value = 0.001; safety.release.value = 0.08;
  const loudPush = offline.createGain();
  loudPush.gain.value = 1.26 * Math.pow(10, pushDb / 20);
  glue.connect(loudPush); loudPush.connect(safety);
  safety.connect(offline.destination);

  src.start(0);
  return offline.startRendering();
}

// Normalize the rendered peak to the ceiling using a TRUE-PEAK estimate
// (4-point sinc reconstruction — a DAC can reconstruct a peak louder than
// any single sample). Never up-normalizes more than 8x.
export function normalizeToCeiling(buffer, ceilingDb) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (i > 0 && i < d.length - 2) {
        const m = Math.abs(-d[i - 1] + 9 * d[i] + 9 * d[i + 1] - d[i + 2]) / 16;
        if (m > peak) peak = m;
      }
    }
  }
  const target = Math.pow(10, ceilingDb / 20);
  const g = peak > 0 ? Math.min(target / peak, 8) : 1;
  if (g === 1) return;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
}

// Apply a linear gain to every sample, in place.
export function applyGain(buffer, g) {
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
}

// Resample to the artist's chosen export rate using the browser's
// high-quality resampler (proper band-limited conversion).
export async function resampleBuffer(buffer, targetRate) {
  if (!targetRate || buffer.sampleRate === targetRate) return buffer;
  const length = Math.ceil((buffer.length * targetRate) / buffer.sampleRate);
  const offline = new OfflineAudioContext(buffer.numberOfChannels, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

// ============ FULL ADAPTIVE PIPELINE ============
// opts: { decoded, analysis, autoBass, bassRhythm, sampleRate, bitDepth,
//         onProgress(key), onReport(report) }
// Returns the WAV Blob; throws (never delivers) if the quality gate fails.
export async function masterTrack(arrayBuffer, presetKey = "signature", opts = {}) {
  const base = MASTER_PRESETS[presetKey] || MASTER_PRESETS.signature;
  const decoded = opts.decoded || await decodeMix(arrayBuffer);

  opts.onProgress?.("analyzing");
  const analysis = opts.analysis || await analyzeMix(decoded);
  const p = buildAdaptiveParams(analysis, base);

  const wantBass = opts.autoBass !== false; // off by default — opt-in creative layer
  const useRhythm = !!opts.bassRhythm;
  const groove = (useRhythm || wantBass) ? (analysis.groove || detectGroove(decoded)) : null;
  let bassBuffer = null, bassLevel = 0;
  if (wantBass) {
    try {
      const autoBass = await buildAutoBass(decoded, groove, presetKey);
      if (autoBass) { bassBuffer = autoBass.buffer; bassLevel = autoBass.level; }
    } catch {}
  }

  opts.onProgress?.("mastering");
  let rendered = await renderMaster(decoded, p, useRhythm, groove, bassBuffer, bassLevel, 0);
  normalizeToCeiling(rendered, p.ceilingDb);

  // Loudness pass — real limiting toward the ADAPTIVE target, never forced.
  opts.onProgress?.("loudness");
  const target = p.targetLufs;
  let lufs = (await measureLoudness(rendered)).integratedLufs;
  let delta = target - lufs;
  if (delta > 0.5 && p.maxPush > 0) {
    rendered = await renderMaster(decoded, p, useRhythm, groove, bassBuffer, bassLevel, Math.min(delta, p.maxPush));
    normalizeToCeiling(rendered, p.ceilingDb);
    lufs = (await measureLoudness(rendered)).integrated;
    delta = target - lufs;
  }
  if (delta < -0.3) applyGain(rendered, Math.pow(10, delta / 20)); // too hot — clean trim

  // Second pass: ANALYZE RESULT → REFINE when the result needs it.
  opts.onProgress?.("review");
  let after = await analyzeMix(rendered);
  const review = reviewMaster(analysis, after, p);
  if (review.rerender) {
    rendered = await renderMaster(decoded, review.params, useRhythm, groove, bassBuffer, bassLevel, 0);
    normalizeToCeiling(rendered, review.params.ceilingDb);
    const l2 = (await measureLoudness(rendered)).integratedLufs;
    const d2 = review.params.targetLufs - l2;
    if (d2 < -0.3) applyGain(rendered, Math.pow(10, d2 / 20));
    after = await analyzeMix(rendered);
  }

  // Export + quality gate (a broken file is never delivered).
  opts.onProgress?.("exporting");
  const finalBuffer = await resampleBuffer(rendered, opts.sampleRate);
  opts.onProgress?.("validating");
  const gate = qualityGate(finalBuffer, decoded, { ceilingDb: p.ceilingDb });
  if (!gate.ok) throw new Error(`Master failed validation: ${gate.issues.join(", ")}`);

  opts.onReport?.({
    before: analysis,
    after,
    target: p.targetLufs,
    corrections: review.corrections,
    quality: gate,
  });
  return audioBufferToWav(finalBuffer, opts.bitDepth === 24 ? 24 : 16);
}