import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarDays, MapPin, Ticket, Radio } from "lucide-react";

// SYNCED EVENT SCHEDULE — pulls upcoming approved/live events from the LiveEvent
// entity so the game schedule stays in sync with the platform's event calendar.
// All client-side (no backend functions, no credits).

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function GameEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Upcoming + live events, soonest first. status in approved/on_sale/live.
        const all = await base44.entities.LiveEvent.list("event_date", 50);
        const now = Date.now();
        const upcoming = (all || [])
          .filter((e) => ["approved", "on_sale", "live"].includes(e.status) && e.event_date && new Date(e.event_date).getTime() >= now - 86400000)
          .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
          .slice(0, 6);
        if (alive) setEvents(upcoming);
      } catch (e) {
        /* ignore */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="noir-panel rounded-2xl p-4">
        <p className="text-xs text-[#8a6d3b] text-center">Syncing event schedule…</p>
      </div>
    );
  }
  if (events.length === 0) {
    return null; // don't clutter the hub when there's nothing to sync
  }

  return (
    <div className="noir-panel rounded-2xl p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#c5a059]/60 to-transparent" />
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-5 h-5 text-[#c5a059]" />
        <h3 className="font-bold text-[#d1a985] tracking-wide">Synced Event Schedule</h3>
        <span className="text-[9px] uppercase tracking-widest text-[#8a6d3b] ml-auto">Live from platform calendar</span>
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {events.map((ev) => {
          const isLive = ev.status === "live";
          return (
            <div key={ev.id} className="shrink-0 w-60 rounded-xl border border-[#c5a059]/20 bg-[#0a0706]/60 p-3 card-lift">
              <div className="flex items-center gap-1.5 mb-1">
                {isLive ? (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-red-300"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE</span>
                ) : (
                  <span className="text-[9px] uppercase tracking-wider text-[#d97757] font-bold">{ev.event_type?.replace("_", " ")}</span>
                )}
              </div>
              <p className="text-xs font-bold text-foreground leading-tight line-clamp-2">{ev.title}</p>
              <div className="mt-1.5 space-y-0.5 text-[10px] text-[#8a6d3b]">
                <p className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {fmtDate(ev.event_date)}</p>
                {(ev.venue || ev.city) && <p className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.venue || ev.city}</p>}
                {ev.artist_lineup && <p className="truncate italic">{ev.artist_lineup}</p>}
              </div>
              {ev.ticket_regular_price > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-[10px] text-[#d1a985]"><Ticket className="w-3 h-3" /> from ₦{ev.ticket_early_bird_price?.toLocaleString() || ev.ticket_regular_price.toLocaleString()}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}