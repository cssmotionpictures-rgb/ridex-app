import React from "react";
import { base44 } from "@/api/base44Client";
import { CalendarDays, CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

// CONFIRMED BOOKINGS → GOOGLE CALENDAR, ALWAYS CURRENT.
// Every confirmed talent booking and scheduled/live concert is pushed to the
// connected Google Calendar. Events carry deterministic ids (ridexbooking… /
// ridexconcert…), so a re-sync PATCHes the existing event in place — no
// duplicates — and anything that flips to cancelled is removed automatically.
// Live entity subscriptions watch status changes: whenever a booking or
// concert changes anywhere in the app, this card quietly re-syncs a few
// seconds later. Admin-only (the shared calendar is the agency's own).

const HOUR = 60 * 60000;

function bookingEvent(b) {
  const d = b.event_date ? new Date(b.event_date) : null;
  if (!d || isNaN(d.getTime())) return null;
  if (b.event_time) {
    const [hh, mm] = String(b.event_time).split(":");
    d.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
  }
  const end = new Date(d.getTime() + Math.max(1, Number(b.duration_hours) || 1) * HOUR);
  return {
    uid: `ridexbooking${b.id}`,
    title: `${b.artist_name} — ${b.event_type || "booking"}`,
    start: d.toISOString(),
    end: end.toISOString(),
    home: b.artist_name || "",
    away: b.client_name || "",
    league: `Talent booking · ${b.status}`,
    reminderMinutes: 120,
  };
}

function concertEvent(c) {
  const d = c.event_date ? new Date(c.event_date) : null;
  if (!d || isNaN(d.getTime())) return null;
  return {
    uid: `ridexconcert${c.id}`,
    title: c.title || c.artist,
    start: d.toISOString(),
    end: new Date(d.getTime() + 3 * HOUR).toISOString(),
    home: c.artist || "",
    away: c.venue || "",
    league: `Concert · ${c.status}`,
    reminderMinutes: 120,
  };
}

export default function BookingCalendarSync() {
  const [me, setMe] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [lastSync, setLastSync] = React.useState(null);
  const timer = React.useRef(null);

  React.useEffect(() => {
    base44.auth.me().then(setMe).catch(() => setMe(null));
  }, []);

  const sync = React.useCallback(async (silent = false) => {
    setBusy(true);
    try {
      const [bookings, concerts] = await Promise.all([
        base44.entities.TalentBooking.list("-event_date", 200).catch(() => []),
        base44.entities.Concert.list("event_date", 200).catch(() => []),
      ]);
      const cutoff = Date.now() - 30 * 86400000;
      const upcoming = (ev) => ev && new Date(ev.start).getTime() >= cutoff;

      const confirmedBookings = (bookings || []).filter((b) => b.status === "confirmed");
      const activeConcerts = (concerts || []).filter((c) => ["scheduled", "live"].includes(c.status));
      const events = [
        ...confirmedBookings.map(bookingEvent),
        ...activeConcerts.map(concertEvent),
      ].filter(upcoming);

      const cancelledUids = [
        ...(bookings || []).filter((b) => b.status === "cancelled" && new Date(b.event_date || 0).getTime() >= cutoff).map((b) => `ridexbooking${b.id}`),
        ...(concerts || []).filter((c) => c.status === "cancelled" && new Date(c.event_date || 0).getTime() >= cutoff).map((c) => `ridexconcert${c.id}`),
      ];

      if (!events.length && !cancelledUids.length) {
        if (!silent) toast({ title: "Nothing to sync", description: "No confirmed concerts or bookings on the calendar yet." });
        return null;
      }

      const res = await base44.functions.invoke("sync-google-calendar", { events, remove: cancelledUids });
      const r = res?.data || {};
      setLastSync({ ...r, at: new Date().toLocaleTimeString() });
      if (!silent) {
        toast({
          title: "Calendar synced",
          description: `${r.created || 0} added · ${r.updated || 0} updated${r.removed ? ` · ${r.removed} removed` : ""}${r.failed ? ` · ${r.failed} failed` : ""}`,
        });
      }
      return r;
    } catch (e) {
      if (!silent) toast({ title: "Calendar sync failed", description: e?.message || "Please try again", variant: "destructive" });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  // Auto-update: any booking / concert change anywhere re-syncs (debounced),
  // so the calendar always mirrors the current confirmed list.
  React.useEffect(() => {
    if (me?.role !== "admin") return;
    const queue = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => sync(true), 5000);
    };
    let u1, u2;
    try { u1 = base44.entities.TalentBooking.subscribe(queue); } catch {}
    try { u2 = base44.entities.Concert.subscribe(queue); } catch {}
    sync(true); // keep the calendar fresh whenever the dashboard is opened
    return () => {
      if (u1) u1();
      if (u2) u2();
      clearTimeout(timer.current);
    };
  }, [me, sync]);

  if (me?.role !== "admin") return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0"><CalendarDays className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Concert &amp; booking calendar sync</p>
          <p className="text-[10px] text-muted-foreground">
            Confirmed concerts and talent bookings are pushed to your Google Calendar — and automatically updated or removed whenever a booking status changes.
          </p>
        </div>
        <button
          onClick={() => sync(false)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarPlus className="w-3 h-3" />} Sync now
        </button>
      </div>
      {lastSync && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Last sync {lastSync.at} · {lastSync.created || 0} added · {lastSync.updated || 0} updated{lastSync.removed ? ` · ${lastSync.removed} removed` : ""}{lastSync.failed ? ` · ${lastSync.failed} failed` : ""}
        </p>
      )}
    </div>
  );
}