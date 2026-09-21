// Auto-Baseline — the "session bass player" inside the master. It listens to
// the song — detects the beat grid, and the bass movement the record already
// plays — then synthesizes a genre-matched bassline that reinforces the song's
// own roots: an amapiano log drum, a punchy 808, or a warm sustained sub.
// It only plays where the song actually has low energy, and its level is
// calibrated to the song, so the record sounds sweeter, deeper and more
// intentional — automatically, 100% in-browser.

const A1 = 55; // A1 — bottom of the bass range

// Goertzel magnitude — cheap single-frequency energy probe.
function goertzel(data, sr, start, size, freq) {
  const k = (2 * Math.PI * freq) / sr;
  const coeff = 2 * Math.cos(k);
  let s1 = 0, s2 = 0;
  const end = Math.min(data.length, start + size);
  for (let i = start; i < end; i++) {
    const s0 = data[i] + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2);
}

// Bass-range semitone probes (55–330 Hz) grouped into 12 pitch classes.
const SEMIS = [];
for (let midi = 33; midi <= 64; midi++) {
  SEMIS.push({ pc: midi % 12, freq: A1 * Math.pow(2, (midi - 33) / 12) });
}

// Dominant bass root (pitch class) per bar — i.e. the song's own bassline
// skeleton, quantized to the bar. The synthesized layer reinforces exactly
// these notes, so it always matches the song's key and chord movement.
function bassRoots(ch, sr, barLen, offset) {
  const bars = [];
  for (let s = offset; s + barLen <= ch.length; s += barLen) {
    const chroma = new Float32Array(12);
    for (let i = 0; i < SEMIS.length; i++) {
      chroma[SEMIS[i].pc] += goertzel(ch, sr, s, barLen, SEMIS[i].freq);
    }
    let best = 0;
    for (let p = 1; p < 12; p++) if (chroma[p] > chroma[best]) best = p;
    bars.push(best);
  }
  return bars;
}

// Pitch-class → frequency. pc 9 (A) = 55 Hz; `up` lifts by octaves.
function pcFreq(pc, up = 0) {
  const steps = ((((pc - 9) % 12) + 12) % 12) + 12 * up;
  return A1 * Math.pow(2, steps / 12);
}

// Genre-matched bass voice, driven by the chosen mastering preset.
function styleFor(presetKey) {
  if (presetKey === "amapiano") return "log";   // pitched log-drum bounce
  if (presetKey === "signature") return "sub";  // warm sustained sub
  return "808";                                  // punchy hip-hop / afrobeats 808
}

// Rhythmic placement per style: [beatSlot, lengthInBeats, accent] within each
// 4-beat bar. The bounce lives in the SPACES — offbeat hits and short notes
// that leave room for the kick, never four-on-the-floor machine-gun notes.
const PATTERNS = {
  sub: [[0, 1.9, 1], [2, 1.9, 0.85]],                                        // held roots with a breath between
  "808": [[0, 0.7, 1], [1.5, 0.6, 0.85], [2, 0.45, 0.8], [3.5, 0.85, 0.9]],  // bouncy syncopated 808 — long tail rings into the next bar
  log: [[0.5, 0.4, 0.9], [1.5, 0.4, 0.85], [2.5, 0.9, 1], [3.25, 0.35, 0.7]], // classic amapiano log-drum offbeat groove
};

// Synthesize the bassline across the full track length.
function synth(len, sr, groove, style, roots, gate) {
  const beat = groove ? groove.periodSec : 0.5;
  const phase = groove ? groove.phase : 0;
  const out = new Float32Array(len);
  const glide = style === "log" ? 1.5 : style === "808" ? 1.15 : 1; // small pitch drop — big glides read as "scattered"
  const glideSec = 0.04;
  const decay = style === "sub" ? 1.5 : style === "log" ? 6 : 4.5;  // envelope decay rate
  const relSec = 0.03 * sr;

  for (let b = 0; b < roots.length; b++) {
    const pc = roots[b];
    const pattern = PATTERNS[style];
    for (let ni = 0; ni < pattern.length; ni++) {
      const [slot, durBeats, accent] = pattern[ni];
      // Musical sweetness: the sub lifts its 2nd note an octave; the log drum
      // walks to the fifth every 4th bar and the 808 walks into the next bar —
      // small moves that make the baseline feel played, not programmed.
      let usePc = pc, up = 0;
      if (style === "sub" && ni === 1) up = 1;
      if (style === "log" && ni === 2 && b % 4 === 2) usePc = (pc + 7) % 12;
      if (style === "808" && ni === 3 && b % 2 === 1) usePc = (pc + 7) % 12;
      const f = pcFreq(usePc, up) * (style === "log" ? 1.19 : 1); // log drums sit a touch higher
      const tStart = phase + (b * 4 + slot) * beat;
      const start = Math.round(tStart * sr);
      const n = Math.min(len - start, Math.round(durBeats * beat * 0.98 * sr));
      if (n <= 0) continue;
      // Per-NOTE gate: the hit plays at ONE steady level — the average of the
      // song's low energy across the note's window. Per-sample gating chopped
      // notes mid-sustain (the "scattering" effect); per-note gating keeps
      // every hit whole, round and glued to the beat.
      let gSum = 0;
      for (let i = 0; i < n; i++) {
        const gi = start + i;
        if (gi >= 0 && gi < len) gSum += gate[gi];
      }
      const noteGate = Math.min(1.15, gSum / Math.max(1, n));
      if (noteGate < 0.15) continue; // breakdown / quiet section — the bass player sits out
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const gf = f * (glide > 1 ? glide - (glide - 1) * Math.min(1, t / glideSec) : 1);
        ph += (2 * Math.PI * gf) / sr;
        let env = Math.min(1, t / 0.004) * Math.min(1, (n - i) / relSec);
        if (style === "sub") env *= 0.55 + 0.45 * Math.exp(-t * decay);
        else env *= Math.exp(-t * decay);
        let s = Math.sin(ph) + 0.35 * Math.sin(2 * ph); // harmonics → audible on phone speakers
        s = Math.tanh(1.2 * s) * 0.85;
        const idx = start + i;
        if (idx >= 0 && idx < len) out[idx] += s * env * accent * noteGate;
      }
    }
  }
  return out;
}

// Full pipeline: analyze the song → pick the voice → synthesize → calibrate.
// Returns { buffer, level } or null when the song gives us nothing to work with.
export async function buildAutoBass(decoded, groove, presetKey) {
  const sr = decoded.sampleRate;
  const ch = decoded.getChannelData(0);

  // 4x decimation for analysis speed (bass lives far below the new Nyquist).
  const dn = Math.floor(ch.length / 4);
  const dch = new Float32Array(dn);
  for (let i = 0; i < dn; i++) dch[i] = (ch[4 * i] + ch[4 * i + 1] + ch[4 * i + 2] + ch[4 * i + 3]) / 4;
  const dsr = sr / 4;
  const beat = groove ? groove.periodSec : 0.5;
  const barLen = Math.max(1, Math.round(dsr * beat * 4));
  const off = Math.max(0, Math.round((groove ? groove.phase : 0) * dsr)) % barLen;
  const roots = bassRoots(dch, dsr, barLen, off);
  if (!roots.length) return null;

  // Per-sample gate from the song's own low energy — the bass player only
  // plays where the song has lows, and ducks out of breakdowns automatically.
  const pole = Math.exp((-2 * Math.PI * 120) / sr);
  const sm = Math.exp(-1 / (0.08 * sr));
  const gate = new Float32Array(ch.length);
  let lp = 0, g = 0, lpSum = 0;
  for (let i = 0; i < ch.length; i++) {
    lp = pole * lp + (1 - pole) * ch[i];
    const e = Math.abs(lp);
    g = sm * g + (1 - sm) * e;
    gate[i] = g;
    lpSum += e * e;
  }
  const srcLowRms = Math.sqrt(lpSum / ch.length);
  let gAvg = 0;
  for (let i = 0; i < gate.length; i++) gAvg += gate[i];
  gAvg = gAvg / gate.length || 1e-9;
  for (let i = 0; i < gate.length; i++) gate[i] = Math.min(1.15, Math.max(0, (gate[i] / gAvg) * 0.75));

  const out = synth(ch.length, sr, groove, styleFor(presetKey), roots, gate);
  let oSum = 0;
  for (let i = 0; i < out.length; i++) oSum += out[i] * out[i];
  const outRms = Math.sqrt(oSum / out.length);
  if (outRms < 1e-6) return null;

  // Calibrate: the added baseline sits at ~45% of the song's own low energy —
  // present and sweet, never overwhelming the record.
  const level = Math.min(1.2, (0.45 * srcLowRms) / outRms);
  const buf = new OfflineAudioContext(1, 1, sr).createBuffer(1, out.length, sr);
  buf.copyToChannel(out, 0);
  return { buffer: buf, level };
}