import React, { useEffect, useRef, useState } from "react";
import { X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Credit-free Three.js GLB inspector. Loads the (temporary) generated model,
// grounds & frames it, and reports real PASS/FAIL for each required check by
// actually parsing the GLB — not by trusting the concept sheet. Writes the
// result back to the record via onValidated so the admin diagnostic panel
// persists. No combat logic; pure inspection.
export default function GlbTestViewer({ url, characterName, onValidated, onClose }) {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checks, setChecks] = useState(null);

  useEffect(() => {
    let renderer, scene, camera, controls, raf, disposed = false;
    const loader = new GLTFLoader();

    const run = async () => {
      try {
        const gltf = await loader.loadAsync(url);
        if (disposed) return;
        const model = gltf.scene;

        // ---- collect real diagnostics from the loaded GLB ----
        let meshCount = 0, triCount = 0, matSet = new Set(), texCount = 0, boneCount = 0;
        model.traverse((o) => {
          if (o.isMesh) {
            meshCount++;
            const g = o.geometry;
            if (g?.index) triCount += g.index.count / 3;
            else if (g?.attributes?.position) triCount += g.attributes.position.count / 3;
            if (o.material) {
              matSet.add(o.material.uuid);
              for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"]) {
                if (o.material[k]) texCount++;
              }
            }
          }
          if (o.isBone) boneCount++;
        });
        const animations = (gltf.animations || []).map((a) => a.name || a.uuid);

        // bounding box for grounding + scale + full-body checks
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const height = size.y;
        const grounded = box.min.y >= -0.15 && box.min.y <= 0.15;
        const scaleOk = height > 0.8 && height < 3.5 && size.x < 3.5 && size.z < 3.5;
        const fullBody = height > 1.0 && meshCount >= 3;
        const meshOk = meshCount >= 1 && triCount > 50;
        const materialsOk = matSet.size >= 1;
        const texturesOk = texCount >= 1;
        const rigOk = boneCount >= 1;
        const animOk = animations.length > 0;

        const result = {
          glb: true,
          sizeBytes: null,
          fullBody,
          mesh: meshOk,
          triCount: Math.round(triCount),
          meshCount,
          materials: materialsOk,
          materialCount: matSet.size,
          textures: texturesOk,
          textureCount: texCount,
          grounded,
          scale: scaleOk,
          height: +height.toFixed(2),
          rig: rigOk,
          boneCount,
          animations: animOk,
          animationNames: animations,
          checkedBy: "browser-threejs",
        };
        setChecks(result);
        onValidated?.(result);

        // ---- scene setup ----
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0c);
        scene.fog = new THREE.Fog(0x0a0a0c, 8, 22);

        camera = new THREE.PerspectiveCamera(40, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 100);
        const maxDim = Math.max(size.x, size.y, size.z) || 2;
        camera.position.set(maxDim * 1.6, height * 0.9, maxDim * 2.2);
        camera.lookAt(0, height * 0.45, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        mountRef.current.appendChild(renderer.domElement);

        // ground & center the model
        model.position.x -= box.min.x + size.x / 2;
        model.position.z -= box.min.z + size.z / 2;
        model.position.y -= box.min.y;
        scene.add(model);

        // lights
        scene.add(new THREE.HemisphereLight(0xfff2d6, 0x1a1408, 1.0));
        const key = new THREE.DirectionalLight(0xffffff, 1.2);
        key.position.set(4, 8, 6); scene.add(key);
        const rim = new THREE.DirectionalLight(0xd97757, 0.8);
        rim.position.set(-6, 4, -4); scene.add(rim);

        // grid floor
        const grid = new THREE.GridHelper(12, 24, 0xc5a059, 0x3a2a1a);
        grid.position.y = 0.001;
        scene.add(grid);

        // play first animation if present
        let mixer = null;
        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(gltf.animations[0]).play();
        }

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, height * 0.45, 0);
        controls.enableDamping = true;
        controls.update();

        const clock = new THREE.Clock();
        const tick = () => {
          raf = requestAnimationFrame(tick);
          const dt = clock.getDelta();
          if (mixer) mixer.update(dt);
          controls.update();
          renderer.render(scene, camera);
        };
        tick();

        const onResize = () => {
          if (!mountRef.current) return;
          const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight;
          camera.aspect = w / h; camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener("resize", onResize);
        setLoading(false);
      } catch (e) {
        setError("GLB failed to load in Three.js: " + (e?.message || e));
        setLoading(false);
      }
    };
    run();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", () => {});
      if (renderer) { renderer.dispose(); renderer.domElement?.remove(); }
      if (controls) controls.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const Check = ({ ok, label, value }) => (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-[#c5a059]/10">
      <span className="text-[11px] text-[#d1a985]">{label}</span>
      <span className={`flex items-center gap-1 text-[11px] font-bold ${ok ? "text-emerald-300" : "text-red-300"}`}>
        {ok === null ? <span className="text-amber-300">PENDING</span> : ok ? <><CheckCircle2 className="w-3.5 h-3.5" /> PASS</> : <><XCircle className="w-3.5 h-3.5" /> FAIL</>}
        {value != null && ok !== null && <span className="text-[9px] text-[#6a5a3b] font-normal">({value})</span>}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[2000] bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#c5a059]/20">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#8a6d3b]">Three.js Model Inspector</p>
          <h3 className="text-sm font-bold text-[#f0d9a8]">{characterName}</h3>
        </div>
        <button onClick={onClose} className="p-2 rounded-full bg-black/50 border border-[#c5a059]/30 text-[#d1a985]"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <div ref={mountRef} className="flex-1 relative min-h-[40vh]">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black">
              <Loader2 className="w-7 h-7 animate-spin text-[#d97757]" />
              <p className="text-xs text-[#d1a985]">Loading GLB in Three.js…</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <p className="text-sm text-red-300 text-center">{error}</p>
            </div>
          )}
        </div>
        <div className="w-full md:w-72 shrink-0 noir-panel rounded-none m-2 p-3 overflow-y-auto">
          <p className="text-[10px] font-bold text-[#d1a985] tracking-wide mb-2">VALIDATION (live from GLB)</p>
          {checks ? (
            <>
              <Check ok={checks.glb} label="GLB loads" />
              <Check ok={checks.fullBody} label="Full body (H>1m)" value={`${checks.height}m`} />
              <Check ok={checks.mesh} label="Mesh exists" value={`${checks.meshCount} mesh`} />
              <Check ok={checks.materials} label="Materials" value={`${checks.materialCount}`} />
              <Check ok={checks.textures} label="Textures" value={`${checks.textureCount}`} />
              <Check ok={checks.grounded} label="Grounded (y≈0)" />
              <Check ok={checks.scale} label="Reasonable scale" />
              <Check ok={checks.rig} label="Skeleton/bones" value={`${checks.boneCount}`} />
              <Check ok={checks.animations} label="Animations" value={`${checks.animationNames?.length || 0}`} />
              {checks.animationNames?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {checks.animationNames.slice(0, 12).map((n) => (
                    <span key={n} className="px-1.5 py-0.5 rounded bg-[#d97757]/15 border border-[#d97757]/30 text-[9px] text-[#f0c9a8]">{n}</span>
                  ))}
                </div>
              )}
              <div className="mt-3 text-[10px] text-[#6a5a3b] leading-snug">
                {checks.animations ? "Animation set detected — ready to wire to the combat controller." : "No animations in GLB. AnimationStatus = RIGGING_REQUIRED (Mixamo/Blender pass needed)."}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-[#6a5a3b]">Inspecting…</p>
          )}
        </div>
      </div>
    </div>
  );
}