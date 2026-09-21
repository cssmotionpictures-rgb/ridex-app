import React from "react";
import { base44 } from "@/api/base44Client";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Users, Clock, Share2, Bell, Loader2, Crown, Star, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import TicketPurchase from "@/components/events/TicketPurchase";
import PerformanceSlots from "@/components/events/PerformanceSlots";
import BookPerformanceSlot from "@/components/events/BookPerformanceSlot";
import QrTicket from "@/components/events/QrTicket";

export default function EventDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [event, setEvent] = React.useState(null);
  const [user, setUser] = React.useState(null);
  const [tickets, setTickets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [reminderOn, setReminderOn] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      let u = null;
      try { u = await base44.auth.me(); setUser(u); } catch {}
      try {
        const ev = await base44.entities.LiveEvent.get(id);
        setEvent(ev);
        if (u) {
          const mine = await base44.entities.EventTicket.filter({ event_id: id, user_id: u.id });
          setTickets(mine);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [id]);

  const share = async () => {
    const url = `${window.location.origin}/events/${id}`;
    if (navigator.share) {
      try { await navigator.share({ title: event.title, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); toast({ title: "Link copied" }); } catch {}
    }
  };

  const toggleReminder = async () => {
    if (!user) return;
    try {
      if (reminderOn) {
        await base44.entities.EventReminder.deleteMany({ event_id: id, user_id: user.id });
        setReminderOn(false);
        toast({ title: "Reminders off" });
      } else {
        await base44.entities.EventReminder.bulkCreate([
          { event_id: id, event_title: event.title, user_id: user.id, reminder_type: "1_week", status: "pending" },
          { event_id: id, event_title: event.title, user_id: user.id, reminder_type: "1_day", status: "pending" },
          { event_id: id, event_title: event.title, user_id: user.id, reminder_type: "1_hour", status: "pending" },
          { event_id: id, event_title: event.title, user_id: user.id, reminder_type: "live", status: "pending" },
        ]);
        setReminderOn(true);
        toast({ title: "Reminders on — we'll notify you" });
      }
    } catch (e) { toast({ title: e.message, variant: "destructive" }); }
  };

  React.useEffect(() => {
    if (user && event && tickets.length) {
      base44.entities.EventReminder.filter({ event_id: id, user_id: user.id }).then((r) => setReminderOn(r.length > 0)).catch(() => {});
    }
  }, [user, event, id, tickets.length]);

  if (loading) return <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!event) return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-muted-foreground">Event not found.</p>
      <Button asChild variant="outline" className="rounded-full mt-4"><Link to="/events">Back to events</Link></Button>
    </div>
  );

  const date = event.event_date ? new Date(event.event_date) : null;
  const lineup = event.artist_lineup ? event.artist_lineup.split(",").map((a) => a.trim()).filter(Boolean) : [];
  const genres = event.genres ? event.genres.split(",").map((g) => g.trim()).filter(Boolean) : [];
  const sold = event.tickets_sold || 0;
  const capacity = event.capacity || 0;
  const pct = capacity ? Math.min(100, Math.round((sold / capacity) * 100)) : 0;
  const isLive = event.status === "live";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Button asChild variant="ghost" className="rounded-full mb-3 -ml-2"><Link to="/events"><ArrowLeft className="w-4 h-4" /> All events</Link></Button>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-5">
          {/* Banner */}
          <div className="relative rounded-3xl overflow-hidden h-56 md:h-72 bg-secondary">
            {event.banner_url ? (
              <Image src={event.banner_url} fittingType="fill" className="w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 via-accent/10 to-secondary">
                <span className="text-7xl">🎤</span>
              </div>
            )}
            {isLive && (
              <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> LIVE NOW
              </div>
            )}
            {event.is_featured && (
              <div className="absolute top-4 right-4 flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                <Star className="w-3 h-3" /> Featured
              </div>
            )}
          </div>

          <div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold">{event.title}</h1>
              <Button variant="outline" size="icon" className="rounded-full shrink-0" onClick={share}><Share2 className="w-4 h-4" /></Button>
            </div>
            {lineup.length > 0 && (
              <p className="text-primary font-semibold mt-1">Featuring {lineup.join(", ")}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
              {date && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {date.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                </span>
              )}
              {date && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {(event.venue || event.city) && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {event.venue ? `${event.venue}${event.city ? ", " + event.city : ""}` : event.city}
                </span>
              )}
            </div>
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {genres.map((g, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">{g}</span>
                ))}
              </div>
            )}
          </div>

          {event.description && (
            <div className="rounded-2xl bg-card border border-border p-4">
              <h3 className="font-semibold mb-2">About this event</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{event.description}</p>
            </div>
          )}

          {lineup.length > 0 && (
            <div className="rounded-2xl bg-card border border-border p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Crown className="w-4 h-4 text-primary" /> Artist lineup</h3>
              <div className="flex flex-wrap gap-2">
                {lineup.map((a, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full bg-secondary border border-border text-sm">{a}</span>
                ))}
              </div>
            </div>
          )}

          {capacity > 0 && (
            <div className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {sold.toLocaleString()} sold</span>
                <span className="text-muted-foreground">{capacity.toLocaleString()} capacity</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {/* My tickets for this event */}
          {tickets.length > 0 && (
            <div className="rounded-2xl bg-card border border-border p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Your tickets</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {tickets.map((t) => (
                  <div key={t.id} className="rounded-2xl bg-secondary p-4 flex flex-col items-center gap-3 border border-border">
                    <QrTicket code={t.qr_code} size={120} />
                    <div className="text-center">
                      <p className="text-xs uppercase text-muted-foreground">{t.ticket_type}</p>
                      <p className="text-sm font-semibold">{t.quantity} {t.quantity > 1 ? "admissions" : "admission"}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block ${t.status === "paid" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <PerformanceSlots event={event} user={user} />
          <BookPerformanceSlot event={event} user={user} />

          {isLive && event.live_stream_url && (
            <div className="rounded-2xl overflow-hidden border border-border bg-black aspect-video">
              <video src={event.live_stream_url} controls autoPlay className="w-full h-full" />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <TicketPurchase event={event} user={user} onPurchased={() => {
            base44.entities.EventTicket.filter({ event_id: id, user_id: user.id }).then(setTickets).catch(() => {});
          }} />
          <Button
            variant={reminderOn ? "default" : "outline"}
            className="w-full rounded-full h-11 font-semibold"
            onClick={toggleReminder}
            disabled={!user}
          >
            <Bell className="w-4 h-4" /> {reminderOn ? "Reminders on" : "Remind me"}
          </Button>
          {!user && <p className="text-xs text-center text-muted-foreground">Log in to buy tickets and set reminders.</p>}
        </div>
      </div>
    </div>
  );
}