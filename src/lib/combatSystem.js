// === Data-Driven Combat System (The Forgotten Ones) ===
// Attack definitions, fighter stats, damage resolution, block/dodge, combo, KO.
// Attack data is fully data-driven — edit ATTACKS to tune the game.

export const ATTACKS = {
  lightPunch: { damage: 30,  staminaCost: 5,  startup: 70,  active: 90,  recover: 160, range: 1.4, knockback: 0.18, hitstun: 260 },
  heavyPunch: { damage: 60,  staminaCost: 12, startup: 170, active: 90,  recover: 320, range: 1.6, knockback: 0.42, hitstun: 420 },
  lightKick:  { damage: 35,  staminaCost: 6,  startup: 90,  active: 90,  recover: 200, range: 1.5, knockback: 0.24, hitstun: 280 },
  heavyKick:  { damage: 75,  staminaCost: 15, startup: 220, active: 100, recover: 380, range: 1.8, knockback: 0.55, hitstun: 480 },
  special:    { damage: 100, staminaCost: 25, startup: 260, active: 120, recover: 420, range: 2.0, knockback: 0.66, hitstun: 520 },
  grab:       { damage: 40,  staminaCost: 8,  startup: 120, active: 120, recover: 300, range: 1.3, knockback: 0.12, hitstun: 300 },
  throw:      { damage: 50,  staminaCost: 10, startup: 140, active: 100, recover: 320, range: 1.3, knockback: 0.30, hitstun: 360 },
  finisher:   { damage: 150, staminaCost: 30, startup: 300, active: 150, recover: 500, range: 2.0, knockback: 0.80, hitstun: 600 },
};

export const BLOCK_REDUCTION = 0.35; // incoming damage multiplier while blocking
export const DODGE_DURATION = 320;   // ms of dodge invulnerability
export const COMBO_TIMEOUT = 1500;  // ms before the combo resets

// Create a fighter's mutable stats block from a config (per-fighter overrides).
export function createFighterStats(cfg = {}) {
  const maxHealth = cfg.maxHealth ?? 1000;
  const maxStamina = cfg.maxStamina ?? 100;
  return {
    maxHealth,
    health: cfg.health ?? maxHealth,
    maxStamina,
    stamina: cfg.stamina ?? maxStamina,
    damageMultiplier: cfg.damageMultiplier ?? 1,
    defense: cfg.defense ?? 1,
    movementSpeed: cfg.movementSpeed ?? 1,
  };
}

// Resolve an attack's damage against a defender, applying block reduction, dodge
// invulnerability, attacker damage multiplier and defender defense.
export function resolveDamage({ attack, attacker, defender, defenderBlocking, defenderInvuln }) {
  if (defenderInvuln) return { damage: 0, evaded: true };
  const def = ATTACKS[attack];
  const base = def ? def.damage : 0;
  let dmg = base * (attacker.damageMultiplier ?? 1);
  if (defenderBlocking) dmg *= BLOCK_REDUCTION;
  dmg = Math.round(dmg / (defender.defense ?? 1));
  return { damage: Math.max(0, dmg), evaded: false };
}

export function canAttack(stats, attack) {
  const def = ATTACKS[attack];
  return !!def && stats.stamina >= def.staminaCost;
}

export function spendStamina(stats, attack) {
  const def = ATTACKS[attack];
  if (def) stats.stamina = Math.max(0, stats.stamina - def.staminaCost);
}

export function regenStamina(stats, dt, rate = 0.01) {
  stats.stamina = Math.min(stats.maxStamina, stats.stamina + dt * rate);
}

// Combo tracker.
export function createComboTracker() {
  return { count: 0, damage: 0, timer: 0 };
}

export function registerComboHit(combo, damage) {
  combo.count += 1;
  combo.damage += damage;
  combo.timer = COMBO_TIMEOUT;
}

export function tickCombo(combo, dt) {
  if (combo.timer > 0) {
    combo.timer -= dt;
    if (combo.timer <= 0) { combo.count = 0; combo.damage = 0; }
  }
}

export function isKO(stats) {
  return stats.health <= 0;
}