// === Fighter Camera (The Forgotten Ones) ===
// Smoothly follows the midpoint between two fighters, zooms out when they
// separate and in when they're close, and keeps both fighters framed. Never
// allows the camera to clip through the arena (z is clamped to a floor).

import * as THREE from "three";

export function createFighterCamera(camera) {
  const target = new THREE.Vector3();
  return {
    update({ x1, x2, height = 1.0, t = 0.08, shake = 0, yaw = 0, camRY = 0, zoomOverride }) {
      const mid = (x1 + x2) / 2;
      const sep = Math.abs(x2 - x1);
      // Zoom out as fighters separate, in as they close — clamped to a safe range.
      const aspect = camera.aspect || 1;
      const vHalf = ((camera.fov || 46) * Math.PI) / 360;
      const halfHperZ = Math.tan(vHalf) * aspect; // horizontal half-width per unit distance
      const need = sep / 2 + 2.4; // fit both fighters with margin
      let zoom;
      if (zoomOverride != null) {
        zoom = zoomOverride;
      } else {
        zoom = need / Math.max(0.2, halfHperZ);
        zoom = THREE.MathUtils.clamp(zoom, 5.0, 16.0);
      }
      const cx = Math.sin(yaw) * zoom;
      const cz = Math.max(2.5, Math.cos(yaw) * zoom); // never clip through the arena
      camera.position.x = THREE.MathUtils.lerp(
        camera.position.x,
        mid + cx + (shake ? (Math.random() - 0.5) * shake * 0.6 : 0),
        t
      );
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, cz, t * 0.8);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.7 + camRY * -2, t * 0.8);
      target.set(mid, height, 0);
      camera.lookAt(target);
    },
  };
}