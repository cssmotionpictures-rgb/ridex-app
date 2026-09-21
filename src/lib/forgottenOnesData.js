// "THE FORGOTTEN ONES" — game data: characters, episodes, enemies, abilities,
// 200+ levels across 4 difficulty tiers, per-level movie scenes & story dialogue.
// All combat is client-side (zero credit, no hit limit).

export const CHARACTERS = [
  { id: 1, name: "Babatunde Adesanya", role: "Protagonist / Family Patriarch", ability: { name: "Ancestral Shield", cost: 25, power: 0, kind: "shield", desc: "Block next attack" }, hp: 120, atk: 18, tier: "Hero", color: "#f7c948", skin: "#6b4423", weapon: "sword" },
  { id: 2, name: "Ifedayo Adesanya", role: "Son / Tech Entrepreneur", ability: { name: "Digital Blade", cost: 20, power: 32, kind: "attack", desc: "Heavy tech strike" }, hp: 95, atk: 22, tier: "Hero", color: "#5ec8f8", skin: "#7a4f2a", weapon: "sword" },
  { id: 3, name: "Mama Agbala", role: "Matriarch / Wisdom Keeper", ability: { name: "Healing Chant", cost: 30, power: 0, kind: "heal", desc: "Restore 60 HP" }, hp: 110, atk: 12, tier: "Hero", color: "#e0a3ff", skin: "#5a3a22", weapon: "staff" },
  { id: 4, name: "Awo Oba", role: "Babalawo / Ifá Priest", ability: { name: "Divine Divination", cost: 35, power: 0, kind: "buff", desc: "+50% damage for 3 turns" }, hp: 100, atk: 15, tier: "Hero", color: "#c5a059", skin: "#5a3a22", weapon: "staff" },
  { id: 5, name: "Iya Olokun", role: "Orisa of the Ocean", ability: { name: "Tidal Wave", cost: 40, power: 55, kind: "attack", desc: "Crushing wave" }, hp: 140, atk: 26, tier: "Orisa", color: "#2bb3c0", skin: "#8d5a3c", weapon: "spear" },
  { id: 6, name: "Major Chidi", role: "Antagonist / Colonial Force", ability: { name: "Suppression Field", cost: 30, power: 0, kind: "weaken", desc: "Enemy deals 50% dmg next turn" }, hp: 130, atk: 24, tier: "Villain", color: "#c0484a", skin: "#6b4423", weapon: "sword" },
  { id: 7, name: "Lisabi", role: "Orisa of Warriors", ability: { name: "Warrior's Fury", cost: 28, power: 40, kind: "attack", desc: "Triple slash" }, hp: 135, atk: 28, tier: "Orisa", color: "#d97757", skin: "#7a4f2a", weapon: "sword" },
  { id: 8, name: "Ibeji", role: "Orisa of Twins", ability: { name: "Twin Blessing", cost: 25, power: 0, kind: "double", desc: "Next attack hits twice" }, hp: 105, atk: 20, tier: "Orisa", color: "#f0a040", skin: "#6b4423", weapon: "fist" },
  { id: 9, name: "Orisa Oko", role: "Orisa of Agriculture", ability: { name: "Harvest Boom", cost: 30, power: 0, kind: "sp", desc: "Gain 40 Spirit Points" }, hp: 125, atk: 18, tier: "Orisa", color: "#8bbf5a", skin: "#8d5a3c", weapon: "staff" },
  { id: 10, name: "Agira", role: "Orisa of Hunters", ability: { name: "Hunter's Mark", cost: 22, power: 38, kind: "attack", desc: "Precision shot" }, hp: 115, atk: 26, tier: "Orisa", color: "#b08555", skin: "#6b4423", weapon: "spear" },
  { id: 11, name: "Agemo", role: "Orisa of Transformation", ability: { name: "Chameleon Shift", cost: 28, power: 0, kind: "evade", desc: "Dodge next 2 attacks" }, hp: 100, atk: 19, tier: "Orisa", color: "#7ad19f", skin: "#7a4f2a", weapon: "fist" },
  { id: 12, name: "Onimere", role: "Orisa of Rivers", ability: { name: "River Flow", cost: 24, power: 30, kind: "attack", desc: "Flowing strike + heal 20" }, hp: 120, atk: 20, tier: "Orisa", color: "#5aa6d9", skin: "#8d5a3c", weapon: "spear" },
  { id: 13, name: "Elegba", role: "Orisa of Crossroads", ability: { name: "Path Alignment", cost: 30, power: 0, kind: "stun", desc: "Stun enemy 1 turn" }, hp: 110, atk: 21, tier: "Orisa", color: "#e6c84c", skin: "#5a3a22", weapon: "staff" },
  { id: 14, name: "Kudeti", role: "Orisa of Marketplace", ability: { name: "Fair Trade", cost: 26, power: 0, kind: "lifesteal", desc: "Steal 35 HP" }, hp: 118, atk: 19, tier: "Orisa", color: "#c89b6b", skin: "#6b4423", weapon: "sword" },
  { id: 15, name: "Osumare", role: "Orisa of Rainbows", ability: { name: "Colour Blast", cost: 38, power: 48, kind: "attack", desc: "Prismatic burst" }, hp: 130, atk: 25, tier: "Orisa", color: "#b06bd9", skin: "#7a4f2a", weapon: "staff" },
  { id: 16, name: "John Obi Mikel", role: "Real-Life Figure (Flashback)", ability: { name: "Legendary Strike", cost: 30, power: 44, kind: "attack", desc: "Football fury" }, hp: 125, atk: 27, tier: "Legend", color: "#3fa64a", skin: "#5a3a22", weapon: "fist" },
  { id: 17, name: "Roman Abramovich", role: "Real-Life Figure (Flashback)", ability: { name: "Oligarch's Power", cost: 40, power: 0, kind: "gold", desc: "Double SP reward this battle" }, hp: 120, atk: 22, tier: "Legend", color: "#4a6cf7", skin: "#8d5a3c", weapon: "none" },
];

// Season 1 — The Journey (12 episodes · 20 levels each = 240 levels, 200+)
export const EPISODES = [
  { id: 1, title: "The Nightmare", theme: "Lagos City · Haunted Visions", boss: "Nightmare Echo", free: true, color: "#9c2f30" },
  { id: 2, title: "The Call", theme: "Ancestral Summons", boss: "Forgotten Shrine Guardian", free: true, color: "#c5a059" },
  { id: 3, title: "The Village", theme: "Ancestral Lands · Mama Agbala", boss: "Corrupted Priest", free: true, color: "#8bbf5a" },
  { id: 4, title: "The Revelation", theme: "Ifá Divination · Awo Oba", boss: "Elegba (The Forgotten)", color: "#e6c84c" },
  { id: 5, title: "The List", theme: "Colonial Ledger · Major Chidi", boss: "Colonial Enforcer", color: "#c0484a" },
  { id: 6, title: "The Survivors", theme: "Warrior's Camp · Lisabi", boss: "Cursed Warrior", color: "#d97757" },
  { id: 7, title: "The Blame", theme: "Marketplace Judgement · Kudeti", boss: "Kudeti (Greed Incarnate)", color: "#c89b6b" },
  { id: 8, title: "The Family Orisa", theme: "Ocean Awakening · Iya Olokun", boss: "Onimere (Corrupted)", color: "#2bb3c0" },
  { id: 9, title: "The Kidnapping", theme: "Hunter's Pursuit · Agira", boss: "Spirit Thief", color: "#b08555" },
  { id: 10, title: "The Rescue", theme: "Twin Covenant · Ibeji & Agemo", boss: "Shadow Twin", color: "#7ad19f" },
  { id: 11, title: "The Reset", theme: "Rainbow Restoration · Osumare", boss: "Osumare (The Fading)", color: "#b06bd9" },
  { id: 12, title: "The Commitment", theme: "Final Reckoning · The Ancestors", boss: "Major Chidi (Final Form)", color: "#5aa6d9" },
];

export const LEVELS_PER_EPISODE = 20;
export const TOTAL_LEVELS = EPISODES.length * LEVELS_PER_EPISODE;

// 4 difficulty tiers across the 12 episodes (60 levels each)
export const DIFFICULTY_TIERS = [
  { key: "beginner", label: "Beginner", color: "#3fae6a", episodes: [1, 2, 3] },
  { key: "easy", label: "Easy", color: "#5ec8f8", episodes: [4, 5, 6] },
  { key: "mid", label: "Mid", color: "#d97757", episodes: [7, 8, 9] },
  { key: "hard", label: "Hard", color: "#c0484a", episodes: [10, 11, 12] },
];
export function difficultyForEpisode(epId) {
  return DIFFICULTY_TIERS.find((t) => t.episodes.includes(epId)) || DIFFICULTY_TIERS[0];
}

// Real-life scene backdrop key per episode (city, shrine, village, ocean…)
export const EPISODE_SCENES = {
  1: "city", 2: "shrine", 3: "village", 4: "temple", 5: "fort", 6: "camp",
  7: "market", 8: "ocean", 9: "forest", 10: "twin", 11: "rainbow", 12: "final",
};

// Per-level detailed movie scene (location, time, weather, mood) — deterministic
// so every one of the 240 levels has a unique, repeatable environment.
const SCENE_BASE = {
  1: { location: "Lagos Streets", sceneKey: "city" },
  2: { location: "Ancestral Shrine", sceneKey: "shrine" },
  3: { location: "Agbala Village", sceneKey: "village" },
  4: { location: "Ifá Temple", sceneKey: "temple" },
  5: { location: "Colonial Fort", sceneKey: "fort" },
  6: { location: "Warrior's Camp", sceneKey: "camp" },
  7: { location: "Grand Market", sceneKey: "market" },
  8: { location: "Atlantic Shore", sceneKey: "ocean" },
  9: { location: "Sacred Forest", sceneKey: "forest" },
  10: { location: "Twin Shrine", sceneKey: "twin" },
  11: { location: "Rainbow Falls", sceneKey: "rainbow" },
  12: { location: "The Ancestral Realm", sceneKey: "final" },
};
const TIMES = ["Dawn", "Midday", "Dusk", "Night", "Midnight", "First Light"];
const WEATHER = ["Clear skies", "Heavy rain", "Harmattan haze", "Thunderstorm", "Thick fog", "Full moon", "Scorching heat"];
const DETAILS = ["abandoned", "ruined", "bustling with life", "eerie and silent", "war-torn", "overgrown", "ash-strewn", "flooded"];
const MOODS = ["tense", "hopeful", "ominous", "triumphant", "desperate", "mysterious"];
const hash = (n) => ((n * 9301 + 49297) % 233280) / 233280;

export function getLevelScene(episodeId, level) {
  const base = SCENE_BASE[episodeId] || SCENE_BASE[1];
  const seed = episodeId * 100 + level;
  return {
    title: getLevelTitle((episodeId - 1) * 20 + level),
    location: base.location,
    sceneKey: base.sceneKey,
    time: TIMES[Math.floor(hash(seed) * TIMES.length)],
    weather: WEATHER[Math.floor(hash(seed * 7) * WEATHER.length)],
    detail: DETAILS[Math.floor(hash(seed * 13) * DETAILS.length)],
    mood: MOODS[Math.floor(hash(seed * 17) * MOODS.length)],
  };
}

// Per-level story dialogue — a 4-beat adventure conversation (arrival →
// discovery → conflict → resolve) between the protagonist, his ally Awo Oba,
// and the level's enemy. Deterministic per level.
const STORY_BEATS = {
  arrival: [
    "The {location} rises before us — {detail}, beneath {time}.",
    "We arrive at {location} as {weather} rolls in. The air is {mood}.",
    "Footsteps echo through {location}, {detail} and cold.",
    "{time}. {location} stands {detail}, waiting for us.",
  ],
  discovery: [
    "Awo Oba: 'The ancestors whisper of a test ahead, my friend.'",
    "Awo Oba: 'Stay sharp — something here is not what it seems.'",
    "Awo Oba: 'I feel an old power stirring beneath this ground.'",
    "Awo Oba: 'The Ifá says a guardian waits. Do not waver.'",
  ],
  conflict: [
    "{enemy} blocks the path. 'You will not reclaim what was erased!'",
    "{enemy} steps from the dark. 'Turn back, mortal — this is not your fight.'",
    "{enemy} laughs. 'Another seeker come to be forgotten? How fitting.'",
    "{enemy} snarls. 'The ancestors abandoned you. I will finish what they started.'",
  ],
  resolve: [
    "Babatunde: 'We are remembered. We fight. We endure.'",
    "Babatunde: 'For the erased — for those who must not stay forgotten.'",
    "Babatunde: 'Stand with me, ancestor. This ends now.'",
    "Babatunde: 'I am the legacy they tried to bury. Watch me rise.'",
  ],
};

export function getLevelStory(episodeId, level) {
  const scene = getLevelScene(episodeId, level);
  const enemy = getLevelEnemy(episodeId, level);
  const fill = (t) => t
    .replace("{location}", scene.location)
    .replace("{time}", scene.time)
    .replace("{weather}", scene.weather)
    .replace("{detail}", scene.detail)
    .replace("{mood}", scene.mood)
    .replace("{enemy}", enemy.name);
  const pick = (arr, s) => arr[Math.floor(hash(episodeId * 50 + level * 3 + s) * arr.length)];
  return [
    { speaker: "Babatunde", text: fill(pick(STORY_BEATS.arrival, 1)) },
    { speaker: "Awo Oba", text: fill(pick(STORY_BEATS.discovery, 2)) },
    { speaker: enemy.name, text: fill(pick(STORY_BEATS.conflict, 3)) },
    { speaker: "Babatunde", text: fill(pick(STORY_BEATS.resolve, 4)) },
  ];
}

export const EPISODE_JOURNEY = EPISODES.map((e) => e.title);

const ENEMY_NAMES = [
  "Shadow Wraith", "Colonial Soldier", "Forgotten Spirit", "Corrupted Priest", "Lost Ancestor",
  "Dark Oracle", "Spirit Thief", "Cursed Warrior", "Nightmare Echo", "Erased Memory",
  "Colonial Enforcer", "Shrine Corruptor", "Spirit Wolf", "Bone Collector", "Void Walker",
  "Forgotten Guardian", "Ancient Curse", "Twisted Orisa", "Shadow Twin", "Memory Eater",
];

export function enemyArchetype(name, isBoss) {
  const n = (name || "").toLowerCase();
  if (isBoss) return { skin: "#4a2e1a", garb: "#c0484a", garb2: "#3a1010", aura: "#c0484a", weapon: "sword", spectral: false };
  if (/(wraith|spirit|ghost|echo|memory|void)/.test(n)) return { skin: "#7a8a9a", garb: "#2a3a4a", garb2: "#0a1018", aura: "#5ed1da", weapon: "none", spectral: true };
  if (/(soldier|enforcer|colonial)/.test(n)) return { skin: "#6b4423", garb: "#8a2a2a", garb2: "#2a0a0a", aura: "#c0484a", weapon: "sword", spectral: false };
  if (/(priest|oracle|shrine|corrupt)/.test(n)) return { skin: "#5a3a22", garb: "#7a5a2a", garb2: "#2a1a08", aura: "#e6c84c", weapon: "staff", spectral: false };
  if (/(warrior|guardian|thief|collector|hunter|wolf|curse|twisted)/.test(n)) return { skin: "#6b4423", garb: "#5a4a3a", garb2: "#1a1008", aura: "#d97757", weapon: "sword", spectral: false };
  return { skin: "#6b4423", garb: "#3a2a1a", garb2: "#0a0806", aura: "#c5a059", weapon: "fist", spectral: false };
}

export function getLevelEnemy(episodeId, level) {
  const ep = EPISODES.find((e) => e.id === episodeId) || EPISODES[0];
  const diff = difficultyForEpisode(episodeId);
  const diffMul = diff.key === "beginner" ? 0.8 : diff.key === "easy" ? 1 : diff.key === "mid" ? 1.25 : 1.6;
  const isBoss = level === 20;
  const baseHp = (60 + episodeId * 18 + level * 8) * diffMul;
  const baseAtk = (8 + episodeId * 2 + level * 1.2) * diffMul;
  const name = isBoss ? ep.boss : ENEMY_NAMES[(level + episodeId) % ENEMY_NAMES.length];
  return {
    name,
    hp: Math.round(isBoss ? baseHp * 1.8 : baseHp),
    atk: Math.round(isBoss ? baseAtk * 1.5 : baseAtk),
    isBoss,
    episodeId,
    level,
  };
}

export function xpForLevel(level) {
  return 100 + (level - 1) * 60;
}

export function rankTitle(level) {
  if (level >= 180) return "Ancestral God";
  if (level >= 120) return "Orisa Champion";
  if (level >= 60) return "Warrior Elite";
  if (level >= 25) return "Spirit Adept";
  return "Seeker";
}

export const RANK_REWARDS = {
  "Ancestral God": 1000,
  "Orisa Champion": 500,
  "Warrior Elite": 250,
  "Spirit Adept": 100,
  Seeker: 0,
};

export const SHOP_ITEMS = [
  { id: "sp500", label: "Spirit Points x500", price: 500, sp: 500 },
  { id: "sp1500", label: "Spirit Points x1,500", price: 1000, sp: 1500 },
  { id: "sp4000", label: "Spirit Points x4,000", price: 2500, sp: 4000 },
  { id: "sp10000", label: "Spirit Points x10,000", price: 5000, sp: 10000 },
  { id: "booster", label: "Booster Pack (2x XP for 5 battles)", price: 1000, sp: 0, booster: true },
  { id: "premium", label: "Premium Subscription (Unlock All + Ad-Free)", price: 10000, sp: 0, premium: true },
];

export const DAILY_REWARD = 50;

export const CHARACTER_IMAGES = {
  1: "", 2: "", 3: "", 4: "", 5: "", 6: "", 7: "", 8: "", 9: "",
  10: "", 11: "", 12: "", 13: "", 14: "", 15: "", 16: "", 17: "",
};

export const ENEMY_IMAGES = {};

// === THE BACK DOOR — zero-credit sprite-sheet assets ===
// Both images below are already-hosted public files on media.base44.com.
// We crop individual cells out of them with pure CSS background-position
// (see SpriteCell.jsx). No AI generation, no uploads, no integration
// credits, and no hit/limit problems — the file just loads from its URL.
export const CHARACTER_SHEET_IMAGE =
  "https://media.base44.com/images/public/6a7364eea84550708f16a360/1b567f61d_file_00000000499c820a8c0c2f8b1e23551c.png";
export const LEVEL_MAP_IMAGE =
  "https://media.base44.com/images/public/6a7364eea84550708f16a360/5999e658a_file_00000000ab08820ab76fe0373d251a70.png";

// Character portraits 1-15 live in a 5-column × 3-row grid on the sheet.
// (16-17 are standalone bottom panels with no reliable grid coords, so
//  they fall back to the RealFighter render.)
export const CHARACTER_SPRITE = {
  1:  { col: 0, row: 0 }, 2:  { col: 1, row: 0 }, 3:  { col: 2, row: 0 },
  4:  { col: 3, row: 0 }, 5:  { col: 4, row: 0 }, 6:  { col: 0, row: 1 },
  7:  { col: 1, row: 1 }, 8:  { col: 2, row: 1 }, 9:  { col: 3, row: 1 },
  10: { col: 4, row: 1 }, 11: { col: 0, row: 2 }, 12: { col: 1, row: 2 },
  13: { col: 2, row: 2 }, 14: { col: 3, row: 2 }, 15: { col: 4, row: 2 },
};

// 100 named locations taken directly from the uploaded level-map sheet.
export const LEVEL_TITLES = [
  "Prologue: The Calling", "Ancestral Dreams", "The Nightmare Begins", "Childhood Village", "Elder's Warning",
  "The Stolen Relic", "The Pursuit", "Crossroads", "Whispers in the Dark", "First Trial",
  "Orisa Temple", "Meeting Orisa", "The Chosen One", "Training Begins", "Spirit Guide",
  "Village Under Attack", "The Escape", "Into the Wilderness", "The Hidden Path", "Ancient Ruins",
  "Lost Companion", "The Oath", "River of Memories", "The Watchers", "Storm Approaching",
  "Sheltered Cave", "Spirit Animals", "The Vision", "Enemy Camp", "Midnight Raid",
  "Captured", "Dark Prison", "Unlikely Ally", "Secret Tunnel", "The Breakout",
  "Deserted Lands", "Mirage", "Desert Storm", "Oasis of Hope", "Bandits",
  "Caravan Journey", "Betrayal", "Left for Dead", "Survival", "Mystic Encounter",
  "Mountain Path", "Cliffside Battle", "Sacred Cave", "Ancestor's Message", "Return to Village",
  "Village in Ruins", "Funeral Rites", "Promise of Revenge", "Allies Gather", "War Council",
  "Forging Weapons", "Spiritual Preparation", "March to War", "Battlefield Dawn", "Clash of Armies",
  "Orisa Power", "Turning the Tide", "Enemy General", "Showdown", "Victory... or Not?",
  "The Price of War", "Fallen Hero", "Spirit Funeral", "New Threat", "The Prophecy",
  "Journey Beyond", "Forbidden Forest", "Cursed Land", "The Witch", "Dark Magic",
  "Brainwashed Warriors", "The Resistance", "Spies in the Shadows", "Poisoned Waters", "The Cure",
  "The Gatekeeper", "Trial of Wisdom", "Trial of Strength", "Trial of Spirit", "The Final Gate",
  "The Real Enemy", "The Dark Throne", "Final Preparation", "Gates of Destiny", "Epic Battle",
  "Light Returns", "Freedom", "Healing the Land", "Rebuilding", "New Generation",
  "Orisa Blessing", "Peaceful Days", "Legends Live On", "The Chronicles", "Epilogue",
];

// globalLevel is 1-240 (episode × 20). Thumbnails/titles cycle through the
// 100-cell sheet, so every level gets a real image + name with zero credits.
export function getLevelThumb(globalLevel) {
  const idx = ((globalLevel - 1) % 100 + 100) % 100;
  return { col: idx % 10, row: Math.floor(idx / 10) };
}
export function getLevelTitle(globalLevel) {
  const idx = ((globalLevel - 1) % 100 + 100) % 100;
  return LEVEL_TITLES[idx];
}