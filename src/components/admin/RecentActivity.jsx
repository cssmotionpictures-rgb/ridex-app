import React from "react";
import { money } from "@/lib/pricing";
import { getLastSeen } from "@/hooks/useNewBookings";
import { Car, Package, Wrench, Droplets, UtensilsCrossed, LifeBuoy } from "lucide-react";

/**
 * Shows the latest bookings across every service in one feed, tagging items
 * created since the admin's last visit with a "NEW" badge so nothing is missed.
 */
export default function RecentActivity({ rides = [], deliveries = [], rentals = [], washes = [], tables = [], tickets = [] }) {
  const lastSeen = getLastSeen();

  const items = [
    ...rides.map((r) => ({ type: "Ride", icon: Car, title: `${r.pickup_address || "—"} → ${r.dest_address || "—"}`, sub: `${money(r.offer_amount || r.accepted_amount || 0)} · ${r.status}`, t: r.created_date })),
    ...deliveries.map((r) => ({ type: "Delivery", icon: Package, title: r.tracking_number || "Parcel", sub: `${r.pickup_address || ""} → ${r.delivery_address || ""}`, t: r.created_date })),
    ...rentals.map((r) => ({ type: "Equipment", icon: Wrench, title: r.model || "Machine", sub: `${money(r.total_amount)} · ${r.status}`, t: r.created_date })),
    ...washes.map((r) => ({ type: "Carwash", icon: Droplets, title: r.service_type || "Wash", sub: `${money(r.total_amount)} · ${r.status}`, t: r.created_date })),
    ...tables.map((r) => ({ type: "Table", icon: UtensilsCrossed, title: r.venue_name || "Venue", sub: `${r.booking_date || ""} · ${r.number_of_guests || 0} guests`, t: r.created_date })),
    ...tickets.map((r) => ({ type: "Ticket", icon: LifeBuoy, title: r.subject || "Support", sub: `${r.status} · ${r.customer_email || ""}`, t: r.created_date })),
  ];

  items.sort((a, b) => new Date(b.t) - new Date(a.t));
  const recent = items.slice(0, 8);

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Recent activity</h3>
        <span className="text-xs text-muted-foreground">Latest bookings across services</span>
      </div>
      <div className="space-y-2">
        {recent.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
        {recent.map((it, i) => {
          const isNew = new Date(it.t).getTime() > lastSeen;
          return (
            <div key={i} className="flex items-center gap-3 rounded-2xl bg-secondary/40 p-3">
              <span className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <it.icon className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{it.title}</p>
                <p className="text-xs text-muted-foreground truncate">{it.sub}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.type}</span>
                {isNew && <span className="ml-2 text-[10px] font-bold text-primary">NEW</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}