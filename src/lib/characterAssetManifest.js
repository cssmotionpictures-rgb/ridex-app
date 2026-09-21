// === THE FORGOTTEN ONES — Character Asset Manifest (DB-backed) ===
// Implements the Asset Loading Contract (spec Section 31).
//
// Playable fighter assets are stored in the GameCharacterAsset entity, uploaded
// via the Admin Game Assets screen. A character may spawn as a fighter ONLY
// when a full-body playable asset exists:
//   STEP 1: Find the character's asset record (by role for the vertical slice).
//   STEP 2: Check for a rigged 3D model (GLB/GLTF).   → LOAD 3D MODEL
//   STEP 3: Check for a full-body transparent PNG.    → LOAD 2.5D SPRITE
//   STEP 4: Neither exists.                           → ASSET_INCOMPLETE
//           DO NOT create a generic human, stick figure, mannequin, or portrait fighter.
//
// The official 17-character master sheet provides HEAD-AND-SHOULDERS PORTRAITS
// only. Per spec Section 5, a portrait is NOT a playable character. Portraits
// serve as identity references only and never spawn into the arena.

import { base44 } from "@/api/base44Client";

export const ASSET_STATUS = {
  READY: "READY",
  INCOMPLETE: "INCOMPLETE",
  ERROR: "ERROR",
};

// Official character roster (spec Section 8) — identities are fixed.
export const CHARACTERS_DB = [
  { id: 1, name: "Babatunde Adesanya", role: "Protagonist / Family Patriarch" },
  { id: 2, name: "Ifedayo Adesanya", role: "Son / Tech Entrepreneur" },
  { id: 3, name: "Mama Agbala", role: "Matriarch / Wisdom Keeper" },
  { id: 4, name: "Awo Oba", role: "Babalawo / Ifá Priest" },
  { id: 5, name: "Iya Olokun", role: "Orisa of the Ocean" },
  { id: 6, name: "Major Chidi", role: "Antagonist / Colonial Force" },
  { id: 7, name: "Lisabi", role: "Orisa of Warriors" },
  { id: 8, name: "Ibeji", role: "Orisa of Twins" },
  { id: 9, name: "Orisa Oko", role: "Orisa of Agriculture" },
  { id: 10, name: "Agira", role: "Orisa of Hunters" },
  { id: 11, name: "Agemo", role: "Orisa of Transformation" },
  { id: 12, name: "Onimere", role: "Orisa of Rivers" },
  { id: 13, name: "Elegba", role: "Orisa of Crossroads" },
  { id: 14, name: "Kudeti", role: "Orisa of Marketplace" },
  { id: 15, name: "Osumare", role: "Orisa of Rainbows" },
  { id: 16, name: "John Obi Mikel", role: "Real-Life Figure (Flashback)" },
  { id: 17, name: "Roman Abramovich", role: "Real-Life Figure (Flashback)" },
];

// The two mandatory vertical-slice slots (spec: prototype is Babatunde vs Corrupted Priest).
export const VERTICAL_SLICE_SLOTS = [
  { role: "player", name: "Babatunde Adesanya", character_id: 1, is_official_sheet_character: true },
  { role: "enemy", name: "Corrupted Priest", character_id: 0, is_official_sheet_character: false },
];

// Resolve the playable-asset status from a single GameCharacterAsset record.
export function assetRecordStatus(record) {
  if (!record) {
    return {
      canSpawn: false,
      hasPortrait: false,
      hasFullBody: false,
      has3D: false,
      hasSprite: false,
      reason: "No asset record exists for this slot yet.",
    };
  }
  const hasPortrait = !!(record.reference_portrait_url || (record.is_official_sheet_character && record.character_id));
  const has3D = !!record.model_3d_url;
  const hasSprite = !!record.full_body_png_url;
  const hasFullBody = has3D || hasSprite;
  return {
    canSpawn: hasFullBody,
    hasPortrait,
    hasFullBody,
    has3D,
    hasSprite,
    renderType: has3D ? "3d-model" : hasSprite ? "2d-sprite" : null,
    reason: hasFullBody
      ? null
      : "PLAYABLE CHARACTER ASSET MISSING — UPLOAD FULL-BODY 3D MODEL OR FULL-BODY TRANSPARENT SPRITE.",
  };
}

// Fetch all GameCharacterAsset records (cached for the session).
let _cache = null;
let _fetching = null;
export async function fetchAssetRecords(force = false) {
  if (_cache && !force) return _cache;
  if (_fetching) return _fetching;
  _fetching = (async () => {
    try {
      const records = await base44.entities.GameCharacterAsset.list("sort_order", 100);
      _cache = records;
      return records;
    } finally {
      _fetching = null;
    }
  })();
  return _fetching;
}
export function clearAssetCache() { _cache = null; }

// Ensure the two vertical-slice slot records exist (seed if missing).
export async function ensureVerticalSliceSlots() {
  const records = await fetchAssetRecords(true);
  const created = [];
  for (const slot of VERTICAL_SLICE_SLOTS) {
    const existing = records.find((r) => r.role === slot.role);
    if (!existing) {
      const rec = await base44.entities.GameCharacterAsset.create({
        name: slot.name,
        character_id: slot.character_id,
        role: slot.role,
        is_official_sheet_character: slot.is_official_sheet_character,
        reference_portrait_url: "",
        full_body_png_url: "",
        model_3d_url: "",
        asset_type: "none",
        status: "missing",
        sort_order: slot.role === "player" ? 1 : 2,
      });
      created.push(rec);
    }
  }
  if (created.length) await fetchAssetRecords(true);
  return await fetchAssetRecords();
}

// The Asset Loading Contract (spec Section 31) — async, DB-backed.
// Checks that BOTH vertical-slice slots (player + enemy) have a full-body
// playable asset. Returns canStart=false if either is missing.
export async function checkVerticalSliceAssets() {
  let records;
  try {
    records = await fetchAssetRecords();
  } catch (e) {
    return {
      canStart: false,
      player: null,
      enemy: null,
      missingAssets: VERTICAL_SLICE_SLOTS.map((s) => ({
        name: s.name,
        role: s.role,
        reason: "Unable to load asset records.",
        canSpawn: false,
        hasPortrait: false,
        hasFullBody: false,
        has3D: false,
        hasSprite: false,
      })),
    };
  }
  const playerRec = records.find((r) => r.role === "player");
  const enemyRec = records.find((r) => r.role === "enemy");
  const ps = assetRecordStatus(playerRec);
  const es = assetRecordStatus(enemyRec);
  const player = playerRec ? { ...playerRec, ...ps } : { ...VERTICAL_SLICE_SLOTS[0], ...ps };
  const enemy = enemyRec ? { ...enemyRec, ...es } : { ...VERTICAL_SLICE_SLOTS[1], ...es };
  return {
    canStart: ps.canSpawn && es.canSpawn,
    player,
    enemy,
    missingAssets: [
      !ps.canSpawn && { name: player.name, role: "player", ...ps },
      !es.canSpawn && { name: enemy.name, role: "enemy", ...es },
    ].filter(Boolean),
  };
}