import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CheckCircle2, Clock, XCircle, Star, FileText } from "lucide-react";
import { money } from "@/lib/pricing";
import InvoiceDialog from "@/components/talent/InvoiceDialog";

export default function TalentBookings() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [bookings, setBookings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [reviewFor, setReviewFor] = React.useState(null);
  const [rating, setRating] = React.useState(5);
  const [feedback, setFeedback] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [invoiceFor, setInvoiceFor] = React.useState(null);

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      if (u) {
        base44.entities.TalentBooking.filter({ client_id: u.id }, "-event_date", 100)
          .then(setBookings).catch(() => {}).finally(() => setLoading(false));
      } else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter((b) => ["pending", "confirmed"].includes(b.status));
  const completed = bookings.filter((b) => b.status === "completed");
  const cancelled = bookings.filter((b) => b.status === "cancelled");

  const complete = async (b) => {
    setBusy(true);
    try {
      await base44.functions.invoke("complete-talent-booking", { booking_id: b.id });
      setBookings((prev) => prev.map((x) => x.id === b.id ? { ...x, status: "completed", escrow_status: "released" } : x));
      toast({ title: "Marked complete", description: "Funds released to the artist." });
    } catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const cancel = async (b) => {
    setBusy(true);
    try {
      await base44.entities.TalentBooking.update(b.id, { status: "cancelled", escrow_status: "refunded" });
      setBookings((prev) => prev.map((x) => x.id === b.id ? { ...x, status: "cancelled", escrow_status: "refunded" } : x));
      toast({ title: "Booking cancelled", description: "Escrow refunded." });
    } catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const submitReview = async () => {
    setBusy(true);
    try {
      await base44.entities.TalentReview.create({
        booking_id: reviewFor.id, client_id: user.id, client_name: user.full_name || "",
        artist_id: reviewFor.artist_id, rating: Number(rating), feedback,
      });
      toast({ title: "Review posted" });
      setReviewFor(null); setFeedback(""); setRating(5);
    } catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const card = (b) => (
    <div key={b.id} className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{b.artist_name}</p>
        <span className="text-xs capitalize flex items-center gap-1">
          {b.status === "confirmed" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            : b.status === "completed" ? <CheckCircle2 className="w-4 h-4 text-primary" />
            : b.status === "cancelled" ? <XCircle className="w-4 h-4 text-destructive" />
            : <Clock className="w-4 h-4 text-amber-400" />}
          {b.status}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{b.event_type} · {b.event_date}{b.event_time ? " " + b.event_time : ""} · {b.duration_hours}h</p>
      {b.project_details && <p className="text-xs text-muted-foreground mt-1">{b.project_details}</p>}
      <div className="flex items-center justify-between mt-2">
        <span className="text-sm font-semibold">{money(b.price)}</span>
        <span className="text-xs text-muted-foreground">escrow: {b.escrow_status}</span>
      </div>
      <div className="flex gap-2 mt-3 flex-wrap">
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setInvoiceFor(b)}><FileText className="w-3.5 h-3.5" /> Invoice</Button>
        {b.status === "confirmed" && b.event_date <= today && <Button size="sm" className="rounded-full" disabled={busy} onClick={() => complete(b)}>Confirm completion</Button>}
        {["pending", "confirmed"].includes(b.status) && b.event_date > today && <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => cancel(b)}>Cancel</Button>}
        {b.status === "completed" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setReviewFor(b)}>Review</Button>}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader eyebrow="My Talent Bookings" title="Bookings" subtitle="Track upcoming gigs, confirm completion to release escrow, and leave reviews." />
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !user ? (
        <p className="text-muted-foreground">Sign in to see your bookings.</p>
      ) : bookings.length === 0 ? (
        <p className="text-muted-foreground py-10">No bookings yet. <Link to="/talent" className="text-primary underline">Browse talent</Link></p>
      ) : (
        <div className="space-y-6">
          <section><p className="text-xs uppercase text-muted-foreground mb-2">Upcoming ({upcoming.length})</p><div className="space-y-2">{upcoming.map(card)}</div></section>
          <section><p className="text-xs uppercase text-muted-foreground mb-2">Completed ({completed.length})</p><div className="space-y-2">{completed.map(card)}</div></section>
          {cancelled.length > 0 && <section><p className="text-xs uppercase text-muted-foreground mb-2">Cancelled ({cancelled.length})</p><div className="space-y-2">{cancelled.map(card)}</div></section>}
        </div>
      )}

      {reviewFor && (
        <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3" onClick={() => setReviewFor(null)}>
          <div className="w-full max-w-md bg-card rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">Review {reviewFor.artist_name}</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)}>
                  <Star className={`w-6 h-6 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
            <Textarea rows={3} placeholder="Share your experience…" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <Button className="w-full rounded-full" disabled={busy} onClick={submitReview}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post review"}</Button>
          </div>
        </div>
      )}

      <InvoiceDialog booking={invoiceFor} onClose={() => setInvoiceFor(null)} />
    </div>
  );
}