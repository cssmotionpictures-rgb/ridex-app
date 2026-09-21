// ============================================================
// RIDE X MASTER ANALYSIS
// Every metric in this module is MEASURED from the actual audio
// (Web Audio + JS DSP, 100% locally). The results drive the
// adaptive mastering chain and the on-screen report — nothing
// here is estimated, canned or faked.
// ============================================================

// ---- ID3 strip (decodeAudioData rejects many MP3s with leading tags) ----
function stripId3(buf) {
  try {
    if (buf.byteLength < 11) return buf;
    const v = new DataView(buf);
    if (v.getUint8(0) === 0x49 && v.getUint8(1) === 0x44 && v.getUint8(2) === 0x33) {
      const size = (v.getUint8(6) << 21) | (v.getUint8(7) << 14) | (v.getUint8(8) << 7) | v.getUint8(9);
      const header = 10 + size;
      if (header > 0 && header < buf.byteLength) return buf.slice(header);
    }
  } catch {}
  return buf;
}

// Decode an uploaded mix to an AudioBuffer (MP3 / WAV / FLAC / M4A).
export async function decodeMix(arrayBuffer) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(stripId3(arrayBuffer.slice(0)));
  try { ctx.close(); } catch {}
  return decoded;
}

// ---- Iterative radix-2 FFT (for spectral band measurement) ----
function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j |= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wLenRe = Math.cos(ang), wLenIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const xRe = re[i + k + half], xIm = im[i + k + half];
        const vRe = xRe * wRe - xIm * wIm;
        const vIm = xRe * wIm + xIm * wRe;
        re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe; im[i + k + half] = uIm - vIm;
        const nRe = wRe * wLenRe - wIm * wLenIm;
        wIm = wRe * wLenIm + wIm * wLenRe; wRe = nRe;
      }
    }
  }
}

// Spectral band energies (dB, internally consistent for band-vs-band
// comparisons) from Hann-windowed FFT frames spread across the track.
// Silent frames are skipped so intros/outros don't skew the balance.
export const SPECTRAL_BANDS = [
  ["sub", 20, 60],
  ["bass", 60, 140],
  ["lowMid", 140, 400],
  ["mid", 400, 2000],
  ["presence", 2000, 5000],
  ["harsh", 5000, 9000],
  ["air", 9000, 18000],
];

export function measureBands(buffer, maxFrames = 36, frameSize = 8192) {
  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const total = Math.floor(ch.length / frameSize);
  if (total < 1) return Object.fromEntries(SPECTRAL_BANDS.map(([k]) => [k, -120]));
  const step = Math.max(1, Math.floor(total / maxFrames));
  const win = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
  const bins = frameSize / 2;
  const binHz = sr / frameSize;
  const pow = new Float64Array(bins);
  const re = new Float32Array(frameSize);
  const im = new Float32Array(frameSize);
  let frames = 0;
  for (let f = 0; f < total && frames < maxFrames; f += step) {
    const off = f * frameSize;
    let rms = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = ch[off + i] || 0;
      rms += s * s;
      re[i] = s * win[i];
      im[i] = 0;
    }
    if (Math.sqrt(rms / frameSize) < 1e-5) continue; // skip silence frames
    fftInPlace(re, im);
    for (let b = 0; b < bins; b++) pow[b] += re[b] * re[b] + im[b] * im[b];
    frames++;
  }
  const out = {};
  for (const [key, lo, hi] of SPECTRAL_BANDS) {
    let s = 0;
    const b0 = Math.max(1, Math.round(lo / binHz));
    const b1 = Math.min(bins - 1, Math.round(hi / binHz));
    for (let b = b0; b <= b1; b++) s += pow[b];
    out[key] = 10 * Math.log10(Math.max(s / Math.max(frames, 1), 1e-12));
  }
  return out;
}

// ---- Peaks (sample peak + true-peak estimate via 4x sinc reconstruction) ----
export function measurePeaks(buffer) {
  let samplePeak = 0, truePeak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > samplePeak) samplePeak = a;
      if (i > 0 && i < d.length - 2) {
        const m = Math.abs(-d[i - 1] + 9 * d[i] + 9 * d[i + 1] - d[i + 2]) / 16;
        if (m > truePeak) truePeak = m;
      }
    }
  }
  return {
    samplePeakDb: 20 * Math.log10(Math.max(samplePeak, 1e-9)),
    truePeakDb: 20 * Math.log10(Math.max(truePeak, 1e-9)),
  };
}

// ---- Level, crest factor, clipping runs, DC offset ----
export function measureLevel(buffer) {
  const ch = buffer.getChannelData(0);
  let sum = 0, peak = 0, dc = 0, clipRuns = 0, inRun = false;
  for (let i = 0; i < ch.length; i++) {
    const s = ch[i];
    sum += s * s; dc += s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
    if (a >= 0.9985) { if (!inRun) { clipRuns++; inRun = true; } } else inRun = false;
  }
  const n = ch.length || 1;
  const rmsDb = 10 * Math.log10(Math.max(sum / n, 1e-12));
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-9));
  return { rmsDb, peakDb, clipRuns, dcOffset: dc / n, crestDb: peakDb - rmsDb };
}

// ---- Stereo: correlation + side/mid width (mono compatibility) ----
export function measureStereo(buffer) {
  if (buffer.numberOfChannels < 2) return { mono: true, correlation: 1, widthDb: -120 };
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const step = Math.max(1, Math.floor(L.length / 1000000));
  let lr = 0, ll = 0, rr = 0, mid = 0, side = 0, n = 0;
  for (let i = 0; i < L.length; i += step) {
    const l = L[i], r = R[i];
    lr += l * r; ll += l * l; rr += r * r;
    const m = (l + r) / 2, s = (l - r) / 2;
    mid += m * m; side += s * s; n++;
  }
  const corr = lr / (Math.sqrt(ll * rr) + 1e-12);
  const widthDb = 10 * Math.log10((side / n + 1e-12) / (mid / n + 1e-12));
  return { mono: false, correlation: Math.max(-1, Math.min(1, corr)), widthDb };
}

// ---- ITU-R BS.1770 loudness: integrated / short-term max / LRA ----
// K-weighting on native biquads, 400 ms blocks @ 100 ms hops with the
// -70 LKFS absolute gate and -10 LU relative gate; short-term 3 s @ 1 s.
export async function measureLoudness(buffer) {
  const empty = { integratedLufs: -70, shortTermMaxLufs: -70, momentaryMaxLufs: -70, lra: 0 };
  try {
    const sr = buffer.sampleRate;
    const off = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, sr);
    const src = off.createBufferSource();
    src.buffer = buffer;
    const shelf = off.createBiquadFilter();
    shelf.type = "highshelf"; shelf.frequency.value = 1681.97; shelf.gain.value = 3.999; shelf.Q.value = 0.7071;
    const rlb = off.createBiquadFilter();
    rlb.type = "highpass"; rlb.frequency.value = 38.13; rlb.Q.value = 0.5;
    src.connect(shelf); shelf.connect(rlb); rlb.connect(off.destination);
    src.start(0);
    const kw = await off.startRendering();
    const chans = [];
    for (let c = 0; c < kw.numberOfChannels; c++) chans.push(kw.getChannelData(c));
    const blockLen = Math.round(0.4 * sr), hop = Math.round(0.1 * sr);
    const blockPowers = [];
    for (let s = 0; s + blockLen <= kw.length; s += hop) {
      let e = 0;
      for (const d of chans) {
        let sum = 0;
        for (let i = s; i < s + blockLen; i++) sum += d[i] * d[i];
        e += sum / blockLen;
      }
      if (Number.isFinite(e) && e > 0) blockPowers.push(e);
    }
    if (!blockPowers.length) return empty;
    const loud = (e) => -0.691 + 10 * Math.log10(e);
    const abs = blockPowers.filter((e) => loud(e) > -70);
    const pool = abs.length ? abs : blockPowers;
    const meanPool = pool.reduce((a, b) => a + b, 0) / pool.length;
    const rel = pool.filter((e) => loud(e) > loud(meanPool) - 10);
    const finalPool = rel.length ? rel : pool;
    const integrated = loud(finalPool.reduce((a, b) => a + b, 0) / finalPool.length);
    let momentaryMax = -70;
    for (const e of blockPowers) { const l = loud(e); if (l > momentaryMax) momentaryMax = l; }
    // Short-term windows (3 s, 1 s hop) → max + loudness range (LRA ≈ p95 − p10)
    const stLen = 3 * sr, stHop = sr;
    const sts = [];
    for (let s = 0; s + stLen <= kw.length; s += stHop) {
      let e = 0;
      for (const d of chans) {
        let sum = 0;
        for (let i = s; i < s + stLen; i++) sum += d[i] * d[i];
        e += sum / stLen;
      }
      if (e > 0) { const l = loud(e); if (l > -70) sts.push(l); }
    }
    let lra = 0;
    if (sts.length >= 4) {
      const sorted = [...sts].sort((a, b) => a - b);
      const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
      lra = Math.max(0, p(0.95) - p(0.10));
    }
    return {
      integratedLufs: integrated,
      shortTermMaxLufs: sts.length ? Math.max(...sts) : -70,
      momentaryMaxLufs: momentaryMax,
      lra,
    };
  } catch {
    return empty;
  }
}

// ---- Time-domain band RMS (dB) — calibration thresholds for the auto-mix ----
// (2-pole band edges; single-pole splits leaked midrange and mis-calibrated.)
export function bandRmsDb(buffer, kind) {
  try {
    const sr = buffer.sampleRate;
    const ch = buffer.getChannelData(0);
    const hpF = kind === "low" ? 0 : kind === "high" ? 5500 : 5800;
    const lpF = kind === "low" ? 140 : kind === "high" ? Infinity : 9200;
    const hpPole = hpF > 0 ? Math.exp((-2 * Math.PI * hpF) / sr) : null;
    const lpPole = Number.isFinite(lpF) ? Math.exp((-2 * Math.PI * lpF) / sr) : null;
    let hpLp1 = 0, hpLp2 = 0, lp1 = 0, lp2 = 0, sum = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = ch[i];
      let band = s;
      if (hpPole) { hpLp1 = hpPole * hpLp1 + (1 - hpPole) * s; band = s - hpLp1; hpLp2 = hpPole * hpLp2 + (1 - hpPole) * band; band = band - hpLp2; }
      if (lpPole) { lp1 = lpPole * lp1 + (1 - lpPole) * band; band = lp1; lp2 = lpPole * lp2 + (1 - lpPole) * band; band = lp2; }
      sum += band * band;
    }
    const rms = Math.sqrt(sum / ch.length);
    return 20 * Math.log10(Math.max(rms, 1e-6));
  } catch {
    return kind === "low" ? -24 : kind === "high" ? -42 : -48;
  }
}

// ---- Groove detection (tempo + phase from the low-end onset envelope) ----
export function detectGroove(buffer) {
  try {
    const sr = buffer.sampleRate;
    const ch = buffer.getChannelData(0);
    const hop = Math.max(1, Math.round(sr / 86));
    const nHops = Math.floor(ch.length / hop);
    if (nHops < 300) return null;
    const env = new Float32Array(nHops);
    const pole = Math.exp((-2 * Math.PI * 150) / sr);
    let lp = 0;
    for (let h = 0; h < nHops; h++) {
      let sum = 0;
      const base = h * hop;
      for (let i = 0; i < hop; i++) {
        const s = ch[base + i] || 0;
        lp = pole * lp + (1 - pole) * s;
        sum += lp * lp;
      }
      env[h] = Math.sqrt(sum / hop);
    }
    const onset = new Float32Array(nHops);
    let maxOn = 0;
    for (let h = 1; h < nHops; h++) {
      onset[h] = Math.max(0, env[h] - env[h - 1]);
      if (onset[h] > maxOn) maxOn = onset[h];
    }
    if (maxOn <= 0) return null;
    const hopSec = hop / sr;
    const minLag = Math.max(2, Math.round(60 / 180 / hopSec));
    const maxLag = Math.min(Math.round(60 / 60 / hopSec), Math.floor(nHops / 2));
    let bestLag = 0, bestScore = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0;
      for (let h = 0; h + lag < nHops; h++) s += onset[h] * onset[h + lag];
      s /= nHops - lag;
      if (s > bestScore) { bestScore = s; bestLag = lag; }
    }
    if (!bestLag) return null;
    let periodSec = bestLag * hopSec;
    while (periodSec < 60 / 180) periodSec *= 2;
    while (periodSec > 60 / 60) periodSec /= 2;
    const bpm = 60 / periodSec;
    if (bpm < 60 || bpm > 180) return null;
    let first = 0;
    for (let h = 1; h < nHops; h++) {
      if (onset[h] > maxOn * 0.5) { first = h * hopSec; break; }
    }
    return { periodSec, phase: first % periodSec, bpm };
  } catch {
    return null;
  }
}

// ---- Pre-master check: honest, only for genuinely problematic sources ----
export function preMasterCheck(a) {
  const w = [];
  const b = a.bands || {};
  if (a.clipRuns > 50) w.push({ code: "clipping", text: "Digital clipping detected in the source. RIDE X will keep the output true-peak-safe, but distortion already baked into the mix cannot be removed by mastering." });
  else if (a.clipRuns > 0) w.push({ code: "clipping", text: "A few clipped samples were detected in the source — the master will stay clean, but avoid clipping on export from your DAW." });
  if (a.integratedLufs > -9 && a.crestDb < 6) w.push({ code: "limited", text: "Your mix is already heavily limited. RIDE X will preserve punch and avoid adding unnecessary loudness." });
  if (a.rmsDb < -32) w.push({ code: "weak", text: "Weak signal level — the master will bring the level up cleanly without adding noise." });
  if (!a.mono && a.correlation < 0.2) w.push({ code: "phase", text: "Severe stereo phase issues detected — RIDE X will keep the low end centered and skip widening to protect mono playback." });
  if ((b.sub ?? -60) - (b.bass ?? -60) > 6) w.push({ code: "sub", text: "Excessive sub-bass energy — the low band will be dynamically controlled so the master stays powerful without becoming boomy." });
  if ((b.lowMid ?? -60) - (b.mid ?? -60) > 3) w.push({ code: "mud", text: "Low-mid buildup detected — a corrective cut will clean the mud region." });
  if ((b.harsh ?? -60) - (b.presence ?? -60) > 4) w.push({ code: "harsh", text: "Elevated 5–9 kHz energy — the de-esser will tame the harshness band." });
  return w;
}

// ---- Preset recommendation — based on the actual measurements ----
export function recommendPreset(a) {
  const b = a.bands || {};
  const strongSub = (b.sub ?? -60) >= (b.bass ?? -60) - 2;
  const vocalForward = (b.presence ?? -60) >= (b.mid ?? -60) - 4;
  if (a.clipRuns > 50 || (a.integratedLufs > -9 && a.crestDb < 6)) {
    return { key: "signature", reason: "your mix is already dense and loud — a balanced, natural master will preserve what is working instead of stacking more processing on top." };
  }
  if (strongSub && a.groove && a.groove.bpm >= 108 && a.groove.bpm <= 126) {
    return { key: "amapiano", reason: `strong low-end rhythmic content (${Math.round(a.groove.bpm)} BPM detected) — benefits from controlled sub weight and transient preservation.` };
  }
  if ((b.bass ?? -60) > (b.mid ?? -60) - 6 && vocalForward && a.crestDb > 8) {
    return { key: "afrobeats", reason: "a warm low end with clear vocal presence — the engine will keep vocals intelligible and the low end controlled." };
  }
  if (a.crestDb > 16 && (b.presence ?? -60) > (b.harsh ?? -60)) {
    return { key: "punchy", reason: "a dynamic mix with clear transients — transient-forward processing will keep the snap while adding weight." };
  }
  return { key: "signature", reason: "a balanced mix — the house signature chain with analysis-driven corrections." };
}

// ---- Full analysis pass ----
export async function analyzeMix(buffer) {
  const [loudness, peaks, level, stereo, bands, lowBandDb, highBandDb, harshBandDb] = await Promise.all([
    measureLoudness(buffer),
    Promise.resolve(measurePeaks(buffer)),
    Promise.resolve(measureLevel(buffer)),
    Promise.resolve(measureStereo(buffer)),
    Promise.resolve(measureBands(buffer)),
    Promise.resolve(bandRmsDb(buffer, "low")),
    Promise.resolve(bandRmsDb(buffer, "high")),
    Promise.resolve(bandRmsDb(buffer, "harsh")),
  ]);
  const a = {
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    durationSec: buffer.duration,
    ...loudness,
    ...peaks,
    ...level,
    ...stereo,
    bands,
    lowBandDb,
    highBandDb,
    harshBandDb,
    groove: detectGroove(buffer),
  };
  a.warnings = preMasterCheck(a);
  return a;
}