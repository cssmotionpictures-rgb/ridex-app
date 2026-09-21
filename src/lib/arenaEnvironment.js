// === Nightmare Village arena environment (The Forgotten Ones) ===
// Fully offline procedural scene: wet reflective ground, big glowing moon,
// burning huts with animated flames + flickering fire lights, war banners,
// drifting embers, and stage-tinted atmosphere that shifts per episode/level
// so progression is visible. Owned animation (flames, embers, lights) runs
// via the returned update(); dispose() tears it all down.

import * as THREE from "three";

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

export function buildNightmareVillage(scene, opts = {}) {
  const level = Number(opts.level || 1);
  const episodeId = Number(opts.episodeId || 1);
  const stage = episodeId * 100 + level;

  // Stage-tinted atmosphere — moon hue + fog shift slightly per stage.
  const moonTint = new THREE.Color().setHSL(0.12 - (stage % 7) * 0.012, 0.55, 0.86);

  const disposables = [];
  const fireLights = [];
  const flames = [];
  let disposed = false;

  // Wet reflective dark ground (glossy → catches fire/moon specular highlights)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.2, metalness: 0.72 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground); disposables.push(ground);

  // Glowing arena ring under the fighters
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.0, 64),
    new THREE.MeshBasicMaterial({ color: 0xc5a059, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; scene.add(ring); disposables.push(ring);

  // Big full moon + soft halo
  const moon = new THREE.Mesh(new THREE.SphereGeometry(2.6, 32, 32), new THREE.MeshBasicMaterial({ color: moonTint }));
  moon.position.set(-4, 9.5, -14); scene.add(moon); disposables.push(moon);
  const moonHalo = new THREE.Mesh(new THREE.SphereGeometry(4.8, 32, 32), new THREE.MeshBasicMaterial({ color: moonTint, transparent: true, opacity: 0.24 }));
  moonHalo.position.copy(moon.position); scene.add(moonHalo); disposables.push(moonHalo);

  // Burning huts — silhouettes with glowing windows + animated roof flames + fire lights
  const hutMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1, metalness: 0 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 1 });
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffb84d, emissive: 0xff8a1e, emissiveIntensity: 2.4, roughness: 0.5 });
  const hutPositions = [[-7,-5],[7,-5],[-4,-8],[4,-8],[0,-11],[-9,-2.5],[9,-2.5]];
  for (const [hx, hz] of hutPositions) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), hutMat);
    w.position.set(hx, 0.7, hz); w.castShadow = true; w.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.0, 4), roofMat);
    roof.position.set(hx, 1.9, hz); roof.rotation.y = Math.PI / 4;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), winMat);
    win.position.set(hx, 0.85, hz + 0.81);
    scene.add(w, roof, win); disposables.push(w, roof, win);
    // animated flame cone on the roof
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 8), new THREE.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.set(hx, 2.6, hz); scene.add(flame); disposables.push(flame);
    flames.push({ mesh: flame, phase: Math.random() * TAU });
    // fire light
    const fl = new THREE.PointLight(0xff5a1e, rand(2.0, 3.0), 18, 2);
    fl.position.set(hx, 1.6, hz + 0.6); scene.add(fl); fireLights.push(fl);
  }

  // Runic war banners (red, glowing) on poles around the arena rim
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x6e0d0d, roughness: 0.85, emissive: 0x3a0606, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x14100a, roughness: 1 });
  for (const [bx, bz] of [[-5.5,-1.5],[5.5,-1.5],[-3.5,-6],[3.5,-6]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), poleMat); pole.position.set(bx, 1.3, bz);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.3), bannerMat); banner.position.set(bx, 1.7, bz); banner.rotation.y = Math.atan2(-bx, -bz);
    scene.add(pole, banner); disposables.push(pole, banner);
  }

  // Embers (additive points)
  const emberN = 220;
  const emberGeo = new THREE.BufferGeometry();
  const emberPos = new Float32Array(emberN * 3);
  for (let i = 0; i < emberN; i++) { emberPos[i*3] = rand(-7,7); emberPos[i*3+1] = rand(0,5); emberPos[i*3+2] = rand(-4,3); }
  emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({ color: 0xff8a4d, size: 0.1, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(embers); disposables.push(embers);

  // Side glows — warm (player) + purple (enemy)
  const warmGlow = new THREE.PointLight(0xd97757, 1.6, 12, 2); warmGlow.position.set(-3, 0.6, 1.2); scene.add(warmGlow);
  const purpleGlow = new THREE.PointLight(0x8a3ad0, 1.5, 12, 2); purpleGlow.position.set(3, 0.6, 1.2); scene.add(purpleGlow);

  return {
    update(dt, now) {
      if (disposed) return;
      const dts = dt / 16;
      const pos = embers.geometry.attributes.position;
      for (let i = 0; i < emberN; i++) { let y = pos.array[i*3+1]; y += (0.008 + (i % 5) * 0.002) * dts; if (y > 5) y = 0; pos.array[i*3+1] = y; }
      pos.needsUpdate = true;
      for (const f of flames) {
        const s = 0.85 + Math.sin(now * 0.012 + f.phase) * 0.25 + Math.random() * 0.1;
        f.mesh.scale.set(s * 0.9, s, s * 0.9);
        f.mesh.material.opacity = 0.7 + Math.sin(now * 0.02 + f.phase) * 0.2;
      }
      for (let i = 0; i < fireLights.length; i++) {
        fireLights[i].intensity = 2.3 + Math.sin(now * 0.008 + i) * 0.7 + Math.random() * 0.3;
      }
      moonHalo.material.opacity = 0.22 + Math.sin(now * 0.0015) * 0.06;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of disposables) {
        scene.remove(o);
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      }
      scene.remove(warmGlow, purpleGlow);
    },
  };
}