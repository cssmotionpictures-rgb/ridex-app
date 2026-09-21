// Google Calendar sync for the daily football match schedule.
// Works fully offline (no backend / integration credits): builds an .ics file
// the user imports once into Google Calendar, plus per-match "Add to Google"
// deep links. Google Calendar alerts fire automatically on the imported events.

import { getAllMatches } from "@/lib/liveSportsMonitor";

function pad(n) { return String(n).padStart(2, "0"); }
function fmtUTC(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}
function escapeICS(s) { return String(s || "").replace(/[\\,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n"); }

function matchDates(m) {
  if (!m.date || !m.time) return null;
  const [y, mo, da] = m.date.split("-").map(Number);
  const [hh, mm] = m.time.split(":").map(Number);
  const start = new Date(y, (mo || 1) - 1, da || 1, hh || 0, mm || 0);
  const end = new Date(start.getTime() + 105 * 60000); // 105-min match window
  return { start, end };
}

export function buildICS(matches = getAllMatches()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ride X//Live Sports Monitor//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  let count = 0;
  matches.forEach((m) => {
    const d = matchDates(m);
    if (!d) return;
    const title = `${m.home} vs ${m.away}`;
    const desc = m.league ? `Ride X Live Monitor · ${m.league} · Kickoff ${m.time}` : `Ride X Live Monitor · Kickoff ${m.time}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${m.id}@ridex.live`,
      `DTSTAMP:${fmtUTC(new Date())}`,
      `DTSTART:${fmtUTC(d.start)}`,
      `DTEND:${fmtUTC(d.end)}`,
      `SUMMARY:${escapeICS(title)}`,
      `DESCRIPTION:${escapeICS(desc)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Kickoff reminder", "TRIGGER:-PT15M", "END:VALARM",
      "END:VEVENT"
    );
    count++;
  });
  lines.push("END:VCALENDAR");
  return { ics: lines.join("\r\n"), count };
}

// One-click: downloads an .ics of every scheduled match (import once into
// Google Calendar → Settings → Import & export). Each event carries a
// 15-min kickoff reminder so alerts fire automatically.
export function downloadMatchICS(filename = "ridex-match-schedule.ics") {
  const { ics, count } = buildICS();
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return count;
}

// Single-match deep link — opens Google Calendar's add-event form pre-filled.
export function googleCalendarLink(m) {
  const d = matchDates(m);
  if (!d) return "";
  const text = encodeURIComponent(`${m.home} vs ${m.away}`);
  const details = encodeURIComponent(m.league ? `Ride X Live Monitor · ${m.league}` : "Ride X Live Monitor");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmtUTC(d.start)}/${fmtUTC(d.end)}&details=${details}`;
}

// === 7-day fixture sync (TheSportsDB events → Google Calendar via .ics) ===
function eventDates(e) {
  let start = null;
  if (e.strTimestamp) start = new Date(Number(e.strTimestamp) * 1000);
  else if (e.dateEvent && e.strTime) {
    const [y, mo, da] = String(e.dateEvent).split("-").map(Number);
    const [hh, mm] = String(e.strTime).split(":").map(Number);
    start = new Date(Date.UTC(y, (mo || 1) - 1, da || 1, hh || 0, mm || 0, 0));
  }
  if (!start || isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 105 * 60000) };
}

export function buildFixturesICS(events = []) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ride X//Sports Fixtures//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  let count = 0;
  events.forEach((e) => {
    const d = eventDates(e);
    if (!d) return;
    const title = e.strLeague ? `${e.strLeague}: ${e.strHomeTeam} vs ${e.strAwayTeam}` : `${e.strHomeTeam} vs ${e.strAwayTeam}`;
    const ko = d.start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    const desc = `Ride X · ${e.strLeague || "Fixture"} · ${e.strHomeTeam} vs ${e.strAwayTeam} · Kickoff ${ko} UTC. Auto-synced for timely alerts.`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.idEvent || `${title}-${e.dateEvent}`}@ridex.fixtures`,
      `DTSTAMP:${fmtUTC(new Date())}`,
      `DTSTART:${fmtUTC(d.start)}`,
      `DTEND:${fmtUTC(d.end)}`,
      `SUMMARY:${escapeICS(title)}`,
      `DESCRIPTION:${escapeICS(desc)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeICS(`Kickoff soon: ${e.strHomeTeam} vs ${e.strAwayTeam} (${e.strLeague || "Fixture"})`)}`, "TRIGGER:-PT30M", "END:VALARM",
      "END:VEVENT"
    );
    count++;
  });
  lines.push("END:VCALENDAR");
  return { ics: lines.join("\r\n"), count };
}

// === Engine picks calendar (PredictionBoard picks → .ics, 30-min reminders) ===
export function buildPicksICS(picks = []) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ride X//Engine Picks//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  let count = 0;
  picks.forEach((p) => {
    const start = new Date(p.kickoff);
    if (!p.kickoff || isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + 105 * 60000);
    const title = `${p.home} vs ${p.away} — ${p.marketLabel || "Engine pick"}`;
    const prob = p.probability ? ` · Model probability ${Math.round(p.probability * 100)}%` : "";
    const desc = `Ride X engine pick · ${p.league || "Football"} · ${p.marketLabel || ""}${prob}. Auto-synced so you never miss kickoff.`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${String(p.fixtureId || title).replace(/[^a-zA-Z0-9]/g, "")}@ridex.engine`,
      `DTSTAMP:${fmtUTC(new Date())}`,
      `DTSTART:${fmtUTC(start)}`,
      `DTEND:${fmtUTC(end)}`,
      `SUMMARY:${escapeICS(title)}`,
      `DESCRIPTION:${escapeICS(desc)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeICS(`Kickoff soon: ${title}`)}`, "TRIGGER:-PT30M", "END:VALARM",
      "END:VEVENT"
    );
    count++;
  });
  lines.push("END:VCALENDAR");
  return { ics: lines.join("\r\n"), count };
}

// One-tap: downloads a .ics of the engine's upcoming picks — imports into
// Google Calendar (Settings → Import & export) with a 30-min reminder on each.
export function downloadPicksICS(picks, filename = "ridex-engine-picks.ics") {
  const { ics, count } = buildPicksICS(picks || []);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return count;
}

// One-click: downloads a .ics of the next 7 days' fixtures. Import once into
// Google Calendar → Settings → Import & export; each event carries a 30-min
// kickoff reminder so alerts fire automatically for every upcoming match.
export function downloadFixturesICS(events, filename = "ridex-7day-fixtures.ics") {
  const { ics, count } = buildFixturesICS(events || []);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return count;
}