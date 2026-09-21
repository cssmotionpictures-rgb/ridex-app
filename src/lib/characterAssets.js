// === THE FORGOTTEN ONES — Persistent Character Asset System ===
// Fetches the uploaded 17-character reference pack (ZIP on media.base44.com),
// extracts each PNG in-browser with the native DecompressionStream (no library,
// zero integration credits), and exposes a stable per-character asset record.
//
// Architecture (per the asset pipeline):
//   CHARACTER_ID  ->  REFERENCE_IMAGE  ->  ANIMATION/COMBAT CONTROLLER  ->  IN-GAME VISUAL
//
// Each character maps to ONE persistent reference image. Every level/encounter
// that features a character references the same asset id, so the identity
// (face, skin, hair, wardrobe) never drifts. The in-game visual model that
// reads from this reference can be swapped for a rigged 3D / animated sprite
// later WITHOUT touching combat logic, controls, stats or progression.

const ZIP_URL =
  "https://media.base44.com/files/public/6a7364eea84550708f16a360/e76e077cc_THE_FORGOTTEN_ONES_17_CHARACTER_REFERENCE_PACK-1.zip";

// Stable identity map — id => display name (matches the 17 reference files).
export const CHARACTER_REFERENCE_NAMES = {
  1: "Babatunde Adesanya",
  2: "Ifedayo Adesanya",
  3: "Mama Agbala",
  4: "Awo Oba",
  5: "Iya Olokun",
  6: "Major Chidi",
  7: "Lisabi",
  8: "Ibeji",
  9: "Orisa Oko",
  10: "Agira",
  11: "Agemo",
  12: "Onimere",
  13: "Elegba",
  14: "Kudeti",
  15: "Osumare",
  16: "John Obi Mikel",
  17: "Roman Abramovich",
};

let _cache = null;
let _loading = null;

// Extract every PNG from the ZIP into a persistent blob URL.
export async function loadCharacterReferences() {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = (async () => {
    const res = await fetch(ZIP_URL);
    if (!res.ok) throw new Error("character pack fetch failed: " + res.status);
    const ab = await res.arrayBuffer();
    const buf = new Uint8Array(ab);
    const dv = new DataView(ab);

    // find End of Central Directory record
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("ZIP EOCD not found");
    const cdCount = dv.getUint16(eocd + 10, true);
    const cdOff = dv.getUint32(eocd + 16, true);

    const entries = [];
    let p = cdOff;
    for (let i = 0; i < cdCount; i++) {
      const compMethod = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const uncompSize = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commLen = dv.getUint16(p + 32, true);
      const lfhOff = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.slice(p + 46, p + 46 + nameLen));
      const lhNameLen = dv.getUint16(lfhOff + 26, true);
      const lhExtraLen = dv.getUint16(lfhOff + 28, true);
      const dataOff = lfhOff + 30 + lhNameLen + lhExtraLen;
      entries.push({ name, compMethod, compSize, uncompSize, dataOff });
      p += 46 + nameLen + extraLen + commLen;
    }

    const out = [];
    for (const e of entries) {
      if (!e.name.toLowerCase().endsWith(".png") || e.name.includes("__MACOSX")) continue;
      let bytes;
      if (e.compMethod === 0) {
        bytes = buf.slice(e.dataOff, e.dataOff + e.uncompSize);
      } else if (e.compMethod === 8) {
        const cs = new DecompressionStream("deflate-raw");
        const stream = new Blob([buf.slice(e.dataOff, e.dataOff + e.compSize)]).stream().pipeThrough(cs);
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } else continue;
      const num = parseInt(e.name, 10);
      if (!num) continue;
      const blob = new Blob([bytes], { type: "image/png" });
      out.push({
        id: num,
        name: CHARACTER_REFERENCE_NAMES[num] || e.name.replace(/\.png$/i, "").replace(/_/g, " "),
        file: e.name.split("/").pop(),
        url: URL.createObjectURL(blob),
      });
    }
    out.sort((a, b) => a.id - b.id);
    _cache = out;
    _loading = null;
    return out;
  })();
  return _loading;
}

// One-shot image loader (used by the real-time arena for the in-game fighter sprite).
export function getCharacterReference(id) {
  return _cache?.find((r) => r.id === id) || null;
}