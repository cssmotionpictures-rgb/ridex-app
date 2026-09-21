// Browser-storage calendar store for Ride X fixture sync.
// Persists the user's synced fixtures + Google Calendar connection state in
// localStorage so the calendar works fully offline. When a Google Calendar
// connection exists (APP_USER connector), the backend function pushes the
// same events to the user's real Google Calendar; this store mirrors that
// locally so the UI always knows what's been synced and the user can view,
// search, and remove synced reminders without a round-trip.

const CAL_KEY = "ridex_calendar_events";
const CONN_KEY = "ridex_gcal_connected";
const LAST_SYNC_KEY = "ridex_gcal_last_sync";

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

function uid() { return "evt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }

// Normalise a TheSportsDB fixture event OR a local match into a calendar event.
export function fixtureToEvent(e, sport = "soccer") {
  let start = null;
  if (e.strTimestamp) start = new Date(Number(e.strTimestamp) * 1000);
  else if (e.dateEvent && e.strTime) {
    const [y, mo, da] = String(e.dateEvent).split("-").map(Number);
    const [hh, mm] = String(e.strTime).split(":").map(Number);
    start = new Date(Date.UTC(y, (mo || 1) - 1, da || 1, hh || 0, mm || 0, 0));
  } else if (e.date && e.time) {
    const [y, mo, da] = e.date.split("-").map(Number);
    const [hh, mm] = e.time.split(":").map(Number);
    start = new Date(y, (mo || 1) - 1, da || 1, hh || 0, mm || 0);
  }
  if (!start || isNaN(start.getTime())) return null;
  const home = e.strHomeTeam || e.home || "TBD";
  const away = e.strAwayTeam || e.away || "TBD";
  const league = e.strLeague || e.league || (sport === "soccer" ? "Football" : sport);
  return {
    id: e.idEvent || e.id || uid(),
    title: `${league}: ${home} vs ${away}`,
    home, away, league, sport,
    start: start.toISOString(),
    end: new Date(start.getTime() + 105 * 60000).toISOString(),
    reminderMinutes: 30,
    syncedAt: new Date().toISOString(),
  };
}

export function getEvents() { return read(CAL_KEY, []); }

export function getUpcoming(limit = 50) {
  const now = Date.now();
  return getEvents()
    .filter((e) => new Date(e.start).getTime() >= now - 3600000)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, limit);
}

export function addEvent(event) {
  if (!event || !event.id) return null;
  const all = getEvents();
  const idx = all.findIndex((x) => x.id === event.id);
  if (idx >= 0) all[idx] = { ...all[idx], ...event };
  else all.push(event);
  write(CAL_KEY, all);
  return event;
}

export function addFixtures(fixtures, sport = "soccer") {
  const events = fixtures.map((f) => fixtureToEvent(f, sport)).filter(Boolean);
  const all = getEvents();
  let added = 0;
  events.forEach((ev) => {
    if (!all.find((x) => x.id === ev.id)) { all.push(ev); added++; }
    else { const i = all.findIndex((x) => x.id === ev.id); all[i] = { ...all[i], ...ev }; }
  });
  write(CAL_KEY, all);
  return { added, total: events.length };
}

export function removeEvent(id) {
  const all = getEvents().filter((e) => e.id !== id);
  write(CAL_KEY, all);
}

export function clearAll() { write(CAL_KEY, []); }

export function isGoogleConnected() { return read(CONN_KEY, false) === true; }
export function setGoogleConnected(v) { write(CONN_KEY, !!v); }

export function getLastSync() { return read(LAST_SYNC_KEY, null); }
export function setLastSync(iso) { write(LAST_SYNC_KEY, iso); }

export function stats() {
  const all = getEvents();
  const now = Date.now();
  const upcoming = all.filter((e) => new Date(e.start).getTime() >= now).length;
  return { total: all.length, upcoming, connected: isGoogleConnected(), lastSync: getLastSync() };
}

// Push the given TheSportsDB fixtures to Google Calendar via the backend
// function (uses the shared googlecalendar connector). Mirrors everything into
// browser storage first so the calendar always works offline. Falls back to a
// one-click .ics download if the API push is unavailable (credits exhausted /
// scope not granted / not connected). Returns { api, ics, total }.
export async function syncFixturesToGoogle(fixtures, sport = "soccer") {
  const events = fixtures.map((f) => fixtureToEvent(f, sport)).filter(Boolean);
  addFixtures(fixtures, sport); // mirror to browser storage regardless
  let api = { created: 0, failed: 0, total: events.length, ok: false };
  try {
    const { base44 } = await import("@/api/base44Client");
    const res = await base44.functions.invoke("sync-google-calendar", { events });
    api = { ...(res?.data || res), ok: !!(res?.data?.created || res?.created) };
    if (api.ok) setGoogleConnected(true);
  } catch (e) {
    api = { created: 0, failed: events.length, total: events.length, ok: false, error: e?.message };
  }
  // Always offer the .ics export as the reliable fallback / manual import path.
  let ics = 0;
  try {
    const { buildFixturesICS } = await import("@/lib/calendarSync");
    ics = buildFixturesICS(fixtures).count;
  } catch {}
  setLastSync(new Date().toISOString());
  return { api, ics, total: events.length };
}