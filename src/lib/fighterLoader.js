import * as THREE from "three";

// === Reusable Fighter Loader (The Forgotten Ones) ===
// Loads a rigged GLB, validates the real mesh/skin/animation, PRESERVES the
// original PBR materials (no wireframe/skeleton/flat-color substitution), and
// returns a ready-to-use fighter object. Works for every fighter — Babatunde,
// Corrupted Priest, Kael, Draven, Ragnar — without duplicating the Three.js pipeline.
export async function loadFighterCharacter(url) {
  // Branch on extension: FBX files use FBXLoader (returns a Group with .animations),
  // GLB/GLTF use GLTFLoader (returns { scene, animations }). Normalize to a gltf-like
  // object so the rest of the pipeline (spike reweight, mixer, diagnostics) is unchanged.
  const gltf = await (async () => {
    if (/\.fbx$/i.test(url)) {
      const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
      const loader = new FBXLoader();
      const fbx = await new Promise((resolve, reject) =>
        loader.load(url, resolve, undefined, reject)
      );
      return { scene: fbx, animations: fbx.animations || [] };
    }
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();
    return await new Promise((resolve, reject) =>
      loader.load(url, resolve, undefined, reject)
    );
  })();

  const model = gltf.scene;
  const skinnedMeshes = [];
  const bones = [];
  const materials = [];
  const textureSet = new Set();
  let meshCount = 0;
  let skinWeights = "FAIL";

  model.traverse((o) => {
    if (o.isMesh) {
      o.visible = true; // never hide the real mesh
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false; // skinned meshes must not be culled
      meshCount++;
      if (o.isSkinnedMesh) {
        skinnedMeshes.push(o);
        if (o.skeleton) {
          for (const b of o.skeleton.bones) if (!bones.includes(b)) bones.push(b);
        }
        if (o.geometry?.attributes?.skinIndex && o.geometry?.attributes?.skinWeight) {
          skinWeights = "PASS";
        }
      }
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          m.wireframe = false; // never wireframe the real character
          materials.push(m);
          for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "bumpMap", "aoMap", "alphaMap"]) {
            if (m[k]?.uuid) textureSet.add(m[k].uuid);
          }
        }
      }
    }
    if (o.isBone && !bones.includes(o)) bones.push(o);
  });

  // === SPIKE REWEIGHT — strongest back-door repair ===
  // Some auto-rig pipelines bake a MISMATCHED inverse-bind matrix for a head/crown
  // bone: the bind geometry is clean (face parts at y~1.8) but at render the stray
  // inverse-bind yanks the skinned head vertices into a tall vertical "spike" that
  // hides the face. Bone clamping and geometry clamping can't fix this because the
  // fault is in the skin weights × inverse-bind product. Here, for every skinned
  // vertex we compute its TRUE rest skinned position (Σ w·(boneMatrix·inverseBind)·v);
  // any vertex that lands far above the model is reweighted to 100% the ROOT bone,
  // whose boneMatrix·inverseBind ≈ identity — so the stray vertex snaps back to its
  // correct bind-pose position on the head. The real face (eyes/iris/pupils/lips/
  // brows are static meshes) stays untouched. Works in-browser on ANY GLB; no file
  // edit needed.
  let spikeReweighted = 0;
  {
    model.updateMatrixWorld(true);
    const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _t = new THREE.Vector3();
    const _m = new THREE.Matrix4();
    for (const sm of skinnedMeshes) {
      if (!sm.skeleton) continue;
      sm.skeleton.update();                 // boneMatrices <- rest world matrices
      const geom = sm.geometry;
      const pos = geom.attributes.position;
      const si = geom.attributes.skinIndex;
      const sw = geom.attributes.skinWeight;
      if (!si || !sw) continue;
      const siArr = si.array, swArr = sw.array;
      const bMat = sm.skeleton.boneMatrices;     // Float32 (16 × boneCount)
      const bInv = sm.skeleton.boneInverses;       // Array<Matrix4>
      const rootIdx = 0;
      // reference: top of the bind geometry (head sits just above this)
      let maxBindY = 0;
      for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i); if (_v.y > maxBindY) maxBindY = _v.y; }
      const limit = maxBindY + 1.0; // anything rendered above head+1m is a spike
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i);          // bind local position
        _s.set(0, 0, 0);
        for (let j = 0; j < 4; j++) {
          const w = swArr[i * 4 + j];
          if (w === 0) continue;
          const bi = siArr[i * 4 + j];
          // skeleton.boneMatrices already = bone.matrixWorld * boneInverse (the
          // exact matrix the GPU shader uses), so use it directly — do NOT
          // multiply by bInv again (that double-applies the inverse bind).
          _m.fromArray(bMat, bi * 16);
          _t.copy(_v).applyMatrix4(_m).multiplyScalar(w);
          _s.add(_t);
        }
        // _s = true rest skinned position. If it spiked above the head, reweight.
        if (_s.y > limit) {
          siArr[i * 4] = rootIdx; siArr[i * 4 + 1] = 0; siArr[i * 4 + 2] = 0; siArr[i * 4 + 3] = 0;
          swArr[i * 4] = 1; swArr[i * 4 + 1] = 0; swArr[i * 4 + 2] = 0; swArr[i * 4 + 3] = 0;
          spikeReweighted++;
        }
      }
      si.needsUpdate = true;
      sw.needsUpdate = true;
    }
  }
  if (spikeReweighted > 0) console.log("[SPIKE] reweighted", spikeReweighted, "stray skinned vertices to root bone");

  const skeleton = skinnedMeshes[0]?.skeleton || null;
  const mixer = new THREE.AnimationMixer(model);
  const animations = (gltf.animations || []).slice();
  const clips = {};
  animations.forEach((c) => { clips[c.name.toLowerCase()] = c; });
  const boundingBox = new THREE.Box3().setFromObject(model);

  return {
    model,
    skinnedMeshes,
    skeleton,
    bones,
    materials,
    animations,
    clips,
    mixer,
    gltf,
    boundingBox,
    diagnostics: {
      meshCount,
      skinnedMeshCount: skinnedMeshes.length,
      materialCount: materials.length,
      boneCount: bones.length,
      animationCount: animations.length,
      animationNames: animations.map((a) => a.name),
      skinWeights,
      textures: textureSet.size > 0 ? "OK" : "NONE",
      rigged: skinnedMeshes.length > 0 && bones.length > 0,
    },
  };
}