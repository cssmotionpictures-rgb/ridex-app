import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import VideoWatermark from "@/components/shared/VideoWatermark";
import { Image } from "@/components/ui/image";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/pricing";
import { Loader2, Calendar, Radio, Ticket, Crown, Play, X, Lock } from "lucide-react";

export default function Concerts() {
  const [concerts, setConcerts] = React.useState([]);
  const [tickets, setTickets] = React.useState([]);
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [checkout, setCheckout] = React.useState(null);
  const [watching, setWatching] = React.useState(null);

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      Promise.all([
        base44.entities.Concert.list("-event_date", 100),
        u ? base44.entities.ConcertTicket.filter({ user_id: u.id, status: "active" }, "-created_date", 100).catch(() => []) : [],
      ])
        .then(([c, t]) => { setConcerts(c); setTickets(t); })
        .finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const ticketFor = (concertId) => tickets.find((t) => t.concert_id === concertId);

  const buyTicket = async (c, tier) => {
    setCheckout({ concert: c, tier });
  };

  const onPaid = async (tx) => {
    const { concert, tier } = checkout;
    const price = tier === "vip" ? concert.ticket_price_vip : concert.ticket_price_regular;
    const t = await base44.entities.ConcertTicket.create({
      concert_id: concert.id,
      concert_title: concert.title,
      artist: concert.artist,
      user_id: user?.id || "",
      user_email: user?.email || "",
      user_name: user?.full_name || "",
      tier,
      price,
      payment_reference: tx?.reference_id || tx?.id || "",
      status: "active",
    });
    await base44.entities.Concert.update(concert.id, { tickets_sold: (concert.tickets_sold || 0) + 1 }).catch(() => {});
    setTickets((prev) => [t, ...prev]);
    setCheckout(null);
  };

  const upcoming = concerts.filter((c) => c.status !== "ended" && c.status !== "cancelled");
  const past = concerts.filter((c) => c.status === "ended");

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Live"
        title="Concert Streaming"
        subtitle="Buy tickets and watch live concerts from your favourite artists. 50% artist · 50% platform."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : upcoming.length === 0 ? (
        <div className="text-center py-20">
          <Calendar className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No concerts scheduled right now. Check back soon.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {upcoming.map((c) => {
            const myTicket = ticketFor(c.id);
            const live = c.is_live || c.status === "live";
            return (
              <div key={c.id} className="rounded-2xl border border-border/60 bg-card overflow-hidden card-lift">
                <div className="relative h-44 bg-secondary">
                  {c.poster_url ? (
                    <Image src={c.poster_url} className="w-full h-full" fittingType="fill" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Calendar className="w-10 h-10 text-primary" /></div>
                  )}
                  {live && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/90 text-white px-2 py-0.5 rounded-full">
                      <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE NOW
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-xs text-primary">{c.artist}</p>
                  <p className="font-semibold">{c.title}</p>
                  {c.event_date && <p className="text-xs text-muted-foreground">{new Date(c.event_date).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</p>}
                  {c.venue && <p className="text-xs text-muted-foreground">📍 {c.venue}</p>}
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs">
                      <p>Regular <span className="text-primary font-semibold">{money(c.ticket_price_regular)}</span></p>
                      <p className="flex items-center gap-1"><Crown className="w-3 h-3 text-primary" /> VIP <span className="text-primary font-semibold">{money(c.ticket_price_vip)}</span></p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{c.tickets_sold || 0} sold</span>
                  </div>
                  {myTicket ? (
                    <Button
                      className="w-full rounded-full"
                      disabled={!live}
                      onClick={() => live ? setWatching(c) : null}
                    >
                      {live ? <><Play className="w-4 h-4" /> Watch live</> : <><Ticket className="w-4 h-4" /> Ticket confirmed</>}
                    </Button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" className="rounded-full" onClick={() => buyTicket(c, "regular")}>Regular</Button>
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => buyTicket(c, "vip")}>
                        <Crown className="w-3.5 h-3.5" /> VIP
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-10">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Past concerts</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {past.slice(0, 6).map((c) => (
              <div key={c.id} className="rounded-xl border border-border/60 bg-card/50 p-3 opacity-70">
                <p className="text-xs text-primary">{c.artist}</p>
                <p className="text-sm font-medium truncate">{c.title}</p>
                <p className="text-[11px] text-muted-foreground">{c.tickets_sold || 0} attended</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <CheckoutDialog
        open={!!checkout}
        onOpenChange={(v) => !v && setCheckout(null)}
        amount={checkout ? (checkout.tier === "vip" ? checkout.concert.ticket_price_vip : checkout.concert.ticket_price_regular) : 0}
        service="subscription"
        description={checkout ? `${checkout.concert.title} — ${checkout.tier === "vip" ? "VIP" : "Regular"} ticket` : ""}
        referenceId={checkout ? `concert-${checkout.concert.id}` : ""}
        onPaid={onPaid}
        allowCash={false}
      />

      {watching && (
        <div className="fixed inset-0 z-[600] bg-black/85 flex items-center justify-center p-3" onClick={() => setWatching(null)}>
          <div className="relative w-full max-w-3xl bg-card rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <div><p className="font-semibold">{watching.title}</p><p className="text-xs text-primary">{watching.artist}</p></div>
              <button onClick={() => setWatching(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="relative aspect-video bg-black">
              {watching.stream_url ? (
                <video src={watching.stream_url} controls autoPlay playsInline className="absolute inset-0 w-full h-full video-8k" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Lock className="w-8 h-8" />
                  <p className="text-sm">Stream link will appear when the concert goes live.</p>
                </div>
              )}
              <VideoWatermark label="RIDE X LIVE CONCERT" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}