import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { ShieldCheck, CheckCircle2, Phone } from "lucide-react";
import AddressAutocomplete from "@/components/shared/AddressAutocomplete";
import { EQUIPMENT, EQUIPMENT_CATEGORIES } from "@/lib/catalog";
import { money, OPERATOR_DAILY, haversineKm, caterpillarTransport, DIESEL_PER_KEG, TREK_MAX_KM, LOWBED_PER_KM, LOWBED_MIN_FEE } from "@/lib/pricing";

export default function Equipment() {
  const [cat, setCat] = React.useState("All");
  const [sel, setSel] = React.useState(null);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [pickup, setPickup] = React.useState({ label: "", lat: null, lng: null });
  const [drop, setDrop] = React.useState({ label: "", lat: null, lng: null });
  const [operator, setOperator] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [checkout, setCheckout] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const [pendingId, setPendingId] = React.useState(null);
  const [snapshot, setSnapshot] = React.useState(null);
  const [bookings, setBookings] = React.useState([]);

  const load = () => base44.entities.EquipmentRental.list("-created_date", 12).then(setBookings);
  React.useEffect(() => { load(); }, []);

  const list = cat === "All" ? EQUIPMENT : EQUIPMENT.filter((e) => e.category === cat);
  const days = start && end ? Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) || 1) : 1;
  const hasRoute = pickup.lat != null && drop.lat != null;
  const deliveryKm = hasRoute ? haversineKm([pickup.lat, pickup.lng], [drop.lat, drop.lng]) : 0;
  const transport = caterpillarTransport(deliveryKm, !!sel?.trek);
  const transportFee = transport.fee;
  const hireTotal = sel ? (sel.rate + (operator ? OPERATOR_DAILY : 0)) * days : 0;
  const total = hireTotal + transportFee;

  const startCheckout = async () => {
    const r = await base44.entities.EquipmentRental.create({
      machine_category: sel.category,
      model: sel.model,
      daily_rate: sel.rate,
      rental_period: "daily",
      start_date: start,
      end_date: end,
      days,
      with_operator: operator,
      pickup_address: pickup.label,
      drop_address: drop.label,
      delivery_km: Math.round(deliveryKm),
      delivery_fee: transportFee,
      site_address: drop.label,
      customer_phone: phone,
      total_amount: total,
      status: "pending",
      payment_status: "unpaid",
    });
    setPendingId(r.id);
    setSnapshot({ model: sel.model, days, hireTotal, transportFee, transportLabel: transport.label, total, phone });
    setCheckout(true);
  };

  const onPaid = async (_tx, method) => {
    if (pendingId) await base44.entities.EquipmentRental.update(pendingId, { payment_status: method === "cash" ? "unpaid" : "paid", status: "approved" });
    setCheckout(false);
    setDone({ ...snapshot, method });
    setSel(null);
    setPhone("");
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="CSS Constructions"
        title="Caterpillar machines for hire"
        subtitle={`Rubber-tyre Caterpillars trek on their own tyres (diesel kegs scale with distance); steel-track machines always use a lowbed, and any trek over ${TREK_MAX_KM} km needs a lowbed too. 1 day = 8 work hours. Operators +₦100,000/day.`}
      />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Link to="/equipment/agreement" className="text-xs text-primary hover:underline inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Read the Rental Agreement & Client Responsibility clause
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-6">
        {["All", ...EQUIPMENT_CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap border ${cat === c ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-muted-foreground"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((m) => (
          <div key={m.model} className="rounded-3xl border border-border/60 bg-card p-6 flex flex-col">
            <p className="text-[11px] uppercase tracking-widest text-primary">{m.category}</p>
            <h3 className="font-bold mt-2">{m.model}</h3>
            <p className="text-2xl font-extrabold mt-3">{money(m.rate)}<span className="text-sm font-normal text-muted-foreground">/8 hrs</span></p>
            <p className="text-xs text-muted-foreground mt-1">1 day = 8 work hours · {m.trek ? "Rubber tyre (treks on road)" : "Steel track (lowbed only)"}</p>
            <Button className="rounded-full mt-5 font-semibold" onClick={() => { setSel(m); setOperator(false); }}>Hire this machine</Button>
          </div>
        ))}
      </div>

      <h3 className="font-semibold mt-12 mb-4">My rentals</h3>
      <div className="space-y-3">
        {bookings.length === 0 && <p className="text-sm text-muted-foreground">No rentals yet.</p>}
        {bookings.map((b) => (
          <div key={b.id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium">{b.model}</p>
              <p className="text-xs text-muted-foreground">{b.start_date} → {b.end_date} · {b.days} day(s){b.with_operator ? " · operator" : ""}</p>
            </div>
            <p className="font-bold">{money(b.total_amount)}</p>
            <StatusBadge status={b.status} />
          </div>
        ))}
      </div>

      <Dialog open={!!sel} onOpenChange={(v) => !v && setSel(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>{sel?.model}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start date</Label>
                <Input type="date" className="rounded-xl mt-1" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">End date</Label>
                <Input type="date" className="rounded-xl mt-1" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Pickup address (load caterpillar)</Label>
              <AddressAutocomplete
                value={pickup.label}
                onChange={(label) => setPickup((p) => ({ ...p, label }))}
                onSelect={(r) => setPickup(r)}
                placeholder="Where the machine is loaded"
              />
            </div>
            <div>
              <Label className="text-xs">Drop address (delivery site)</Label>
              <AddressAutocomplete
                value={drop.label}
                onChange={(label) => setDrop((d) => ({ ...d, label }))}
                onSelect={(r) => setDrop(r)}
                placeholder="Where the machine is used"
              />
            </div>
            <div className="rounded-2xl bg-secondary/60 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Transport mode</span>
                <span className="font-semibold">
                  {!hasRoute ? "enter both addresses" : transport.mode === "trek" ? "Trek on rubber tyres" : "Lowbed / flatbed"}
                </span>
              </div>
              {hasRoute && transport.mode === "trek" && transport.kegs > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Diesel ({transport.kegs} keg(s) @ {money(DIESEL_PER_KEG)})</span>
                  <span className="font-semibold text-primary">{money(transportFee)}</span>
                </div>
              )}
              {hasRoute && transport.mode === "trek" && transport.kegs === 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Free trek (≤1 km)</span>
                  <span className="font-semibold text-primary">{money(0)}</span>
                </div>
              )}
              {hasRoute && transport.mode === "lowbed" && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Lowbed fee ({Math.round(deliveryKm)} km @ {money(LOWBED_PER_KM)}/km)</span>
                    <span className="font-semibold text-primary">{money(transportFee)}</span>
                  </div>
                  {transportFee === LOWBED_MIN_FEE && (
                    <div className="text-[11px] text-muted-foreground">Minimum lowbed charge {money(LOWBED_MIN_FEE)} applies.</div>
                  )}
                </>
              )}
              {sel?.trek && (
                <div className="pt-1.5 border-t border-border/60 text-[11px] leading-relaxed text-muted-foreground">
                  Diesel kegs count by trekking time at ~4 km/h: <b>first 15 min (1 km) free</b>, then <b>1 keg</b> for the next 20 min (~1.33 km), and <b>+1 keg per 20 min</b> after. Treks over {TREK_MAX_KM} km switch to lowbed.
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Distance</span>
                <span className="font-semibold">{hasRoute ? `${Math.round(deliveryKm)} km` : "—"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-secondary p-4">
              <div>
                <p className="text-sm font-medium">Add certified operator</p>
                <p className="text-xs text-muted-foreground">+₦100,000 / day (8 hrs)</p>
              </div>
              <Switch checked={operator} onCheckedChange={setOperator} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{days} day(s) · 8 hrs/day</p>
              <p className="text-2xl font-extrabold">{money(total)}</p>
            </div>
            <div>
              <Label className="text-xs">Your phone number</Label>
              <Input type="tel" className="rounded-xl mt-1" placeholder="0803 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-1">We call this number to confirm your booking. Agent in charge: <b className="text-foreground">09020042099</b></p>
            </div>
            <Button className="w-full rounded-full h-11 font-semibold" disabled={!start || !end || !hasRoute || !phone.trim()} onClick={startCheckout}>
              Continue to payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CheckoutDialog
        open={checkout}
        onOpenChange={setCheckout}
        amount={snapshot?.total ?? total}
        service="equipment"
        description={`CSS Constructions · ${snapshot?.model ?? sel?.model} for ${snapshot?.days ?? days} day(s) @ 8 hrs/day${snapshot ? ` · ${snapshot.transportLabel}` : hasRoute ? ` · ${transport.label}` : ""}`}
        referenceId={pendingId}
        onPaid={onPaid}
      />

      <Dialog open={!!done} onOpenChange={(v) => !v && setDone(null)}>
        <DialogContent className="sm:max-w-sm rounded-3xl text-center">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-xl font-bold">Booking received</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Your <b className="text-foreground">{done?.model}</b> hire is confirmed. Our agent will call <b className="text-foreground">{done?.phone}</b> shortly{done?.method === "cash" ? " to arrange cash payment" : ""}.
          </p>
          <div className="rounded-2xl bg-secondary/60 p-3 mt-4 text-xs space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Hire ({done?.days} day(s))</span>
              <span className="font-semibold">{money(done?.hireTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{done?.transportLabel}</span>
              <span className="font-semibold">{money(done?.transportFee)}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
              <span className="font-medium">{done?.method === "cash" ? "Cash on arrival" : "Paid"}</span>
              <span className="font-extrabold text-primary">{money(done?.total)}</span>
            </div>
          </div>
          <div className="rounded-2xl bg-secondary/60 p-4 mt-4">
            <p className="text-xs text-muted-foreground">Agent in charge of your booking</p>
            <a href="tel:09020042099" className="text-2xl font-extrabold text-primary mt-1 inline-flex items-center gap-2">
              <Phone className="w-5 h-5" /> 09020042099
            </a>
            <p className="text-[11px] text-muted-foreground mt-2">Call this number for any questions or to coordinate delivery.</p>
          </div>
          <Button className="w-full rounded-full h-11 font-semibold mt-4" onClick={() => setDone(null)}>Done</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}