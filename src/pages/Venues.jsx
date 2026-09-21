import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ServiceMap from "@/components/shared/ServiceMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VenueMedia from "@/components/venues/VenueMedia";
import VibeHero from "@/components/venues/VibeHero";
import NearbyPlaces from "@/components/venues/NearbyPlaces";
import { Star, MapPin, History, LifeBuoy, Receipt } from "lucide-react";
import QuickActionsFab from "@/components/shared/QuickActionsFab";

const CATEGORIES = ["All", "Fine Dining", "Casual", "Fast Food", "Sports Bar", "Cocktail Lounge", "Nightclub", "Wine Bar", "Rooftop Bar", "Beach Bar", "Pub & Grill"];

export default function Venues() {
  const [venues, setVenues] = React.useState([]);
  const [cat, setCat] = React.useState("All");
  const [detail, setDetail] = React.useState(null);
  const [booking, setBooking] = React.useState(null);
  const [date, setDate] = React.useState("");
  const [guests, setGuests] = React.useState(2);
  const [notes, setNotes] = React.useState("");
  const [myBookings, setMyBookings] = React.useState([]);

  const load = () => {
    base44.entities.Venue.filter({ status: "active" }, "-featured").then(setVenues);
    base44.entities.RestaurantBooking.list("-created_date", 10).then(setMyBookings);
  };
  React.useEffect(() => { load(); }, []);

  const list = cat === "All" ? venues : venues.filter((v) => v.category === cat);

  const confirm = async () => {
    await base44.entities.RestaurantBooking.create({
      venue_id: booking.id,
      venue_name: booking.name,
      booking_date: date,
      number_of_guests: Number(guests),
      special_requests: notes,
      status: "confirmed",
    });
    await base44.entities.Venue.update(booking.id, { bookings_count: (booking.bookings_count || 0) + 1 });
    setBooking(null);
    setDetail(null);
    setNotes("");
    load();
  };

  return (
    <div>
      <PageHeader eyebrow="Vibe & Tap" title="Find your next table" subtitle="Bars, restaurants, lounges and clubs near you — reserve in seconds." />

      <VibeHero />

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-6">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap border ${cat === c ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-muted-foreground"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {list.length === 0 && <p className="text-sm text-muted-foreground">No venues in this category yet.</p>}
        {list.map((v) => (
          <button key={v.id} onClick={() => setDetail(v)} className="text-left rounded-3xl overflow-hidden border border-border/60 bg-card hover:border-primary/40 transition-colors">
            <div className="h-44 bg-secondary">
              {v.photo_url && <VenueMedia src={v.photo_url} alt={v.name} className="w-full h-full object-cover" />}
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold truncate">{v.name}</h3>
                <span className="text-xs flex items-center gap-1 text-primary"><Star className="w-3 h-3 fill-current" />{v.rating}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{v.category} · {v.price_level}</p>
              <p className="text-xs text-muted-foreground mt-2 truncate flex items-center gap-1"><MapPin className="w-3 h-3" />{v.address}</p>
            </div>
          </button>
        ))}
      </div>

      <NearbyPlaces />

      <h3 id="my-table-bookings" className="font-semibold mt-12 mb-4">My table bookings</h3>
      <div className="space-y-3">
        {myBookings.length === 0 && <p className="text-sm text-muted-foreground">No bookings yet.</p>}
        {myBookings.map((b) => (
          <div key={b.id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium">{b.venue_name}</p>
              <p className="text-xs text-muted-foreground">{b.booking_date} · {b.number_of_guests} guests{b.special_requests ? ` · ${b.special_requests}` : ""}</p>
            </div>
            <StatusBadge status={b.status} />
          </div>
        ))}
      </div>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.name}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              {detail.photo_url && <VenueMedia src={detail.photo_url} alt={detail.name} className="w-full h-56 rounded-2xl object-cover" />}
              <p className="text-sm text-muted-foreground">{detail.description}</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1 text-primary"><Star className="w-4 h-4 fill-current" />{detail.rating}</span>
                <span>{detail.category}</span>
                <span>{detail.price_level}</span>
                <span className="text-muted-foreground">{detail.bookings_count || 0} bookings</span>
              </div>
              {detail.lat && (
                <ServiceMap height="220px" markers={[{ position: [detail.lat, detail.lng], kind: "venue", label: detail.name }]} />
              )}
              <Button className="w-full rounded-full h-11 font-semibold" onClick={() => setBooking(detail)}>Book a table</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!booking} onOpenChange={(v) => !v && setBooking(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>Book at {booking?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Date & time</Label>
              <Input type="datetime-local" className="rounded-xl mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Guests</Label>
              <Input type="number" min="1" className="rounded-xl mt-1" value={guests} onChange={(e) => setGuests(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Special requests</Label>
              <Textarea className="rounded-xl mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Window table, birthday cake…" />
            </div>
            <Button className="w-full rounded-full h-11 font-semibold" disabled={!date} onClick={confirm}>Confirm booking</Button>
          </div>
        </DialogContent>
      </Dialog>
      <QuickActionsFab
        label="History & support"
        items={[
          { icon: History, label: "My bookings", onClick: () => document.getElementById("my-table-bookings")?.scrollIntoView({ behavior: "smooth" }) },
          { icon: Receipt, label: "Payment history", to: "/receipts" },
          { icon: LifeBuoy, label: "Support", to: "/support" },
        ]}
      />
    </div>
  );
}