// LAGOS TIME — the single shared clock for every RIDE X prediction surface.
// Daily board keys, session classification and kickoff labels all use
// Africa/Lagos, never server UTC. Pure module — safe to import anywhere,
// including the software tests.

const lagosParts = (ts, opts) => {
  const d = ts instanceof Date ? ts : new Date(ts);
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", ...opts })
    .formatToParts(d)
    .forEach((x) => (p[x.type] = x.value));
  return p;
};

export function lagosDateKey(ts) {
  const p = lagosParts(ts, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

export const lagosTodayKey = () => lagosDateKey(Date.now());

export function lagosKickoffLabel(ts) {
  const p = lagosParts(ts, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.hour}:${p.minute}`;
}

export function lagosDayLabel(dateKey) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return isNaN(d)
    ? dateKey
    : d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
}

// ☀️ MORNING / DAY = 00:00–16:59 Lagos · 🌙 EVENING = 17:00–23:59 Lagos
export function sessionOfKickoff(ts) {
  if (!ts || isNaN(new Date(ts).getTime())) return null;
  const h = Number(lagosParts(ts, { hour: "2-digit", hourCycle: "h23" }).hour);
  return h >= 17 ? "evening" : "morning";
}