// === Hitbox / Hurtbox System (The Forgotten Ones) ===
// Hurtboxes (body parts that can BE hit) and attack hitboxes (fists/feet/special
// that DEAL hits). Attack hitboxes activate ONLY during attack-active frames and
// follow the fighter. A per-hit target set prevents repeated damage every frame.

export const HURTBOX_PARTS = ["HEAD", "TORSO", "LEFT_ARM", "RIGHT_ARM", "LEFT_LEG", "RIGHT_LEG"];
export const ATTACK_HITBOXES = ["LEFT_FIST", "RIGHT_FIST", "LEFT_FOOT", "RIGHT_FOOT", "SPECIAL"];

// Mixamo bone names used to attach hitboxes to the skeleton. Edit if a rig uses
// different names — the system stays the same, only the bone map changes.
export const HURTBOX_BONES = {
  HEAD: "mixamorigHead",
  TORSO: "mixamorigSpine2",
  LEFT_ARM: "mixamorigLeftForeArm",
  RIGHT_ARM: "mixamorigRightForeArm",
  LEFT_LEG: "mixamorigLeftLeg",
  RIGHT_LEG: "mixamorigRightLeg",
};

export const ATTACK_BONES = {
  LEFT_FIST: "mixamorigLeftHand",
  RIGHT_FIST: "mixamorigRightHand",
  LEFT_FOOT: "mixamorigLeftFoot",
  RIGHT_FOOT: "mixamorigRightFoot",
  SPECIAL: "mixamorigSpine2",
};

// Which attack hitboxes are active for each attack kind.
export const ATTACK_HITBOX_MAP = {
  lightPunch: ["RIGHT_FIST"],
  heavyPunch: ["RIGHT_FIST"],
  lightKick: ["RIGHT_FOOT"],
  heavyKick: ["RIGHT_FOOT"],
  special: ["SPECIAL"],
  grab: [],
  throw: [],
  finisher: ["RIGHT_FIST", "SPECIAL"],
};

export function createHitState() {
  return { activeHitboxes: new Set(), hitTargets: new Set() };
}

// Mark hitboxes active ONLY during attack-active frames. Cleared otherwise so
// attack hitboxes are never permanently enabled.
export function setActiveHitboxes(hitState, attack, inActive) {
  hitState.activeHitboxes.clear();
  if (!inActive) return;
  const parts = ATTACK_HITBOX_MAP[attack] || [];
  parts.forEach((p) => hitState.activeHitboxes.add(p));
}

// Register a hit on a target id — returns true only for the FIRST hit per attack
// (prevents the same strike damaging every render frame).
export function registerHit(hitState, targetId) {
  if (hitState.hitTargets.has(targetId)) return false;
  hitState.hitTargets.add(targetId);
  return true;
}

export function clearHitTargets(hitState) {
  hitState.hitTargets.clear();
}