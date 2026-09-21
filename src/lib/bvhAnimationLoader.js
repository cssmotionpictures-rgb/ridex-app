// === BVH Motion-Capture Pipeline (The Forgotten Ones) ===
// Drop a Mixamo-compatible BVH URL (mixamorig:* bone names) into BVH_SOURCES[state]
// and the animator will bind it onto the fighter's skeleton with NO JS-side
// retargeting — the Mixamo BVH bone names match the GLB skeleton directly.
// URLs empty = NOT INSTALLED. No fake combat motion is ever generated.

export const BVH_SOURCES = {
  idle: "",
  walk: "",
  run: "",
  lightPunch: "",
  heavyPunch: "",
  lightKick: "",
  heavyKick: "",
  special: "",
  block: "",
  dodge: "",
  grab: "",
  throw: "",
  hit: "",
  stagger: "",
  knockdown: "",
  getUp: "",
  finisher: "",
  death: "",
  victory: "",
};

// Parse a single BVH file into a THREE.AnimationClip.
export async function loadBVHClip(url) {
  const { BVHLoader } = await import("three/addons/loaders/BVHLoader.js");
  const res = await fetch(url);
  const text = await res.text();
  const parsed = new BVHLoader().parse(text);
  return parsed.clip.clone();
}

// Load all configured BVH sources and install each as a real clip on the animator,
// keyed by canonical state. Returns the list of states successfully installed.
export async function loadAllBVH(animator, sources = BVH_SOURCES) {
  const installed = [];
  for (const [state, url] of Object.entries(sources)) {
    if (!url) continue;
    try {
      const clip = await loadBVHClip(url);
      clip.name = state;
      animator.installClip(state, clip);
      installed.push(state);
    } catch (e) {
      console.warn("BVH load failed", state, e);
    }
  }
  return installed;
}