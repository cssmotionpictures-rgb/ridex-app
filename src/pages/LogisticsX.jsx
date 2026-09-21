import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import ServiceMap from "@/components/shared/ServiceMap";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import SceneBanner from "@/components/shared/SceneBanner";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DELIVERY_SPEEDS } from "@/lib/catalog";
import { haversineKm, money, logisticsFare } from "@/lib/pricing";
import { MapPin } from "lucide-react";

export default function LogisticsX() {
  const nav = useNavigate();
  const [pickup, setPickup] = React.useState([6.4531, 3.3958]);
  const [drop, setDrop] = React.useState(null);
  const [pickupText, setPickupText] = React.useState("Ikeja, Lagos");
  const [dropText, setDropText] = React.useState("");
  const [picking, setPicking] = React.useState("drop");
  const [weight, setWeight] = React.useState("2");
  const [dimensions, setDimensions] = React.useState("30x20x15 cm");
  const [desc, setDesc] = React.useState("");
  const [speed, setSpeed] = React.useState("standard");
  const [checkout, setCheckout] = React.useState(false);
  const [pendingId, setPendingId] = React.useState(null);
  const [receiverEmail, setReceiverEmail] = React.useState("");
  const [codeMsg, setCodeMsg] = React.useState(null);
  const [history, setHistory] = React.useState([]);

  React.useEffect(() => {
    base44.entities.LogisticsRequest.list("-created_date", 6).then(setHistory);
  }, []);

  const dest = drop || pickup;
  const km = drop ? haversineKm(pickup, drop) : 0;
  const sp = DELIVERY_SPEEDS.find((s) => s.key === speed);
  const amount = logisticsFare({ km, weightKg: Number(weight || 0), speedMultiplier: sp.multiplier });

  const pick = (latlng) => {
    if (picking === "pickup") {
      setPickup(latlng);
      setPickupText(`Pin ${latlng[0].toFixed(4)}, ${latlng[1].toFixed(4)}`);
    } else {
      setDrop(latlng);
      setDropText(`Pin ${latlng[0].toFixed(4)}, ${latlng[1].toFixed(4)}`);
    }
  };

  const request = async () => {
    if (!dropText) return;
    const req = await base44.entities.LogisticsRequest.create({
      tracking_number: `RX${Date.now().toString().slice(-8)}`,
      pickup_address: pickupText,
      pickup_lat: pickup[0],
      pickup_lng: pickup[1],
      delivery_address: dropText,
      delivery_lat: dest[0],
      delivery_lng: dest[1],
      package_description: desc,
      weight_kg: Number(weight),
      dimensions,
      delivery_speed: speed,
      receiver_email: receiverEmail,
      amount: Number(amount),
      driver_name: "Chidi N. · Van GHT-402",
      driver_lat: pickup[0],
      driver_lng: pickup[1],
      eta_minutes: sp.minutes,
      status: "driver_assigned",
      payment_status: "unpaid",
    });
    setPendingId(req.id);
    setCheckout(true);
  };

  const onPaid = async (_tx, method) => {
    if (pendingId) await base44.entities.LogisticsRequest.update(pendingId, { payment_status: method === "cash" ? "unpaid" : "paid" });
    // Generate + email the receiver's delivery confirmation code automatically.
    if (pendingId && receiverEmail) {
      try {
        const res = await base44.functions.invoke("generate-delivery-code", { logistics_id: pendingId });
        const data = res?.data || res;
        if (data?.emailed) {
          setCodeMsg({ ok: true, text: `A delivery code was emailed to ${data.receiver_email}. The receiver will give it to the driver to confirm delivery.` });
        } else if (data?.code) {
          setCodeMsg({ ok: false, text: `Email couldn't be delivered to ${data.receiver_email}. Share this code with your receiver: ${data.code}` });
        }
      } catch (e) {
        setCodeMsg({ ok: false, text: `Could not generate delivery code: ${e.message || e}` });
      }
    }
    nav(`/delivery-tracking?id=${pendingId}`);
  };

  return (
    <div>
      <PageHeader eyebrow="Logistics X" title="Send a parcel" subtitle="Pin pickup and delivery on the map, choose your speed and track it live." />

      <SceneBanner
        scene="scene-logistics"
        kicker="LOGISTICS X · SAME-HOUR PARCELS"
        title="Send a parcel"
        badges={["EXPRESS · STANDARD · ECONOMY", "LIVE TRACKING", "DELIVERY CODE EMAILED"]}
      />

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
        <ServiceMap
          height="520px"
          onPick={pick}
          markers={[
            { position: pickup, kind: "pickup", label: "Pickup" },
            { position: drop, kind: "destination", label: "Delivery" },
          ]}
          route={pickup && drop ? [pickup, drop] : []}
        />

        <div className="rounded-3xl border border-primary/25 bg-card p-6 space-y-4">
          <div className="flex gap-2">
            {["pickup", "drop"].map((m) => (
              <button
                key={m}
                onClick={() => setPicking(m)}
                className={`flex-1 py-2 rounded-full text-xs border ${picking === m ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-muted-foreground"}`}
              >
                <MapPin className="w-3 h-3 inline mr-1" /> Set {m === "pickup" ? "pickup" : "delivery"}
              </button>
            ))}
          </div>

          <div>
            <Label className="text-xs">Pickup address</Label>
            <Input className="rounded-xl mt-1" value={pickupText} onChange={(e) => setPickupText(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Delivery address</Label>
            <Input className="rounded-xl mt-1" value={dropText} onChange={(e) => setDropText(e.target.value)} placeholder="Where is it going?" />
          </div>
          <div>
            <Label className="text-xs">Receiver email (gets the delivery code)</Label>
            <Input className="rounded-xl mt-1" type="email" value={receiverEmail} onChange={(e) => setReceiverEmail(e.target.value)} placeholder="receiver@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Weight (kg)</Label>
              <Input className="rounded-xl mt-1" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Dimensions</Label>
              <Input className="rounded-xl mt-1" value={dimensions} onChange={(e) => setDimensions(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Package description</Label>
            <Textarea className="rounded-xl mt-1" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What's inside?" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {DELIVERY_SPEEDS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSpeed(s.key)}
                className={`p-3 rounded-2xl border text-xs card-lift text-center ${speed === s.key ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}
              >
                <p className="font-semibold">{s.label}</p>
                <p className="text-[10px]">{s.eta}</p>
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-secondary p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{km ? `${km.toFixed(1)} km estimate` : "Pin a delivery point"}</p>
              <p className="text-2xl font-extrabold">{money(amount)}</p>
            </div>
            <Button className="rounded-full font-semibold" disabled={!dropText || !receiverEmail} onClick={request}>
              Request delivery
            </Button>
            {!receiverEmail && <p className="text-[11px] text-muted-foreground col-span-full text-center">Enter a receiver email to generate the delivery code.</p>}
            {codeMsg && (
              <div className={`col-span-full text-xs rounded-xl px-3 py-2 ${codeMsg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>{codeMsg.text}</div>
            )}
          </div>
        </div>
      </div>

      <h3 className="font-semibold mt-10 mb-4">Delivery history</h3>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {history.length === 0 && <p className="text-sm text-muted-foreground">No deliveries yet.</p>}
        {history.map((h) => (
          <Link key={h.id} to={`/delivery-tracking?id=${h.id}`} className="block rounded-3xl border border-border/60 bg-card p-5 hover:border-primary/40 card-lift">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs text-primary">{h.tracking_number}</p>
              <StatusBadge status={h.status} />
            </div>
            <p className="text-sm mt-2 truncate">{h.pickup_address} → {h.delivery_address}</p>
            <p className="text-xs text-muted-foreground mt-1">{money(h.amount)} · {h.delivery_speed}</p>
          </Link>
        ))}
      </div>

      <CheckoutDialog
        open={checkout}
        onOpenChange={setCheckout}
        amount={Number(amount)}
        service="logistics"
        description={`Logistics X · ${sp.label} delivery to ${dropText}`}
        referenceId={pendingId}
        onPaid={onPaid}
      />
    </div>
  );
}