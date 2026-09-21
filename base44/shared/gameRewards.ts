// Server-authoritative reward + enemy math for "The Forgotten Ones".
// Mirrors src/lib/forgottenOnesData.js so the backend never trusts the client's
// claimed XP/SP — it recomputes from the same formulas. Any change to the
// client reward curve MUST be mirrored here or the server will reject/override.

export const EPISODES = [
  { id: 1, free: true, boss: "Nightmare Echo" },
  { id: 2, free: true, boss: "Forgotten Shrine Guardian" },
  { id: 3, free: true, boss: "Corrupted Priest" },
  { id: 4, free: false, boss: "Elegba (The Forgotten)" },
  { id: 5, free: false, boss: "Colonial Enforcer" },
  { id: 6, free: false, boss: "Cursed Warrior" },
  { id: 7, free: false, boss: "Kudeti (Greed Incarnate)" },
  { id: 8, free: false, boss: "Onimere (Corrupted)" },
  { id: 9, free: false, boss: "Spirit Thief" },
  { id: 10, free: false, boss: "Shadow Twin" },
  { id: 11, free: false, boss: "Osumare (The Fading)" },
  { id: 12, free: false, boss: "Major Chidi (Final Form)" },
];

export const LEVELS_PER_EPISODE = 20;
export const MAX_COMBO_FOR_BONUS = 50;
export const MIN_WIN_DURATION_MS = 1000;     // a real fight can't end instantly
export const MIN_GAP_BETWEEN_BATTLES_MS = 1500; // crude auto-farm rate limit

const DIFFICULTY_MUL = { beginner: 0.8, easy: 1, mid: 1.25, hard: 1.6 };

export function difficultyKeyForEpisode(epId) {
  if (epId <= 3) return "beginner";
  if (epId <= 6) return "easy";
  if (epId <= 9) return "mid";
  return "hard";
}

export function isBossLevel(level) {
  return level === 20;
}

export function xpForLevel(level) {
  return 100 + (level - 1) * 60;
}

// XP + SP awarded for a win. Mirrors the client's BattleArena/RealTimeArena math.
export function computeWinReward(episodeId, level, combo, boosterActive) {
  let baseXp = 20 + episodeId * 5 + level * 2;
  if (isBossLevel(level)) baseXp += 50;
  let baseSp = 10 + level * 2;
  const cb = Math.min(Math.max(0, combo), MAX_COMBO_FOR_BONUS);
  baseXp += Math.round(baseXp * cb * 0.05);
  baseSp += cb * 2;
  if (boosterActive) baseXp *= 2;
  return { xp: Math.round(baseXp), sp: Math.round(baseSp) };
}

// Apply XP to the level curve. Returns { level, xp, leveled } after leveling.
export function applyXp(xpGained, currentLevel, currentXp) {
  let xp = (currentXp || 0) + xpGained;
  let level = currentLevel || 1;
  let leveled = 0;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    leveled += 1;
    if (leveled > 200) break; // hard cap
  }
  return { level, xp, leveled };
}

// Is a level reachable given the player's completed-level set?
// Replays of already-completed levels are allowed (still earn XP).
export function isLevelReachable(episodeId, level, completedSet, isPremium) {
  const ep = EPISODES.find((e) => e.id === episodeId);
  if (!ep) return false;
  if (!ep.free && !isPremium) return false;
  const key = `${episodeId}-${level}`;
  if (completedSet.has(key)) return true;
  const prevDone = level === 1 ? true : completedSet.has(`${episodeId}-${level - 1}`);
  const prevEpDone = episodeId === 1 ? true : completedSet.has(`${episodeId - 1}-20`);
  return prevDone && prevEpDone;
}