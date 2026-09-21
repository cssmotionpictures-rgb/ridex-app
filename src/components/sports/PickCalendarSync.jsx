import React from "react";
import { base44 } from "@/api/base44Client";
import { CalendarClock, CalendarPlus, Download, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { downloadPicksICS } from "@/lib/calendarSync";

// Pushes EVERY upcoming fixture kickoff plus each day's PREDICTION SLIP
// RELEASE (the daily batch drop for the next 7 days) straight to the
// connected Google Calendar — every event with a popup notification, so a
// match alert or a slip release is never missed. If the Calendar connection
// is unavailable, the kickoff schedule exports as a one-tap .ics file that
// imports into Google / Apple Calendar — syncing always has a working path.

const BATCH_TITLES = "CHOP EBA · SUGAR · DRINK 7UP · SPECIAL ODDS · MORE SPORTS";

export default function PickCalendarSync({ picks = [] }) {
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const [error, setError] = React.useState(null);

  const upcoming = picks.filter((p) => p.kickoff && new Date(p.kickoff).getTime() > Date.now());

  // Kickoff events — uid is the upsert key, so re-syncs never duplicate.
  const kickoffEvents = upcoming.map((p) => {
    const start = new Date(p.kickoff);
    return {
      title: `${p.home} vs ${p.away} — ${p.marketLabel || "Engine pick"}`,
      home: p.home,
      away: p.away,
      league: p.league,
      start: start.toISOString(),
      end: new Date(start.getTime() + 105 * 60000).toISOString(),
      reminderMinutes: 30,
      uid: `ridex-kick-${p.fixtureId || `${p.home}-${p.away}-${p.kickoff}`}`.replace(/\s+/g, "-"),
    };
  });

  // Daily prediction-batch events — the day's tickets drop at 08:30 local,
  // with a 10-minute popup notification, for each of the next 7 days.
  const batchEvents = [];
  for (let d = 0; d < 7; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const ymd = day.toISOString().slice(0, 10);
    const start = new Date(`${ymd}T08:30:00`);
    batchEvents.push({
      title: `RIDE X — Today's prediction slips released`,
      home: "Ride X",
      away: "Predict & Win",
      league: "Daily slip release",
      start: start.toISOString(),
      end: new Date(start.getTime() + 30 * 60000).toISOString(),
      reminderMinutes: 10,
      uid: `ridex-slip-${ymd}`,
    });
  }

  const events = [...kickoffEvents, ...batchEvents];

  const syncNow = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await base44.functions.invoke("sync-google-calendar", { events });
      const d = res?.data || res;
      if (d && (d.created > 0 || d.created === 0) && !d.error) {
        setDone(d);
      } else {
        throw new Error(d?.error || "Calendar sync unavailable");
      }
    } catch (e) {
      setError(e?.message || "Google Calendar sync unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-primary shrink-0" />
        <p className="font-bold text-sm">NEVER MISS KICKOFF OR A SLIP RELEASE</p>
        <span className="ml-auto text-[10px] text-muted-foreground">{upcoming.length} picks · 7 daily batches</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Adds every upcoming fixture kickoff and each day's prediction slip release ({BATCH_TITLES}) to your Google
        Calendar — each with its own popup notification, so a match alert or a ticket drop never slips by.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={syncNow}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
          {busy ? "Syncing…" : "Sync to my Calendar"}
        </button>
        {upcoming.length > 0 && (
          <button
            onClick={() => downloadPicksICS(upcoming)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-secondary text-[11px] font-semibold hover:bg-secondary/70"
          >
            <Download className="w-3.5 h-3.5" /> Kickoff file (.ics)
          </button>
        )}
      </div>
      {done && (done.created > 0 || done.updated > 0 || done.failed > 0) && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {done.created + done.updated} of {done.total} events in your Google Calendar — kickoffs with 30-min
          reminders, daily slip releases with 10-min alerts{done.failed > 0 ? ` · ${done.failed} failed` : ""}.
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-400 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {error} Use the kickoff file button instead — download it, then import it once in Google Calendar
            (Settings → Import &amp; export) and every kickoff lands in your schedule with reminders.
          </span>
        </p>
      )}
    </div>
  );
}