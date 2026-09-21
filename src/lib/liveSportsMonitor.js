// Live sports monitor — credit-free news ticker + sound alerts + daily schedule.
// NEWS + SCHEDULE run fully offline (RSS via rss2json proxy + localStorage).
// The live-event monitor polls the "live-match-events" backend function; while
// workspace credits are exhausted it returns an error state and keeps polling,
// so the moment credits reset (2026-09-01) it auto-fires goal/red-card/etc.
// sound alerts without any code change.

import { base44 } from "@/api/base44Client";

export const NEWS_FEEDS = [
  { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml", cat: "Sport" },
  { name: "Sky Sports Football", url: "https://www.skysports.com/rss/12040", cat: "Football" },
  { name: "ESPN Soccer", url: "https://www.espn.com/espn/rss/soccer/news", cat: "Football" },
  { name: "Guardian Sport", url: "https://www.theguardian.com/sport/rss", cat: "Sport" },
  { name: "Goal.com", url: "https://www.goal.com/feeds/news", cat: "Football" },
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", cat: "General" },
  { name: "Channels TV", url: "https://www.channelstv.com/feed/", cat: "General" },
];

async function fetchFeed(feed) {
  try {
    const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
    const res = await fetch(api);
    const data = await res.json();
    if (data.status !== "ok" || !Array.isArray(data.items)) return [];
    return data.items.slice(0, 15).map((it) => ({
      title: (it.title || "").trim(),
      link: it.link || "",
      pubDate: it.pubDate || "",
      source: feed.name,
      cat: feed.cat,
    })).filter((it) => it.title);
  } catch { return []; }
}

export async function fetchLatestNews(limit = 40) {
  const settled = await Promise.all(NEWS_FEEDS.map((f) => fetchFeed(f)));
  let all = [];
  let feedsOk = 0;
  settled.forEach((items) => { if (items.length) feedsOk++; all = all.concat(items); });
  all.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return { items: all.slice(0, limit), feedsOk, feedsTotal: NEWS_FEEDS.length };
}

// ---- Web Audio sound alerts (one distinct sound per event type) ----
let ctx = null;
function audioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx || ctx.state === "closed") ctx = new Ctx();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}
function tone(freq, start, dur, type = "sine", vol = 0.28) {
  const c = audioCtx(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
  o.connect(g); g.connect(c.destination);
  o.start(c.currentTime + start); o.stop(c.currentTime + start + dur);
}
export const ALERTS = {
  goal: () => { tone(660, 0, 0.12, "sawtooth", 0.3); tone(880, 0.12, 0.12, "sawtooth", 0.3); tone(1175, 0.24, 0.18, "sawtooth", 0.32); tone(1568, 0.44, 0.3, "sawtooth", 0.3); },
  redcard: () => { tone(180, 0, 0.5, "square", 0.34); tone(140, 0.26, 0.4, "square", 0.34); },
  penalty: () => { tone(440, 0, 0.15, "square", 0.3); tone(440, 0.2, 0.15, "square", 0.3); tone(880, 0.42, 0.25, "square", 0.3); },
  substitution: () => { tone(784, 0, 0.1, "sine", 0.25); tone(587, 0.12, 0.12, "sine", 0.25); },
  throwin: () => { tone(660, 0, 0.08, "triangle", 0.2); },
  corner: () => { tone(740, 0, 0.1, "triangle", 0.2); tone(880, 0.1, 0.1, "triangle", 0.2); },
  halftime: () => { tone(523, 0, 0.3, "sine", 0.3); tone(659, 0.3, 0.3, "sine", 0.3); tone(784, 0.6, 0.5, "sine", 0.3); },
  fulltime: () => { tone(784, 0, 0.3, "sine", 0.3); tone(659, 0.3, 0.3, "sine", 0.3); tone(523, 0.6, 0.6, "sine", 0.3); },
};
export const ALERT_LABELS = {
  goal: "⚽ GOAL", redcard: "🟥 Red card", penalty: "🎯 Penalty",
  substitution: "🔄 Substitution", throwin: "🤾 Throw-in", corner: "🚩 Corner",
  halftime: "⏸️ Half-time", fulltime: "🔚 Full-time",
};

export async function enableNotifications() {
  try {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch { return false; }
}
export function pushNotify(title, body) {
  try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body }); } catch {}
}

// ---- Live event monitor: polls the backend function ----
export async function pollLiveEvents(payload = {}) {
  try {
    const r = await base44.functions.invoke("live-match-events", payload);
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: String(e?.message || e || "blocked") };
  }
}

// Heuristic: detect an event type from a live-event string/label.
export function detectEvent(text = "") {
  const t = String(text).toLowerCase();
  if (/(goal|scored|finds net|netted)/.test(t)) return "goal";
  if (/(red card|sent off|second yellow)/.test(t)) return "redcard";
  if (/penalty/.test(t)) return "penalty";
  if (/(substitut|comes on|comes off|replaced|sub:)/.test(t)) return "substitution";
  if (/throw[- ]?in/.test(t)) return "throwin";
  if (/corner/.test(t)) return "corner";
  if (/(half[- ]?time|ht|interval)/.test(t)) return "halftime";
  if (/(full[- ]?time|match end|final whistle|ft)/.test(t)) return "fulltime";
  return null;
}

// ---- Daily match schedule (localStorage, offline) ----
const SCHED_KEY = "ridex_daily_schedule_v1";
export function loadSchedule() {
  try { return JSON.parse(localStorage.getItem(SCHED_KEY) || "[]"); } catch { return []; }
}
export function saveSchedule(list) { try { localStorage.setItem(SCHED_KEY, JSON.stringify(list)); } catch {} }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
export function getTodayMatches() {
  const t = todayStr();
  return loadSchedule().filter((m) => m.date === t).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
}
export function addMatch({ time = "", home = "", away = "", league = "", date = todayStr() } = {}) {
  if (!home || !away) return null;
  const list = loadSchedule();
  const m = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, time, home, away, league };
  list.push(m); saveSchedule(list); return m;
}
export function removeMatch(id) { saveSchedule(loadSchedule().filter((m) => m.id !== id)); }
export function getAllMatches() { return loadSchedule(); }
export function getMonthMatches(year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return loadSchedule().filter((m) => (m.date || "").startsWith(prefix));
}