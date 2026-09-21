import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import RewardedAd from "@/components/shared/RewardedAd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARWASH_SERVICES } from "@/lib/catalog";
import { money } from "@/lib/pricing";
import { Gift } from "lucide-react";

export default function Carwash() {
  const [service, setService] = React.useState(CARWASH_SERVICES[1]);
  const [locationType, setLocationType] = React.useState("mobile");
  const [address, setAddress] = React.useState("");
  const [date, setDate] = React.useState("");
  const [vehicle, setVehicle] = React.useState("");
  const [discount, setDiscount] = React.useState(0);
  const [ad, setAd] = React.useState(false);
  const [checkout, setCheckout] = React.useState(false);
  const [pendingId, setPendingId] = React.useState(null);
  const [bookings, setBookings] = React.useState([]);

  const load = () => base44.entities.CarwashBooking.list("-created_date", 12).then(setBookings);
  React.useEffect(() => { load(); }, []);

  const total = Math.max(0, service.price - discount);

  const startCheckout = async () => {
    const b = await base44.entities.CarwashBooking.create({
      service_type: service.name,
      location_type: locationType,
      address,
      booking_date: date,
      vehicle,
      discount_applied: discount,
      total_amount: total,
      status: "pending",
      payment_status: "unpaid",
    });
    setPendingId(b.id);
    setCheckout(true);
  };

  const onPaid = async (_tx, method) => {
    if (pendingId) await base44.entities.CarwashBooking.update(pendingId, { payment_status: method === "cash" ? "unpaid" : "paid", status: "confirmed" });
    setDiscount(0);
    load();
  };

  return (
    <div>
      <PageHeader eyebrow="Carwash X" title="Book a wash" subtitle="Mobile teams come to you, or drop by a fixed bay. Every 10th wash is free." />

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
        <div className="grid sm:grid-cols-2 gap-4">
          {CARWASH_SERVICES.map((s) => (
            <button
              key={s.name}
              onClick={() => setService(s)}
              className={`text-left rounded-3xl border p-6 transition-colors ${service.name === s.name ? "border-primary bg-primary/10" : "border-border/60 bg-card hover:border-primary/40"}`}
            >
              <h3 className="font-bold">{s.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{s.detail}</p>
              <p className="text-2xl font-extrabold mt-3">{money(s.price)}</p>
            </button>
          ))}
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4 h-fit">
          <div className="flex gap-2">
            {[
              { key: "mobile", label: "Mobile — we come to you" },
              { key: "fixed", label: "Fixed bay" },
            ].map((o) => (
              <button
                key={o.key}
                onClick={() => setLocationType(o.key)}
                className={`flex-1 py-2 px-3 rounded-2xl text-xs border ${locationType === o.key ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-muted-foreground"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div>
            <Label className="text-xs">{locationType === "mobile" ? "Your address" : "Preferred bay"}</Label>
            <Input className="rounded-xl mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Date & time</Label>
            <Input type="datetime-local" className="rounded-xl mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Vehicle</Label>
            <Input className="rounded-xl mt-1" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. Toyota Camry, black" />
          </div>

          <Button variant="outline" className="w-full rounded-full" disabled={discount > 0} onClick={() => setAd(true)}>
            <Gift className="w-4 h-4 mr-2" /> {discount ? "₦5,000 discount applied" : "Watch an ad for ₦5,000 off"}
          </Button>

          <div className="rounded-2xl bg-secondary p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{service.name}{discount ? " · −₦5,000" : ""}</p>
              <p className="text-2xl font-extrabold">{money(total)}</p>
            </div>
            <Button className="rounded-full font-semibold" disabled={!address || !date} onClick={startCheckout}>Book now</Button>
          </div>
        </div>
      </div>

      <h3 className="font-semibold mt-12 mb-4">My bookings</h3>
      <div className="space-y-3">
        {bookings.length === 0 && <p className="text-sm text-muted-foreground">No washes booked yet.</p>}
        {bookings.map((b) => (
          <div key={b.id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium">{b.service_type} · {b.location_type}</p>
              <p className="text-xs text-muted-foreground">{b.booking_date} · {b.address}</p>
            </div>
            <p className="font-bold">{money(b.total_amount)}</p>
            <StatusBadge status={b.status} />
          </div>
        ))}
      </div>

      <RewardedAd open={ad} onOpenChange={setAd} movieTitle="Carwash X discount" onReward={() => setDiscount(5000)} />
      <CheckoutDialog
        open={checkout}
        onOpenChange={setCheckout}
        amount={total}
        service="carwash"
        description={`Carwash X · ${service.name}`}
        referenceId={pendingId}
        onPaid={onPaid}
      />
    </div>
  );
}