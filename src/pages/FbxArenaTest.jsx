import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Loader2, Play } from "lucide-react";

// Generic FBX fighter + GLB arena test viewer (ported from the standalone
// HTML template). Paste your own hosted URLs, hit Load, and the fighter spawns
// with WASD movement + automatic animation playback inside the arena scene.
// Uses the app's installed `three` + dynamic addon imports (no external CDN).

const DEFAULT_FIGHTER = "https://media.base44.com/files/public/6a7364eea84550708f16a360/9fa067a6f_MariaWPropJJOngPunching.fbx";

export default function FbxArenaTest() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const playAnimRef = useRef(null);
  const [fighterUrl, setFighterUrl] = useState(DEFAULT_FIGHTER);
  const [arenaUrl, setArenaUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [statusMsg, setStatusMsg] = useState("Enter URLs and press Load");
  const [animList, setAnimList] = useState([]);
  const [currentAnim, setCurrentAnim] = useState("");

  const loadScene = async () => {
    // tear down any previous scene
    if (sceneRef.current) {
      sceneRef.current.dispose();
      sceneRef.current = null;
    }
    const mount = mountRef.current;
    if (!mount) return;
    mount.innerHTML = "";
    setStatus("loading");
    setStatusMsg("Loading assets…");

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 3, 10);
    camera.lookAt(0, 1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // default ground (removed if an arena GLB loads)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    let mixer = null;
    let fighterModel = null;
    const animations = {};
    let activeAction = null;
    let currentState = "";

    const playAnimation = (name) => {
      if (!mixer) return;
      const key = name.toLowerCase();
      const clip = animations[key] || Object.values(animations).find((c) => c.name.toLowerCase().includes(key));
      if (!clip) return;
      if (activeAction) activeAction.fadeOut(0.2);
      const action = mixer.clipAction(clip);
      action.reset().fadeIn(0.2).play();
      activeAction = action;
      currentState = key;
      setCurrentAnim(clip.name);
    };
    playAnimRef.current = playAnimation;

    // ---- Load arena GLB ----
    if (arenaUrl && arenaUrl !== "YOUR_ARENA_GLB_URL") {
      try {
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        const gltf = await new Promise((res, rej) => new GLTFLoader().load(arenaUrl, res, undefined, rej));
        const arena = gltf.scene;
        arena.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        scene.remove(ground);
        scene.add(arena);
        setStatusMsg((m) => m + " · Arena loaded");
      } catch (err) {
        console.error("Arena load failed:", err);
        setStatusMsg((m) => m + " · ARENA LOAD FAILED");
      }
    }

    // ---- Load fighter FBX ----
    if (fighterUrl && fighterUrl !== "YOUR_FIGHTER_FBX_URL") {
      try {
        const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
        const fbx = await new Promise((res, rej) => new FBXLoader().load(fighterUrl, res, undefined, rej));
        fighterModel = fbx;
        fighterModel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        // Auto-fit to ~1.7m so any FBX is visible regardless of its export scale.
        const box = new THREE.Box3().setFromObject(fighterModel);
        const size = new THREE.Vector3(); box.getSize(size);
        const targetH = 1.7;
        const s = targetH / (size.y || 1);
        fighterModel.scale.setScalar(s);
        const box2 = new THREE.Box3().setFromObject(fighterModel);
        const center = new THREE.Vector3(); box2.getCenter(center);
        fighterModel.position.x = -center.x;
        fighterModel.position.z = -center.z;
        fighterModel.position.y = -box2.min.y;
        scene.add(fighterModel);

        mixer = new THREE.AnimationMixer(fighterModel);
        fbx.animations.forEach((clip) => { animations[clip.name.toLowerCase()] = clip; });
        setAnimList(fbx.animations.map((c) => c.name));

        if (animations["idle"]) playAnimation("idle");
        else if (Object.keys(animations).length > 0) playAnimation(Object.keys(animations)[0]);
        setStatus("ready");
        setStatusMsg("Fighter loaded" + (fbx.animations.length ? ` · ${fbx.animations.length} animation(s)` : " (no animations)"));
      } catch (err) {
        console.error("Fighter load failed:", err);
        setStatus("error");
        setStatusMsg("FIGHTER LOAD FAILED — check URL / CORS");
      }
    } else {
      setStatus("error");
      setStatusMsg("NO FIGHTER URL SET");
    }

    // ---- Input ----
    const keys = {};
    const onKeyDown = (e) => {
      keys[e.code] = true;
      if (e.code === "Space" && animations["jump"]) playAnimation("jump");
    };
    const onKeyUp = (e) => { keys[e.code] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const updateMovement = () => {
      if (!fighterModel) return;
      const dx = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);
      const dz = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0);
      if (dx !== 0 || dz !== 0) {
        const len = Math.sqrt(dx * dx + dz * dz);
        fighterModel.position.x += (dx / len) * 0.08;
        fighterModel.position.z += (dz / len) * 0.08;
        fighterModel.rotation.y = Math.atan2(dx, dz);
        if (animations["walk"] && currentState !== "walk") playAnimation("walk");
        else if (animations["run"] && currentState !== "run" && len > 0.5) playAnimation("run");
      } else if ((currentState === "walk" || currentState === "run") && animations["idle"]) {
        playAnimation("idle");
      }
    };

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (mixer) mixer.update(delta);
      updateMovement();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    sceneRef.current = {
      dispose() {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); });
      },
    };
  };

  useEffect(() => {
    loadScene();
    return () => sceneRef.current?.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] bg-black overflow-hidden" style={{ fontFamily: "Arial, sans-serif" }}>
      <div ref={mountRef} className="absolute inset-0" />

      {/* Status */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
        <div className="bg-black/60 text-white text-sm rounded-md px-3 py-2 flex items-center gap-2">
          {status === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{statusMsg}</span>
        </div>
        <div className="bg-black/60 text-white text-xs rounded-md px-3 py-2 pointer-events-auto max-w-[55%]">
          <strong>Controls:</strong> WASD move · Space jump<br />
          <strong>Anim:</strong> {currentAnim || "—"}
        </div>
      </div>

      {/* URL config bar */}
      <div className="absolute bottom-0 inset-x-0 bg-black/75 backdrop-blur-sm p-3 space-y-2 pointer-events-auto">
        <div className="flex gap-2">
          <input
            value={fighterUrl}
            onChange={(e) => setFighterUrl(e.target.value)}
            placeholder="YOUR_FIGHTER_FBX_URL"
            className="flex-1 min-w-0 bg-black/50 border border-white/20 rounded-md px-3 py-2 text-xs text-white placeholder-white/30"
          />
          <input
            value={arenaUrl}
            onChange={(e) => setArenaUrl(e.target.value)}
            placeholder="YOUR_ARENA_GLB_URL (optional)"
            className="flex-1 min-w-0 bg-black/50 border border-white/20 rounded-md px-3 py-2 text-xs text-white placeholder-white/30"
          />
          <button
            onClick={loadScene}
            className="shrink-0 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition"
          >
            {status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Load
          </button>
        </div>
        {animList.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {animList.map((name) => (
              <button
                key={name}
                onClick={() => playAnimRef.current?.(name)}
                className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/20 text-white/80"
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}