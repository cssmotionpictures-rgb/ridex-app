/* =============================================================================
   THE FORGOTTEN ONES — Zero-credit game audio engine (per-character)
   -----------------------------------------------------------------------------
   No integration credits are consumed. Everything is synthesized in-browser:
     • Web Audio API  → combat SFX (swings, impacts, blocks, dodges, specials,
                       KO, footsteps) and human "voice-like" pain grunts —
                       NOW modulated PER CHARACTER so each fighter sounds
                       unique (pitch, formant, weapon timbre, ability color).
     • Web Speech API → spoken dialogue lines with distinct voice profiles
                       per character (Babatunde / Mama Agbala / Priest / etc).

   The engine is a fire-and-forget singleton: call gameAudio.sfx(...) or
   gameAudio.speak(...) from anywhere in the game client. It safely no-ops when
   the browser lacks the APIs or when muted.
============================================================================= */

let _ctx = null;
let _master = null;
let _noise = null;
let enabled = true;

function ctx() {
  if (_ctx) return _ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  _ctx = new AC();
  _master = _ctx.createGain();
  _master.gain.value = 0.55;
  _master.connect(_ctx.destination);
  return _ctx;
}

function noiseBuffer(c, dur) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function resume() {
  const c = ctx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

// ---------------------------------------------------------------------------
// PER-CHARACTER AUDIO PROFILES
// Each of the 17 fighters has a unique sonic fingerprint:
//   voice   — Web Speech pitch/rate/gender for dialogue + victory lines
//   painMul — multiplier on the pain-grunt base frequency (timbre shift)
//   formant — bandpass center for the pain grunt (vocal character)
//   weapon  — determines the swing/attack timbre family
//   ability — tints the special-move sound (attack/heal/shield/buff/...)
// ---------------------------------------------------------------------------
export const CHARACTER_AUDIO = {
  1:  { voice: { pitch: 0.95, rate: 0.95, prefer: "male" },   painMul: 1.00, formant: 700, weapon: "sword",  ability: "shield" },  // Babatunde
  2:  { voice: { pitch: 1.15, rate: 1.05, prefer: "male" },   painMul: 1.30, formant: 820, weapon: "tech",   ability: "attack" },  // Ifedayo
  3:  { voice: { pitch: 1.25, rate: 0.88, prefer: "female" }, painMul: 1.45, formant: 950, weapon: "staff",  ability: "heal" },    // Mama Agbala
  4:  { voice: { pitch: 0.82, rate: 0.82, prefer: "male" },   painMul: 0.88, formant: 580, weapon: "staff",  ability: "buff" },    // Awo Oba
  5:  { voice: { pitch: 1.05, rate: 0.90, prefer: "female" }, painMul: 0.82, formant: 520, weapon: "spear",  ability: "attack" },  // Iya Olokun
  6:  { voice: { pitch: 0.70, rate: 0.85, prefer: "male" },   painMul: 0.75, formant: 480, weapon: "sword",  ability: "weaken" },  // Major Chidi
  7:  { voice: { pitch: 0.85, rate: 0.98, prefer: "male" },   painMul: 0.90, formant: 640, weapon: "sword",  ability: "attack" },  // Lisabi
  8:  { voice: { pitch: 1.30, rate: 1.10, prefer: "male" },   painMul: 1.35, formant: 880, weapon: "fist",   ability: "double" },  // Ibeji
  9:  { voice: { pitch: 0.78, rate: 0.80, prefer: "male" },   painMul: 0.80, formant: 500, weapon: "staff",  ability: "sp" },      // Orisa Oko
  10: { voice: { pitch: 0.92, rate: 1.00, prefer: "male" },   painMul: 1.05, formant: 760, weapon: "spear",  ability: "attack" },  // Agira
  11: { voice: { pitch: 1.10, rate: 1.02, prefer: "male" },   painMul: 1.20, formant: 820, weapon: "fist",   ability: "evade" },   // Agemo
  12: { voice: { pitch: 1.00, rate: 0.92, prefer: "female" }, painMul: 0.95, formant: 680, weapon: "spear",  ability: "attack" },  // Onimere
  13: { voice: { pitch: 0.88, rate: 0.85, prefer: "male" },   painMul: 0.92, formant: 620, weapon: "staff",  ability: "stun" },    // Elegba
  14: { voice: { pitch: 0.80, rate: 0.90, prefer: "male" },   painMul: 0.85, formant: 560, weapon: "sword",  ability: "lifesteal"}, // Kudeti
  15: { voice: { pitch: 1.08, rate: 0.95, prefer: "female" }, painMul: 1.15, formant: 900, weapon: "staff",  ability: "attack" },  // Osumare
  16: { voice: { pitch: 0.90, rate: 1.00, prefer: "male" },   painMul: 1.00, formant: 700, weapon: "fist",   ability: "attack" },  // John Obi Mikel
  17: { voice: { pitch: 0.75, rate: 0.82, prefer: "male" },   painMul: 0.70, formant: 440, weapon: "none",   ability: "gold" },    // Abramovich
};

const DEFAULT_AUDIO = CHARACTER_AUDIO[1];

function profileFor(characterId) {
  return CHARACTER_AUDIO[characterId] || DEFAULT_AUDIO;
}

// --- voice (Web Speech) ---
let _voices = [];
function loadVoices() {
  if (!window.speechSynthesis) return;
  _voices = window.speechSynthesis.getVoices() || [];
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  loadVoices();
  try { window.speechSynthesis.onvoiceschanged = loadVoices; } catch {}
  // Chrome bug: long utterances pause after ~15s. Keep speech alive while speaking.
  setInterval(() => {
    try {
      const s = window.speechSynthesis;
      if (s.speaking || s.pending) s.resume();
    } catch {}
  }, 4000);
}
function pickVoice(prefer) {
  if (!_voices.length) loadVoices();
  if (!_voices.length) return null;
  const en = _voices.filter((v) => /^en/i.test(v.lang));
  const pool = en.length ? en : _voices;
  const male = pool.find((v) => /male|david|daniel|alex|fred|jorge|mark|google uk english male/i.test(v.name));
  if (prefer === "male") return male || pool[0];
  if (prefer === "female") return pool.find((v) => /female|samantha|victoria|zira|google uk english female/i.test(v.name)) || pool[0];
  return male || pool[0];
}

// Speaker aliases used across the game (intro cutscene, victory, etc).
// A numeric characterId resolves to that fighter's personal voice.
const VOICE_PROFILE = {
  priest: { pitch: 0.6, rate: 0.82, prefer: "male" },
  narrator: { pitch: 0.85, rate: 0.9, prefer: "male" },
  boss: { pitch: 0.45, rate: 0.8, prefer: "male" },
  hero: { pitch: 0.95, rate: 0.95, prefer: "male" },
};

function resolveVoice(who, characterId) {
  if (typeof who === "number") return profileFor(who).voice;
  if (VOICE_PROFILE[who]) return VOICE_PROFILE[who];
  return profileFor(characterId || 1).voice;
}

function speak(text, who = "narrator", characterId) {
  if (!enabled || !window.speechSynthesis) return;
  try {
    resume();
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const pr = resolveVoice(who, characterId);
    u.pitch = pr.pitch; u.rate = pr.rate; u.volume = 1;
    const v = pickVoice(pr.prefer);
    if (v) u.voice = v;
    u.lang = v?.lang || "en-US";
    // Let cancel() flush the queue (Chrome quirk) before speaking.
    setTimeout(() => { try { synth.speak(u); } catch {} }, 40);
  } catch {}
}

// Unlock speech on a user gesture — some browsers (esp. iOS) block the first
// utterance unless it fires inside a gesture. Call from a click/touch/keydown.
function unlockSpeech() {
  if (!enabled || !window.speechSynthesis) return;
  try {
    resume();
    window.speechSynthesis.resume();
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {}
}

// --- SFX (Web Audio synthesis, per-character modulated) ---
function env(c, node, t0, a, d, peak) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  return g;
}

// Weapon-specific swing timbres so a sword, spear, staff, and fist all sound
// distinct — the character's identity comes through in every attack.
function weaponSwing(c, type, now, out, I, profile) {
  const w = profile.weapon;
  if (w === "tech") {
    // Ifedayo: digital blade — bright square sweep + high shimmer
    const o = c.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(1800, now); o.frequency.exponentialRampToValueAtTime(600, now + 0.14);
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 6;
    const g = env(c, o, now, 0.004, 0.14, 0.5 * I); o.connect(bp); bp.connect(g); g.connect(out); o.start(now); o.stop(now + 0.2);
  } else if (w === "spear") {
    // piercing thrust — narrow high bandpass, fast
    const src = c.createBufferSource(); src.buffer = _noise || (_noise = noiseBuffer(c, 0.3));
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(3200, now); bp.frequency.exponentialRampToValueAtTime(1200, now + 0.1); bp.Q.value = 2.5;
    const g = env(c, src, now, 0.003, 0.1, 0.5 * I); src.connect(bp); bp.connect(g); g.connect(out); src.start(now); src.stop(now + 0.16);
  } else if (w === "staff") {
    // whoosh — low-mid bandpass, wider, airy
    const src = c.createBufferSource(); src.buffer = _noise || (_noise = noiseBuffer(c, 0.3));
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(900, now); bp.frequency.exponentialRampToValueAtTime(400, now + 0.16); bp.Q.value = 0.7;
    const g = env(c, src, now, 0.006, 0.16, 0.5 * I); src.connect(bp); bp.connect(g); g.connect(out); src.start(now); src.stop(now + 0.22);
  } else if (w === "fist") {
    // meaty thud — short low body impact, no swish
    const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(180, now); o.frequency.exponentialRampToValueAtTime(70, now + 0.1);
    const g = env(c, o, now, 0.002, 0.1, 0.55 * I); o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.14);
  } else if (w === "none") {
    // pure energy — Abramovich: no weapon, raw power shimmer
    const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(1500, now + 0.12);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2000;
    const g = env(c, o, now, 0.004, 0.14, 0.5 * I); o.connect(lp); lp.connect(g); g.connect(out); o.start(now); o.stop(now + 0.2);
  } else {
    // sword (default): crisp swish — bandpass noise sweep
    const src = c.createBufferSource(); src.buffer = _noise || (_noise = noiseBuffer(c, 0.3));
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(2400, now); bp.frequency.exponentialRampToValueAtTime(900, now + 0.12); bp.Q.value = 1.1;
    const g = env(c, src, now, 0.005, 0.12, 0.5 * I); src.connect(bp); bp.connect(g); g.connect(out); src.start(now); src.stop(now + 0.2);
  }
}

// Special-move color per ability kind — each character's signature sounds
// like its element (heal = chime, shield = metallic ring, attack = power burst…)
function abilitySpecial(c, now, out, I, profile) {
  const kind = profile.ability;
  if (kind === "heal") {
    [523, 659, 784].forEach((f, i) => {
      const t = now + i * 0.06;
      const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = f;
      const g = env(c, o, t, 0.01, 0.4, 0.35 * I); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.5);
    });
  } else if (kind === "shield") {
    [600, 900].forEach((f) => {
      const o = c.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 1.4, now + 0.3);
      const g = env(c, o, now, 0.01, 0.35, 0.35 * I); o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.4);
    });
  } else if (kind === "buff" || kind === "double" || kind === "sp" || kind === "gold") {
    const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(1200, now + 0.35);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(800, now); lp.frequency.exponentialRampToValueAtTime(3000, now + 0.35);
    const g = env(c, o, now, 0.02, 0.4, 0.45 * I); o.connect(lp); lp.connect(g); g.connect(out); o.start(now); o.stop(now + 0.5);
  } else if (kind === "evade") {
    const src = c.createBufferSource(); src.buffer = _noise || (_noise = noiseBuffer(c, 0.4));
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(400, now); bp.frequency.exponentialRampToValueAtTime(3000, now + 0.3); bp.Q.value = 2;
    const g = env(c, src, now, 0.004, 0.3, 0.4 * I); src.connect(bp); bp.connect(g); g.connect(out); src.start(now); src.stop(now + 0.4);
  } else {
    // attack / weaken / stun / lifesteal — power burst (default special)
    const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(220 * (profile.painMul || 1), now); o.frequency.exponentialRampToValueAtTime(900 * (profile.painMul || 1), now + 0.3);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(1200, now); lp.frequency.exponentialRampToValueAtTime(3600, now + 0.3);
    const g = env(c, o, now, 0.01, 0.4, 0.5 * I); o.connect(lp); lp.connect(g); g.connect(out); o.start(now); o.stop(now + 0.5);
    const o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.setValueAtTime(880, now); o2.frequency.exponentialRampToValueAtTime(220, now + 0.4);
    const g2 = env(c, o2, now, 0.02, 0.4, 0.4 * I); o2.connect(g2); g2.connect(out); o2.start(now); o2.stop(now + 0.5);
  }
}

function playSfx(c, type, { intensity = 1, characterId } = {}) {
  const now = c.currentTime;
  const out = _master;
  const I = Math.max(0.3, Math.min(1.6, intensity));
  const profile = profileFor(characterId);

  switch (type) {
    case "light": {
      weaponSwing(c, "light", now, out, I, profile);
      break;
    }
    case "heavy": {
      // weapon swing + a low thump (scaled by character mass via painMul)
      weaponSwing(c, "heavy", now, out, I * 1.2, profile);
      const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(160 * (profile.painMul || 1), now); o.frequency.exponentialRampToValueAtTime(60, now + 0.18);
      const og = env(c, o, now, 0.005, 0.18, 0.6 * I); o.connect(og); og.connect(out); o.start(now); o.stop(now + 0.25);
      break;
    }
    case "special": {
      abilitySpecial(c, now, out, I, profile);
      break;
    }
    case "grab": {
      const o = c.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(180 * (profile.painMul || 1), now); o.frequency.exponentialRampToValueAtTime(90, now + 0.18);
      const g = env(c, o, now, 0.006, 0.18, 0.4 * I); o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.25);
      break;
    }
    case "impact": {
      // body thud scaled by character's vocal weight + crack
      const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(200 * (profile.painMul || 1), now); o.frequency.exponentialRampToValueAtTime(50, now + 0.16);
      const g = env(c, o, now, 0.002, 0.16, 0.9 * I); o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.22);
      const src = c.createBufferSource(); src.buffer = _noise || (_noise = noiseBuffer(c, 0.2));
      const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800;
      const g2 = env(c, src, now, 0.001, 0.08, 0.5 * I); src.connect(hp); hp.connect(g2); g2.connect(out); src.start(now); src.stop(now + 0.12);
      break;
    }
    case "pain": {
      // per-character grunt: formant + pitch unique to each fighter
      const base = 300 * (profile.painMul || 1);
      const formant = profile.formant || 700;
      const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(base, now); o.frequency.exponentialRampToValueAtTime(base * 0.4, now + 0.22);
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(formant, now); bp.frequency.exponentialRampToValueAtTime(formant * 0.57, now + 0.2); bp.Q.value = 3.5;
      const g = env(c, o, now, 0.006, 0.24, 0.6 * I); o.connect(bp); bp.connect(g); g.connect(out); o.start(now); o.stop(now + 0.3);
      const src = c.createBufferSource(); src.buffer = _noise || (_noise = noiseBuffer(c, 0.2));
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1200;
      const g2 = env(c, src, now, 0.01, 0.18, 0.18 * I); src.connect(lp); lp.connect(g2); g2.connect(out); src.start(now); src.stop(now + 0.25);
      break;
    }
    case "block": {
      [820, 1240].forEach((f) => {
        const o = c.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 0.6, now + 0.18);
        const g = env(c, o, now, 0.002, 0.2, 0.35 * I); o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.25);
      });
      const src = c.createBufferSource(); src.buffer = _noise || (_noise = noiseBuffer(c, 0.15));
      const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3000;
      const g3 = env(c, src, now, 0.001, 0.06, 0.3 * I); src.connect(hp); hp.connect(g3); g3.connect(out); src.start(now); src.stop(now + 0.1);
      break;
    }
    case "dodge": {
      const src = c.createBufferSource(); src.buffer = _noise || (_noise = noiseBuffer(c, 0.3));
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(600, now); bp.frequency.exponentialRampToValueAtTime(2400, now + 0.16); bp.Q.value = 1.4;
      const g = env(c, src, now, 0.004, 0.16, 0.4 * I); src.connect(bp); bp.connect(g); g.connect(out); src.start(now); src.stop(now + 0.22);
      break;
    }
    case "jump": {
      const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(680, now + 0.14);
      const g = env(c, o, now, 0.004, 0.14, 0.3 * I); o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.18);
      break;
    }
    case "footstep": {
      const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(90, now); o.frequency.exponentialRampToValueAtTime(50, now + 0.08);
      const g = env(c, o, now, 0.002, 0.08, 0.18 * I); o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.1);
      break;
    }
    case "finish": {
      const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(160, now); o.frequency.exponentialRampToValueAtTime(1200, now + 0.5);
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(800, now); lp.frequency.exponentialRampToValueAtTime(4000, now + 0.5);
      const g = env(c, o, now, 0.02, 0.6, 0.6 * I); o.connect(lp); lp.connect(g); g.connect(out); o.start(now); o.stop(now + 0.7);
      break;
    }
    case "ko": {
      const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(420, now); o.frequency.exponentialRampToValueAtTime(40, now + 0.7);
      const g = env(c, o, now, 0.004, 0.8, 1.0 * I); o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.85);
      const src = c.createBufferSource(); src.buffer = _noise || (_noise = noiseBuffer(c, 0.5));
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1000;
      const g2 = env(c, src, now, 0.003, 0.4, 0.6 * I); src.connect(lp); lp.connect(g2); g2.connect(out); src.start(now); src.stop(now + 0.5);
      break;
    }
    case "victory": {
      // per-character victory chord — major triad pitched to the fighter's voice
      const root = 440 * (profile.painMul || 1);
      [1, 1.26, 1.5].forEach((mul, i) => {
        const t = now + i * 0.12;
        const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = root * mul;
        const g = env(c, o, t, 0.01, 0.4, 0.4 * I); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.5);
      });
      break;
    }
    default: break;
  }
}

export const gameAudio = {
  resume,
  setEnabled(v) { enabled = !!v; if (!v) this.stopSpeech(); },
  isEnabled() { return enabled; },
  sfx(type, opts) { if (!enabled) return; const c = ctx(); if (!c) return; resume(); try { playSfx(c, type, opts || {}); } catch {} },
  speak,
  unlockSpeech,
  stopSpeech() { try { window?.speechSynthesis?.cancel(); } catch {} },
};

export default gameAudio;