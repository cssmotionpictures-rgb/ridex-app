import React from "react";
import { base44 } from "@/api/base44Client";

export const BOOKING_ENTITIES = [
  "Ride",
  "LogisticsRequest",
  "EquipmentRental",
  "CarwashBooking",
  "RestaurantBooking",
  "SupportTicket",
];

export const LAST_SEEN_KEY = "rx_admin_bookings_lastseen";

export const getLastSeen = () => Number(localStorage.getItem(LAST_SEEN_KEY) || Date.now());

/**
 * Counts bookings created since the admin last opened the Admin page.
 * Live-updates via entity subscriptions so the badge ticks up the moment
 * someone books. `markSeen()` records "now" and resets the count.
 */
export function useNewBookings(enabled = true) {
  const [count, setCount] = React.useState(0);
  const [lastSeen, setLastSeen] = React.useState(getLastSeen);

  React.useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const refresh = async () => {
      try {
        const results = await Promise.all(
          BOOKING_ENTITIES.map((e) => base44.entities[e].list("-created_date", 50).catch(() => []))
        );
        const all = results.flat();
        const n = all.filter((r) => new Date(r.created_date).getTime() > lastSeen).length;
        if (mounted) setCount(n);
      } catch {}
    };
    refresh();

    const unsubs = [];
    BOOKING_ENTITIES.forEach((e) => {
      try {
        const u = base44.entities[e].subscribe((ev) => {
          if (ev.type === "create") setCount((c) => c + 1);
        });
        if (u) unsubs.push(u);
      } catch {}
    });

    return () => {
      mounted = false;
      unsubs.forEach((u) => u && u());
    };
  }, [lastSeen, enabled]);

  const markSeen = React.useCallback(() => {
    const now = Date.now();
    localStorage.setItem(LAST_SEEN_KEY, String(now));
    setLastSeen(now);
    setCount(0);
  }, []);

  return { count, markSeen, lastSeen };
}