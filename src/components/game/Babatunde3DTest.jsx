import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { base44 } from "@/api/base44Client";
import { loadFighterCharacter } from "@/lib/fighterLoader";
import { createFighterAnimator } from "@/lib/fighterAnimator";
import { REQUIRED_COMBAT_STATES } from "@/lib/fighterAnimationState";
import { getFighterConfig } from "@/lib/fighterCharacters";
import { Activity, X, AlertTriangle, Box, Bone, ShieldCheck } from "lucide-react";

// BABATUNDE 3D TEST — loads the REAL rigged GLB from the player GameCharacterAsset
// (model_3d_url), renders the real 3D human mesh with original materials, hides
// the skeleton in normal mode, plays the embedded Idle/Walk/Run/Wave animations
// via AnimationMixer, and provides test buttons + movement controls + diagnostics.
// No 2D fallback: if the GLB is missing or fails, an error is shown.

const TEST_ANIMS = ["idle", "walk", "run", "wave"];
const COMBAT_ANIMS = [
  { id: "lightPunch", label: "LIGHT PUNCH" },
  { id: "heavyPunch", label: "HEAVY PUNCH" },
  { id: "lightKick", label: "LIGHT KICK" },
  { id: "heavyKick", label: "HEAVY KICK" },
  { id: "special", label: "SPECIAL" },
  { id: "block", label: "BLOCK" },
  { id: "dodge", label: "DODGE" },
  { id: "grab", label: "GRAB" },
  { id: "throw", label: "THROW" },
  { id: "hit", label: "HIT" },
  { id: "stagger", label: "STAGGER" },
  { id: "knockdown", label: "KNOCKDOWN" },
  { id: "getUp", label: "GET UP" },
  { id: "finisher", label: "FINISHER" },
  { id: "death", label: "DEATH" },
  { id: "victory", label: "VICTORY" },
];

export default function Babatunde3DTest() {
  const mountRef = useRef(null);
  const st = useRef({}); // three.js handles + playAnimation
  const input = useRef({ forward: false, backward: false, left: false, right: false, run: false });
  const [modelUrl, setModelUrl] = useState(null);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | error | nourl
  const [diag, setDiag] = useState(null);
  const [currentAnim, setCurrentAnim] = useState("");
  const [debug3D, setDebug3D] = useState(
    () => new URLSearchParams(window.location.search).get("debug") === "1"
  );
  const [showTouch, setShowTouch] = useState(false);
  const [fps, setFps] = useState(0);
  const [installedStates, setInstalledStates] = useState([]);
  const [curState, setCurState] = useState("idle");

  // Resolve the Babatunde model URL: the fighter registry is authoritative (the
  // repaired realistic GLB). Fall back to the DB GameCharacterAsset record.
  useEffect(() => {
    const registryUrl = getFighterConfig("babatunde")?.modelUrl;
    if (registryUrl) { setModelUrl(registryUrl); return; }
    (async () => {
      try {
        const recs = await base44.entities.GameCharacterAsset.list();
        const p = recs.find((r) => r.role === "player");
        if (p?.model_3d_url) setModelUrl(p.model_3d_url);
        else setLoadState("nourl");
      } catch (e) {
        setLoadState("error");
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)) {
      setShowTouch(true);
    }
  }, []);

  const triggerAnim = useCallback((name) => {
    st.current.playAnimation?.(name);
  }, []);

  // Play a combat state through the reusable animator (real clips only — never
  // substitutes). Returns to idle through the animator when the one-shot finishes.
  const playCombat = useCallback((state, label) => {
    const ok = st.current.animator?.play(state, {
      onFinish: () => { st.current.animator?.play("idle", { loop: true }); setCurrentAnim("Idle"); },
    });
    if (ok) setCurrentAnim(label);
  }, []);

  // Three.js scene + fighter load (one render loop).
  useEffect(() => {
    if (!modelUrl) return;
    let disposed = false;
    const mount = mountRef.current;
    const width = mount.clientWidth || 393;
    const height = mount.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // mobile-safe
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2030);
    scene.fog = new THREE.Fog(0x1a2030, 12, 40);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 5);

    // Cinematic PBR lighting (not flat white / wireframe)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.95));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(4, 9, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 30;
    dir.shadow.camera.left = -6; dir.shadow.camera.right = 6;
    dir.shadow.camera.top = 6; dir.shadow.camera.bottom = -6;
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.55);
    fill.position.set(-4, 3, -5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffcc88, 0.5);
    rim.position.set(2, 4, -6);
    scene.add(rim);

    // Ground + contact shadow
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x14141e, roughness: 0.85, metalness: 0.08 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    scene.add(blob);

    // Debug-only OrbitControls
    let controls = null;
    let skeletonHelper = null;
    let bboxHelper = null;

    let mixer = null;
    let model = null;
    let clips = {};
    let activeAction = null;
    let curAnim = "";
    let lastMoving = false;

    const playAnimation = (name) => {
      if (!mixer) return;
      const key = String(name).toLowerCase();
      let clip = clips[key];
      if (!clip) {
        const entry = Object.entries(clips).find(([n]) => n.includes(key));
        if (entry) clip = entry[1];
      }
      if (!clip) {
        setDiag((d) => ({ ...(d || {}), note: `${name.toUpperCase()} ANIMATION NOT FOUND` }));
        return;
      }
      const newAction = mixer.clipAction(clip);
      newAction.setLoop(THREE.LoopRepeat, Infinity);
      if (activeAction && activeAction !== newAction) activeAction.fadeOut(0.2);
      newAction.reset().fadeIn(0.2).play();
      activeAction = newAction;
      curAnim = clip.name;
      setCurrentAnim(clip.name);
    };
    st.current.playAnimation = playAnimation;

    const updateMovement = () => {
      if (!model) return;
      const inp = input.current;
      const dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const dz = (inp.forward ? 1 : 0) - (inp.backward ? 1 : 0);
      const speed = inp.run ? 0.09 : 0.05;
      const isMoving = !!(dx || dz);
      if (isMoving) {
        const len = Math.hypot(dx, dz) || 1;
        model.position.x += (dx / len) * speed;
        model.position.z += (dz / len) * speed;
        model.rotation.y = Math.atan2(dx, dz); // face movement direction (stable, not spinning)
        blob.position.x = model.position.x;
        blob.position.z = model.position.z;
        if (inp.run && curAnim.toLowerCase() !== "run") playAnimation("run");
        else if (!inp.run && curAnim.toLowerCase() !== "walk") playAnimation("walk");
      } else if (lastMoving) {
        // Just stopped moving → return to idle. Manual clips (Wave, or a button-previews
        // Walk/Run while stationary) are NOT overridden because lastMoving is false then.
        playAnimation("idle");
      }
      lastMoving = isMoving;
    };

    // load the real fighter
    (async () => {
      try {
        const fighter = await loadFighterCharacter(modelUrl);
        if (disposed) return;
        model = fighter.model;
        mixer = fighter.mixer;
        clips = fighter.clips;

        // Build the reusable animator over the loaded clips. A combat state is
        // INSTALLED only when a real clip (GLB-embedded or BVH) exists — never
        // faked. Until real combat clips are installed: COMBAT ANIMATIONS =
        // NOT INSTALLED, combat test buttons stay disabled.
        const animator = createFighterAnimator({ mixer, clips });
        st.current.animator = animator;
        setInstalledStates(Array.from(animator.installedStates));
        const installedCombat = REQUIRED_COMBAT_STATES.filter((s) => animator.isInstalled(s));
        const combatInstalled = installedCombat.length > 0;
        const combatReady = installedCombat.length === REQUIRED_COMBAT_STATES.length;

        // Center + ground the character (feet on the floor, no float, no sink)
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;
        scene.add(model);

        // Auto-frame camera from bounding box (full body visible, feet not cropped)
        const h = size.y || 1.8;
        const dist = h * 2.4;
        camera.position.set(0, h * 0.58, dist);
        camera.lookAt(0, h * 0.46, 0);

        blob.scale.setScalar(Math.max(0.7, size.x * 0.6));

        if (debug3D) {
          const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
          controls = new OrbitControls(camera, renderer.domElement);
          controls.target.set(0, h * 0.46, 0);
          controls.update();
          skeletonHelper = new THREE.SkeletonHelper(model);
          scene.add(skeletonHelper); // OVER the mesh — mesh stays visible
          bboxHelper = new THREE.Box3Helper(box, 0x00ff00);
          scene.add(bboxHelper);
        }

        setDiag({
          ...fighter.diagnostics,
          animationCount: Object.keys(clips).length,
          glb: "LOADED",
          mixer: "ACTIVE",
          current: "Idle",
          skeletonVisible: debug3D ? "YES" : "NO",
          webgl: "READY",
          modelStatus: fighter.diagnostics.rigged ? "RIGGED" : "FAILED",
          combatAnimations: `${installedCombat.length}/${REQUIRED_COMBAT_STATES.length}`,
          combatReady: combatReady ? "TRUE" : "FALSE",
          animsReady: `${installedCombat.length}/${REQUIRED_COMBAT_STATES.length}`,
        });

        // Initial animation: Idle (fallback to Bind, then first clip)
        if (clips["idle"]) playAnimation("idle");
        else if (clips["bind"]) playAnimation("bind");
        else if (Object.keys(clips).length) playAnimation(Object.values(clips)[0].name);

        setLoadState("ready");
      } catch (e) {
        console.error("Fighter load failed:", e);
        if (!disposed) setLoadState("error");
      }
    })();

    const clock = new THREE.Clock();
    let raf = 0;
    let fpsCount = 0;
    let fpsT = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      fpsCount++;
      if (performance.now() - fpsT > 1000) {
        setFps(fpsCount);
        setCurState(st.current.animator?.getState() || "idle");
        fpsCount = 0;
        fpsT = performance.now();
      }
      updateMovement();
      if (mixer) mixer.update(dt);
      if (controls) controls.update();
      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      if (controls) controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) { Array.isArray(o.material) ? o.material.forEach((m) => m.dispose?.()) : o.material.dispose?.(); }
      });
    };
  }, [modelUrl, debug3D]);

  // Keyboard: WASD move, I/O/P/L anims, Shift = run
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (k === "w") input.current.forward = true;
      if (k === "s") input.current.backward = true;
      if (k === "a") input.current.left = true;
      if (k === "d") input.current.right = true;
      if (k === "shift") input.current.run = true;
      if (k === "i") triggerAnim("idle");
      if (k === "o") triggerAnim("walk");
      if (k === "p") triggerAnim("run");
      if (k === "l") triggerAnim("wave");
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      if (k === "w") input.current.forward = false;
      if (k === "s") input.current.backward = false;
      if (k === "a") input.current.left = false;
      if (k === "d") input.current.right = false;
      if (k === "shift") input.current.run = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [triggerAnim]);

  const touchBtn = (key, label) => (
    <button
      className="w-14 h-14 rounded-full border-2 border-[#c5a059]/50 bg-white/10 text-[#f0d9a8] text-xl font-bold flex items-center justify-center active:bg-white/30 select-none"
      onPointerDown={(e) => { e.preventDefault(); input.current[key] = true; }}
      onPointerUp={(e) => { e.preventDefault(); input.current[key] = false; }}
      onPointerLeave={() => { input.current[key] = false; }}
      onPointerCancel={() => { input.current[key] = false; }}
    >{label}</button>
  );

  const DiagRow = ({ label, value, ok }) => (
    <div className="flex justify-between gap-2 leading-tight">
      <span className="text-[#8a6d3b]">{label}</span>
      <span className={ok === true ? "text-emerald-300" : ok === false ? "text-red-300" : "text-[#f0d9a8]"}>{value ?? "—"}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[1000] bg-black select-none" style={{ touchAction: "none" }}>
      <div ref={mountRef} className="absolute inset-0" />

      {/* status line */}
      <div id="anim-status" className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/60 border border-[#c5a059]/30 text-[11px] text-[#f0d9a8] tracking-wide">
        {loadState === "ready" ? `Playing: ${currentAnim}` : loadState === "loading" ? "Loading real Babatunde GLB…" : loadState === "nourl" ? "BABATUNDE MODEL URL NOT CONFIGURED" : "3D CHARACTER ASSET FAILED TO LOAD"}
      </div>

      {/* test buttons */}
      {loadState === "ready" && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {TEST_ANIMS.map((a) => (
            <button
              key={a}
              onClick={() => triggerAnim(a)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${currentAnim.toLowerCase() === a ? "btn-noir-primary border-transparent" : "bg-black/50 border-[#c5a059]/40 text-[#d1a985]"}`}
            >{a.toUpperCase()}</button>
          ))}
        </div>
      )}

      {loadState === "ready" && (() => {
        const installedCombatCount = COMBAT_ANIMS.filter((a) => installedStates.includes(a.id)).length;
        return (
        <div className="absolute top-[4.6rem] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 max-w-[94vw]">
          <div className="text-[9px] tracking-widest uppercase text-[#8a6d3b]">
            COMBAT ANIMATIONS: {installedCombatCount}/{COMBAT_ANIMS.length}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 max-w-[94vw]">
            {COMBAT_ANIMS.map((a) => {
              const installed = installedStates.includes(a.id);
              return (
                <button
                  key={a.id}
                  disabled={!installed}
                  title={installed ? `Play ${a.label}` : "Animation not installed"}
                  onClick={() => { if (installed) playCombat(a.id, a.label); }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${installed ? (curState === a.id ? "btn-noir-primary border-transparent" : "bg-black/50 border-[#d97757]/40 text-[#f0c9a8]") : "bg-black/40 border-[#6a5a3b]/40 text-[#6a5a3b] opacity-60 cursor-not-allowed"}`}
                >{installed ? a.label : "NOT INSTALLED"}</button>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* close */}
      <a href="/game" className="absolute top-2 right-2 z-30 p-2 rounded-full bg-black/50 border border-[#c5a059]/30 text-[#d1a985]"><X className="w-4 h-4" /></a>

      {/* diagnostics (test/debug page — visible here per spec §21) */}
      {debug3D && diag && (
        <div className="absolute top-16 right-2 z-30 w-[min(92vw,300px)] max-h-[70vh] overflow-auto noir-panel rounded-xl p-3 text-[10px] space-y-0.5">
          <p className="font-bold text-[#f0d9a8] tracking-wide border-b border-[#c5a059]/15 pb-1 mb-1">BABATUNDE 3D STATUS</p>
          <DiagRow label="GLB" value={diag.glb} ok={diag.glb === "LOADED"} />
          <DiagRow label="Meshes" value={diag.meshCount} ok={diag.meshCount > 0} />
          <DiagRow label="Skinned meshes" value={diag.skinnedMeshCount} ok={diag.skinnedMeshCount > 0} />
          <DiagRow label="Materials" value={diag.materialCount} ok={diag.materialCount > 0} />
          <DiagRow label="Skeleton" value={diag.boneCount > 0 ? "YES" : "NO"} ok={diag.boneCount > 0} />
          <DiagRow label="Bones" value={diag.boneCount} />
          <DiagRow label="Skin weights" value={diag.skinWeights} ok={diag.skinWeights === "PASS"} />
          <DiagRow label="Animations" value={diag.animationCount} ok={diag.animationCount > 0} />
          <DiagRow label="Current clip" value={currentAnim || "—"} />
          <DiagRow label="Current state" value={curState} />
          <DiagRow label="Mixer" value={diag.mixer} ok={diag.mixer === "ACTIVE"} />
          <DiagRow label="Textures" value={diag.textures} ok={diag.textures === "OK"} />
          <DiagRow label="WebGL" value={diag.webgl} ok={diag.webgl === "READY"} />
          <DiagRow label="Skeleton visible" value={diag.skeletonVisible} ok={diag.skeletonVisible === "NO"} />
          <DiagRow label="Model status" value={diag.modelStatus} ok={diag.modelStatus === "RIGGED"} />
          <DiagRow label="Combat animations" value={diag.combatAnimations} ok={diag.combatReady === "TRUE"} />
          <DiagRow label="Combat ready" value={diag.combatReady} ok={diag.combatReady === "TRUE"} />
          <DiagRow label="Anims ready" value={diag.animsReady} ok={diag.combatReady === "TRUE"} />
          <DiagRow label="FPS" value={fps} />
          {diag.note && <p className="text-red-300 mt-1">{diag.note}</p>}
        </div>
      )}

      {/* error / no-url states — no 2D fallback */}
      {(loadState === "error" || loadState === "nourl") && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 px-6 text-center">
          <AlertTriangle className="w-12 h-12 text-[#e07466]" />
          <h2 className="cinzel-title text-lg text-[#e07466] font-bold tracking-wide">
            {loadState === "nourl" ? "BABATUNDE MODEL URL NOT CONFIGURED" : "3D CHARACTER ASSET FAILED TO LOAD"}
          </h2>
          <p className="text-xs text-[#d1a985] max-w-md">
            {loadState === "nourl"
              ? "The player GameCharacterAsset has no model_3d_url. Set it in Admin → Game Assets. No substitute character is used."
              : "The real rigged GLB could not be loaded. No 2D fallback, sprite, or placeholder is substituted."}
          </p>
          <a href="/admin/game-assets" className="mt-2 px-6 py-2.5 rounded-xl btn-noir-primary text-sm font-semibold">Open Asset Pipeline</a>
          <a href="/game" className="px-6 py-2 rounded-xl btn-noir-ghost text-sm font-semibold">Back to Hub</a>
        </div>
      )}

      {/* loading */}
      {loadState === "loading" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black">
          <div className="w-10 h-10 border-4 border-[#c5a059]/30 border-t-[#d97757] rounded-full animate-spin" />
          <p className="cinzel-title text-sm text-[#d1a985] tracking-widest">Loading real Babatunde…</p>
        </div>
      )}

      {/* controls hint */}
      {loadState === "ready" && (
        <div className="absolute bottom-2 left-2 z-20 text-[10px] text-[#8a6d3b] bg-black/50 rounded-lg px-2 py-1 leading-snug">
          WASD move · Shift run · I Idle · O Walk · P Run · L Wave{debug3D ? " · drag to orbit" : " · ?debug=1 for diagnostics"}
        </div>
      )}

      {/* touch controls */}
      {showTouch && loadState === "ready" && (
        <div className="absolute bottom-6 inset-x-0 z-30 flex items-end justify-between px-5 pointer-events-none">
          <div className="flex gap-2 pointer-events-auto">
            {touchBtn("left", "←")}
            {touchBtn("right", "→")}
          </div>
          <div className="flex gap-2 pointer-events-auto">
            {touchBtn("backward", "↓")}
            {touchBtn("forward", "↑")}
          </div>
        </div>
      )}
    </div>
  );
}