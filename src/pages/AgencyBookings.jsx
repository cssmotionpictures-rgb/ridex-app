import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import BookingPromotionDialog from "@/components/agency/BookingPromotionDialog";
import { money } from "@/lib/pricing";
import { Loader2, Megaphone, CalendarClock, CalendarDays } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import BookingsCalendar from "@/components/agency/BookingsCalendar";

const TIER_BADGE = {
  mega_star: "bg-purple-500/15 text-purple-300 border-purple-400/30",
  superstar: "bg-amber-400/15 text-amber-300 border-amber-300/30",
  a_list: "bg-yellow-400/10 text-yellow-200 border-yellow-300/25",
  mid: "bg-sky-400/10 text-sky-300 border-sky-300/25",
  rising: "bg-emerald-400/10 text-emerald-300 border-emerald-300/25",
  emerging: "bg-slate-400/10 text-slate-300 border-slate-300/25",
};

export default function AgencyBookings() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [artists, setArtists] = React.useState([]);
  const [bookings, setBookings] = React.useState([]);
  const [promotions, setPromotions] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [view, setView] = React.useState("profiles");

  const moveBooking = async (id, date) => {
    try {
      await base44.entities.TalentBooking.update(id, { event_date: date });
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, event_date: date } : b)));
      toast({ title: "Booking moved", description: `Rescheduled to ${date}.` });
    } catch (e) {
      toast({ title: "Couldn't move the booking", description: e.message, variant: "destructive" });
    }
  };

  React.useEffect(() => {
    (async () => {
      const [a, b, p] = await Promise.all([
        base44.entities.TalentArtist.list("-created_date", 200),
        base44.entities.TalentBooking.list("-created_date", 200),
        base44.entities.PromotionPackage.list("-created_date", 500),
      ]);
      setArtists(a);
      setBookings(b);
      setPromotions(p);
    })().catch(() => {}).finally(() => setLoading(false));
  }, []);

  const promosFor = (artist) =>
    promotions.filter((pp) => pp.artist_name && (pp.artist_name === artist.stage_name || pp.artist_name === artist.full_name));

  const bookingInfo = (artist) => {
    const list = bookings.filter((bk) => bk.artist_id === artist.id || bk.artist_name === artist.stage_name);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = list.filter((bk) => bk.event_date >= today && ["pending", "confirmed"].includes(bk.status));
    if (upcoming.length) {
      const next = upcoming.reduce((m, bk) => (bk.event_date < m.event_date ? bk : m));
      return {
        label: `${next.status === "confirmed" ? "Confirmed" : "Pending"} · ${next.event_date}`,
        tone: next.status === "confirmed" ? "ok" : "warn",
      };
    }
    if (list.length) {
      const latest = list.reduce((m, bk) => (bk.event_date > m.event_date ? bk : m));
      return { label: `${list.length} booking${list.length > 1 ? "s" : ""} · last ${latest.event_date} (${latest.status})`, tone: "muted" };
    }
    return { label: "No bookings yet", tone: "muted" };
  };

  return (
    <div>
      <PageHeader
        eyebrow="Agency"
        title="Bookings & Promotions"
        subtitle="Every talent profile with its live booking status and promotional packages in one place."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant={view === "profiles" ? "default" : "outline"} className="rounded-full" onClick={() => setView("profiles")}>Profiles</Button>
            <Button size="sm" variant={view === "calendar" ? "default" : "outline"} className="rounded-full" onClick={() => setView("calendar")}>
              <CalendarDays className="w-3.5 h-3.5 mr-1" /> Calendar
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : view === "calendar" ? (
        <BookingsCalendar bookings={bookings} promotions={promotions} onMove={moveBooking} />
      ) : !artists.length ? (
        <p className="text-sm text-muted-foreground text-center py-12">No talent profiles yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {artists.map((a) => {
            const info = bookingInfo(a);
            const promos = promosFor(a);
            return (
              <div key={a.id} className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-4 card-lift">
                <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-heading font-bold shrink-0">
                  {(a.stage_name || a.full_name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{a.stage_name || a.full_name}</p>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${TIER_BADGE[a.tier] || TIER_BADGE.emerging}`}>
                      {(a.tier_label || a.tier || "").replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.talent_type} · {a.booking_price ? money(a.booking_price) : "Price on request"}{a.location ? ` · ${a.location}` : ""}
                  </p>
                  <p className="text-xs mt-1 flex items-center gap-1">
                    <CalendarClock className="w-3 h-3 shrink-0" />
                    <span className={info.tone === "ok" ? "text-emerald-300" : info.tone === "warn" ? "text-amber-300" : "text-muted-foreground"}>
                      {info.label}
                    </span>
                  </p>
                </div>
                <Button size="sm" variant="outline" className="rounded-full shrink-0" onClick={() => setSelected(a)}>
                  <Megaphone className="w-3.5 h-3.5 mr-1" /> Packages{promos.length ? ` (${promos.length})` : ""}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <BookingPromotionDialog
        artist={selected}
        promotions={selected ? promosFor(selected) : []}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}