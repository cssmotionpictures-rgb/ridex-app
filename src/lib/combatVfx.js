// === 3D Combat VFX system for "The Forgotten Ones" arena ===
// Credit-free, client-side Three.js particle/geometry effects fired at combat
// events (hit, heavy, special, dodge, land, finisher, KO). One update(dt) ticks
// every live effect and disposes it when its lifetime ends.

import * as THREE from "three";

export function createCombatVfx(scene) {
  const live = [];
  const SPARK_GEO = new THREE.SphereGeometry(0.05, 6, 6);
  const RING_GEO = new THREE.RingGeometry(0.5, 0.62, 48);

  function track(obj, update) {
    scene.add(obj);
    const e = { obj, life: 0, alive: true, update, remove: null };
    live.push(e);
    return e;
  }

  function disposeObj(obj) {
    obj.traverse((o) => {
      if (o.geometry && o.geometry !== SPARK_GEO && o.geometry !== RING_GEO) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose());
      }
    });
    scene.remove(obj);
  }

  // Radial impact burst: white core flash + colored additive sparks flying outward.
  function impact(x, y, z, color, power = 1) {
    const g = new THREE.Group();
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.2 * power, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    g.add(flash);
    const sparks = [];
    const N = Math.round(10 * power);
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(
        SPARK_GEO,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.position.set(x, y, z);
      const ang = (i / N) * Math.PI * 2 + Math.random() * 0.5;
      const spd = (0.05 + Math.random() * 0.07) * power;
      m.userData.v = new THREE.Vector3(Math.cos(ang) * spd, 0.03 + Math.random() * 0.08 * power, Math.sin(ang) * spd);
      g.add(m);
      sparks.push(m);
    }
    track(g, (dt, e) => {
      e.life += dt;
      const k = Math.min(1, e.life / 520);
      flash.scale.setScalar(1 + k * 3);
      flash.material.opacity = 1 - k;
      for (const s of sparks) {
        s.position.addScaledVector(s.userData.v, dt / 16);
        s.userData.v.multiplyScalar(0.92);
        s.material.opacity = 1 - k;
      }
      return e.life < 520;
    });
  }

  // Expanding shockwave ring on the ground.
  function shockwave(x, color, maxR = 3, dur = 600) {
    const ring = new THREE.Mesh(
      RING_GEO.clone(),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, 0);
    track(ring, (dt, e) => {
      e.life += dt;
      const k = Math.min(1, e.life / dur);
      const r = 0.5 + k * maxR;
      ring.scale.set(r, r, 1);
      ring.material.opacity = 0.9 * (1 - k);
      return e.life < dur;
    });
  }

  // Dust puff (dodge / landing / takeoff).
  function dust(x, color = 0x8a6d3b, power = 1) {
    const g = new THREE.Group();
    const puffs = [];
    const N = Math.round(6 * power);
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false })
      );
      m.position.set(x + (Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.02 + Math.random() * 0.03, (Math.random() - 0.5) * 0.04);
      g.add(m);
      puffs.push(m);
    }
    track(g, (dt, e) => {
      e.life += dt;
      const k = Math.min(1, e.life / 600);
      for (const p of puffs) {
        p.position.addScaledVector(p.userData.v, dt / 16);
        p.userData.v.y -= 0.001 * (dt / 16);
        p.scale.setScalar(1 + k * 1.5);
        p.material.opacity = 0.5 * (1 - k);
      }
      return e.life < 600;
    });
  }

  // Energy beam between two fighters (special).
  function beam(x1, x2, y, color) {
    const len = Math.max(0.1, Math.abs(x2 - x1));
    const geo = new THREE.CylinderGeometry(0.06, 0.06, len, 12, 1, true);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    m.position.set((x1 + x2) / 2, y, 0);
    m.rotation.z = Math.PI / 2;
    track(m, (dt, e) => {
      e.life += dt;
      const k = Math.min(1, e.life / 360);
      m.material.opacity = 0.9 * (1 - k);
      m.scale.x = 1 + k * 0.5;
      return e.life < 360;
    });
  }

  // Jagged lightning bolt (special crit).
  function lightning(x1, x2, y, color) {
    const pts = [];
    const segs = 8;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(new THREE.Vector3(x1 + (x2 - x1) * t, y + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    track(line, (dt, e) => {
      e.life += dt;
      const k = Math.min(1, e.life / 300);
      mat.opacity = 1 - k;
      return e.life < 300;
    });
  }

  // Power aura that follows a fighter group until removed (finisher charge).
  function aura(group, color) {
    const ring = new THREE.Mesh(
      RING_GEO.clone(),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    let removed = false;
    const e = track(ring, (dt, ev) => {
      ev.life += dt;
      ring.position.set(group.position.x, 0.04, group.position.z);
      const p = (Math.sin(ev.life * 0.01) + 1) / 2;
      ring.material.opacity = 0.4 + 0.4 * p;
      ring.scale.setScalar(1 + 0.1 * p);
      return !removed;
    });
    e.remove = () => { removed = true; };
    return e;
  }

  // KO light burst: big shockwave + expanding white flash.
  function koBurst(x, color = 0xfff7d6) {
    shockwave(x, color, 5, 800);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    flash.position.set(x, 1.2, 0);
    track(flash, (dt, e) => {
      e.life += dt;
      const k = Math.min(1, e.life / 700);
      flash.scale.setScalar(1 + k * 8);
      flash.material.opacity = 1 - k;
      return e.life < 700;
    });
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

  return { impact, shockwave, dust, beam, lightning, aura, koBurst, update, disposeAll };
}