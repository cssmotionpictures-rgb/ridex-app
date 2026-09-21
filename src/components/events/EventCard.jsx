import React from "react";
import { Calendar, MapPin, Users, Star } from "lucide-react";
import { money } from "@/lib/pricing";
import { Image } from "@/components/ui/image";

const STATUS_STYLES = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  on_sale: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  live: "bg-red-500/15 text-red-300 border-red-500/30 animate-pulse",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

const TYPE_LABEL = {
  concert: "Concert", festival: "Festival", live_stream: "Live Stream",
  meet_greet: "Meet & Greet", album_launch: "Album Launch",
};

export default function EventCard({ event, onClick }) {
  const prices = [
    event.ticket_early_bird_price, event.ticket_regular_price, event.ticket_streaming_price,
    event.ticket_group_price, event.ticket_vip_price,
  ].filter((p) => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const date = event.event_date ? new Date(event.event_date) : null;
  const sold = event.tickets_sold || 0;
  const capacity = event.capacity || 0;
  const pct = capacity ? Math.min(100, Math.round((sold / capacity) * 100)) : 0;

  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-3xl overflow-hidden bg-card border border-border card-lift group"
    >
      <div className="relative h-40 bg-secondary">
        {event.banner_url ? (
          <Image src={event.banner_url} fittingType="fill" className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 via-accent/10 to-secondary">
            <span className="text-5xl">🎤</span>
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-black/60 backdrop-blur text-primary">
            {TYPE_LABEL[event.event_type] || "Event"}
          </span>
          {event.is_featured && (
            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-primary text-primary-foreground flex items-center gap-1">
              <Star className="w-3 h-3" /> Featured
            </span>
          )}
        </div>
        <span className={`absolute bottom-3 right-3 text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${STATUS_STYLES[event.status] || ""} bg-black/60 backdrop-blur`}>
          {event.status.replace("_", " ")}
        </span>
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-bold leading-tight line-clamp-1 group-hover:text-primary transition-colors">{event.title}</h3>
        {event.artist_lineup && (
          <p className="text-sm text-muted-foreground line-clamp-1">{event.artist_lineup}</p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
          {(event.venue || event.city) && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {event.city || event.venue || "TBA"}
            </span>
          )}
        </div>
        {event.genres && (
          <div className="flex flex-wrap gap-1">
            {event.genres.split(",").slice(0, 3).map((g, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent">{g.trim()}</span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="font-extrabold text-primary">
            {minPrice > 0 ? `From ${money(minPrice)}` : "Free"}
          </span>
          {capacity > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="w-3 h-3" /> {pct}% sold
            </span>
          )}
        </div>
      </div>
    </button>
  );
}