// === Reusable Fighter Animator (The Forgotten Ones) ===
// Wraps a Three.js AnimationMixer + a loaded clip set with the reusable state
// machine. Resolves a fighter STATE to a REAL clip by alias, plays it with
// crossFade, and — critically — NEVER substitutes another clip when the real
// one is missing. A missing combat clip is honestly "not installed".
//
// Also loads Mixamo-compatible BVH sources (mixamorig:* bone names) and adds
// them as real clips keyed by state, so dropping a BVH URL into BVH_SOURCES
// installs that animation with no code changes.
//
// Shared by every fighter; the engine supplies the renderer/camera/lighting once.

import * as THREE from "three";
import {
  createStateMachine,
  MOVEMENT_STATES,
  isCombatState,
} from "./fighterAnimationState";

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// Canonical state -> clip-name candidates (matched normalized: spaces/hyphens/
// underscores stripped, case-insensitive). Covers GLB-native names, Mixamo BVH
// names, and the new canonical camelCase state names.
export const STATE_CLIP_ALIASES = {
  idle: ["idle", "stand", "breath", "rest"],
  walk: ["walk", "move", "stroll"],
  run: ["run", "sprint", "jog"],
  jump: ["jump", "leap"],
  lightPunch: ["lightpunch", "punch", "jab", "strike", "lightattack", "attacklight"],
  heavyPunch: ["heavypunch", "smash", "heavyattack", "attackheavy"],
  lightKick: ["lightkick", "kick", "kicklight"],
  heavyKick: ["heavykick", "kickheavy"],
  special: ["special", "groundslam", "slam", "ultimate", "skill", "super"],
  block: ["block", "guard"],
  dodge: ["dodge", "dash", "evade", "roll"],
  grab: ["grab"],
  throw: ["throw", "toss"],
  hit: ["hit", "hurt", "damage"],
  stagger: ["stagger", "hitheavy", "heavyhit"],
  knockdown: ["knockdown", "down", "ko"],
  getUp: ["getup", "rise", "standup"],
  finisher: ["finisher", "finish", "fatality"],
  death: ["death", "die", "defeat", "dead"],
  victory: ["victory", "win", "celebrate", "cheer", "pose"],
};

export function createFighterAnimator({ mixer, clips }) {
  const clipList = Array.isArray(clips) ? clips.slice() : Object.values(clips || {});
  const clipsByNorm = new Map();
  for (const c of clipList) if (c && c.name) clipsByNorm.set(norm(c.name), c);

  // Resolve each state to a real clip. Pass 1: exact normalized match (greedy,
  // one clip per state). Pass 2: substring match, skipping already-assigned
  // clips — prevents "Kick" stealing the "Heavy Kick" clip and vice-versa.
  const resolved = new Map();
  const assigned = new Set();
  for (const [state, aliases] of Object.entries(STATE_CLIP_ALIASES)) {
    for (const a of aliases) {
      const c = clipsByNorm.get(norm(a));
      if (c && !assigned.has(c)) { resolved.set(state, c); assigned.add(c); break; }
    }
  }
  for (const [state, aliases] of Object.entries(STATE_CLIP_ALIASES)) {
    if (resolved.has(state)) continue;
    for (const a of aliases) {
      const na = norm(a);
      const c = clipList.find((c) => c && c.name && !assigned.has(c) && norm(c.name).includes(na));
      if (c) { resolved.set(state, c); assigned.add(c); break; }
    }
  }

  const installed = new Set(resolved.keys());
  const findClipForState = (state) => resolved.get(state) || null;

  const sm = createStateMachine();
  let activeAction = null;
  const finishTimers = new Map();

  const playClip = (clip, loop) => {
    if (!mixer || !clip) return false;
    const action = mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, 1);
    action.clampWhenFinished = !loop;
    if (activeAction && activeAction !== action) activeAction.fadeOut(0.12);
    action.reset().fadeIn(0.12).play();
    activeAction = action;
    return true;
  };

  return {
    sm,
    installedStates: installed,
    isInstalled: (state) => installed.has(state),
    findClipForState,
    getState: () => sm.state,
    resolvedMap: resolved,

    // Play a state. Returns true only if a REAL clip played. Never substitutes
    // another clip (no Wave faking) — returns false if the clip isn't installed.
    play(state, { now = performance.now(), loop, lockMs = 0, onFinish } = {}) {
      const clip = findClipForState(state);
      if (!clip) return false;
      const accepted = sm.request(state, { now, lockMs });
      if (accepted !== state) return false;
      // Cancel any pending one-shot finish callback from a previous combat clip.
      if (finishTimers.size) { finishTimers.forEach((t) => clearTimeout(t)); finishTimers.clear(); }
      const isLoop = loop ?? MOVEMENT_STATES.has(state);
      const ok = playClip(clip, isLoop);
      if (ok && !isLoop && onFinish) {
        const dur = Math.max(50, (clip.duration || 0.4) * 1000);
        const t = setTimeout(() => { finishTimers.delete(state); onFinish(state); }, dur);
        finishTimers.set(state, t);
      }
      return ok;
    },

    // Locomotion update — respects the combat lock so movement can't interrupt a
    // playing combat clip. When a combat clip finishes and the fighter is
    // stationary, return to idle; if moving, to walk/run.
    updateLocomotion({ moving, running, now = performance.now() }) {
      if (sm.locked) return; // combat clip still playing — don't override
      if (moving) {
        const target = running ? "run" : "walk";
        if (sm.state !== target && sm.state !== "jump") {
          this.play(target, { now, loop: true });
        }
      } else if (MOVEMENT_STATES.has(sm.state) || !isCombatState(sm.state)) {
        if (sm.state !== "idle") this.play("idle", { now, loop: true });
      }
    },

    // Load Mixamo-compatible BVH sources and add them as real clips keyed by state.
    // The BVH must already use the fighter's skeleton bone names (Mixamo FBX->BVH via
    // Blender); if names don't match, tracks simply won't bind (honest no-op).
    async loadBVHSources(sources) {
      if (!sources) return 0;
      let added = 0;
      const { BVHLoader } = await import("three/addons/loaders/BVHLoader.js");
      for (const [state, url] of Object.entries(sources)) {
        if (!url) continue;
        try {
          const res = await fetch(url);
          const text = await res.text();
          const parsed = new BVHLoader().parse(text);
          const clip = parsed.clip.clone();
          clip.name = state;
          clipsByNorm.set(norm(state), clip);
          clipList.push(clip);
          resolved.set(state, clip);
          installed.add(state);
          added++;
        } catch (e) {
          console.warn("BVH load failed", state, e);
        }
      }
      return added;
    },

    installClip(state, clip) {
      if (!clip) return;
      clip.name = state;
      clipsByNorm.set(norm(state), clip);
      clipList.push(clip);
      resolved.set(state, clip);
      installed.add(state);
    },

    dispose() {
      finishTimers.forEach((t) => clearTimeout(t));
      finishTimers.clear();
    },
  };
}