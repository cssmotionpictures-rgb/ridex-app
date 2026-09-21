// === Reusable Fighter Character Registry (The Forgotten Ones) ===
// Each fighter supplies ONLY its identity/data: modelUrl, display name, role,
// combat stats, animation map, and combat config. The shared engine supplies the
// rest ONCE — renderer, camera, lighting, AnimationMixer, animation state machine,
// movement, combat, hitboxes/hurtboxes, health, stamina, AI, and UI. New fighters
// plug in here and reuse loadFighterCharacter() + the arena; nothing is duplicated.
//
// modelUrl = null  ->  MODEL NOT INSTALLED (no fake placeholder is ever created).
// Both .glb and .fbx are supported — loadFighterCharacter() branches on extension.

// === AUTHORITATIVE PLAYABLE ASSETS — loaded directly from public URLs in the
// browser via Three.js. This is the credit-free back door: no backend function,
// no UploadFile, no integration credits, no GPU server in the critical path.
const BABATUNDE_PS5_GLB =
  "https://media.base44.com/files/public/6a7364eea84550708f16a360/90e2ec5db_Babatunde_PS5_HIGH_GRADE_FIXED-1.glb";
const BABATUNDE_PS5_GLB_2 =
  "https://media.base44.com/files/public/6a7364eea84550708f16a360/6a67ac184_Babatunde_PS5_HIGH_GRADE_FIXED-2.glb";

// === 6 new real-life FBX fighters uploaded by the user (PS5-grade rigged humans).
// Loaded straight from public media URLs via Three.js FBXLoader — no credits.
const FBX_BASE = "https://media.base44.com/files/public/6a7364eea84550708f16a360/";
const FBX_FIGHTERS = [
  { file: "f6c0f9457_character1.fbx", name: "Adeolu Ironhand",   role: "player", stats: { maxHealth: 1000, damageMultiplier: 1.0, defense: 1.0, movementSpeed: 1.0 } },
  { file: "3c9f7febd_character2.fbx", name: "Nneka Shadowblade", role: "player", stats: { maxHealth: 950,  damageMultiplier: 1.1, defense: 0.9, movementSpeed: 1.15 } },
  { file: "aefe0c2f8_character3.fbx", name: "Tunde Stormfist",   role: "player", stats: { maxHealth: 1100, damageMultiplier: 1.2, defense: 1.1, movementSpeed: 0.95 } },
  { file: "ad5b7770c_character4.fbx", name: "Chidinma Swiftstrike", role: "player", stats: { maxHealth: 900, damageMultiplier: 1.15, defense: 0.85, movementSpeed: 1.25 } },
  { file: "fec69e095_character5.fbx", name: "Olabisi Nightborn", role: "player", stats: { maxHealth: 1050, damageMultiplier: 1.05, defense: 1.05, movementSpeed: 1.0 } },
  { file: "f7e97e8a3_character.fbx",  name: "Emeka Warbringer",  role: "player", stats: { maxHealth: 1200, damageMultiplier: 1.3, defense: 1.2, movementSpeed: 0.9 } },
];

export const FIGHTER_CONFIGS = {
  babatunde: {
    key: "babatunde",
    name: "Babatunde Adesanya",
    role: "player",
    modelUrl: BABATUNDE_PS5_GLB_2,
    stats: { maxHealth: 1000, health: 1000, maxStamina: 100, stamina: 100, damageMultiplier: 1, defense: 1, movementSpeed: 1 },
    animationMap: { idle: "Idle", walk: "Walk", run: "Run", lightPunch: "lightPunch", heavyPunch: "heavyPunch", special: "groundSlam" },
    combatConfig: { lightPunchDmg: 30, heavyPunchDmg: 60, lightKickDmg: 35, heavyKickDmg: 75, specialDmg: 100, grabDmg: 40, throwDmg: 50, finisherDmg: 150 },
  },

  corrupted_priest: {
    key: "corrupted_priest",
    name: "Corrupted Priest",
    role: "enemy",
    modelUrl: BABATUNDE_PS5_GLB,
    stats: { maxHealth: 1000, health: 1000, maxStamina: 100, stamina: 100, damageMultiplier: 1, defense: 1, movementSpeed: 1 },
    animationMap: {},
    combatConfig: {},
  },

  kael: { key: "kael", name: "Kael", role: "enemy", modelUrl: null, stats: { maxHealth: 1100, health: 1100, maxStamina: 100, stamina: 100, damageMultiplier: 1.1, defense: 1, movementSpeed: 1.05 }, animationMap: {}, combatConfig: {} },
  draven: { key: "draven", name: "Draven", role: "enemy", modelUrl: null, stats: { maxHealth: 1300, health: 1300, maxStamina: 120, stamina: 120, damageMultiplier: 1.2, defense: 1.1, movementSpeed: 0.95 }, animationMap: {}, combatConfig: {} },
  ragnar: { key: "ragnar", name: "Ragnar", role: "enemy", modelUrl: null, stats: { maxHealth: 1500, health: 1500, maxStamina: 140, stamina: 140, damageMultiplier: 1.3, defense: 1.25, movementSpeed: 0.9 }, animationMap: {}, combatConfig: {} },
};

// Register the 6 uploaded FBX fighters into the registry under keys fbx1..fbx6.
FBX_FIGHTERS.forEach((f, i) => {
  const key = `fbx${i + 1}`;
  FIGHTER_CONFIGS[key] = {
    key,
    name: f.name,
    role: f.role,
    modelUrl: FBX_BASE + f.file,
    stats: { maxHealth: f.stats.maxHealth, health: f.stats.maxHealth, maxStamina: 100, stamina: 100, damageMultiplier: f.stats.damageMultiplier, defense: f.stats.defense, movementSpeed: f.stats.movementSpeed },
    animationMap: {},
    combatConfig: { lightPunchDmg: 28, heavyPunchDmg: 58, lightKickDmg: 32, heavyKickDmg: 72, specialDmg: 96, grabDmg: 38, throwDmg: 48, finisherDmg: 140 },
  };
});

export function getFighterConfig(key) {
  return FIGHTER_CONFIGS[key];
}

export function listFighters() {
  return Object.values(FIGHTER_CONFIGS);
}

// Only fighters with a real installed model URL (GLB or FBX).
export function installedFighters() {
  return listFighters().filter((f) => f.modelUrl);
}

export function isFighterInstalled(key) {
  return !!FIGHTER_CONFIGS[key]?.modelUrl;
}

// Pick an enemy fighter (different from the player) by deterministic rotation so
// every level faces a different real character — no capsule placeholder.
export function pickEnemyFighter(playerKey, episodeId = 1, level = 1) {
  const pool = installedFighters().filter((f) => f.key !== playerKey);
  if (!pool.length) return null;
  return pool[((episodeId + level) % pool.length + pool.length) % pool.length];
}