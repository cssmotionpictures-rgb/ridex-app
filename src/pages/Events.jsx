import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Plus, Settings2, Sparkles, Loader2, CalendarDays, Bell } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EventCard from "@/components/events/EventCard";
import EventFilters from "@/components/events/EventFilters";
import SubmitEventForm from "@/components/events/SubmitEventForm";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const VISIBLE = ["on_sale", "live", "approved"];

function applyFilters(events, f) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endWeek = new Date(startToday); endWeek.setDate(endWeek.getDate() + 7);
  const endMonth = new Date(startToday); endMonth.setMonth(endMonth.getMonth() + 1);
  return events.filter((e) => {
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = `${e.title} ${e.artist_lineup || ""} ${e.venue || ""} ${e.city || ""} ${e.genres || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const date = e.event_date ? new Date(e.event_date) : null;
    if (date && f.date !== "all") {
      if (f.date === "today" && (date < startToday || date > new Date(startToday.getTime() + 86400000))) return false;
      if (f.date === "week" && (date < startToday || date > endWeek)) return false;
      if (f.date === "month" && (date < startToday || date > endMonth)) return false;
    }
    if (f.venue !== "all" && e.venue_type !== f.venue) return false;
    const prices = [e.ticket_early_bird_price, e.ticket_regular_price, e.ticket_streaming_price, e.ticket_group_price, e.ticket_vip_price].filter((p) => p > 0);
    const min = prices.length ? Math.min(...prices) : 0;
    if (f.price === "free" && min > 0) return false;
    if (f.price === "low" && min >= 20000) return false;
    if (f.price === "mid" && (min < 20000 || min > 100000)) return false;
    if (f.price === "high" && min < 100000) return false;
    return true;
  });
}

export default function Events() {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filters, setFilters] = React.useState({ q: "", date: "all", price: "all", venue: "all" });
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me();
        setUser(u);
      } catch {}
      try {
        const raw = await base44.entities.LiveEvent.list("-event_date", 200);
        const seen = new Set();
        const list = raw.filter((e) => {
          if (!VISIBLE.includes(e.status)) return false;
          const key = (e.title || "").toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setEvents(list);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const filtered = React.useMemo(() => applyFilters(events, filters), [events, filters]);
  const featured = filtered.filter((e) => e.is_featured);
  const upcoming = filtered.filter((e) => e.status !== "live" && (!e.event_date || new Date(e.event_date) >= new Date(Date.now() - 86400000)));
  const liveNow = filtered.filter((e) => e.status === "live");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader
        eyebrow="RIDE X LIVE"
        title="Live Events & Tickets"
        subtitle="Discover live concerts, festivals, and live streams. Buy tickets in-app with instant QR entry."
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" className="rounded-full"><Link to="/event-preferences"><Settings2 className="w-4 h-4" /> Preferences</Link></Button>
          </div>
        }
      />

      {liveNow.length > 0 && (
        <div className="mb-6 rounded-3xl bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-red-300 font-bold text-sm"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE NOW</span>
          <div className="flex flex-wrap gap-2">
            {liveNow.map((e) => (
              <Link key={e.id} to={`/events/${e.id}`} className="text-sm font-semibold text-foreground hover:text-primary">
                {e.title} →
              </Link>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="browse">
        <TabsList className="rounded-full">
          <TabsTrigger value="browse" className="rounded-full">Browse</TabsTrigger>
          <TabsTrigger value="featured" className="rounded-full">Featured</TabsTrigger>
          <TabsTrigger value="submit" className="rounded-full">Submit event</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-6 space-y-6">
          <EventFilters filters={filters} setFilters={setFilters} />
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {upcoming.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => (window.location.href = `/events/${e.id}`)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="featured" className="mt-6 space-y-6">
          {featured.length === 0 ? (
            <EmptyState label="No featured events right now" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {featured.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => (window.location.href = `/events/${e.id}`)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="submit" className="mt-6">
          {user ? (
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-primary" />
                User submissions are reviewed by our team before publishing.
              </div>
              <SubmitEventForm user={user} />
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Please log in to submit an event.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ label = "No events match your filters" }) {
  return (
    <div className="text-center py-20">
      <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
      <p className="text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-1">New events are auto-discovered every few hours — check back soon.</p>
    </div>
  );
}