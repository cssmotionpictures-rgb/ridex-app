// === Mortal Kombat-style cinematic VFX for "The Forgotten Ones" arena ===
// Blood mist on impact, ground blood pools, and a critical-HP rage aura.
// Credit-free, client-side Three.js. Paired with the 2D CSS overlays
// (X-Ray flash, blood-splatter screen, FATALITY/BRUTALITY/FLAWLESS pops)
// rendered in RealTimeArena3D's JSX layer.

import * as THREE from "three";

export function createMkVfx(scene) {
  const live = [];
  const DROP_GEO = new THREE.SphereGeometry(0.04, 6, 6);

  function track(obj, update) {
    scene.add(obj);
    const e = { obj, life: 0, alive: true, update, remove: null };
    live.push(e);
    return e;
  }

  function disposeObj(obj) {
    obj.traverse((o) => {
      if (o.geometry && o.geometry !== DROP_GEO) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose());
      }
    });
    scene.remove(obj);
  }

  // Blood mist: dark-red droplets bursting outward with gravity (MK impact gore-mist).
  function bloodMist(x, y, z, power = 1) {
    const g = new THREE.Group();
    const drops = [];
    const N = Math.round(14 * power);
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(
        DROP_GEO,
        new THREE.MeshBasicMaterial({ color: 0x8a0d0d, transparent: true, opacity: 0.95, depthWrite: false })
      );
      m.position.set(x, y, z);
      const ang = Math.random() * Math.PI * 2;
      const up = 0.05 + Math.random() * 0.12;
      const spd = (0.04 + Math.random() * 0.08) * power;
      m.userData.v = new THREE.Vector3(Math.cos(ang) * spd, up, Math.sin(ang) * spd * 0.6);
      g.add(m);
      drops.push(m);
    }
    track(g, (dt, e) => {
      e.life += dt;
      const k = Math.min(1, e.life / 700);
      for (const d of drops) {
        d.userData.v.y -= 0.012 * (dt / 16);
        d.position.addScaledVector(d.userData.v, dt / 16);
        d.material.opacity = 0.95 * (1 - k);
      }
      return e.life < 700;
    });
  }

  // Blood pool: dark-red flat decal spreading on the ground under a fallen fighter.
  function bloodPool(x, color = 0x5a0a0a) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, 0);
    track(m, (dt, e) => {
      e.life += dt;
      const k = Math.min(1, e.life / 1100);
      const grow = 0.5 + k * 1.6;
      m.scale.set(grow, grow, 1);
      m.material.opacity = 0.7 * Math.min(1, k * 2);
      return e.life < 1100;
    });
  }

  // Rage aura: pulsing red ring following a fighter at critical HP.
  function rageAura(group, color = 0xc01818) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.05, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    let removed = false;
    const e = track(ring, (dt, ev) => {
      ev.life += dt;
      ring.position.set(group.position.x, 0.05, group.position.z);
      const p = (Math.sin(ev.life * 0.012) + 1) / 2;
      ring.material.opacity = 0.35 + 0.4 * p;
      ring.scale.setScalar(0.9 + 0.12 * p);
      return !removed;
    });
    e.remove = () => { removed = true; };
    return e;
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      const alive = e.update(dt, e);
      if (!alive) {
        disposeObj(e.obj);
        live.splice(i, 1);
      }
    }
  }

  function disposeAll() {
    for (const e of live) disposeObj(e.obj);
    live.length = 0;
  }

  return { bloodMist, bloodPool, rageAura, update, disposeAll };
}