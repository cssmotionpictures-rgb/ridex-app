import React from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// BANKu → GOOGLE CALENDAR — the day's 15 BANKu kickoffs land in the connected
// Google Calendar automatically (once per day, with 30-minute kickoff
// reminders), so every drop's schedule is organized without a tap. Kickoff
// times come from the same day feed the engine scans; a game whose time is
// missing still lands as an all-day event so no leg is skipped.

const FLAG_PREFIX = "ridex-banku-calsync";
const BASE = "https://www.thesportsdb.com/api/v1/json/3";
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

export default function BankuCalendarSync({ picks = [] }) {
  const [state, setState] = React.useState(null);

  const run = React.useCallback(
    async (force = false) => {
      if (!picks.length) return;
      const day = picks[0].date || new Date().toISOString().slice(0, 10);
      const flag = `${FLAG_PREFIX}-${day}`;
      if (!force) {
        try {
          const prev = localStorage.getItem(flag);
          if (prev != null) {
            setState({ status: "done", added: Number(prev) || 0 });
            return;
          }
        } catch {}
      }
      setState({ status: "busy" });
      try {
        let times = new Map();
        try {
          const res = await fetch(`${BASE}/eventsday.php?d=${day}&s=Soccer`);
          const j = await res.json();
          for (const ev of (j && j.events) || []) {
            const ts = ev.strTimestamp ? new Date(Number(ev.strTimestamp) * 1000) : null;
            times.set(norm(ev.strHomeTeam), ts && !isNaN(ts.getTime()) ? ts : null);
          }
        } catch {}

        const events = picks.map((p) => {
          const start = times.get(norm(p.home)) || null;
          const ev = {
            title: `BANKu: ${p.home} vs ${p.away} — ${p.marketLabel}`,
            home: p.home,
            away: p.away,
            league: `${p.league || "Football"} · BANKu daily drop`,
            reminderMinutes: 30,
            uid: `ridex-banku-${day}-${norm(p.home)}-${norm(p.away)}`,
          };
          if (start) {
            ev.start = start.toISOString();
            ev.end = new Date(start.getTime() + 105 * 60000).toISOString();
          } else {
            ev.allDay = true;
            ev.start = day;
            ev.end = day;
          }
          return ev;
        });

        const res = await base44.functions.invoke("sync-google-calendar", { events });
        const d = res?.data || res;
        if (d && !d.error) {
          const added = (d.created || 0) + (d.updated || 0);
          try {
            localStorage.setItem(flag, String(added));
          } catch {}
          setState({ status: "done", added });
        } else {
          throw new Error(d?.error || "sync unavailable");
        }
      } catch (e) {
        setState({ status: "error", message: e?.message || "" });
      }
    },
    [picks]
  );

  React.useEffect(() => {
    run(false);
  }, [run]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 flex items-center gap-2">
      <CalendarCheck className="w-4 h-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        {state?.status === "busy" && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Adding today's BANKu kickoffs to your Google Calendar…
          </p>
        )}
        {state?.status === "done" && (
          <p className="text-[11px] text-emerald-400 font-semibold">
            ✓ {state.added} BANKu kickoff{state.added !== 1 ? "s" : ""} in your Google Calendar — each with a 30-minute kickoff reminder.
          </p>
        )}
        {state?.status === "error" && (
          <p className="text-[11px] text-amber-400">
            Calendar sync unavailable right now{state.message ? ` (${state.message})` : ""}.
          </p>
        )}
        {(!state || state.status === "idle") && (
          <p className="text-[11px] text-muted-foreground">Today's BANKu kickoffs sync to your Google Calendar automatically.</p>
        )}
      </div>
      {state?.status === "error" && (
        <button onClick={() => run(true)} className="px-3 py-1 rounded-full bg-secondary text-[10px] font-bold shrink-0">
          RETRY
        </button>
      )}
    </div>
  );
}