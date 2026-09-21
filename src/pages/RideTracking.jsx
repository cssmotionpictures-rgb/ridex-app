import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import ServiceMap from "@/components/shared/ServiceMap";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { haversineKm, money } from "@/lib/pricing";
import { ShieldAlert, Send, Phone, Star, Flag, CheckCircle2, Navigation } from "lucide-react";
import SosButton from "@/components/safety/SosButton";
import VerifiedBadge from "@/components/safety/VerifiedBadge";

export default function RideTracking() {
  const id = new URLSearchParams(window.location.search).get("id");
  const [ride, setRide] = React.useState(null);
  const [driver, setDriver] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [draft, setDraft] = React.useState("");
  const [rating, setRating] = React.useState(5);
  const [review, setReview] = React.useState("");
  const [reviewed, setReviewed] = React.useState(false);
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    if (id) {
      setMissing(false);
      base44.entities.Ride.get(id).then(setRide).catch(() => setMissing(true));
    } else setMissing(true);
  }, [id]);

  // Live ride status (driven by the driver app: arriving → in_progress → completed).
  React.useEffect(() => {
    if (!id) return;
    const u = base44.entities.Ride.subscribe((ev) => {
      if (ev.data?.id === id) setRide(ev.data);
    });
    return () => u && u();
  }, [id]);

  // Live driver position — the car only moves when the driver actually moves.
  React.useEffect(() => {
    if (!ride?.driver_id) return;
    base44.entities.Driver.get(ride.driver_id).then(setDriver).catch(() => {});
    const u = base44.entities.Driver.subscribe((ev) => {
      if (ev.data?.id === ride.driver_id) setDriver(ev.data);
    });
    return () => u && u();
  }, [ride?.driver_id]);

  React.useEffect(() => {
    if (!id) return;
    const load = async () => setMessages(await base44.entities.ChatMessage.filter({ ride_id: id }, "created_date", 200).catch(() => []));
    load();
    const u = base44.entities.ChatMessage.subscribe((ev) => {
      if (ev.data?.ride_id === id) setMessages((prev) => [...prev, ev.data]);
    });
    return () => u && u();
  }, [id]);

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const m = await base44.entities.ChatMessage.create({ ride_id: id, sender: "customer", text: draft.trim() });
    setMessages((prev) => [...prev, m]);
    setDraft("");
  };

  const submitReview = async () => {
    await base44.entities.DriverReview.create({ driver_id: ride.driver_id || "", ride_id: id, rating, review, customer_name: ride.pickup_address });
    if (driver) {
      const all = await base44.entities.DriverReview.filter({ driver_id: driver.id }, "-created_date", 200).catch(() => []);
      const avg = all.length ? all.reduce((s, r) => s + (r.rating || 5), 0) / all.length : rating;
      await base44.entities.Driver.update(driver.id, { rating: Number(avg.toFixed(2)) }).catch(() => {});
    }
    setReviewed(true);
  };

  const complain = async () => {
    await base44.entities.DriverReview.create({ driver_id: ride.driver_id || "", ride_id: id, service: "ride", rating, review: review || "Customer reported an issue with this driver.", customer_name: ride.pickup_address, complaint: true }).catch(() => {});
    const subject = `Complaint about driver ${ride.driver_name || ""}`;
    const message = `Ride ${id}: ${review || "Customer reported an issue with this driver."}`;
    await base44.entities.SupportTicket.create({ subject, message, service: "ride", customer_email: "" });
    alert("Complaint sent to RIDE X support. We'll review and get back to you.");
  };

  if (missing) return (
    <div className="text-center py-20 space-y-3">
      <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto" />
      <p className="text-muted-foreground">No ride selected. Book a ride to see live tracking.</p>
      <Button asChild className="rounded-full"><Link to="/ride">Book a ride</Link></Button>
    </div>
  );
  if (!ride) return <p className="text-muted-foreground">Loading your ride…</p>;

  const pickup = [ride.pickup_lat, ride.pickup_lng];
  const dest = [ride.dest_lat, ride.dest_lng];
  const hasDriverPos = driver && Number.isFinite(driver.lat) && Number.isFinite(driver.lng);
  const driverPos = hasDriverPos ? [driver.lat, driver.lng] : null;
  const total = haversineKm(pickup, dest);

  // Real progress + ETA based on the driver's actual live position, not a fake timer.
  const target = ride.status === "arriving" ? pickup : dest;
  const remaining = hasDriverPos ? haversineKm(driverPos, target) : null;
  let progress = 0;
  if (ride.status === "completed") progress = 1;
  else if (ride.status === "in_progress" && hasDriverPos && total > 0) progress = Math.max(0, Math.min(1, 1 - haversineKm(driverPos, dest) / total));
  const etaLeft = hasDriverPos ? Math.max(0, Math.round((remaining || 0) * 2.5)) : (ride.eta_minutes || 0);

  const stageLabel =
    ride.status === "completed" ? "Trip complete" :
    ride.status === "arriving" ? "Heading to pickup" :
    ride.status === "in_progress" ? "On the trip" :
    ride.status === "cancelled" ? "Cancelled" :
    !ride.driver_id ? "Finding your driver…" : "On the move";

  return (
    <div>
      <PageHeader
        eyebrow="Live ride"
        title={ride.status === "completed" ? "Trip complete" : stageLabel}
        subtitle={`${ride.pickup_address} → ${ride.dest_address}`}
        action={<StatusBadge status={ride.status} />}
      />

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
        <ServiceMap
          height="560px"
          markers={[
            { position: ride.pickup_lat ? pickup : null, kind: "pickup", label: "Pickup" },
            { position: ride.dest_lat ? dest : null, kind: "destination", label: "Destination" },
            { position: driverPos, kind: "driver", label: ride.driver_name },
          ]}
          route={ride.pickup_lat && ride.dest_lat ? [pickup, dest] : []}
        />

        <div className="space-y-5">
          <div className="rounded-3xl border border-border/60 bg-card p-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <Stat label="ETA" value={`${etaLeft} min`} />
              <Stat label="Distance" value={`${(ride.distance_km || 0).toFixed(1)} km`} />
              <Stat label="Fare" value={money(ride.accepted_amount)} />
            </div>
            <div className="mt-5 h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all duration-700" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5" />
              {ride.status === "completed" ? "You've arrived" : hasDriverPos ? "Tracking your driver live" : "Waiting for your driver's location…"}
            </p>
          </div>

          <div className="rounded-3xl border border-border/60 bg-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold flex items-center gap-2 flex-wrap">
                  {ride.driver_name || "Finding your driver…"}
                  {driver?.is_approved && <VerifiedBadge approved label="Verified driver" />}
                </p>
                <p className="text-sm text-muted-foreground">{ride.driver_vehicle}</p>
                {ride.ride_pin && (
                  <p className="text-xs text-emerald-300 mt-2">Your ride PIN: <span className="font-mono font-bold tracking-[0.3em]">{ride.ride_pin}</span> — share it with your driver at pickup.</p>
                )}
              </div>
              {driver?.phone && (
                <a href={`tel:${driver.phone}`}>
                  <Button size="sm" variant="outline" className="rounded-full"><Phone className="w-4 h-4 mr-1" /> Call</Button>
                </a>
              )}
            </div>
            <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
              {messages.map((m, i) => (
                <div key={i} className={`text-sm px-3 py-2 rounded-2xl max-w-[85%] ${m.sender === "customer" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary"}`}>{m.text}</div>
              ))}
              {messages.length === 0 && <p className="text-xs text-muted-foreground">Messages with your driver appear here.</p>}
            </div>
            <form className="flex gap-2 mt-4" onSubmit={send}>
              <Input className="rounded-xl" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message driver" />
              <Button type="submit" size="icon" className="rounded-xl"><Send className="w-4 h-4" /></Button>
            </form>
          </div>

          {ride.status === "completed" && (
            <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
              <h3 className="font-semibold">Rate your driver</h3>
              {reviewed ? (
                <p className="text-sm text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Thanks for your feedback!</p>
              ) : (
                <>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setRating(n)}>
                        <Star className={`w-6 h-6 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                      </button>
                    ))}
                  </div>
                  <Label className="text-xs">Review</Label>
                  <Input className="rounded-xl" value={review} onChange={(e) => setReview(e.target.value)} placeholder="How was your ride?" />
                  <div className="flex gap-2">
                    <Button className="rounded-full flex-1" onClick={submitReview}>Submit review</Button>
                    <Button variant="outline" className="rounded-full" onClick={complain}><Flag className="w-4 h-4 mr-1" /> Report driver</Button>
                  </div>
                </>
              )}
            </div>
          )}

          <SosButton context={{ rideId: id, pickup: ride.pickup_address, destination: ride.dest_address, driver: ride.driver_name }} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}