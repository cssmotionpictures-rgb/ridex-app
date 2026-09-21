// === In-browser ZIP → Three.js scene loader (credit-free, client-side) ===
//
// Loads a modular-environment ZIP directly from a public URL: parses the ZIP
// archive in the browser using the native DecompressionStream('deflate-raw'),
// exposes each entry as a Blob URL, then hands the main .glb/.gltf to GLTFLoader
// with a LoadingManager URL modifier so external .bin / texture URIs resolve
// back into the same archive. No backend function, no UploadFile, no credits.
//
// Used by the 3D fighting arena to swap the PS5 environment per level from
// uploaded modular-environment packs.

const cache = new Map(); // zipUrl -> { entries }

// Parse a ZIP file into a list of { path, blobUrl, size, method } entries.
export async function parseZip(zipUrl) {
  if (cache.has(zipUrl)) return cache.get(zipUrl);

  const res = await fetch(zipUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`zip fetch failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  const buf = new Uint8Array(ab);
  const dv = new DataView(ab);

  // Find the End Of Central Directory record (scan backwards from the end).
  let eocd = -1;
  const minEocd = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("EOCD not found — not a valid ZIP archive");

  const entryCount = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break; // central file header sig
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    // Skip directories and macOS / metadata junk.
    if (name.endsWith("/") || /(^|\/)(__MACOSX|\.)/.test(name)) continue;

    // Read the local header to find the real data offset (extra field may differ).
    const lhNameLen = dv.getUint16(localOffset + 26, true);
    const lhExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);

    let bytes;
    if (method === 0) {
      bytes = compressed;
    } else if (method === 8) {
      // Deflate (raw — ZIP stores raw deflate streams).
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Blob([compressed]).stream().pipeThrough(ds);
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      // Unsupported method — skip this entry rather than fail the whole archive.
      continue;
    }

    if (bytes.length !== uncompSize && uncompSize !== 0) {
      // Streaming/mis-sized entry; trust the decompressed length we got.
    }

    const blob = new Blob([bytes]);
    const blobUrl = URL.createObjectURL(blob);
    entries.push({ path: name, blobUrl, size: bytes.length, method });
  }

  const result = { entries };
  cache.set(zipUrl, result);
  return result;
}

// Load a scene from a ZIP and return { scene, gltf, entries, main }.
// Picks the largest .glb (preferred — single file) or .gltf as the scene root.
export async function loadZipScene(zipUrl, THREE) {
  const { entries } = await parseZip(zipUrl);
  if (!entries.length) throw new Error("ZIP contains no files");

  // Map every entry by full path AND basename so resource URIs resolve regardless
  // of whether GLTFLoader passes a relative path or a blob-base-qualified URL.
  const map = {};
  for (const e of entries) {
    map[e.path] = e.blobUrl;
    map[e.path.split("/").pop()] = e.blobUrl;
  }

  const byExt = (ext) => entries.filter((e) => new RegExp("\\." + ext + "$", "i").test(e.path)).sort((a, b) => b.size - a.size);
  const glbs = byExt("glb");
  const gltfs = byExt("gltf");
  const fbxs = byExt("fbx");
  const main = glbs[0] || gltfs[0] || fbxs[0];
  if (!main) throw new Error("No .glb, .gltf or .fbx found inside the ZIP");
  const isFbx = /\.fbx$/i.test(main.path);

  const Loader = isFbx
    ? (await import("three/addons/loaders/FBXLoader.js")).FBXLoader
    : (await import("three/addons/loaders/GLTFLoader.js")).GLTFLoader;

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    // url is either the main blob URL, a resource URI, or a blob-base-qualified
    // resource URL (path + uri). Strip any blob: prefix down to the path portion.
    let key;
    if (/^blob:/i.test(url)) {
      // "blob:<origin>/<uuid>" (main file) or "blob:<origin>/<relative/path>" (resource)
      const after = url.replace(/^blob:[^/]*\/\/[^/]*\//, "");
      key = after;
    } else {
      key = url;
    }
    // Try the raw key, then URL-decoded, then the basename.
    if (map[key]) return map[key];
    const dec = (() => { try { return decodeURIComponent(key); } catch { return key; } })();
    if (map[dec]) return map[dec];
    const base = key.split("/").pop();
    const baseDec = (() => { try { return decodeURIComponent(base); } catch { return base; } })();
    if (map[base]) return map[base];
    if (map[baseDec]) return map[baseDec];
    return url; // main file (already a valid blob URL) or truly unknown resource
  });

  const loader = new Loader(manager);
  return await new Promise((resolve, reject) => {
    loader.load(
      main.blobUrl,
      (loaded) => {
        // GLTF returns { scene }; FBX returns a Group directly.
        const scene = isFbx ? loaded : loaded.scene;
        resolve({ scene, main: main.path, entries: entries.map((e) => e.path) });
      },
      undefined,
      (err) => reject(err)
    );
  });
}

// Diagnostic helper: list the scene files inside a ZIP without loading them.
export async function listZipContents(zipUrl) {
  const { entries } = await parseZip(zipUrl);
  return entries.map((e) => ({ path: e.path, size: e.size }));
}