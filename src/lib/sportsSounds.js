// Web Audio sound engine for live-sport alerts.
// Synthesizes distinct sounds for goals, red cards, and penalties — no audio files needed.

let audioCtx = null;
const getCtx = () => {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
};

// Some browsers require a user gesture before audio plays. Call this on a click/tap.
export const primeAudio = () => { getCtx(); };

const noiseBuffer = (ctx, dur = 1.2) => {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
};

// Triumphant "GOAL!" — rising arpeggio + filtered crowd-cheer noise burst
export const playGoalSound = () => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Arpeggio
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const t = now + i * 0.09;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });

  // Crowd cheer — band-passed noise swelling up
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 1.4);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(900, now);
  bp.frequency.linearRampToValueAtTime(1600, now + 1.0);
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.18, now + 0.25);
  g.gain.setValueAtTime(0.18, now + 0.9);
  g.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(now);
  src.stop(now + 1.4);
};

// Harsh low buzzer — a referee's "strange" red-card tone
export const playRedCardSound = () => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Two-tone descending buzzer, repeated
  [0, 0.28].forEach((off) => {
    const t = now + off;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.22);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
    gain.gain.setValueAtTime(0.22, t + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  });
};

// Referee whistle — oscillating sine, two short blasts
export const playPenaltySound = () => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [0, 0.32].forEach((off) => {
    const t = now + off;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(2100, t);
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(18, t);
    lfoGain.gain.setValueAtTime(420, t);
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.03);
    gain.gain.setValueAtTime(0.2, t + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain).connect(ctx.destination);
    lfo.start(t);
    osc.start(t);
    osc.stop(t + 0.3);
    lfo.stop(t + 0.3);
  });
};

// Yellow card — two crisp short beeps (distinct from red card & penalty)
export const playYellowCardSound = () => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [0, 0.16].forEach((off) => {
    const t = now + off;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
    gain.gain.setValueAtTime(0.18, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  });
};

// Bright rising two-note chime — a NEW live match joined the scanner
export const playPingSound = () => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const t = now + i * 0.14;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
};

// Voice announcement — "It's a goal!" — via the browser's built-in speech engine
export const speakGoal = () => {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("It's a goal!");
    u.rate = 1.0;
    u.pitch = 1.1;
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  } catch {}
};

export const SPORT_SOUNDS = { goal: playGoalSound, redcard: playRedCardSound, penalty: playPenaltySound, yellowcard: playYellowCardSound };