// WIN CELEBRATION ENGINE — fires the moment any recorded prediction is
// settled as a WIN: the app SHOUTS "win" in voice, plays the triumphant
// sound, and broadcasts to the badge overlay. Each win is celebrated exactly
// once — the celebration memory lives in browser storage.

import { playGoalSound } from "@/lib/sportsSounds";
import { toast } from "@/components/ui/use-toast";

const SEEN_KEY = "ridex-win-celebrated";

export function celebrateWin({ home, away, market } = {}) {
  if (typeof window === "undefined") return;
  const key = `${home}|${away}|${market}`;
  let seen = [];
  try {
    seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    if (!Array.isArray(seen)) seen = [];
  } catch {
    seen = [];
  }
  if (seen.includes(key)) return;
  seen.push(key);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-300)));
  } catch {}

  playGoalSound();

  // The WIN NOTIFICATION — a toast banner shown to the user wherever they are
  // in the app, alongside the congratulations badge overlay below.
  try {
    toast({
      title: "WE HAVE A WIN!",
      description: `${home} vs ${away} — ${market} HIT. Congratulations!`,
      duration: 10000,
    });
  } catch {}

  // The voice shout — "We have a WIN!"
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(
        `We have a win! ${home} versus ${away} — ${market} hit! Congratulations!`
      );
      u.rate = 1;
      u.pitch = 1.15;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    }
  } catch {}

  window.dispatchEvent(
    new CustomEvent("ridex:win", { detail: { home, away, market } })
  );
}