// PERSISTENT DEALT-PICK MEMORY — the engine behind the 7-day pick cycle.
// Every pick dealt onto any ticket is remembered with the date it was dealt.
// On every new day (and automatically when a 7-day cycle rolls over into a
// brand-new Day 1), any pick already dealt on an EARLIER day is skipped:
//   - each day the sections deal fresh picks from the incoming fixtures first,
//   - when the week's fresh supply can't fill the slips, picks dealt on
//     earlier days come back (the refill pass) so every slip still brings
//     games — within one deal a pick is never shown on two tickets,
//   - after Day 7 the next day is a fresh Day-1 deal, forever.
// Entries older than 7 days are pruned — by then the game has kicked off and
// can never re-enter a window anyway, so the memory stays small.

const KEY = "ridex_dealt_pick_memory";
const RETAIN_DAYS = 7;
const DAY_MS = 86400000;

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function loadDealtMemory() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY));
    if (j && typeof j === "object") return j;
  } catch {}
  return {};
}

// True only for picks dealt on an EARLIER day — same-day re-renders never
// exclude, so the deal stays stable within the day.
export function wasDealtBefore(mem, scope, gameKey, pickKey, today = todayKey()) {
  const d = mem?.[scope]?.[gameKey]?.[pickKey];
  return !!d && d < today;
}

export function recordDealt(mem, scope, gameKey, pickKey, today = todayKey()) {
  const scoped = (mem[scope] ||= {});
  const game = (scoped[gameKey] ||= {});
  game[pickKey] = today;
}

export function saveDealtMemory(mem, today = todayKey()) {
  const cutoffMs = new Date(today + "T00:00:00Z").getTime() - RETAIN_DAYS * DAY_MS;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const out = {};
  for (const [scope, games] of Object.entries(mem || {})) {
    for (const [gk, picks] of Object.entries(games || {})) {
      const kept = {};
      for (const [pk, d] of Object.entries(picks || {})) {
        if (d >= cutoff) kept[pk] = d;
      }
      if (Object.keys(kept).length) (out[scope] ||= {})[gk] = kept;
    }
  }
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch {}
}

// The rolling 7-day pick CYCLE. Epoch-anchored: today is Day 1..7 of a fixed
// week — when Day 7 passes, the next day is automatically a brand-new Day 1,
// forever, with no setup and no manual reset.
export function cycleInfo(now = new Date()) {
  const dayIdx = Math.floor(now.getTime() / DAY_MS);
  const day = (dayIdx % 7) + 1;
  const startMs = (dayIdx - (day - 1)) * DAY_MS;
  return {
    day,
    start: new Date(startMs).toISOString().slice(0, 10),
    end: new Date(startMs + 6 * DAY_MS).toISOString().slice(0, 10),
  };
}