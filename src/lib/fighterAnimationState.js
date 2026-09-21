// === Reusable Fighter Animation State Machine (The Forgotten Ones) ===
// Canonical combat/locomotion states, a strict priority order, and a lock-based
// state machine that prevents locomotion from interrupting a combat clip mid-play.
// Shared by every fighter via the fighterAnimator — never duplicated per character.

export const FIGHTER_STATES = [
  "idle", "walk", "run", "jump",
  "lightPunch", "heavyPunch", "lightKick", "heavyKick", "special",
  "block", "dodge", "grab", "throw",
  "hit", "stagger", "knockdown", "getUp", "finisher", "death", "victory",
];

// Priority — higher wins. Order per spec:
// DEATH > KNOCKDOWN > HIT > ATTACK > GRAB > THROW > BLOCK > DODGE > JUMP > RUN > WALK > IDLE > VICTORY
export const STATE_PRIORITY = {
  death: 100,
  knockdown: 95,
  hit: 90,
  stagger: 88,
  lightPunch: 80, heavyPunch: 80, lightKick: 80, heavyKick: 80, special: 80, finisher: 80,
  grab: 75,
  throw: 73,
  block: 70,
  dodge: 68,
  jump: 60,
  run: 50,
  walk: 40,
  idle: 10,
  victory: 5,
};

// Combat states lock the state machine until their clip finishes — locomotion
// (idle/walk/run/jump) cannot interrupt them.
export const COMBAT_STATES = new Set([
  "lightPunch", "heavyPunch", "lightKick", "heavyKick", "special", "finisher",
  "grab", "throw", "block", "dodge",
  "hit", "stagger", "knockdown", "getUp", "death", "victory",
]);

export const MOVEMENT_STATES = new Set(["idle", "walk", "run", "jump"]);

// The combat clips a fighter must have installed to be COMBAT_READY.
export const REQUIRED_COMBAT_STATES = [
  "lightPunch", "heavyPunch", "lightKick", "heavyKick", "special",
  "block", "dodge", "grab", "throw",
  "hit", "stagger", "knockdown", "getUp", "finisher", "death", "victory",
];

export const isCombatState = (s) => COMBAT_STATES.has(s);
export const isMovementState = (s) => MOVEMENT_STATES.has(s);

// Create a state machine instance for one fighter.
export function createStateMachine() {
  let current = "idle";
  let lockUntil = 0; // ms timestamp: locomotion cannot override before this

  const prio = (s) => STATE_PRIORITY[s] ?? 0;

  return {
    get state() { return current; },
    get locked() { return performance.now() < lockUntil; },
    reset() { current = "idle"; lockUntil = 0; },

    // Request a transition. Returns the resulting state (may reject the request).
    request(state, { now = performance.now(), lockMs = 0 } = {}) {
      const incomingPrio = prio(state);
      const curPrio = prio(current);
      const locked = now < lockUntil;
      const isLoco = MOVEMENT_STATES.has(state);

      // Locomotion may NEVER interrupt a higher-priority / locked combat state.
      if (isLoco) {
        if (locked && curPrio > incomingPrio) return current;
        if (COMBAT_STATES.has(current) && curPrio > incomingPrio) return current;
      }

      current = state;
      if (COMBAT_STATES.has(state) && lockMs > 0) lockUntil = now + lockMs;
      else if (MOVEMENT_STATES.has(state)) lockUntil = 0;
      return current;
    },

    // A one-shot combat clip finished — release the lock so locomotion resumes.
    releaseCombat(now = performance.now()) {
      if (now >= lockUntil) lockUntil = 0;
    },
  };
}