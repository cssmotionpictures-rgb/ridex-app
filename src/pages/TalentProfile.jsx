import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { money } from "@/lib/pricing";
import { splitTalentPrice, talentPriceFor } from "@/lib/talentPricing";
import PageHeader from "@/components/shared/PageHeader";
import BookingDialog from "@/components/talent/BookingDialog";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Star, MapPin, Calendar, Shield, CheckCircle2, ArrowLeft, Plane, Hotel, ShieldCheck, Speaker, Wallet } from "lucide-react";

export default function TalentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [artist, setArtist] = React.useState(null);
  const [reviews, setReviews] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [booking, setBooking] = React.useState(false);
  const [checkout, setCheckout] = React.useState(false);
  const [details, setDetails] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [me, setMe] = React.useState(null);

  React.useEffect(() => {
    base44.auth.me().then(setMe).catch(() => {});
    Promise.all([
      base44.entities.TalentArtist.get(id).catch(() => null),
      base44.entities.TalentReview.filter({ artist_id: id }, "-created_date", 20).catch(() => []),
    ]).then(([a, r]) => { setArtist(a); setReviews(r); }).finally(() => setLoading(false));
  }, [id]);

  const isAdmin = me?.role === "admin";

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!artist) return (
    <div className="text-center py-20">
      <p>Talent not found.</p>
      <Button className="mt-4 rounded-full" onClick={() => navigate("/talent")}>Back to talent</Button>
    </div>
  );

  const price = talentPriceFor(artist);
  const { artist: artistEarn, platform } = splitTalentPrice(price);

  const onConfirm = (d) => { setDetails(d); setBooking(false); setCheckout(true); };

  const onPaid = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("auto-submit-talent-booking", { artist_id: artist.id, ...details });
      const auto = res?.data?.auto_confirmed;
      toast({
        title: "Booking confirmed",
        description: isAdmin && auto
          ? `${artist.stage_name} auto-accepted. See it in My Bookings.`
          : "Your booking is confirmed. See it in My Bookings.",
      });
      setCheckout(false);
      navigate("/talent-bookings");
    } catch (e) {
      toast({ title: "Booking failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 rounded-full" onClick={() => navigate("/talent")}><ArrowLeft className="w-4 h-4" /> Back</Button>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="aspect-video bg-secondary">
              {artist.profile_image ? (
                <img src={artist.profile_image} alt={artist.stage_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-primary/30">{(artist.stage_name || "?").charAt(0)}</div>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-extrabold">{artist.stage_name || artist.full_name}</h1>
                  <p className="text-sm text-primary capitalize">{artist.talent_type} · {artist.tier_label || artist.tier.replace("_", " ")}</p>
                </div>
                {artist.rating > 0 && <span className="flex items-center gap-1 text-amber-400"><Star className="w-4 h-4" /> {artist.rating.toFixed(1)}</span>}
              </div>
              {artist.location && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2"><MapPin className="w-3.5 h-3.5" /> {artist.location}, {artist.country}</p>}
              {artist.bio && <p className="text-sm text-muted-foreground mt-3">{artist.bio}</p>}
            </div>
          </div>

          {artist.video_url && (
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Showreel</p>
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                {artist.video_url.includes("youtube") || artist.video_url.includes("youtu.be") ? (
                  <iframe src={artist.video_url.replace("watch?v=", "embed/")} className="w-full h-full" allowFullScreen title="showreel" />
                ) : (
                  <video src={artist.video_url} controls className="w-full h-full" />
                )}
              </div>
            </div>
          )}

          {artist.logistics_rider && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-amber-400" />
                <p className="text-xs uppercase tracking-wide text-amber-400">Logistics rider · paid by event owner</p>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">The promoter/brand hosting this show covers 100% of these costs — the agency & artist pay nothing. Breach of any item voids the contract and forfeits the deposit.</p>
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                {[
                  { icon: Plane, label: "Flights", text: artist.logistics_rider },
                  { icon: Hotel, label: "5-Star Hotel", text: artist.logistics_rider },
                  { icon: ShieldCheck, label: "VVIP Security", text: artist.logistics_rider },
                  { icon: Speaker, label: "Technical Stage", text: artist.logistics_rider },
                ].map((r) => (
                  <div key={r.label} className="rounded-xl bg-secondary/60 p-2.5">
                    <p className="flex items-center gap-1.5 font-medium text-foreground"><r.icon className="w-3.5 h-3.5 text-primary" /> {r.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3 whitespace-pre-line leading-relaxed">{artist.logistics_rider}</p>
            </div>
          )}

          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Reviews ({reviews.length})</p>
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reviews yet — be the first to book.</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div key={r.id} className="border-b border-border/40 pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{r.client_name || "Client"}</p>
                      <span className="text-xs text-amber-400">{"★".repeat(r.rating)}</span>
                    </div>
                    {r.feedback && <p className="text-xs text-muted-foreground mt-1">{r.feedback}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 sticky top-4">
            <p className="text-xs text-muted-foreground">{price > 0 ? "Booking fee" : "Booking"}</p>
            <p className="text-3xl font-extrabold">{price > 0 ? money(price) : "On Request"}</p>
            <div className="text-xs text-muted-foreground mt-2 space-y-1">
              <p>Artist earns (Net): <span className="text-foreground font-medium">{money(artistEarn)}</span></p>
              <p>Agency (20% gross-up): <span className="text-foreground font-medium">{money(platform)}</span></p>
              {artist.international_fee > 0 && (
                <p className="text-amber-400 pt-1">International: ${Number(artist.international_fee).toLocaleString()} · on request</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 mt-3"><Shield className="w-4 h-4" /> Escrow-protected</div>
            {isAdmin && artist.auto_accept_enabled && <div className="flex items-center gap-2 text-xs text-primary mt-1"><CheckCircle2 className="w-4 h-4" /> Auto-confirms instantly</div>}
            {price > 0 ? (
              <Button className="w-full rounded-full mt-4" onClick={() => setBooking(true)}><Calendar className="w-4 h-4" /> Book Now</Button>
            ) : (
              <Button className="w-full rounded-full mt-4" disabled>On Request — Contact Agency</Button>
            )}
            <p className="text-[11px] text-muted-foreground text-center mt-2">{price > 0 ? "100% upfront · released after the gig" : "Intercontinental routing — handled by the routing desk"}</p>
          </div>
        </div>
      </div>

      <BookingDialog open={booking} artist={artist} onClose={() => setBooking(false)} onConfirm={onConfirm} />
      <CheckoutDialog
        open={checkout}
        onOpenChange={(v) => !v && setCheckout(false)}
        amount={price}
        service="talent_booking"
        description={`Talent booking — ${artist.stage_name}`}
        referenceId={`talent-${artist.id}`}
        onPaid={onPaid}
        allowCash={false}
        commission={platform}
      />
    </div>
  );
}