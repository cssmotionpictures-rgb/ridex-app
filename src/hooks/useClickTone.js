import { useEffect, useRef } from "react";

// Plays a short, subtle "click" tone on button/link taps so users get audible
// feedback that their tap registered. Uses the Web Audio API (no audio asset,
// instant, zero network). Honors a localStorage mute flag so users can silence it.

function toneEnabled() {
  try { return localStorage.getItem("ridex_click_tone") !== "off"; } catch { return true; }
}
export function isClickToneOn() { return toneEnabled(); }
export function setClickTone(on) {
  try { if (on) localStorage.removeItem("ridex_click_tone"); else localStorage.setItem("ridex_click_tone", "off"); } catch {}
}

export function useClickTone() {
  const ctxRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const play = () => {
      if (!toneEnabled()) return;
      try {
        if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") ctx.resume();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(920, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(560, ctx.currentTime + 0.05);
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
        o.connect(g); g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.1);
      } catch {}
    };

    const handler = (e) => {
      const t = e.target?.closest?.("button, a, [role='button'], summary, label");
      if (t) play();
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);
}