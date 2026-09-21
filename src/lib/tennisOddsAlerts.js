import { getTennisOddsMap, normTennisName } from "@/lib/tennisOdds";
import { SLIP_SPORTS, scanSportPool } from "@/lib/multiSportSlips";

// US OPEN LIVE ODDS RADAR — watches the REAL bookmaker feed (The Odds API via
// the bookmaker-odds backend, tennis_atp_us_open + tennis_wta_us_open) and
// fires two kinds of alerts:
//   SHIFT — a player's real best price moved ≥ SHIFT_PCT% since the last
//     check (drift = price lengthening, steam = price shortening).
//   VALUE — the engine's model probability vs the real price shows an
//     expected value ≥ VALUE_EV_PCT% (model estimate, always labeled as one).
// Every price on an alert was quoted by a real bookmaker — nothing here is
// modelled or invented, and no alert is ever manufactured from a failed feed.
// Baselines and fired-alert ids persist in localStorage (3-day memory) so a
// shift is caught exactly once across tab switches and reloads.

export const SHIFT_PCT = 10; // ≥10% real price move = significant shift
export const VALUE_EV_PCT = 5; // model EV ≥ +5% vs the real price = value spot
export const POLL_MINUTES = 10;

const BASELINE_KEY = "rx-tennis-usopen-baseline";
const FIRED_KEY = "rx-tennis-usopen-fired";
const LIST_KEY = "rx-tennis-usopen-alerts";
const KEEP_MS = 3 * 86400000;

const load = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) || d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

const disp = (n) =>
  String(n || "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

// Model match-winner probabilities from the day-cached tennis pool scan —
// the same verified set-win model the tennis slips use. Lazily armed: if the
// scan has not run yet, only shift alerts fire until it lands.
let modelPromise = null;
async function getModelProbs() {
  if (!modelPromise) {
    modelPromise = scanSportPool(SLIP_SPORTS[0])
      .then((pool) => {
        const m = new Map();
        for (const g of pool || []) {
          const h = normTennisName(g.home);
          const a = normTennisName(g.away);
          if (!h || !a || !g.rawP) continue;
          m.set(`${h}|${a}`, g.rawP);
          m.set(`${a}|${h}`, { p1: g.rawP.p2, p2: g.rawP.p1 });
        }
        return m;
      })
      .catch(() => new Map());
  }
  return modelPromise;
}

export async function pollTennisOddsAlerts() {
  const [map, model] = await Promise.all([getTennisOddsMap(true), getModelProbs()]);
  const now = Date.now();
  const fired = load(FIRED_KEY, {});
  const baseline = load(BASELINE_KEY, {});
  const fresh = [];

  if (!map || map.size === 0) {
    return { alerts: fresh, all: load(LIST_KEY, []), feedSize: 0, modelReady: model.size > 0, checkedAt: now };
  }

  // The map keys every match in BOTH orientations — process each match once.
  const seen = new Set();
  for (const [key, quotes] of map.entries()) {
    const [h, a] = key.split("|");
    const canon = [h, a].sort().join("|");
    if (seen.has(canon)) continue;
    seen.add(canon);

    const sides = [
      { name: h, q: quotes.p1, pk: `${canon}|${h}`, probKey: key, probSide: "p1" },
      { name: a, q: quotes.p2, pk: `${canon}|${a}`, probKey: key, probSide: "p2" },
    ];
    for (const s of sides) {
      if (!s.q || !(Number(s.q.price) > 1)) continue;

      // SHIFT — real price moved vs the stored baseline
      const base = baseline[s.pk];
      if (base && Number(base.price) > 1) {
        const shiftPct = ((s.q.price - base.price) / base.price) * 100;
        if (Math.abs(shiftPct) >= SHIFT_PCT) {
          const id = `${s.pk}|shift|${base.price}|${s.q.price}`;
          if (!fired[id]) {
            fired[id] = now;
            fresh.push({
              id,
              type: "shift",
              dir: shiftPct > 0 ? "drift" : "steam",
              player: disp(s.name),
              match: `${disp(h)} vs ${disp(a)}`,
              from: Number(base.price),
              to: Number(s.q.price),
              shiftPct: Math.round(shiftPct * 10) / 10,
              bookmaker: s.q.bookmaker || "",
              at: now,
            });
          }
        }
      }

      // VALUE — model probability vs the real price (model estimate, labeled)
      const probs = model.get(s.probKey);
      const prob = probs ? Number(probs[s.probSide]) : null;
      if (prob > 0 && prob < 1) {
        const evPct = Math.round((prob * s.q.price - 1) * 1000) / 10;
        if (evPct >= VALUE_EV_PCT) {
          const id = `${s.pk}|value|${s.q.price.toFixed(2)}`;
          if (!fired[id]) {
            fired[id] = now;
            fresh.push({
              id,
              type: "value",
              player: disp(s.name),
              match: `${disp(h)} vs ${disp(a)}`,
              price: Number(s.q.price),
              prob,
              evPct,
              bookmaker: s.q.bookmaker || "",
              at: now,
            });
          }
        }
      }

      baseline[s.pk] = { price: Number(s.q.price), at: now };
    }
  }

  // Persist — 3-day memory, fired ids and baseline pruned by time.
  for (const k of Object.keys(fired)) if (now - fired[k] > KEEP_MS) delete fired[k];
  for (const k of Object.keys(baseline)) if (now - (baseline[k].at || 0) > KEEP_MS) delete baseline[k];
  save(FIRED_KEY, fired);
  save(BASELINE_KEY, baseline);

  const all = [...fresh, ...load(LIST_KEY, [])].slice(0, 30);
  save(LIST_KEY, all);
  return { alerts: fresh, all, feedSize: seen.size, modelReady: model.size > 0, checkedAt: now };
}