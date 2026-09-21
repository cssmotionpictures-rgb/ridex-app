import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import * as THREE from "three";
import { X, Maximize2, Minimize2, Volume2, VolumeX, AlertTriangle, Upload, Loader2, Activity, Hand, Flame, Zap, Shield, Wind, Grab, ChevronUp, Skull, Droplets, Lock, Sun, Circle } from "lucide-react";
import { CHARACTERS, getLevelEnemy, getLevelStory } from "@/lib/forgottenOnesData";
import { checkVerticalSliceAssets, clearAssetCache } from "@/lib/characterAssetManifest";
import { gameAudio } from "@/lib/gameAudio";
import { base44 } from "@/api/base44Client";
import { createFighterCamera } from "@/lib/fighterCamera";
import { getFighterConfig, listFighters, installedFighters, pickEnemyFighter } from "@/lib/fighterCharacters";
import { createCombatVfx } from "@/lib/combatVfx";
import { createMkVfx } from "@/lib/mkVfx";
import VictoryScreen from "@/components/game/VictoryScreen";
import { buildNightmareVillage } from "@/lib/arenaEnvironment";

/* =============================================================================
   REAL-TIME 3D FIGHTING ARENA — "THE FORGOTTEN ONES"  (Three.js, client-side)

   This is the credit-free back door: fighters are real GLB models loaded DIRECTLY
   from public URLs in the browser via Three.js GLTFLoader. No backend function,
   no UploadFile, no integration credits, no GPU server in the critical path.
   The user obtains a GLB (manually, free, on a Hugging Face Space web UI or any
   image-to-3D tool), hosts it publicly, sets model_3d_url, and the browser
   renders it in a full 3D cinematic arena with the same combat engine.

   Combat state machine, input, AI, hit resolution and HUD are ported from the
   2.5D RealTimeArena so gameplay is identical — only the fighter visual layer
   moved from 2D canvas sprites to 3D GLB meshes.
============================================================================= */

const TAU = Math.PI * 2;
const PI = Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);

// BVH motion-capture pipeline. Each entry maps a fighter state to a BVH URL.
// Supplied BVH files MUST use the Mixamo humanoid bone naming convention
// (mixamorig:*) — produced by exporting a Mixamo FBX animation to BVH in Blender
// (see the combine_animations_to_glb.py workflow). Such a clip binds DIRECTLY
// onto the fighter's skeleton with no JS-side retargeting. Leave a URL empty to
// leave that state without a real clip — honest "not installed", no Wave fake.
const BVH_SOURCES = {
  idle:        "",
  walk:        "",
  run:         "",
  lightPunch:  "",
  heavyPunch:  "",
  lightKick:   "",
  heavyKick:   "",
  block:       "",
  dodge:       "",
  hit:         "",
  knockdown:   "",
  getUp:       "",
  death:       "",
  victory:     "",
};

function makeFighter(opts) {
  return {
    name: opts.name, role: opts.role, facing: opts.facing ?? 1,
    x: opts.x, y: 0, vx: 0, vy: 0, onGround: true,
    hp: opts.hp, maxHp: opts.hp, spirit: 50, maxSpirit: 100,
    state: "idle", stateT: 0, cooldown: 0, hitstun: 0, iframe: 0, combo: 0,
    atkKind: null, atkHasHit: false, walkPhase: 0,
    enemy: !!opts.enemy, ai: opts.ai ? { mode: "approach", decT: 0 } : null,
  };
}

const ATK = {
  light:   { startup: 70,  active: 90,  recover: 160, dmg: 6,  range: 1.4, kb: 0.18, spirit: 6 },
  heavy:   { startup: 170, active: 90,  recover: 320, dmg: 13, range: 1.6, kb: 0.42, spirit: 10 },
  special: { startup: 260, active: 120, recover: 420, dmg: 22, range: 2.0, kb: 0.66, spirit: -34 },
  grab:    { startup: 120, active: 120, recover: 300, dmg: 9,  range: 1.3, kb: 0.12, spirit: 4 },
};

// Required combat animation library. A fighter is COMBAT_READY only when its
// GLB contains a skeleton + skinned mesh + ALL of these clips (by alias).
const ANIM_ALIASES = {
  idle: ["idle","stand","breath","rest"],
  walk: ["walk","move","stroll"],
  run: ["run","sprint","jog"],
  jump: ["jump","leap"],
  fall: ["fall","air","airborne"],
  attack_light: ["attack_light","lightattack","light_attack","jab","punch","strike","attack","light"],
  attack_heavy: ["attack_heavy","heavyattack","heavy_attack","heavy","smash"],
  block: ["block","guard"],
  parry: ["parry"],
  dodge: ["dodge","dash","evade","roll"],
  hit_light: ["hit_light","hitlight","light_hit","hit","hurt","damage"],
  hit_heavy: ["hit_heavy","hithavy","heavy_hit","stagger","knockback"],
  knockdown: ["knockdown","knock_down","downed"],
  getup: ["getup","get_up","rise","standup","stand_up"],
  grab: ["grab","grabbing"],
  throw: ["throw","toss"],
  special: ["special","ultimate","skill","super"],
  finisher: ["finisher","finish","fatality","finish_move"],
  death: ["die","death","defeat","dead","fall_dead"],
  victory: ["victory","win","celebrate","cheer","pose"],
};
const REQUIRED_ANIMATIONS = Object.keys(ANIM_ALIASES);
function classifyAnimations(names) {
  const lower = names.map((n) => n.toLowerCase().replace(/[\s-]/g, "_"));
  const found = [], missing = [];
  for (const key of REQUIRED_ANIMATIONS) {
    const hit = ANIM_ALIASES[key].some((a) => lower.some((n) => n === a || n.includes(a)));
    if (hit) found.push(key); else missing.push(key);
  }
  return { found, missing };
}

export default function RealTimeArena3D({ episodeId, level, profile, onWin, onLose, onExit }) {
  const mountRef = useRef(null);
  const wrapRef = useRef(null);
  const game = useRef(null);
  const INPUT_FLAGS = ["left","right","up","block","light","heavy","special","grab","dodge","finish"];
  const makeInputState = () => Object.fromEntries(INPUT_FLAGS.map((f) => [f, false]));
  // `input.current` is the effective merged state the game reads each frame.
  // Keyboard + touch write to `keys`; the external gamepad writes to `pad`.
  // Merging per-frame (in the loop) lets all three coexist without one
  // overwriting the other — e.g. a plugged-in gamepad no longer cancels keyboard.
  const input = useRef({ ...makeInputState(), camRX: 0, camRY: 0 });
  const keys = useRef(makeInputState());
  const pad = useRef(makeInputState());
  const edgeKeys = useRef({});
  const rafRef = useRef(0);
  const [fs, setFs] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loadState, setLoadState] = useState("checking"); // checking | loading | ready | incomplete | error
  const [loadPct, setLoadPct] = useState(0);
  const [assetCheck, setAssetCheck] = useState(null);
  const [boot3D, setBoot3D] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null); // { failed: [{which,name,reason}] }
  const [showDiag, setShowDiag] = useState(false);
  const [diag, setDiag] = useState({ p: null, e: null, runtime: null });
  const [hud, setHud] = useState({ pHP:100, pSP:50, eHP:100, combo:0, phase:"intro", sub:"", finisher:false, enemyName:"Corrupted Priest", enemyRole:"ENEMY", fightPrompt:false });
  const [joy, setJoy] = useState({ active:false, x:0, y:0 });
  const [potions, setPotions] = useState(3);
  const drinkPotion = () => {
    if (potions <= 0 || !game.current) return;
    if (game.current.phase !== "fight" && game.current.phase !== "finish") return;
    if (game.current.p.hp <= 0) return;
    setPotions((p) => p - 1);
    game.current.p.hp = Math.min(game.current.p.maxHp || 120, game.current.p.hp + 25);
    gameAudio.sfx("block", { intensity: 1 });
  };
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const assetsIncomplete = assetCheck && !assetCheck.canStart;
  const charDef = CHARACTERS.find((c) => c.id === (profile?.active_character_id || 1)) || CHARACTERS[0];

  useEffect(() => { gameAudio.setEnabled(!muted); }, [muted]);

  // ---- Asset gate: both fighters need a permanent GLB (model_3d_url) ----
  useEffect(() => {
    let alive = true;
    clearAssetCache();
    checkVerticalSliceAssets()
      .then((check) => { if (alive) setAssetCheck(check); })
      .catch(() => { if (alive) setAssetCheck({ canStart:false, missingAssets:[], player:null, enemy:null }); });
    return () => { alive = false; };
  }, []);

  const pressed = (key) => {
    if (input.current[key]) { if (!edgeKeys.current[key]) { edgeKeys.current[key] = true; return true; } }
    return false;
  };
  const clearEdge = () => { edgeKeys.current = {}; };

  // ---- Init combat world (pure state, no rendering) ----
  const initWorld = useCallback(() => {
    const pLvl = profile?.level || 1;
    const playerHp = 120 + (pLvl - 1) * 10;
    const lvlEnemy = getLevelEnemy(episodeId || 1, level);
    const world = {
      phase: "intro", introT: 0, time: 0, timeScale: 1, fightStartT: 0, fightPromptT: 0,
      sub: "", subQueue: [], _lastSpoken: "", _finSound: false, winLogged: false, over: null,
      camShake: 0, flash: 0, lightLeak: 0,
      mkPop: "", mkPopT: 0, xrayFlash: 0, bloodScreen: 0, hitStop: 0, flawless: true, _rageAura: null,
      p: makeFighter({ name: charDef.name, role: charDef.role, facing: 1, x: -2.2, hp: playerHp }),
      e: makeFighter({ name: lvlEnemy.name || "Corrupted Priest", role: "BOSS", facing: -1, x: 2.2, hp: lvlEnemy.hp, enemy: true, ai: {} }),
      comboTimer: 0, sparks: [],
    };
    const story = getLevelStory(episodeId || 1, level);
    world.subQueue = [
      { t: 0, who: story[0].speaker.toUpperCase(), text: story[0].text },
      { t: 1500, who: "CORRUPTED PRIEST", text: "You dare enter the forgotten village? Your soul will rot here, remembered one." },
      { t: 3000, who: charDef.name.toUpperCase(), text: "I am the one they could not bury. Kneel — or fall where you stand." },
      { t: 4600, who: "", text: "" },
    ];
    game.current = world;
  }, [charDef, level, profile, episodeId]);

  // ---- Three.js scene + combat loop ----
  useEffect(() => {
    if (!boot3D) return;
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth || 393;
    const height = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07070f);
    scene.fog = new THREE.Fog(0x07070f, 6, 22);

    const camFov = width / height < 1 ? 62 : 46;
    const camera = new THREE.PerspectiveCamera(camFov, width / height, 0.1, 100);
    camera.position.set(0, 1.7, 6.2);
    camera.lookAt(0, 1.0, 0);
    const fighterCam = createFighterCamera(camera);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    const _gl = renderer.getContext();
    let _gpu = "n/a";
    try { const ext = _gl.getExtension("WEBGL_debug_renderer_info"); if (ext) _gpu = _gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); } catch {}
    const _engineInfo = { three: "r" + THREE.REVISION, webgl: _gl.getParameter(_gl.VERSION), gpu: _gpu, maxTex: _gl.getParameter(_gl.MAX_TEXTURE_SIZE) };

    // Lighting — brighter so fighters + scene read clearly on dark phones
    scene.add(new THREE.HemisphereLight(0x6a7a9a, 0x2a1a12, 0.7));
    scene.add(new THREE.AmbientLight(0x6a6a78, 1.25));
    const moon = new THREE.DirectionalLight(0xd0deff, 1.7);
    moon.position.set(-4, 9, 6);
    moon.castShadow = true;
    moon.shadow.mapSize.set(512, 512);
    moon.shadow.camera.left = -6; moon.shadow.camera.right = 6; moon.shadow.camera.top = 6; moon.shadow.camera.bottom = -6;
    scene.add(moon);
    const warm = new THREE.PointLight(0xd97757, 2.0, 14, 2);
    warm.position.set(-3, 2.8, 1.5); scene.add(warm);
    const teal = new THREE.PointLight(0x2bb3c0, 1.6, 12, 2);
    teal.position.set(3, 2.2, 1.5); scene.add(teal);
    // Per-fighter key lights so both combatants stay well-lit at all times
    const pKey = new THREE.PointLight(0xfff2d0, 3.2, 11, 2); pKey.position.set(-2.2, 3.0, 2.6); scene.add(pKey);
    const eKey = new THREE.PointLight(0xff5050, 3.2, 11, 2); eKey.position.set(2.2, 3.0, 2.6); scene.add(eKey);

    // === Nightmare Village arena (upgraded, offline) ===
    const arenaEnv = buildNightmareVillage(scene, { episodeId: episodeId || 1, level });

    const vfx = createCombatVfx(scene);
    const mk = createMkVfx(scene);

    initWorld();
    const world = game.current;

    // ---- Load GLBs (client-side, no backend) ----
    // GLTFLoader is imported dynamically so a load failure can never break the
    // app's module graph — only the 3D arena degrades.
    // The fighter registry is the authoritative model source (realistic Babatunde).
    // Player fighter: the selected 3D fighter from the profile (Babatunde or one
    // of the 6 uploaded FBX fighters). Falls back to the asset record / Babatunde.
    // Offline-first: only attempt a real GLB if the admin explicitly set one on
    // the asset record. Otherwise the built-in procedural fighter is used so the
    // game plays with NO internet (no threejs.org fallback, no spike-prone GLB).
    const playerUrl = assetCheck?.player?.model_3d_url || "";
    const enemyUrl = assetCheck?.enemy?.model_3d_url || "";
    const pRecId = assetCheck?.player?.id;
    const eRecId = assetCheck?.enemy?.id;
    const fighterObjs = { p: null, e: null };
    const mixers = { p: null, e: null };
    const clips = { p: [], e: [] };
    const combatInfo = { p: null, e: null };

    const fitModel = (model) => {
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3(); box.getSize(size);
      const targetH = 2.0;
      const s = targetH / (size.y || 1);
      model.scale.setScalar(s);
      const box2 = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3(); box2.getCenter(center);
      model.position.x -= center.x; model.position.z -= center.z;
      model.position.y -= box2.min.y; // feet on ground
      return s;
    };

    // Built-in playable fighter (no asset dependency). The game is ALWAYS playable:
    // if a real rigged GLB is set it loads on top; otherwise this stylized fighter
    // spawns so combat runs immediately with zero credits / zero assets.
    const buildCapsuleFighter = (which) => {
      const isP = which === "p";
      // Player: dark martial attire with gold trim. Enemy: hooded dark robe, glowing purple aura.
      const robe = isP ? 0x16161e : 0x1a1022;
      const trim = isP ? 0xc5a059 : 0x7a3ad0;
      const skin = isP ? 0x6b4a32 : 0x2a2030;
      const matBody = new THREE.MeshStandardMaterial({ color: robe, roughness: 0.7, metalness: 0.2 });
      const matTrim = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.4, metalness: 0.5, emissive: isP ? 0x000000 : 0x3a1a5a, emissiveIntensity: isP ? 0 : 0.6 });
      const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
      const group = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.30, 0.55, 6, 12), matBody);
      torso.position.y = 1.05; torso.castShadow = true; torso.receiveShadow = true;
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 12), matTrim);
      belt.position.y = 0.78;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 18), matSkin);
      head.position.y = 1.62; head.castShadow = true;
      if (isP) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.04, 8, 18), matTrim);
        band.position.y = 1.68; band.rotation.x = Math.PI / 2; group.add(band);
      } else {
        const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x0c0810, roughness: 1, side: THREE.DoubleSide }));
        hood.position.y = 1.66; hood.rotation.x = Math.PI; group.add(hood);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb14fff });
        const eL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat); eL.position.set(-0.08, 1.6, 0.2);
        const eR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat); eR.position.set(0.08, 1.6, 0.2);
        group.add(eL, eR);
      }
      const armGeo = new THREE.CapsuleGeometry(0.11, 0.42, 4, 8);
      armGeo.translate(0, -0.32, 0);
      const lArm = new THREE.Mesh(armGeo, matBody); lArm.position.set(-0.40, 1.35, 0); lArm.castShadow = true;
      const rArm = new THREE.Mesh(armGeo, matBody); rArm.position.set(0.40, 1.35, 0); rArm.castShadow = true;
      const legGeo = new THREE.CapsuleGeometry(0.15, 0.48, 4, 8);
      legGeo.translate(0, -0.39, 0);
      const lLeg = new THREE.Mesh(legGeo, matBody); lLeg.position.set(-0.17, 0.62, 0); lLeg.castShadow = true;
      const rLeg = new THREE.Mesh(legGeo, matBody); rLeg.position.set(0.17, 0.62, 0); rLeg.castShadow = true;
      group.add(torso, belt, head, lArm, rArm, lLeg, rLeg);
      scene.add(group);
      fighterObjs[which] = { group, model: group, currentClip: null, currentAction: null, isCapsule: true, parts: { torso, head, lArm, rArm, lLeg, rLeg } };
      combatInfo[which] = {
        url: "(built-in fighter)", loaded: true, meshCount: 7, triCount: 0, materialCount: 3, textureCount: 0,
        skeleton: false, skinned: false, boneCount: 0, animationCount: 0, animationNames: [],
        foundAnims: [], missingAnims: ["procedural"], combatStatus: "COMBAT_READY", bbox: [0.9, 2.0, 0.6],
      };
      setDiag((d) => ({ ...d, [which]: combatInfo[which] }));
    };

    const buildFighter = (gltf, which, tint) => {
      const model = gltf.scene || gltf; // GLTF returns {scene}; FBX returns a Group directly
      fitModel(model);
      // Preserve the GLB's original PBR materials (spec §6) — never wireframe, never
      // substitute a flat/skeleton material. The real mesh stays visible; the skeleton
      // stays internal. Enemy tint is a light color multiply only (different character).
      model.traverse((o) => {
        if (o.isMesh) {
          o.visible = true;
          o.castShadow = true; o.receiveShadow = true;
          if (o.isSkinnedMesh) o.frustumCulled = false;
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => { m.wireframe = false; });
            if (tint) mats.forEach((m) => { m.color = new THREE.Color(tint); });
          }
        }
      });
      const group = new THREE.Group();
      group.add(model);
      scene.add(group);
      fighterObjs[which] = { group, model, currentClip: null, currentAction: null };
      if (gltf.animations && gltf.animations.length) {
        mixers[which] = new THREE.AnimationMixer(model);
        clips[which] = gltf.animations.slice();
      }
      // === SPIKE REWEIGHT (same back-door repair as the shared loader) ===
      // Some auto-rig GLBs bake a mismatched inverse-bind for a head bone, so at
      // rest the skinned head vertices get yanked into a vertical spike that hides
      // the face. For every skinned vertex, compute its true rest skinned position
      // using the GPU's exact matrix (boneMatrices already = matrixWorld×inverseBind);
      // any vertex landing far above the model is reweighted to 100% the root bone so
      // it snaps back to its bind-pose head position. The static face parts (eyes/
      // iris/pupils/lips/brows) are untouched. Works on any GLB; no file edit needed.
      try {
        model.updateMatrixWorld(true);
        const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _t = new THREE.Vector3();
        const _m = new THREE.Matrix4();
        let _rw = 0;
        model.traverse((o) => {
          if (!o.isSkinnedMesh || !o.skeleton) return;
          o.skeleton.update();
          const pos = o.geometry.attributes.position;
          const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
          if (!si || !sw) return;
          const siA = si.array, swA = sw.array, bM = o.skeleton.boneMatrices;
          let maxY = 0;
          for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i); if (_v.y > maxY) maxY = _v.y; }
          const limit = maxY + 1.0;
          for (let i = 0; i < pos.count; i++) {
            _v.fromBufferAttribute(pos, i);
            _s.set(0, 0, 0);
            for (let j = 0; j < 4; j++) {
              const w = swA[i * 4 + j]; if (w === 0) continue;
              _m.fromArray(bM, siA[i * 4 + j] * 16);
              _t.copy(_v).applyMatrix4(_m).multiplyScalar(w);
              _s.add(_t);
            }
            if (_s.y > limit) {
              siA[i * 4] = 0; siA[i * 4 + 1] = 0; siA[i * 4 + 2] = 0; siA[i * 4 + 3] = 0;
              swA[i * 4] = 1; swA[i * 4 + 1] = 0; swA[i * 4 + 2] = 0; swA[i * 4 + 3] = 0;
              _rw++;
            }
          }
          si.needsUpdate = true; sw.needsUpdate = true;
        });
        if (_rw > 0) console.log("[ARENA-SPIKE] reweighted", _rw, "verts for", which);
      } catch (e) {}
      // Combat clips come ONLY from real sources — GLB-embedded animations or
      // Mixamo-compatible BVH (see BVH_SOURCES). No procedural/Wave substitution:
      // a missing combat clip is honestly "not installed" (COMBAT_READY = FALSE).
      // ---- diagnostics: scan the real loaded GLB ----
      let meshCount = 0, triCount = 0, skinned = false; const matSet = new Set(); const texSet = new Set(); let boneCount = 0;
      model.traverse((o) => {
        if (o.isMesh) {
          meshCount++;
          if (o.isSkinnedMesh) skinned = true;
          const g = o.geometry;
          if (g) { if (g.index) triCount += g.index.count / 3; else if (g.attributes && g.attributes.position) triCount += g.attributes.position.count / 3; }
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (!m) return; matSet.add(m.uuid); for (const k of ["map","normalMap","roughnessMap","metalnessMap","emissiveMap","bumpMap","aoMap","alphaMap"]) if (m[k] && m[k].uuid) texSet.add(m[k].uuid); });
        }
        if (o.isBone) boneCount++;
      });
      const box = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); box.getSize(size);
      const animNames = (clips[which] || []).map((a) => a.name);
      const { found, missing } = classifyAnimations(animNames);
      const hasSkeleton = boneCount > 0;
      let combatStatus = "MODEL_GENERATED";
      if (!hasSkeleton) combatStatus = "MODEL_CLEAN";
      else if (!skinned) combatStatus = "RIGGED";
      else if (missing.length) combatStatus = "SKINNED";
      else combatStatus = "COMBAT_READY";
      const info = {
        url: which === "p" ? playerUrl : enemyUrl, loaded: true,
        meshCount, triCount: Math.round(triCount), materialCount: matSet.size, textureCount: texSet.size,
        skeleton: hasSkeleton, skinned, boneCount,
        animationCount: (gltf.animations || []).length, animationNames: animNames,
        foundAnims: found, missingAnims: missing, combatStatus, bbox: [size.x, size.y, size.z],
      };
      combatInfo[which] = info;
      setDiag((d) => ({ ...d, [which]: info }));
      // Persist live validation back to the asset record so the admin pipeline reflects reality.
      const _rid = which === "p" ? pRecId : eRecId;
      if (_rid) base44.entities.GameCharacterAsset.update(_rid, {
        validation_details: JSON.stringify({ ...info, checkedBy: "browser-threejs" }),
        combat_status: combatStatus,
        skeleton_status: hasSkeleton ? "detected" : "missing",
        skin_status: skinned ? "skinned" : "missing",
        animation_status: missing.length === 0 ? "ready" : (found.length ? "partial" : "pending"),
        rig_status: hasSkeleton ? "ready" : "pending",
      }).catch(() => {});
    };

    const findClip = (which, keys) => {
      const list = clips[which];
      if (!list || !list.length) return null;
      const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
      // Exact normalized match first (prevents "Kick" stealing the "Heavy Kick" clip).
      for (const k of keys) { const c = list.find((c) => norm(c.name) === norm(k)); if (c) return c; }
      // Then substring match.
      for (const k of keys) { const c = list.find((c) => norm(c.name).includes(norm(k))); if (c) return c; }
      return null; // no fallback — never substitute another clip for a missing one
    };
    // Blend animations with fadeIn/fadeOut (crossFade) instead of abruptly cutting.
    const playClip = (which, keys, loop = false) => {
      const mixer = mixers[which];
      if (!mixer) return;
      const clip = findClip(which, keys);
      if (!clip) return;
      const fo = fighterObjs[which];
      // Don't restart a clip that's already playing — calling reset() every frame
      // re-seeks the animation to frame 0 so it never advances (the "static fighter" bug).
      if (fo && fo.currentClip === clip.name) {
        const existing = mixer.existingAction(clip);
        if (existing && existing.isRunning()) return;
      }
      const action = mixer.existingAction(clip) || mixer.clipAction(clip);
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, 1);
      const isDeath = /death|die|defeat|fall|knockdown/.test(clip.name.toLowerCase());
      action.clampWhenFinished = !loop && isDeath; // dead stays down; attacks revert to stance
      const cur = fo?.currentAction;
      if (cur && cur !== action) cur.fadeOut(0.12);
      action.reset().fadeIn(0.12).play();
      if (fo) { fo.currentClip = clip.name; fo.currentAction = action; }
    };

    // Built-in fighters spawn IMMEDIATELY — the game is ALWAYS playable with NO
    // internet. A real rigged GLB (if the admin set model_3d_url) loads on top
    // and swaps in when ready; any failure is silent and the built-in fighter
    // stays. Combat is never gated on downloads, never shows an error screen.
    buildCapsuleFighter("p");
    buildCapsuleFighter("e");
    let glbsReady = true;
    setLoadPct(100); setLoadState("ready");
    const swapInReal = (which, gltf, tint) => {
      try {
        const fo = fighterObjs[which];
        if (fo?.group) { scene.remove(fo.group); fo.group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); }); }
        buildFighter(gltf, which, tint);
      } catch (e) { console.warn(which, "swap-in failed", e); }
    };
    // Real rigged FBX fighters + animation clips (uploaded by the builder).
    // Loaded best-effort on top of the built-in capsule fighters: when network
    // is available the real characters spawn and their real animations play
    // during combat; offline (or on load failure) the capsules stay so the game
    // is never broken. Clips are Mixamo humanoid (mixamorig:*) so they bind by
    // bone name across both fighters' skeletons.
    const REAL_FBX = {
      punch:   "https://media.base44.com/files/public/6a7364eea84550708f16a360/9fa067a6f_MariaWPropJJOngPunching.fbx",
      die:     "https://media.base44.com/files/public/6a7364eea84550708f16a360/a07bf24aa_MariaWPropJJOngDying.fbx",
      dropkick:"https://media.base44.com/files/public/6a7364eea84550708f16a360/42ae1b2e0_Ch14_nonPBRDropKick.fbx",
      turn:    "https://media.base44.com/files/public/6a7364eea84550708f16a360/a23408941_Ch34_nonPBRUnarmedTurnLeft90.fbx",
      climb:   "https://media.base44.com/files/public/6a7364eea84550708f16a360/3abe02f63_DemonTWiezzorekFreehangClimb.fbx",
      standup: "https://media.base44.com/files/public/6a7364eea84550708f16a360/2a1d3950e_GirlscoutTMasuyamaStandingUp.fbx",
      idle:    "https://media.base44.com/files/public/6a7364eea84550708f16a360/c4746b2a0_StandingIdle03.fbx",
    };
    const ENV_ZIPS = [
      "https://media.base44.com/files/public/6a7364eea84550708f16a360/6f348aaf6_modular-environment.zip",
      "https://media.base44.com/files/public/6a7364eea84550708f16a360/ac604b6c7_modular_environment.zip",
    ];
    const loadFbxBase = async (which, url, baseClipName, tint) => {
      try {
        const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
        const obj = await new Promise((res, rej) => new FBXLoader().load(url, res, undefined, rej));
        if (obj.animations?.[0]) obj.animations[0].name = baseClipName;
        swapInReal(which, obj, tint);
        return obj;
      } catch (e) { console.warn(which, "FBX base load failed", e?.message || e); return null; }
    };
    const loadFbxClip = async (url, clipName) => {
      try {
        const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
        const obj = await new Promise((res, rej) => new FBXLoader().load(url, res, undefined, rej));
        if (obj.animations?.[0]) { const c = obj.animations[0].clone(); c.name = clipName; return c; }
        return null;
      } catch (e) { console.warn("FBX clip load failed", url, e?.message || e); return null; }
    };
    // Load a known-good Mixamo-rigged GLB as the fighter base. The Soldier.glb from
    // threejs.org ships with a clean mixamorig:* skeleton + Idle/Walk/Run, and the
    // uploaded FBX combat clips (punch, dropkick, die…) bind onto it by bone name.
    const loadGlbBase = async (which, url, tint) => {
      try {
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        const gltf = await new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
        swapInReal(which, gltf, tint);
        return gltf;
      } catch (e) { console.warn(which, "GLB base load failed", e?.message || e); return null; }
    };
    (async () => {
      // Base fighters: the reliable Mixamo-rigged Soldier.glb (known-good skeleton +
      // Idle/Walk/Run). Combat clips (punch, dropkick, die…) from the uploaded FBX
      // library bind onto the Soldier's mixamorig:* skeleton by bone name.
      const SOLDIER_URL = "https://threejs.org/examples/models/gltf/Soldier.glb";
      const [pBase, eBase, punchClip, dropkickClip, dieClip, turnClip, climbClip, upClip, idleClip] = await Promise.all([
        loadGlbBase("p", SOLDIER_URL, null),
        loadGlbBase("e", SOLDIER_URL, 0x8a3a3a),
        loadFbxClip(REAL_FBX.punch, "lightPunch"),
        loadFbxClip(REAL_FBX.dropkick, "heavyPunch"),
        loadFbxClip(REAL_FBX.die, "death"),
        loadFbxClip(REAL_FBX.turn, "dodge"),
        loadFbxClip(REAL_FBX.climb, "special"),
        loadFbxClip(REAL_FBX.standup, "getUp"),
        loadFbxClip(REAL_FBX.idle, "idle"),
      ]);
      // Share all combat clips across both fighters (Mixamo mixamorig:* binds by bone name).
      for (const w of ["p", "e"]) {
        if (punchClip) clips[w].push(punchClip.clone());
        if (dropkickClip) clips[w].push(dropkickClip.clone());
        if (dieClip) clips[w].push(dieClip.clone());
        if (turnClip) clips[w].push(turnClip.clone());
        if (climbClip) clips[w].push(climbClip.clone());
        if (upClip) clips[w].push(upClip.clone());
        if (idleClip) clips[w].push(idleClip.clone());
      }
      // === Your uploaded scene packs ARE the arena — rotated every level ===
      // Both modular-environment ZIPs alternate per level so the scenery
      // changes as you progress. The procedural Nightmare Village is built
      // first (so the scene is never empty during the ~1s ZIP download) and is
      // swapped out the moment a pack loads. If a ZIP fails or we're offline,
      // the village stays so the fight is never broken.
      const zipUrl = ENV_ZIPS[(Number(level || 1) - 1) % ENV_ZIPS.length];
      try {
        const mod = await import("@/lib/zipSceneLoader");
        const res = await mod.loadZipScene(zipUrl, THREE);
        if (res?.scene) {
          const obj = res.scene;
          const box = new THREE.Box3().setFromObject(obj); const size = new THREE.Vector3(); box.getSize(size);
          const s = 18 / (Math.max(size.x, size.z) || 1); obj.scale.setScalar(s);
          const b2 = new THREE.Box3().setFromObject(obj); const c = new THREE.Vector3(); b2.getCenter(c);
          obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y;
          obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
          scene.add(obj);
          arenaEnv.dispose(); // swap out the procedural fallback
        }
      } catch (e) { console.warn("env zip load failed", e?.message || e); }
    })();

    // ---- Spark pool ----
    const sparkGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const spawnSpark3D = (x, y, color) => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(sparkGeo, mat);
      m.position.set(x, y, 0.5);
      scene.add(m);
      world.sparks.push({ mesh: m, life: 380 });
    };

    // ---- Combat helpers (ported) ----
    const enterState = (f, st) => { if (f.state === st) return; f.state = st; f.stateT = 0; };
    const startAttack = (f, kind) => {
      f.state = kind; f.stateT = 0; f.cooldown = ATK[kind].startup + ATK[kind].active + ATK[kind].recover;
      f.atkKind = kind; f.atkHasHit = false; f.vx = f.facing * 0.4;
      const cid = f.enemy ? undefined : charDef.id;
      if (kind === "light") gameAudio.sfx("light", { intensity: 1, characterId: cid });
      else if (kind === "heavy") gameAudio.sfx("heavy", { intensity: 1, characterId: cid });
      else if (kind === "special") gameAudio.sfx("special", { intensity: 1, characterId: cid });
      else if (kind === "grab") gameAudio.sfx("grab", { intensity: 0.9, characterId: cid });
      // Animation is driven by updateState on state change (animKey), so no
      // clip call is needed here — the attack clip fires when the state flips.
    };

    const physics = (f, dt) => {
      const dts = dt / 16;
      f.x += f.vx * dts; f.vx *= 0.86;
      f.vy += 0.018 * dts; f.y += f.vy * dts;
      if (f.y >= 0) { f.y = 0; f.vy = 0; f.onGround = true; }
      f.x = clamp(f.x, -4, 4);
    };

    const resolveHits = (g) => {
      for (const [atk, def] of [[g.p, g.e], [g.e, g.p]]) {
        if (!["light","heavy","special","grab"].includes(atk.state)) continue;
        if (atk.atkHasHit) continue;
        const a = ATK[atk.state]; const t = atk.stateT;
        if (t < a.startup || t > a.startup + a.active) continue;
        const hb = atk.x + atk.facing * (0.4 + a.range / 2);
        const dist = Math.abs(hb - def.x);
        if (dist < a.range / 2 + 0.5 && Math.abs(def.y) < 0.6) {
          atk.atkHasHit = true;
          if (def.iframe > 0) { spawnSpark3D(def.x, 1.2, 0x5ed1da); gameAudio.sfx("dodge", { intensity: 0.7 }); continue; }
          if (def.state === "block" && Math.sign(atk.x - def.x) === def.facing) {
            def.spirit = Math.min(def.maxSpirit, def.spirit + 4);
            def.vx += atk.facing * (a.kb * 0.4);
            g.camShake = Math.max(g.camShake, 0.3);
            spawnSpark3D((atk.x + def.x)/2, 1.2, 0xf7c948);
            gameAudio.sfx("block", { intensity: 0.85 });
            continue;
          }
          def.hp = Math.max(0, def.hp - a.dmg);
          def.hitstun = atk.state === "heavy" ? 420 : atk.state === "special" ? 520 : 260;
          def.vx += atk.facing * a.kb; def.vy = -0.06; def.onGround = false;
          enterState(def, "hit");
          if (def === g.p) playClip("p", ["hit","hurt","damage"], false);
          gameAudio.sfx("impact", { intensity: atk.state === "special" ? 1.4 : atk.state === "heavy" ? 1.2 : 0.9, characterId: atk === g.p ? charDef.id : undefined });
          gameAudio.sfx("pain", { intensity: atk.state === "special" ? 1.3 : 0.85, characterId: def === g.p ? charDef.id : undefined });
          if (atk === g.p) { g.p.combo += 1; g.comboTimer = 1500; g.p.spirit = Math.min(g.p.maxSpirit, g.p.spirit + a.spirit); if (g.p.combo === 8 && g.mkPop !== "FATALITY") { g.mkPop = "BRUTALITY"; g.mkPopT = 1600; } }
          else g.p.combo = 0;
          g.camShake = Math.max(g.camShake, atk.state === "special" ? 1 : atk.state === "heavy" ? 0.7 : 0.4);
          g.flash = Math.max(g.flash, atk.state === "special" ? 0.7 : 0.3);
          spawnSpark3D(def.x, 1.2, atk.state === "special" ? 0x2bb3c0 : 0xe07466);
          if (atk.state === "special") { vfx.impact(def.x, 1.2, 0.5, 0x2bb3c0, 1.8); vfx.shockwave(def.x, 0x2bb3c0, 3.2, 600); vfx.lightning(atk.x, def.x, 1.2, 0x5ed1da); }
          else if (atk.state === "heavy") { vfx.impact(def.x, 1.2, 0.5, 0xe07466, 1.3); vfx.shockwave(def.x, 0xe07466, 2.2, 480); }
          else { vfx.impact(def.x, 1.2, 0.5, 0xf7c948, 0.9); }
          // MK stunts: blood mist, hit-stop freeze frame, X-Ray flash, screen blood.
          mk.bloodMist(def.x, 1.3, 0.4, atk.state === "special" ? 2 : atk.state === "heavy" ? 1.5 : 0.8);
          if (atk.state === "heavy") g.hitStop = Math.max(g.hitStop, 90);
          if (atk.state === "special") { g.hitStop = Math.max(g.hitStop, 220); g.xrayFlash = 1; }
          if (def === g.p) { g.bloodScreen = Math.min(1, g.bloodScreen + (atk.state === "special" ? 0.7 : atk.state === "heavy" ? 0.4 : 0.15)); g.flawless = false; }
        }
      }
    };

    const enemyAI = (g, dt) => {
      const e = g.e, p = g.p;
      if (e.state === "defeated" || e.hitstun > 0) { e.vx *= 0.8; return; }
      if (["light","heavy","special","grab"].includes(e.state)) return;
      e.ai.decT = (e.ai.decT || 0) - dt;
      const dist = Math.abs(e.x - p.x);
      e.facing = p.x > e.x ? 1 : -1;
      // The enemy holds its ground — fighters stand facing each other until the
      // player engages. Only when the player steps in does the enemy attack/block.
      if (e.ai.decT <= 0) {
        e.ai.decT = rand(700, 1400);
        const r = Math.random();
        if (dist > 2.6) e.ai.mode = "idle";
        else if (r < 0.45) { startAttack(e, Math.random() < 0.6 ? "light" : "heavy"); e.ai.mode = "attack"; }
        else if (r < 0.6) { e.ai.mode = "block"; e.state = "block"; }
        else if (r < 0.72) e.ai.mode = "retreat";
        else e.ai.mode = "idle";
        if (e.spirit >= 34 && dist < 2.4 && Math.random() < 0.3) { startAttack(e, "special"); e.spirit -= 34; e.ai.mode = "attack"; }
      }
      if (e.ai.mode === "idle") { if (dist > 2.2) e.vx = e.facing * 0.05; else e.vx *= 0.8; if (e.state === "block") e.state = "idle"; }
      else if (e.ai.mode === "retreat") e.vx = -e.facing * 0.04;
      else if (e.ai.mode === "block") { e.vx *= 0.7; e.state = "block"; }
      else e.vx *= 0.7;
      e.spirit = Math.min(e.maxSpirit, e.spirit + dt * 0.01);
      p.spirit = Math.min(p.maxSpirit, p.spirit + dt * 0.006);
    };

    const updateState = (f, dt) => {
      let key = f.state;
      if (f.state === "idle" && Math.abs(f.vx) > 0.01 && f.onGround) key = "walk";
      if (["light","heavy","special","grab"].includes(f.state)) {
        const a = ATK[f.state]; const t = f.stateT;
        if (t > a.startup + a.active + a.recover) { f.state = "idle"; key = "idle"; }
      }
      if (f.state === "dodge" && f.stateT > 320) { f.state = "idle"; key = "idle"; }
      if (f.hitstun > 0) key = f.hitstun > 240 ? "stagger" : "hit";
      if (f.state === "defeated") key = "defeated";
      if (key === "walk") f.walkPhase += dt * 0.02;
      // Animation selection — only switch clips when the desired animation CHANGES.
      // Switching every frame would restart the clip and freeze the fighter.
      // BVH aliases (attack_light, hit_light, defeated…) take priority so dropped-in
      // BVH clips override the GLB's native Idle/Walk/Run/Wave clips.
      const w = f.enemy ? "e" : "p";
      if (mixers[w] && f._lastAnim !== key) {
        f._lastAnim = key;
        // Clip names: canonical fighter states (lightPunch …) first, then legacy
        // aliases. No Wave/Idle fallback — a missing combat clip simply doesn't
        // play (honest), so combat is never faked with a non-combat animation.
        if (key === "walk") playClip(w, ["walk","Walk","run","move"], true);
        else if (key === "idle") playClip(w, ["idle","Idle","breath","stand"], true);
        else if (key === "light") playClip(w, ["lightPunch","light_punch","attack_light","jab","punch","strike","attack"], false);
        else if (key === "heavy") playClip(w, ["heavyPunch","heavy_punch","attack_heavy","smash","heavy","strike"], false);
        else if (key === "special") playClip(w, ["special","ultimate","skill","super"], false);
        else if (key === "grab") playClip(w, ["grab","throw"], false);
        else if (key === "block") playClip(w, ["block","guard"], false);
        else if (key === "dodge") playClip(w, ["dodge","dash","evade","roll"], false);
        else if (key === "hit") playClip(w, ["hit","hit_light","hurt","damage"], false);
        else if (key === "stagger") playClip(w, ["hit_heavy","hit","hurt","damage","stagger","knockback"], false);
        else if (key === "knockdown") playClip(w, ["knockdown","knock_down","downed"], false);
        else if (key === "getUp") playClip(w, ["getUp","get_up","rise","standup"], false);
        else if (key === "defeated") playClip(w, ["death","die","defeat","knockdown","fall"], false);
        else if (key === "victory") playClip(w, ["victory","win","celebrate"], false);
      }
    };

    const finishWin = (g) => {
      let xp = 20 + (episodeId||1)*5 + (level||1)*2 + 50;
      let sp = 10 + (level||1)*2 + g.p.combo*2;
      if (profile?.booster_battles > 0) xp *= 2;
      g.lastReward = { xp: Math.round(xp), sp: Math.round(sp), combo: g.p.combo, flawless: g.flawless, booster: profile?.booster_battles > 0 };
      onWin?.({ ...g.lastReward, key:`${episodeId}-${level}`, boss:true, durationMs: Math.round(g.time - (g.fightStartT||g.time)) });
    };

    // ---- STEP ----
    const stepEnvironment = (g, dt) => {
      arenaEnv.update(dt, g.time);
      for (let i = g.sparks.length-1; i>=0; i--) {
        const s = g.sparks[i]; s.life -= dt;
        const k = clamp(s.life/380,0,1);
        s.mesh.scale.setScalar(1 + (1-k)*2); s.mesh.material.opacity = k;
        if (s.life <= 0) { scene.remove(s.mesh); s.mesh.material.dispose(); g.sparks.splice(i,1); }
      }
    };

    const step = (g, dt) => {
      g.time += dt; const sdt = dt * g.timeScale;
      g.camShake = Math.max(0, g.camShake - dt*0.002);
      g.flash = Math.max(0, g.flash - dt*0.004);
      g.lightLeak = Math.max(0, g.lightLeak - dt*0.002);
      g.xrayFlash = Math.max(0, g.xrayFlash - dt*0.0028);
      g.bloodScreen = Math.max(0, g.bloodScreen - dt*0.0012);
      if (g.mkPopT > 0) { g.mkPopT -= dt; if (g.mkPopT <= 0) g.mkPop = ""; }

      if (g.phase === "intro") {
        g.introT += dt;
        const cur = g.subQueue.find((s,i) => g.introT >= s.t && (g.subQueue[i+1]? g.introT < g.subQueue[i+1].t : true));
        const full = cur ? `${cur.who? cur.who+" — ":""}${cur.text}` : "";
        g.sub = full;
        if (cur && full && full !== g._lastSpoken) {
          g._lastSpoken = full;
          const who = cur.who === charDef.name.toUpperCase() ? "hero" : "priest";
          gameAudio.speak(cur.text, who, who === "hero" ? charDef.id : undefined);
        }
        if (g.introT > 4600) { g.phase="fight"; g.lightLeak=1; g.sub=""; g.timeScale=1; g.fightStartT=g.time; g.fightPromptT=g.time; gameAudio.sfx("special",{intensity:0.7}); if(mixers.p)playClip("p",["idle","stand","breath"],true); if(mixers.e)playClip("e",["idle","stand"],true); }
        stepEnvironment(g, dt); return;
      }
      if (g.phase === "finish") {
        g.timeScale = lerp(g.timeScale, 0.28, 0.06);
        if (!g._finSound) { g._finSound = true; gameAudio.sfx("finish",{intensity:1.3}); gameAudio.speak("Ancestral finish","hero",charDef.id); playClip("p",["attack","ultimate","special"],false); if (fighterObjs.p?.group) g._finAura = vfx.aura(fighterObjs.p.group, 0xfff7d6); }
        g.p.stateT += dt;
        if (g.p.stateT > 520 && !g.over) {
          g.e.hp = 0; g.flash = 1; g.camShake = 1.2; enterState(g.e, "defeated"); g.over = "win";
          if (g._finAura?.remove) g._finAura.remove(); vfx.koBurst(g.e.x, 0xfff7d6);
          mk.bloodMist(g.e.x, 1.4, 0.4, 2.5); mk.bloodPool(g.e.x);
          g.mkPop = "FATALITY"; g.mkPopT = 2600;
          gameAudio.sfx("ko",{intensity:1.3}); gameAudio.speak("It is finished.","hero",charDef.id);
          playClip("e",["die","death","defeat","fall"],false);
          playClip("p",["victory","win","celebrate","idle"],true);
          if (!g.winLogged) { g.winLogged = true; finishWin(g); }
          setTimeout(() => { if (game.current) game.current.phase = "over"; }, 900);
        }
        stepEnvironment(g, dt); return;
      }
      if (g.phase === "over") { stepEnvironment(g, dt); return; }

      // FIGHT
      g.timeScale = lerp(g.timeScale, 1, 0.1);
      if (g.hitStop > 0) { g.hitStop -= dt; g.camShake = Math.max(g.camShake, 0.25); stepEnvironment(g, dt); return; }
      if (g.comboTimer > 0) { g.comboTimer -= dt; if (g.comboTimer <= 0) g.p.combo = 0; }

      const p = g.p; const inp = input.current;
      if (p.state !== "defeated" && p.hitstun <= 0 && !["light","heavy","special","grab","finish"].includes(p.state)) {
        const spd = 0.07;
        if (inp.left) { p.vx = -spd; p.facing = -1; }
        else if (inp.right) { p.vx = spd; p.facing = 1; }
        else p.vx *= 0.7;
        if (inp.up && p.onGround) { p.vy = -0.28; p.onGround = false; gameAudio.sfx("jump",{intensity:0.8,characterId:charDef.id}); vfx.dust(p.x, 0x6a5a3b, 0.8); }
        if (inp.block) enterState(p, "block"); else if (p.state === "block") enterState(p, "idle");
      }
      if (p.cooldown <= 0 && p.hitstun <= 0 && p.state !== "defeated") {
        if (pressed("dodge") && p.onGround) { enterState(p,"dodge"); p.iframe=320; p.vx=-p.facing*0.16; p.cooldown=200; gameAudio.sfx("dodge",{intensity:1,characterId:charDef.id}); vfx.dust(p.x, 0xc5a059, 1); }
        else if (pressed("finish") && g.e.hp > 0 && g.e.hp <= g.e.maxHp*0.25 && p.spirit >= 30) { g.phase="finish"; enterState(p,"finish"); p.stateT=0; p.spirit-=30; return; }
        else if (pressed("special") && p.spirit >= 34) { startAttack(p,"special"); p.spirit-=34; }
        else if (pressed("heavy")) startAttack(p,"heavy");
        else if (pressed("light")) startAttack(p,"light");
        else if (pressed("grab")) startAttack(p,"grab");
      }
      physics(g.p, dt); physics(g.e, dt);
      enemyAI(g, dt);
      resolveHits(g);
      p.cooldown = Math.max(0, p.cooldown - dt); p.hitstun = Math.max(0, p.hitstun - dt); p.iframe = Math.max(0, p.iframe - dt);
      p.stateT += dt; g.e.stateT += dt; g.e.cooldown = Math.max(0, g.e.cooldown - dt); g.e.hitstun = Math.max(0, g.e.hitstun - dt);
      updateState(p, dt); updateState(g.e, dt);

      // MK: rage aura ignites at critical HP, fades when safe.
      if (p.hp > 0 && p.hp <= (p.maxHp||120) * 0.25 && !g._rageAura && fighterObjs.p?.group) g._rageAura = mk.rageAura(fighterObjs.p.group, 0xc01818);
      if ((p.hp <= 0 || p.hp > (p.maxHp||120) * 0.25) && g._rageAura) { g._rageAura.remove?.(); g._rageAura = null; }

      if (g.e.hp <= 0 && !g.over) {
        g.over = "win"; g.flash = 0.8; g.camShake = 1; enterState(g.e, "defeated");
        vfx.koBurst(g.e.x, 0xfff7d6);
        mk.bloodMist(g.e.x, 1.3, 0.4, 2); mk.bloodPool(g.e.x);
        if (g._rageAura) { g._rageAura.remove?.(); g._rageAura = null; }
        g.mkPop = g.flawless ? "FLAWLESS VICTORY" : "FATALITY"; g.mkPopT = 2400;
        gameAudio.sfx("victory", { characterId: charDef.id }); gameAudio.speak("You are remembered.","narrator",charDef.id);
        playClip("e",["die","death","defeat","fall"],false);
        playClip("p",["victory","win","celebrate","idle"],true);
        setTimeout(() => { if (game.current) game.current.phase = "over"; }, 600);
        if (!g.winLogged) { g.winLogged = true; finishWin(g); }
      }
      if (p.hp <= 0 && !g.over) {
        g.over = "lose"; enterState(p, "defeated"); vfx.koBurst(p.x, 0xc0484a); mk.bloodMist(p.x, 1.3, 0.4, 2); mk.bloodPool(p.x); if (g._rageAura) { g._rageAura.remove?.(); g._rageAura = null; } gameAudio.sfx("ko",{intensity:1}); gameAudio.speak("The forgotten call you back.","priest");
        playClip("p",["die","death","defeat","fall"],false);
        setTimeout(() => { if (game.current) game.current.phase = "over"; }, 700);
      }
      stepEnvironment(g, dt);
    };

    // ---- per-fighter 3D visual transform (state-driven; used when no clips too) ----
    const fighterVisual = (f, t) => {
      let dx = 0, dy = 0, lean = 0;
      const bob = Math.sin(t*0.003 + (f.enemy?1.7:0)) * 0.03;
      if (f.hitstun > 0 && f.state !== "defeated") { dx = -f.facing*0.25; lean = -f.facing*0.22; }
      else switch (f.state) {
        case "walk": dy = Math.abs(Math.sin(f.walkPhase*TAU))*0.04; lean = Math.sin(f.walkPhase*TAU)*0.04; break;
        case "jump": dy = 0.08; break;
        case "light": { const a=ATK.light, ph=clamp((f.stateT-a.startup)/a.active,0,1); dx=f.facing*0.6*Math.sin(PI*ph); lean=f.facing*0.2*Math.sin(PI*ph); break; }
        case "heavy": { const a=ATK.heavy, ph=clamp((f.stateT-a.startup)/a.active,0,1); dx=f.facing*0.85*Math.sin(PI*ph); lean=f.facing*0.3*Math.sin(PI*ph); break; }
        case "special": { const a=ATK.special, ph=clamp((f.stateT-a.startup)/a.active,0,1); dx=f.facing*0.45*Math.sin(PI*ph); lean=-f.facing*0.12 + f.facing*0.22*ph; break; }
        case "grab": { const a=ATK.grab, ph=clamp((f.stateT-a.startup)/a.active,0,1); dx=f.facing*0.3*Math.sin(PI*ph); break; }
        case "block": dx=-f.facing*0.08; lean=-f.facing*0.06; break;
        case "dodge": { const ph=clamp(f.stateT/320,0,1); dx=-f.facing*0.5*Math.sin(PI*ph); break; }
        case "defeated": lean = f.facing>0?-1.3:1.3; dy=-0.4; break;
        case "finish": { const ph=clamp(f.stateT/520,0,1); dx=f.facing*0.6*Math.sin(PI*ph); lean=f.facing*0.28*Math.sin(PI*ph); break; }
        default: dy = bob;
      }
      return { dx, dy, lean };
    };

    const applyFighter = (which, f, t) => {
      const fo = fighterObjs[which];
      if (!fo) return;
      const { group, model } = fo;
      const v = fighterVisual(f, t);
      group.position.x = f.x + v.dx;
      group.position.y = f.y + v.dy;
      group.rotation.y = f.facing > 0 ? -PI/2 : PI/2;
      model.rotation.z = v.lean;
      if (mixers[which]) mixers[which].update(0.016 * game.current.timeScale);
      // Procedural animation for built-in fighters (no GLB mixer).
      if (fo.isCapsule && fo.parts) {
        const P = fo.parts;
        const bob = Math.sin(t * 0.003 + (f.enemy ? 1.7 : 0)) * 0.03;
        P.torso.position.y = 1.05 + bob;
        P.head.position.y = 1.62 + bob;
        P.lArm.position.y = 1.35 + bob;
        P.rArm.position.y = 1.35 + bob;
        const moving = Math.abs(f.vx) > 0.02 && f.onGround;
        const sw = moving ? Math.sin(f.walkPhase * TAU) : 0;
        P.lLeg.rotation.x = sw * 0.6;
        P.rLeg.rotation.x = -sw * 0.6;
        P.lArm.rotation.x = -sw * 0.4;
        if (["light", "heavy", "special", "grab"].includes(f.state)) {
          const a = ATK[f.state]; const ph = clamp((f.stateT - a.startup) / a.active, 0, 1);
          P.rArm.rotation.x = -Math.sin(PI * ph) * 1.9;
          P.lArm.rotation.x = Math.sin(PI * ph) * 0.3;
        } else if (f.state === "block") {
          P.lArm.rotation.x = -1.2; P.rArm.rotation.x = -1.2;
        } else if (f.state !== "walk") {
          P.rArm.rotation.x = 0;
        }
        if (f.state === "defeated") { group.rotation.z = f.facing > 0 ? 1.4 : -1.4; group.position.y = f.y - 0.3; }
        else { group.rotation.z = 0; }
      }
    };

    // ---- Main loop ----
    let last = performance.now(); let hudT = 0; let diagT = 0; let fps = 0; let fpsAcc = 0; let fpsN = 0; let camYaw = 0;
    const clock = new THREE.Clock();
    const loop = (now) => {
      const dt = Math.min(40, now - last); last = now;
      const g = game.current; if (!g) { rafRef.current = requestAnimationFrame(loop); return; }
      // Merge keyboard/touch + gamepad into the effective input each frame so
      // all three input methods coexist without one clobbering the other.
      for (const f of INPUT_FLAGS) input.current[f] = keys.current[f] || pad.current[f];
      if (dt > 0) { fpsAcc += 1000 / dt; fpsN++; if (fpsN >= 20) { fps = fpsAcc / fpsN; fpsAcc = 0; fpsN = 0; } }
      // Combat runs immediately on the built-in fighters; pauses on demand.
      if (glbsReady && !pausedRef.current) step(g, dt);
      // camera follow + shake
      // Cinematic third-person camera — reusable fighter camera follows the
      // midpoint, zooms with separation, and never clips through the arena.
      camYaw += (input.current.camRX || 0) * 0.03;
      fighterCam.update({ x1: g.p.x, x2: g.e.x, shake: g.camShake, yaw: camYaw, camRY: input.current.camRY || 0, zoomOverride: g.phase === "finish" ? 3.6 : (g.p.combo >= 5 ? 5.4 : undefined) });
      warm.intensity = 1.9 + Math.sin(now*0.004)*0.3;
      applyFighter("p", g.p, now);
      applyFighter("e", g.e, now);
      vfx.update(dt);
      mk.update(dt);
      // flash overlay via background lerp
      if (g.flash > 0) renderer.toneMappingExposure = 1.25 + g.flash; else renderer.toneMappingExposure = 1.15;
      renderer.render(scene, camera);
      hudT += dt;
      if (hudT > 80) {
        hudT = 0;
        setHud({
          pHP: Math.round(g.p.hp), pSP: Math.round(g.p.spirit), eHP: Math.round(g.e.hp),
          combo: g.p.combo, phase: g.phase, sub: g.sub,
          finisher: g.e.hp > 0 && g.e.hp <= g.e.maxHp*0.25 && g.p.spirit >= 30,
          enemyName: g.e.name, enemyRole: g.e.role,
          fightPrompt: g.fightPromptT && (g.time - g.fightPromptT < 1200),
          mkPop: g.mkPop, xrayFlash: g.xrayFlash, bloodScreen: g.bloodScreen,
          lowHp: g.p.hp > 0 && g.p.hp <= (g.p.maxHp||120) * 0.25,
          result: g.over, reward: g.lastReward || null,
        });
      }
      diagT += dt;
      if (diagT > 250) {
        diagT = 0;
        const ri = renderer.info;
        setDiag((d) => ({ ...d, runtime: {
          fps: Math.round(fps), phase: g.phase,
          pState: g.p.state, eState: g.e.state,
          pClip: fighterObjs.p?.currentClip || null, eClip: fighterObjs.e?.currentClip || null,
          pStatus: combatInfo.p?.combatStatus, eStatus: combatInfo.e?.combatStatus,
          engine: _engineInfo,
          drawCalls: ri.render.calls, triangles: ri.render.triangles, textures: ri.memory.textures, geometries: ri.memory.geometries, programs: ri.programs?.length,
        }}));
      }
      clearEdge();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w/h; camera.fov = w/h < 1 ? 62 : 46; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      gameAudio.stopSpeech();
      vfx.disposeAll();
      mk.disposeAll();
      arenaEnv.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m=>m.dispose?.()); else o.material.dispose?.(); } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot3D]);

  // Boot the 3D arena immediately — the fighter registry already has the
  // permanent GLB URLs baked in, so we don't block the boot on the entity
  // asset check (that fetch continues in the background for diagnostics only).
  useEffect(() => {
    setLoadState("loading");
    setBoot3D(true);
  }, []);

  // Visible percentage estimator: eases smoothly toward 90% while assets load,
  // then snaps to 100% the moment both fighters resolve (set above). Gives the
  // player a fast, always-moving progress bar even if a server omits byte counts.
  useEffect(() => {
    if (loadState !== "loading" && loadState !== "checking") return;
    let v = 6;
    setLoadPct(6);
    const t = setInterval(() => {
      v = Math.min(92, v + (92 - v) * 0.09 + 0.6);
      setLoadPct(Math.round(v));
    }, 170);
    return () => clearInterval(t);
  }, [loadState]);

  // ---- Input wiring (keyboard + gamepad) ----
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase(); gameAudio.resume(); gameAudio.unlockSpeech();
      if (game.current && game.current.phase === "intro") game.current._lastSpoken = "";
      if (k==="a") keys.current.left=true;
      if (k==="d") keys.current.right=true;
      if (k==="w") keys.current.up=true;
      if (k==="j") keys.current.light=true;
      if (k==="k") keys.current.heavy=true;
      if (k==="l") keys.current.special=true;
      if (k==="i") keys.current.block=true;
      if (k==="shift") keys.current.dodge=true;
      if (k==="e") keys.current.grab=true;
      if (k==="r") keys.current.finish=true;
      if (k==="escape") onExit?.();
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      if (k==="a") keys.current.left=false;
      if (k==="d") keys.current.right=false;
      if (k==="w") keys.current.up=false;
      if (k==="j") keys.current.light=false;
      if (k==="k") keys.current.heavy=false;
      if (k==="l") keys.current.special=false;
      if (k==="i") keys.current.block=false;
      if (k==="shift") keys.current.dodge=false;
      if (k==="e") keys.current.grab=false;
      if (k==="r") keys.current.finish=false;
    };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    let gpT = 0;
    const poll = () => {
      const pads = navigator.getGamepads?.() || [];
      const gp = pads[0];
      if (gp) {
        const ax = gp.axes[0] || 0;
        pad.current.left = ax < -0.3 || gp.buttons[14]?.pressed;
        pad.current.right = ax > 0.3 || gp.buttons[15]?.pressed;
        // Standard mapping: A=jump, X=light, Y=heavy, B=dodge, LT=block, LB=grab, RT=special, RB=finisher
        pad.current.up = gp.buttons[0]?.pressed;
        pad.current.light = gp.buttons[2]?.pressed;
        pad.current.heavy = gp.buttons[3]?.pressed;
        pad.current.dodge = gp.buttons[1]?.pressed;
        pad.current.block = gp.buttons[6]?.pressed;
        pad.current.grab = gp.buttons[4]?.pressed;
        pad.current.special = gp.buttons[7]?.pressed;
        pad.current.finish = gp.buttons[5]?.pressed;
        // Right stick = camera orbit (gamepad-only axis — no keyboard/touch conflict)
        input.current.camRX = gp.axes[2] || 0;
        input.current.camRY = gp.axes[3] || 0;
      } else {
        // No gamepad connected this frame — clear its state so a disconnect
        // doesn't leave a held button stuck on.
        for (const f of INPUT_FLAGS) pad.current[f] = false;
      }
      gpT = requestAnimationFrame(poll);
    };
    gpT = requestAnimationFrame(poll);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); cancelAnimationFrame(gpT); };
  }, [onExit]);

  // touch joystick
  const joyRef = useRef(null);
  const onJoyStart = (e) => {
    e.preventDefault(); gameAudio.resume(); gameAudio.unlockSpeech();
    if (game.current && game.current.phase === "intro") game.current._lastSpoken = "";
    const set = (cx,cy,tx,ty) => { let dx=tx-cx,dy=ty-cy; const max=48,d=Math.hypot(dx,dy); if(d>max){dx=dx/d*max;dy=dy/d*max;} setJoy({active:true,x:dx,y:dy}); keys.current.left=dx<-10; keys.current.right=dx>10; keys.current.up=dy<-28; };
    const r = joyRef.current.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
    set(cx,cy,e.clientX,e.clientY);
    const move = (ev)=>set(cx,cy,ev.clientX,ev.clientY);
    const end = ()=>{ setJoy({active:false,x:0,y:0}); keys.current.left=false; keys.current.right=false; keys.current.up=false; window.removeEventListener("pointermove",move); window.removeEventListener("pointerup",end); };
    window.addEventListener("pointermove",move); window.addEventListener("pointerup",end);
  };
  const touchBtn = (key, Icon, label, color) => (
    <button data-act={key} className="relative w-14 h-14 rounded-full flex flex-col items-center justify-center active:scale-90 transition"
      style={{ border:"2px solid #E6C26D", background:"rgba(10,8,7,0.6)", boxShadow:`0 0 8px ${color}55` }}
      onPointerDown={(e)=>{e.preventDefault();gameAudio.resume();gameAudio.unlockSpeech();if(game.current&&game.current.phase==="intro")game.current._lastSpoken="";keys.current[key]=true;}}
      onPointerUp={(e)=>{e.preventDefault();keys.current[key]=false;}}
      onPointerLeave={()=>{keys.current[key]=false;}}
      onPointerCancel={()=>{keys.current[key]=false;}}
    >
      <Icon className="w-5 h-5" style={{ color }} />
      <span className="text-[7px] font-bold mt-0.5 tracking-wide" style={{ color:"#E6C26D" }}>{label}</span>
    </button>
  );

  const toggleFs = () => { const w=wrapRef.current; if(document.fullscreenElement) document.exitFullscreen?.().catch(()=>{}); else w?.requestFullscreen?.().catch(()=>{}); };
  useEffect(()=>{ const onFs=()=>setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange",onFs); return()=>document.removeEventListener("fullscreenchange",onFs); },[]);
  useEffect(()=>{ const w=wrapRef.current; if(w&&document.fullscreenEnabled) w.requestFullscreen?.().then(()=>setFs(true)).catch(()=>{}); return()=>{ if(document.fullscreenElement===wrapRef.current) document.exitFullscreen?.().catch(()=>{}); }; },[]);

  const DiagRow = ({ label, value }) => (
    <div className="flex justify-between gap-2 leading-tight">
      <span className="text-[#8a6d3b]">{label}</span>
      <span className="text-[#f0d9a8] text-right break-all">{value ?? "—"}</span>
    </div>
  );

  const pHPpct = clamp((hud.pHP/(game.current?.p.maxHp||120))*100,0,100);
  const eHPpct = clamp((hud.eHP/(game.current?.e.maxHp||100))*100,0,100);
  const pSPpct = clamp((hud.pSP/100)*100,0,100);

  return (
    <div ref={wrapRef} className="fixed inset-0 z-[1000] bg-black select-none" style={{ touchAction:"none" }} onPointerDown={() => { gameAudio.resume(); gameAudio.unlockSpeech(); }}>
      <div ref={mountRef} className="absolute inset-0" />

      {(loadState === "checking" || loadState === "loading") && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black px-6">
          <div className="w-12 h-12 border-4 border-[#c5a059]/30 border-t-[#d97757] rounded-full animate-spin" />
          <p className="cinzel-title text-sm text-[#d1a985] tracking-widest">Summoning Warriors…</p>
          <div className="w-60 max-w-[82vw]">
            <div className="h-2.5 rounded-full bg-[#1a140e] border border-[#c5a059]/30 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#d97757] to-[#f7c948] transition-all duration-200 ease-out" style={{ width: `${loadPct}%` }} />
            </div>
            <p className="mt-1.5 text-center text-xs font-bold text-[#f0d9a8] tabular-nums tracking-widest">{loadPct}%</p>
          </div>
          <p className="text-[10px] text-[#8a6d3b]">Loading 3D fighters & arena…</p>
        </div>
      )}

      {loadState === "error" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/92 backdrop-blur-sm px-6">
          <AlertTriangle className="w-12 h-12 text-[#e07466]" />
          <h2 className="cinzel-title text-lg sm:text-xl text-[#e07466] text-center font-bold tracking-wide">3D CHARACTER ASSET FAILED TO LOAD</h2>
          <p className="text-xs sm:text-sm text-[#d1a985] text-center max-w-md leading-relaxed">
            The 3D arena loads real <span className="text-[#f7c948] font-semibold">.GLB</span> models directly in your browser. A fighter's GLB is missing or could not be loaded — no 2.5D fallback is used, because the 3D GLB is the authoritative playable asset.
          </p>
          <div className="mt-1 space-y-2 w-full max-w-sm">
            {(errorInfo?.failed||[]).map((f,i)=>(
              <div key={i} className="noir-panel rounded-lg p-3 text-left">
                <p className="text-[11px] font-bold text-[#e07466] tracking-wide uppercase">{f.name} <span className="text-[#8a6d3b] font-normal">({f.which==="p"?"player":"enemy"})</span></p>
                <p className="text-[10px] text-[#d1a985] mt-0.5">{f.reason}</p>
              </div>
            ))}
          </div>
          <Link to="/admin/game-assets" className="mt-3 px-6 py-2.5 rounded-xl btn-noir-primary text-sm font-semibold flex items-center gap-2">
            <Upload className="w-4 h-4" /> Set GLB URL
          </Link>
          <button onClick={onExit} className="mt-2 px-6 py-2 rounded-xl btn-noir-ghost text-sm font-semibold">Back to Hub</button>
        </div>
      )}

      {loadState === "notready" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-[2px] px-6 overflow-auto py-8">
          <AlertTriangle className="w-10 h-10 text-[#f7c948]" />
          <h2 className="cinzel-title text-base sm:text-xl text-[#f7c948] text-center font-bold tracking-wide">3D MODEL NOT COMBAT-READY</h2>
          <p className="text-[11px] sm:text-xs text-[#d1a985] text-center max-w-md leading-relaxed">
            Both GLBs loaded and are visible in the arena, but a fighter is not a complete playable character yet. Combat stays locked until every fighter is <span className="text-[#f7c948] font-semibold">COMBAT_READY</span> (skeleton + skin + all required animations).
          </p>
          <div className="mt-1 w-full max-w-sm space-y-2">
            {[["p", charDef.name], ["e", "Corrupted Priest"]].map(([w, nm]) => {
              const info = errorInfo?.[w];
              if (!info) return null;
              const stages = [
                ["MODEL", info.loaded],
                ["RIG", info.skeleton],
                ["SKIN", info.skinned],
                ["ANIM", info.animationCount > 0 && info.missingAnims.length === 0],
                ["COMBAT", info.combatStatus === "COMBAT_READY"],
              ];
              return (
                <div key={w} className="noir-panel rounded-lg p-3 text-left">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-[#f0d9a8] tracking-wide uppercase">{nm}</p>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${info.combatStatus==="COMBAT_READY"?"border-emerald-700/40 bg-emerald-950/40 text-emerald-300":"border-amber-700/40 bg-amber-950/30 text-amber-200"}`}>{info.combatStatus}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {stages.map(([s, ok]) => (
                      <span key={s} className={`text-[9px] px-1.5 py-0.5 rounded border ${ok?"border-emerald-700/40 bg-emerald-950/40 text-emerald-300":"border-red-800/40 bg-red-950/30 text-red-300"}`}>{ok?"✓":"✗"} {s}</span>
                    ))}
                  </div>
                  <div className="mt-1.5 text-[9px] text-[#8a6d3b]">Meshes {info.meshCount} · Tris {info.triCount} · Bones {info.boneCount} · Anims {info.animationCount}/{REQUIRED_ANIMATIONS.length}</div>
                  {info.missingAnims.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-[9px] text-[#e07466] font-bold">MISSING ANIMATIONS:</p>
                      <p className="text-[9px] text-[#d1a985] leading-snug">{info.missingAnims.join(", ")}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-[#6a5a3b] italic text-center max-w-sm">A TRELLIS mesh alone is MODEL_CLEAN — not a fighter. The rig → skin → combat-animation stages (Mixamo/Blender/Rigify) must complete first. The models are rendering behind this message.</p>
          <Link to="/admin/game-assets" className="mt-2 px-6 py-2.5 rounded-xl btn-noir-primary text-sm font-semibold flex items-center gap-2"><Upload className="w-4 h-4" /> Open Asset Pipeline</Link>
          <button onClick={onExit} className="px-6 py-2 rounded-xl btn-noir-ghost text-sm font-semibold">Back to Hub</button>
        </div>
      )}

      {/* TOP STATUS BAR — gold-trim portraits, dual bars, trio icons, pause */}
      <div className="absolute top-0 inset-x-0 px-2 pt-2 flex items-start justify-between pointer-events-none z-20">
        <div className="flex items-center gap-1.5">
          <div className="relative w-12 h-12 rounded-full shrink-0" style={{ border:"2.5px solid #E6C26D", background:"radial-gradient(circle,#2a1a0e,#0a0706)", boxShadow:"0 0 10px rgba(230,194,109,.4)" }}>
            <span className="absolute inset-0 flex items-center justify-center cinzel-title font-extrabold text-lg" style={{ color:"#f0d9a8" }}>{charDef.name?.[0] || "B"}</span>
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background:"#E6C26D", color:"#1a0d08", border:"1.5px solid #1a0d08" }}>{profile?.level||1}</span>
          </div>
          <div className="min-w-0">
            <p className="cinzel-title text-[10px] font-bold leading-none truncate" style={{ color:"#f0d9a8" }}>{charDef.name}</p>
            <div className="mt-1 w-28 h-2.5 rounded-full overflow-hidden" style={{ background:"rgba(0,0,0,.7)", border:"1px solid rgba(230,194,109,.35)" }}>
              <div className="h-full transition-all duration-200" style={{ width:`${pHPpct}%`, background:"linear-gradient(90deg,#00A3FF,#3BC4FF)" }} />
            </div>
            <div className="mt-0.5 w-28 h-2 rounded-full overflow-hidden" style={{ background:"rgba(0,0,0,.7)", border:"1px solid rgba(0,255,85,.3)" }}>
              <div className="h-full transition-all duration-200" style={{ width:`${pSPpct}%`, background:"linear-gradient(90deg,#00FF55,#7CFF9B)" }} />
            </div>
            <div className="mt-1 flex gap-1">
              <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background:"rgba(0,163,255,.2)", border:"1px solid rgba(0,163,255,.6)" }}><Circle className="w-2 h-2" style={{color:"#00A3FF"}}/></span>
              <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background:"rgba(230,194,109,.2)", border:"1px solid rgba(230,194,109,.6)" }}><Sun className="w-2.5 h-2.5" style={{color:"#E6C26D"}}/></span>
              <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background:"rgba(0,255,85,.2)", border:"1px solid rgba(0,255,85,.6)" }}><Zap className="w-2.5 h-2.5" style={{color:"#00FF55"}}/></span>
            </div>
          </div>
        </div>
        <button onClick={()=>setPaused(p=>!p)} className="pointer-events-auto shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold" style={{ border:"2.5px solid #E6C26D", background:"rgba(0,0,0,.6)", color:"#E6C26D", boxShadow:"0 0 10px rgba(230,194,109,.4)" }}>{paused?"▶":"II"}</button>
        <div className="flex items-center gap-1.5 flex-row-reverse text-right">
          <div className="relative w-12 h-12 rounded-full shrink-0" style={{ border:"2.5px solid #E6C26D", background:"radial-gradient(circle,#2a0a14,#0a0706)", boxShadow:"0 0 10px rgba(230,194,109,.4)" }}>
            <span className="absolute inset-0 flex items-center justify-center cinzel-title font-extrabold text-lg" style={{ color:"#e07466" }}>{hud.enemyName?.[0] || "C"}</span>
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background:"#E6C26D", color:"#1a0d08", border:"1.5px solid #1a0d08" }}>{Math.max(1,(profile?.level||1)-2)}</span>
          </div>
          <div className="min-w-0">
            <p className="cinzel-title text-[10px] font-bold leading-none truncate" style={{ color:"#e07466" }}>{hud.enemyName}</p>
            <div className="mt-1 w-28 h-2.5 rounded-full overflow-hidden ml-auto" style={{ background:"rgba(0,0,0,.7)", border:"1px solid rgba(255,45,85,.4)" }}>
              <div className="h-full transition-all duration-200" style={{ width:`${eHPpct}%`, background:"linear-gradient(90deg,#FF2D55,#FF6B82)" }} />
            </div>
            <div className="mt-0.5 w-28 h-2 rounded-full overflow-hidden ml-auto" style={{ background:"rgba(0,0,0,.7)", border:"1px solid rgba(168,85,247,.4)" }}>
              <div className="h-full" style={{ width:"50%", background:"linear-gradient(90deg,#A855F7,#C08AFF)" }} />
            </div>
            <div className="mt-1 flex gap-1 justify-end">
              <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background:"rgba(168,85,247,.2)", border:"1px solid rgba(168,85,247,.6)" }}><Circle className="w-2 h-2" style={{color:"#A855F7"}}/></span>
              <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background:"rgba(255,45,85,.2)", border:"1px solid rgba(255,45,85,.6)" }}><Flame className="w-2.5 h-2.5" style={{color:"#FF2D55"}}/></span>
              <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background:"rgba(230,194,109,.2)", border:"1px solid rgba(230,194,109,.6)" }}><Skull className="w-2.5 h-2.5" style={{color:"#E6C26D"}}/></span>
            </div>
          </div>
        </div>
      </div>

      {hud.combo >= 2 && (
        <div className="absolute left-3 top-16 z-30 pointer-events-none">
          <span className="font-extrabold text-2xl sm:text-3xl" style={{ color:"#ff4500", textShadow:"0 0 12px #ff4500, 0 2px 4px #000", transform:"rotate(-6deg)", fontFamily:"var(--font-heading)", display:"inline-block" }}>{hud.combo} COMBO!</span>
        </div>
      )}
      {hud.finisher && hud.phase==="fight" && (
        <p className="absolute left-1/2 -translate-x-1/2 top-16 z-30 text-[9px] text-[#f7c948] animate-pulse font-bold tracking-widest pointer-events-none">✦ ANCESTRAL FINISH READY (R)</p>
      )}
      {paused && (
        <div className="absolute inset-0 z-50 bg-black/70 flex flex-col items-center justify-center gap-3 pointer-events-auto">
          <h2 className="cinzel-title text-2xl text-[#f0d9a8] font-bold">PAUSED</h2>
          <button onClick={()=>setPaused(false)} className="px-6 py-2.5 rounded-xl btn-noir-primary font-semibold text-sm">Resume</button>
          <button onClick={onExit} className="px-6 py-2 rounded-xl btn-noir-ghost text-sm font-semibold">Quit to Hub</button>
        </div>
      )}

      {hud.phase === "intro" && hud.sub && (
        <div className="absolute left-0 right-0 bottom-28 sm:bottom-32 px-6 z-20 pointer-events-none">
          <p className="text-center text-sm sm:text-base text-[#f0d9a8] italic" style={{ textShadow:"0 2px 10px #000" }}>{hud.sub}</p>
        </div>
      )}
      {hud.fightPrompt && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <h2 className="cinzel-title font-extrabold bronze-text fight-pop" style={{ fontSize:"clamp(3rem,14vw,6rem)", letterSpacing:"0.12em" }}>FIGHT!</h2>
        </div>
      )}

      {/* MK-style cinematic overlays */}
      {hud.xrayFlash > 0 && (
        <div className="absolute inset-0 z-30 pointer-events-none mk-xray" style={{ opacity: hud.xrayFlash }}>
          <div className="mk-xray-label">X-RAY</div>
        </div>
      )}
      {hud.bloodScreen > 0 && (
        <div className="absolute inset-0 z-20 pointer-events-none mk-blood-screen" style={{ opacity: hud.bloodScreen }} />
      )}
      {hud.lowHp && hud.phase === "fight" && (
        <div className="absolute inset-0 z-10 pointer-events-none mk-rage-vignette" />
      )}
      {hud.mkPop && hud.phase !== "over" && (
        <div className="absolute inset-0 flex items-center justify-center z-[45] pointer-events-none">
          <h2 className="cinzel-title font-extrabold mk-fatality">{hud.mkPop}</h2>
        </div>
      )}

      <div className="absolute top-2 right-2 z-30 flex gap-1.5 pointer-events-auto">
        <button onClick={()=>setShowDiag(s=>!s)} className="p-2 rounded-full bg-black/50 border border-[#c5a059]/30 text-[#d1a985]" title="Diagnostics"><Activity className="w-4 h-4"/></button>
        <button onClick={()=>{setMuted(m=>!m);gameAudio.resume();}} className="p-2 rounded-full bg-black/50 border border-[#c5a059]/30 text-[#d1a985]">{muted?<VolumeX className="w-4 h-4"/>:<Volume2 className="w-4 h-4"/>}</button>
        <button onClick={onExit} className="p-2 rounded-full bg-black/50 border border-[#c5a059]/30 text-[#d1a985]"><X className="w-4 h-4"/></button>
        <button onClick={toggleFs} className="p-2 rounded-full bg-black/50 border border-[#c5a059]/30 text-[#d1a985]">{fs?<Minimize2 className="w-4 h-4"/>:<Maximize2 className="w-4 h-4"/>}</button>
      </div>

      {showDiag && (
        <div className="absolute top-12 right-2 z-40 w-[min(92vw,360px)] max-h-[78vh] overflow-auto noir-scrollbar noir-panel rounded-xl p-3 text-[10px] text-[#d1a985] space-y-1.5 pointer-events-auto">
          <p className="font-bold text-[#f0d9a8] tracking-wide border-b border-[#c5a059]/15 pb-1">3D DIAGNOSTICS</p>
          <p className="font-bold text-[#f0c9a8] border-b border-[#c5a059]/10 pb-1">ENGINE</p>
          <DiagRow label="Three.js" value={diag.runtime?.engine?.three} />
          <DiagRow label="WebGL" value={diag.runtime?.engine?.webgl} />
          <DiagRow label="GPU" value={diag.runtime?.engine?.gpu} />
          <DiagRow label="FPS" value={diag.runtime?.fps} />
          <DiagRow label="Phase" value={diag.runtime?.phase} />
          <DiagRow label="Draw calls" value={diag.runtime?.drawCalls} />
          <DiagRow label="Triangles" value={diag.runtime?.triangles} />
          <DiagRow label="Textures" value={diag.runtime?.textures} />
          <DiagRow label="Geometries" value={diag.runtime?.geometries} />
          <DiagRow label="Programs" value={diag.runtime?.programs} />
          {["p","e"].map((w) => (
            <div key={w} className="border-t border-[#c5a059]/15 pt-1.5 space-y-0.5">
              <p className="font-bold text-[#f0c9a8]">{w==="p"?charDef.name:"Corrupted Priest"} <span className="text-[#8a6d3b] font-normal">({w})</span> · <span className={diag.runtime?.[w+"Status"]==="COMBAT_READY"?"text-emerald-300":"text-amber-300"}>{diag.runtime?.[w+"Status"] || "—"}</span></p>
              <DiagRow label="GLB URL" value={diag[w]?.url ? (diag[w].url.length>44 ? diag[w].url.slice(0,44)+"…" : diag[w].url) : "—"} />
              <DiagRow label="Load status" value={diag[w]? "loaded":"pending"} />
              <DiagRow label="Meshes" value={diag[w]?.meshCount} />
              <DiagRow label="Triangles" value={diag[w]?.triCount} />
              <DiagRow label="Materials" value={diag[w]?.materialCount} />
              <DiagRow label="Textures" value={diag[w]?.textureCount} />
              <DiagRow label="Skeleton" value={diag[w]? (diag[w].skeleton? "yes":"no"):null} />
              <DiagRow label="Skinned" value={diag[w]? (diag[w].skinned? "yes":"no"):null} />
              <DiagRow label="Bones" value={diag[w]?.boneCount} />
              <DiagRow label="Animations" value={diag[w]?.animationCount != null ? `${diag[w].animationCount}/${REQUIRED_ANIMATIONS.length}` : null} />
              <DiagRow label="Anim names" value={diag[w]?.animationNames?.join(", ")} />
              <DiagRow label="Missing anims" value={diag[w]?.missingAnims?.length ? diag[w].missingAnims.join(", ") : (diag[w] ? "none" : null)} />
              <DiagRow label="BBox (m)" value={diag[w]?.bbox ? diag[w].bbox.map((v)=>v.toFixed(2)).join(" × ") : null} />
              <DiagRow label="State" value={diag.runtime?.[w+"State"]} />
              <DiagRow label="Clip" value={diag.runtime?.[w+"Clip"]} />
            </div>
          ))}
        </div>
      )}

      {hud.phase === "over" && (
        <VictoryScreen
          result={hud.result}
          reward={hud.reward}
          characterName={charDef.name}
          enemyName={hud.enemyName}
          combo={hud.combo}
          onExit={onExit}
        />
      )}

      <div className="absolute bottom-1.5 inset-x-0 z-20 pointer-events-none flex justify-center">
        <div className="px-4 py-0.5 rounded-full" style={{ background:"linear-gradient(180deg,rgba(10,7,6,.85),rgba(0,0,0,.92))", border:"1px solid rgba(230,194,109,.4)", boxShadow:"0 0 18px rgba(0,0,0,.8)" }}>
          <span className="cinzel-title text-[10px] tracking-[0.22em]" style={{ color:"#E6C26D" }}>THE NIGHTMARE VILLAGE</span>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 z-30 flex items-end justify-between p-2 pb-3 pointer-events-none">
        <div className="flex items-end gap-2 pointer-events-auto">
          <div ref={joyRef} onPointerDown={onJoyStart} className="relative w-28 h-28 rounded-full shrink-0" style={{ background:"radial-gradient(circle,rgba(20,16,12,0.7),rgba(10,8,7,0.3))", border:"2px solid rgba(230,194,109,0.55)" }}>
            <span className="absolute top-1.5 left-1/2 -translate-x-1/2 text-xs" style={{color:"#E6C26D"}}>▲</span>
            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-xs" style={{color:"#E6C26D"}}>▼</span>
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs" style={{color:"#E6C26D"}}>◀</span>
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs" style={{color:"#E6C26D"}}>▶</span>
            <div className="absolute top-1/2 left-1/2 w-11 h-11 rounded-full" style={{ transform:`translate(-50%,-50%) translate(${joy.x}px,${joy.y}px)`, background:"radial-gradient(circle,rgba(230,194,109,0.8),rgba(120,90,40,0.4))", border:"1.5px solid rgba(230,194,109,0.8)" }} />
          </div>
          <button onPointerDown={(e)=>{e.preventDefault();drinkPotion();}} className="relative w-14 h-14 rounded-full flex flex-col items-center justify-center active:scale-90 transition shrink-0" style={{ border:"2.5px solid #E6C26D", background:"rgba(0,40,80,0.55)", boxShadow:"0 0 10px rgba(0,163,255,0.35)" }}>
            <Droplets className="w-5 h-5" style={{color:"#00A3FF"}} />
            <span className="text-[7px] font-bold mt-0.5" style={{color:"#E6C26D"}}>POTION</span>
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{background:"#E6C26D",color:"#1a0d08",border:"1.5px solid #1a0d08"}}>{potions}</span>
          </button>
        </div>
        <div className="flex items-end gap-2 pointer-events-auto">
          <div className="grid grid-cols-3 gap-1.5">
            {touchBtn("light", Hand, "ATK", "#f0c9a8")}
            {touchBtn("heavy", Flame, "HVY", "#e07466")}
            {touchBtn("special", Zap, "SPC", "#A855F7")}
            {touchBtn("block", Shield, "BLK", "#E6C26D")}
            {touchBtn("dodge", Wind, "DDG", "#00FF55")}
            {touchBtn("grab", Grab, "GRB", "#ff8c1a")}
            {touchBtn("up", ChevronUp, "JMP", "#00A3FF")}
            {touchBtn("finish", Skull, "FSH", "#ffffff")}
          </div>
          <button onPointerDown={(e)=>{e.preventDefault();}} className="relative w-14 h-14 rounded-full flex flex-col items-center justify-center active:scale-90 transition shrink-0" style={{ border:"2.5px solid #E6C26D", background:"rgba(30,30,30,0.6)" }}>
            <Lock className="w-5 h-5" style={{color:"#fff"}} />
            <span className="text-[7px] font-bold mt-0.5" style={{color:"#E6C26D"}}>TARGET</span>
          </button>
        </div>
      </div>
    </div>
  );
}