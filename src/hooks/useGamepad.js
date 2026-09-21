import { useEffect, useRef, useState } from "react";

// Standard gamepad button index mapping (most controllers: Xbox/PS/Switch).
const MAP = { a: 0, b: 1, x: 2, y: 3, l: 4, r: 5, up: 12, down: 13, left: 14, right: 15, start: 9 };

/**
 * useGamepad — engine for external plugged-in game controllers.
 * Polls navigator.getGamepads only while a pad is connected, edge-triggers
 * button presses, and exposes a live `pressed` map for visual sync.
 *
 * handlers: { a, b, x, y, l, r, up, down, left, right, start } — each fired on press edge.
 * returns { connected, pressed }
 */
export function useGamepad(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const [connected, setConnected] = useState(false);
  const [pressed, setPressed] = useState({});
  const pressedRef = useRef({});

  useEffect(() => {
    let raf = null;

    const loop = () => {
      const pad = (navigator.getGamepads?.() || [])[0];
      if (pad && pad.connected) {
        const next = { ...pressedRef.current };
        for (const key in MAP) {
          const btn = pad.buttons[MAP[key]];
          const down = !!btn && btn.value > 0.5;
          if (down && !pressedRef.current[key]) ref.current[key]?.();
          next[key] = down;
        }
        // only setState when something actually changed (cheap)
        let changed = false;
        for (const k in next) {
          if (next[k] !== pressedRef.current[k]) { changed = true; break; }
        }
        if (changed) {
          pressedRef.current = next;
          setPressed(next);
        }
      }
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (raf) return;
      setConnected(true);
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      setConnected(false);
      pressedRef.current = {};
      setPressed({});
    };

    window.addEventListener("gamepadconnected", start);
    window.addEventListener("gamepaddisconnected", stop);
    // Pad may already be connected when the page loads
    const existing = (navigator.getGamepads?.() || [])[0];
    if (existing && existing.connected) start();

    return () => {
      window.removeEventListener("gamepadconnected", start);
      window.removeEventListener("gamepaddisconnected", stop);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { connected, pressed };
}