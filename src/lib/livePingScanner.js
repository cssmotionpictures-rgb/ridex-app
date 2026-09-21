import { fetchLiveFixtures } from "@/lib/liveFootballScores";
import { playPingSound } from "@/lib/sportsSounds";

const SEEN_KEY = "ridex-live-ping-seen";
const ON_KEY = "ridex-live-ping-on";

// LIVE SCANNER — ONE singleton watcher per browser session. It polls the
// worldwide live-match feed every minute and, the moment a NEW game goes in
// play, fires the alert pack exactly once: ping sound, spoken call and a
// system notification. Every UI (the sports-page scanner chip, the app-wide
// toast) subscribes to this one scanner, so no matter how many pages mount
// it, a kickoff is never pinged twice and never missed.

const state = { on: readOn(), live: null, fresh: [] };
const subs = new Set();
let timer = null;

function readOn() {
  try {
    return localStorage.getItem(ON_KEY) !== "0";
  } catch {
    return true;
  }
}

function emit(newOnes) {
  for (const fn of subs) {
    try {
      fn(state, newOnes || []);
    } catch {}
  }
}

function fireAlerts(newOnes) {
  playPingSound();
  try {
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(
        newOnes.length === 1
          ? `New live match. ${newOnes[0].home} versus ${newOnes[0].away}.`
          : `${newOnes.length} new live matches added to the scanner.`
      );
      u.rate = 1;
      u.pitch = 1.05;
      window.speechSynthesis.speak(u);
    }
  } catch {}
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const first = newOnes[0];
      new Notification("⚽ LIVE NOW on Ride X", {
        body:
          newOnes.length === 1
            ? `${first.home} vs ${first.away} · ${first.league || "Live"}`
            : `${newOnes.length} new live matches — open Live Scores.`,
      });
    }
  } catch {}
}

async function tick() {
  try {
    const matches = await fetchLiveFixtures();
    const liveOnes = matches.filter((m) => m.status === "live");
    state.live = liveOnes.length;
    let seen = {};
    try {
      const m = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
      if (m && typeof m === "object") seen = m;
    } catch {}
    const next = { ...seen };
    const newOnes = [];
    for (const m of liveOnes) {
      if (!m.id) continue;
      if (seen[m.id]) {
        next[m.id] = seen[m.id];
        continue;
      }
      next[m.id] = new Date().toISOString().slice(0, 10);
      newOnes.push(m);
    }
    if (newOnes.length) {
      state.fresh = [...newOnes, ...state.fresh].slice(0, 5);
      fireAlerts(newOnes);
    }
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {}
    emit(newOnes);
  } catch {}
}

function start() {
  if (timer || !state.on) return;
  tick();
  timer = setInterval(tick, 60000);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getLivePingState() {
  return state;
}

export function setPingEnabled(on) {
  state.on = on;
  try {
    localStorage.setItem(ON_KEY, on ? "1" : "0");
  } catch {}
  if (on) start();
  else stop();
  emit();
}

export async function requestPingPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }
}

// Subscribe to the scanner. The callback receives (state, newOnes) on every
// emission — newOnes is non-empty only when new live games just appeared.
export function subscribeLivePing(fn) {
  subs.add(fn);
  start();
  try {
    fn(state, []);
  } catch {}
  return () => {
    subs.delete(fn);
  };
}