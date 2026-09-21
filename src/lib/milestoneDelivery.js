// 100% in-browser milestone delivery — no backend, no integration credits.
// Email: Gmail compose deep-link (opens pre-filled; user hits Send) with a
// mailto: fallback for non-Gmail users. Calendar: Google Calendar "add event"
// template link for the 15%-profit withdrawal reminder.
// Both open synchronously inside the WON tap gesture, so popup blockers allow
// them and delivery is automatic the moment a milestone is crossed.

export function gmailComposeLink(to, subject, body) {
  const p = new URLSearchParams({ view: "cm", fs: "1", to: to || "", su: subject || "", body: body || "" });
  return `https://mail.google.com/mail/?${p.toString()}`;
}

export function mailtoLink(to, subject, body) {
  return `mailto:${encodeURIComponent(to || "")}?subject=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(body || "")}`;
}

export function openEmail(to, subject, body) {
  const url = to && /@/.test(to) ? gmailComposeLink(to, subject, body) : mailtoLink(to, subject, body);
  window.open(url, "_blank", "noopener,noreferrer");
}

function fmtNaira(n) {
  if (n >= 1000000) return `₦${(n / 1000000).toFixed(n % 1000000 ? 1 : 0)}m`;
  if (n >= 1000) return `₦${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}

function pad(n) { return String(n).padStart(2, "0"); }
function fmtUTC(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

export function milestoneEmailBody({ tierLabel, bankroll, start, profit, withdraw15, wins, day }) {
  return [
    "Ride X · 7-Day Rollover — Milestone Reached",
    "",
    `Milestone tier: ${tierLabel}`,
    `Starting bankroll: ${fmtNaira(start)}`,
    `Current bankroll: ${fmtNaira(bankroll)}`,
    `Total profit: ${fmtNaira(profit)} (+${start > 0 ? Math.round((profit / start) * 100) : 0}%)`,
    `Wins so far: ${wins}/${day}`,
    "",
    `Withdraw 15% profit now: ${fmtNaira(withdraw15)}`,
    "",
    "Log your wins at Ride X → Dashboard. 50/50 game for fun — not betting advice. No outcome is guaranteed.",
  ].join("\n");
}

// Google Calendar "add event" template link — opens Google Calendar with a
// pre-filled withdrawal-reminder event (next hour, 30 min). One tap, no
// calendar.events scope, no API, no credits.
export function withdrawalCalendarLink({ tierLabel, bankroll, profit, withdraw15 }) {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0); // top of next hour
  const end = new Date(start.getTime() + 30 * 60000);
  const text = encodeURIComponent(`Withdraw 15% profit — Ride X rollover (${tierLabel})`);
  const details = encodeURIComponent(`Bankroll ${fmtNaira(bankroll)} · profit ${fmtNaira(profit)} · withdraw ${fmtNaira(withdraw15)}. Ride X 7-day rollover milestone — take your profit off the table.`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmtUTC(start)}/${fmtUTC(end)}&details=${details}`;
}