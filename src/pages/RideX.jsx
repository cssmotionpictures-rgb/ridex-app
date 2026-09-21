import React from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import ServiceMap from "@/components/shared/ServiceMap";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import SceneBanner from "@/components/shared/SceneBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RIDE_TYPES } from "@/lib/catalog";
import { haversineKm, money, rideFare, RIDE_DIST_RATE, RIDE_TIME_RATE, RIDE_BASE_FARE } from "@/lib/pricing";
import AddressAutocomplete from "@/components/shared/AddressAutocomplete";
import { Loader2, MapPin, Car, Bike, History, LifeBuoy, ShieldCheck, Heart } from "lucide-react";
import QuickActionsFab from "@/components/shared/QuickActionsFab";

const BIDDERS = [
  { driver_name: "Emeka O.", driver_vehicle: "Toyota Corolla · KJA-231", rating: 4.9, delta: -0.12, eta: 4 },
  { driver_name: "Aisha B.", driver_vehicle: "Kia Rio · LSD-884", rating: 4.8, delta: 0.05, eta: 3 },
  { driver_name: "Tunde A.", driver_vehicle: "Hyundai Elantra · FKJ-119", rating: 5.0, delta: 0.18, eta: 7 },
];

export default function RideX() {
  const nav = useNavigate();
  const [pickup, setPickup] = React.useState(null);
  const [dest, setDest] = React.useState(null);
  const [pickupText, setPickupText] = React.useState("");
  const [destText, setDestText] = React.useState("");
  const [picking, setPicking] = React.useState("pickup");
  const [type, setType] = React.useState("economy");
  const [offer, setOffer] = React.useState("");
  const [bids, setBids] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const [chosen, setChosen] = React.useState(null);
  const [checkout, setCheckout] = React.useState(false);
  const [pendingId, setPendingId] = React.useState(null);
  const [phone, setPhone] = React.useState("");
  const [ridePin, setRidePin] = React.useState("");

  React.useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setPickup([p.coords.latitude, p.coords.longitude]);
        setPickupText("My current location");
      },
      () => {
        setPickup([6.5244, 3.3792]);
        setPickupText("Lagos Island");
      }
    );
  }, []);

  const km = haversineKm(pickup, dest);
  const typeMult = RIDE_TYPES.find((t) => t.key === type)?.multiplier || 1;
  const minutes = Math.round(km * 2.5);
  const baseFare = km > 0 ? rideFare({ km, minutes, type, rideTypes: RIDE_TYPES }) : 0;
  const breakdown = km > 0 ? (RIDE_BASE_FARE + RIDE_DIST_RATE * km + RIDE_TIME_RATE * minutes) * typeMult : 0;
  const suggested = baseFare;

  React.useEffect(() => {
    if (km > 0) setOffer(String(suggested));
  }, [km, type]);

  const pick = (latlng) => {
    if (picking === "pickup") {
      setPickup(latlng);
      setPickupText(`Pin ${latlng[0].toFixed(4)}, ${latlng[1].toFixed(4)}`);
      setPicking("dest");
    } else {
      setDest(latlng);
      setDestText(`Pin ${latlng[0].toFixed(4)}, ${latlng[1].toFixed(4)}`);
    }
  };

  const findDrivers = async () => {
    setSearching(true);
    setBids([]);
    // 1. Create the ride (status 'searching') so it exists and can be tracked.
    const ride = await base44.entities.Ride.create({
      pickup_address: pickupText,
      pickup_lat: pickup?.[0],
      pickup_lng: pickup?.[1],
      dest_address: destText,
      dest_lat: dest?.[0],
      dest_lng: dest?.[1],
      ride_type: type,
      offer_amount: Number(offer),
      accepted_amount: Number(offer),
      distance_km: Number(km.toFixed(2)),
      customer_phone: phone.trim(),
      ride_pin: ridePin.trim(),
      status: "searching",
      payment_status: "unpaid",
    });
    setPendingId(ride.id);

    // 2. Auto-assign the nearest approved, online driver with a known location.
    const online = await base44.entities.Driver.filter({ is_approved: true, is_online: true }, "-rating", 50).catch(() => []);
    const ranked = online
      .filter((d) => d.lat != null)
      .map((d) => ({ d, dist: haversineKm([d.lat, d.lng], pickup) }))
      .sort((a, b) => a.dist - b.dist);
    if (ranked.length) {
      const dd = ranked[0].d;
      const eta = Math.max(2, Math.round(ranked[0].dist * 2.5));
      const vehicle = `${dd.vehicle_color || ""} ${dd.vehicle_type} · ${dd.license_plate || ""}`.trim();
      await base44.entities.Ride.update(ride.id, {
        driver_id: dd.id,
        driver_name: dd.full_name,
        driver_vehicle: vehicle,
        eta_minutes: eta,
        status: "driver_assigned",
      });
      setChosen({ driver_name: dd.full_name, driver_vehicle: vehicle, rating: dd.rating || 5, eta, amount: Number(offer) });
      setSearching(false);
      setCheckout(true);
      return;
    }

    // 3. Fallback: simulated driver bids while no real drivers are online.
    setTimeout(() => {
    setBids(BIDDERS.map((b) => ({ ...b, amount: Math.max(500, Math.ceil((Number(offer) * (1 + b.delta)) / 50) * 50) })));
    setSearching(false);
    }, 1600);
  };

  const accept = async (b) => {
    setChosen(b);
    if (pendingId) {
      await base44.entities.Ride.update(pendingId, {
        accepted_amount: Number(b.amount.toFixed(2)),
        driver_name: b.driver_name,
        driver_vehicle: b.driver_vehicle,
        eta_minutes: b.eta,
        status: "driver_assigned",
      });
    }
    setCheckout(true);
  };

  const onPaid = async (_tx, method) => {
    if (pendingId) await base44.entities.Ride.update(pendingId, { payment_status: method === "cash" ? "unpaid" : "paid" });
    nav(`/ride-tracking?id=${pendingId}`);
  };

  return (
    <div>
      <PageHeader eyebrow="Ride X" title="Name your fare" subtitle="Tap the map to set pickup and destination, then let drivers bid for your trip." />

      <SceneBanner
        scene="scene-ride"
        kicker="RIDE X · NAME-YOUR-FARE"
        title="Book a car or a bike"
        badges={["CARS & BIKES", "DRIVERS BID FOR YOUR TRIP", "PAY ON COMPLETION"]}
      />

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
        <ServiceMap
          height="520px"
          onPick={pick}
          markers={[
            { position: pickup, kind: "pickup", label: "Pickup" },
            { position: dest, kind: "destination", label: "Destination" },
          ]}
          route={pickup && dest ? [pickup, dest] : []}
        />

        <div className="space-y-5">
          <div className="rounded-3xl border border-primary/25 bg-card p-6 space-y-4">
            <div className="flex gap-2">
              {["pickup", "dest"].map((m) => (
                <button
                  key={m}
                  onClick={() => setPicking(m)}
                  className={`flex-1 py-2 rounded-full text-xs border ${picking === m ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-muted-foreground"}`}
                >
                  <MapPin className="w-3 h-3 inline mr-1" /> Set {m === "pickup" ? "pickup" : "destination"}
                </button>
              ))}
            </div>
            <div>
              <Label className="text-xs">Pickup</Label>
              <AddressAutocomplete
                value={pickupText}
                onChange={setPickupText}
                onSelect={(p) => { setPickup([p.lat, p.lng]); setPickupText(p.label); }}
                placeholder="Start typing a pickup address…"
              />
            </div>
            <div>
              <Label className="text-xs">Destination</Label>
              <AddressAutocomplete
                value={destText}
                onChange={setDestText}
                onSelect={(p) => { setDest([p.lat, p.lng]); setDestText(p.label); setPicking("dest"); }}
                placeholder="Where to? Start typing…"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {RIDE_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setType(t.key)}
                  className={`p-3 rounded-2xl border text-xs card-lift text-center ${type === t.key ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}
                >
                  {t.key === "bike" ? <Bike className="w-4 h-4 mx-auto mb-1 text-primary" /> : <Car className="w-4 h-4 mx-auto mb-1 text-primary" />}
                  <p className="font-semibold">{t.label}</p>
                  <p className="text-[10px]">{t.seats} seats</p>
                </button>
              ))}
            </div>

            {km > 0 ? (
              <div className="rounded-2xl bg-secondary/50 p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Distance</span><span>{km.toFixed(1)} km · ~{minutes} min · {type}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Base + distance + time</span><span>{money(breakdown)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>× location & traffic</span><span>applied</span></div>
                <div className="flex justify-between font-semibold pt-1.5 border-t border-border/40"><span>Suggested fare</span><span className="text-primary">{money(suggested)}</span></div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Set both pickup and destination to see your fare.</p>
            )}

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-xs">Your offer (₦)</Label>
                <Input className="rounded-xl mt-1" type="number" step="50" value={offer} onChange={(e) => setOffer(e.target.value)} />
              </div>
              <div className="text-right text-xs text-muted-foreground pb-2">
                <p>{km ? `${km.toFixed(1)} km` : "Set both points"}</p>
                <p>Suggested {money(suggested)}</p>
              </div>
            </div>

            <div>
              <Label className="text-xs">Your phone (so the driver can call you)</Label>
              <Input className="rounded-xl mt-1" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0803 123 4567" />
            </div>

            <div>
              <Label className="text-xs">Ride PIN (share with your driver at pickup to confirm it's you)</Label>
              <Input className="rounded-xl mt-1 tracking-[0.4em] font-mono text-center text-lg" inputMode="numeric" maxLength={4} value={ridePin} onChange={(e) => setRidePin(e.target.value.replace(/\D/g, ""))} placeholder="••••" />
            </div>

            <Button className="w-full rounded-full h-11 font-semibold" disabled={!pickup || !dest || !destText || !phone.trim() || ridePin.length !== 4 || searching} onClick={findDrivers}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Find drivers"}
            </Button>
          </div>

          <div className="rounded-3xl border border-primary/25 bg-card p-5 space-y-3 card-lift">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">RideX Mingle</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">NEW</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Meet compatible people along your way — opt in, match, chat, voice &amp; video, then book a ride to an agreed
              public venue. Your exact location is never shown to other members.
            </p>
            <Button variant="outline" className="rounded-full w-full" onClick={() => nav("/mingle")}>
              💜 Activate Mingle
            </Button>
          </div>

          {bids.length > 0 && (
            <div className="rounded-3xl border border-primary/25 bg-card p-6 space-y-3">
              <h3 className="font-semibold">Driver bids</h3>
              {bids.map((b) => (
                <div key={b.driver_name} className="flex items-center gap-3 p-3 rounded-2xl bg-secondary">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{b.driver_name} · ⭐ {b.rating}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.driver_vehicle} · {b.eta} min away</p>
                  </div>
                  <p className="font-bold">{money(b.amount)}</p>
                  <Button size="sm" className="rounded-full" onClick={() => accept(b)}>Accept</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CheckoutDialog
        open={checkout}
        onOpenChange={setCheckout}
        amount={chosen ? Math.round(Number(chosen.amount)) : 0}
        service="ride"
        description={`Ride X · ${pickupText} → ${destText}`}
        referenceId={pendingId}
        onPaid={onPaid}
      />

      <QuickActionsFab
        label="History & support"
        items={[
          { icon: History, label: "Ride history", to: "/receipts" },
          { icon: LifeBuoy, label: "Support", to: "/support" },
          { icon: ShieldCheck, label: "Safety", to: "/safety" },
        ]}
      />
    </div>
  );
}